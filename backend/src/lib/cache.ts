import Valkey from "iovalkey";
import { config } from "../config";
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

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds = DEFAULT_TTL
): Promise<void> {
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
