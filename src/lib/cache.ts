import Valkey from "iovalkey";
import { config } from "@/config";
import { createLogger } from "./logger";

const logger = createLogger("cache");

// Create Valkey client
export const valkey = new Valkey(config.VALKEY_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 3) {
      logger.error("Valkey connection failed after 3 retries");
      return null; // Stop retrying
    }
    return Math.min(times * 200, 2000); // Exponential backoff
  },
});

// Event handlers
valkey.on("connect", () => logger.info("Connected to Valkey"));
valkey.on("error", (err) => logger.error({ err }, "Valkey error"));
valkey.on("close", () => logger.warn("Valkey connection closed"));

// Cache helper functions
const DEFAULT_TTL = 300; // 5 minutes

export async function cacheGet<T>(key: string): Promise<T | null> {
  const data = await valkey.get(key);
  if (!data) return null;
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds = DEFAULT_TTL): Promise<void> {
  await valkey.set(key, JSON.stringify(value), "EX", ttlSeconds);
}

export async function cacheDelete(key: string): Promise<void> {
  await valkey.del(key);
}

export async function cacheDeletePattern(pattern: string): Promise<void> {
  const keys = await valkey.keys(pattern);
  if (keys.length > 0) {
    await valkey.del(...keys);
  }
}

// Health check
export async function checkCacheConnection(): Promise<boolean> {
  try {
    await valkey.ping();
    return true;
  } catch {
    return false;
  }
}

// Graceful shutdown
export async function closeCacheConnection(): Promise<void> {
  await valkey.quit();
}

// =============================================================================
// Valkey 9 Hash Field Expiration Helpers
// =============================================================================

/**
 * HSETEX - Set hash field(s) with per-field expiration (Valkey 9+)
 *
 * @param key - The hash key
 * @param fields - Object with field-value pairs to set
 * @param ttlSeconds - TTL in seconds for ALL fields being set
 * @param options - Optional flags:
 *   - nx: Only set if key doesn't exist (key-level)
 *   - xx: Only set if key exists (key-level)
 *   - fnx: Only set fields that don't exist (field-level)
 *   - fxx: Only set fields that already exist (field-level)
 *
 * @returns Number of fields that were added (not updated)
 */
export async function hsetex(
  key: string,
  fields: Record<string, string>,
  ttlSeconds: number,
  options?: { nx?: boolean; xx?: boolean; fnx?: boolean; fxx?: boolean },
): Promise<number> {
  const entries = Object.entries(fields);
  if (entries.length === 0) return 0;

  // Build command args
  const args: (string | number)[] = [key];

  // Key-level conditions
  if (options?.nx) args.push("NX");
  if (options?.xx) args.push("XX");

  // Field-level conditions
  if (options?.fnx) args.push("FNX");
  if (options?.fxx) args.push("FXX");

  // TTL
  args.push("EX", ttlSeconds);

  // Fields
  args.push("FIELDS", entries.length);
  for (const [field, value] of entries) {
    args.push(field, value);
  }

  const result = await valkey.call("HSETEX", ...args);
  return result as number;
}

/**
 * HGETEX - Get hash field(s) and optionally set/update expiration
 *
 * @param key - The hash key
 * @param fields - Array of field names to get
 * @param expireOptions - Optional expiration modification:
 *   - ex: Set expiration in seconds
 *   - px: Set expiration in milliseconds
 *   - exat: Set expiration at Unix timestamp (seconds)
 *   - pxat: Set expiration at Unix timestamp (milliseconds)
 *   - persist: Remove expiration
 *
 * @returns Array of values (null for non-existent fields)
 */
export async function hgetex(
  key: string,
  fields: string[],
  expireOptions?: { ex?: number; px?: number; exat?: number; pxat?: number; persist?: boolean },
): Promise<(string | null)[]> {
  if (fields.length === 0) return [];

  const args: (string | number)[] = [key];

  // Expiration options (mutually exclusive)
  if (expireOptions?.ex !== undefined) {
    args.push("EX", expireOptions.ex);
  } else if (expireOptions?.px !== undefined) {
    args.push("PX", expireOptions.px);
  } else if (expireOptions?.exat !== undefined) {
    args.push("EXAT", expireOptions.exat);
  } else if (expireOptions?.pxat !== undefined) {
    args.push("PXAT", expireOptions.pxat);
  } else if (expireOptions?.persist) {
    args.push("PERSIST");
  }

  // Fields
  args.push("FIELDS", fields.length, ...fields);

  const result = await valkey.call("HGETEX", ...args);
  return result as (string | null)[];
}

/**
 * HTTL - Get the remaining TTL of hash field(s) in seconds
 *
 * @param key - The hash key
 * @param fields - Array of field names
 *
 * @returns Array of TTLs:
 *   - -2: Field doesn't exist
 *   - -1: Field has no expiration
 *   - >= 0: Remaining TTL in seconds
 */
export async function httl(key: string, fields: string[]): Promise<number[]> {
  if (fields.length === 0) return [];

  const args: (string | number)[] = [key, "FIELDS", fields.length, ...fields];
  const result = await valkey.call("HTTL", ...args);
  return result as number[];
}

/**
 * HPERSIST - Remove expiration from hash field(s)
 *
 * @param key - The hash key
 * @param fields - Array of field names
 *
 * @returns Array of results:
 *   - -2: Field doesn't exist
 *   - -1: Field had no expiration
 *   - 1: Expiration was removed
 */
export async function hpersist(key: string, fields: string[]): Promise<number[]> {
  if (fields.length === 0) return [];

  const args: (string | number)[] = [key, "FIELDS", fields.length, ...fields];
  const result = await valkey.call("HPERSIST", ...args);
  return result as number[];
}

/**
 * HEXPIRE - Set expiration on existing hash field(s)
 *
 * @param key - The hash key
 * @param ttlSeconds - TTL in seconds
 * @param fields - Array of field names
 * @param options - Optional flags:
 *   - nx: Only set if field has no expiration
 *   - xx: Only set if field has expiration
 *   - gt: Only set if new TTL > current TTL
 *   - lt: Only set if new TTL < current TTL
 *
 * @returns Array of results:
 *   - -2: Field doesn't exist
 *   - 0: Condition not met (nx/xx/gt/lt)
 *   - 1: Expiration was set
 *   - 2: Expiration was deleted (ttl <= 0)
 */
export async function hexpire(
  key: string,
  ttlSeconds: number,
  fields: string[],
  options?: { nx?: boolean; xx?: boolean; gt?: boolean; lt?: boolean },
): Promise<number[]> {
  if (fields.length === 0) return [];

  const args: (string | number)[] = [key, ttlSeconds];

  // Condition flags (mutually exclusive)
  if (options?.nx) args.push("NX");
  else if (options?.xx) args.push("XX");
  else if (options?.gt) args.push("GT");
  else if (options?.lt) args.push("LT");

  args.push("FIELDS", fields.length, ...fields);

  const result = await valkey.call("HEXPIRE", ...args);
  return result as number[];
}
