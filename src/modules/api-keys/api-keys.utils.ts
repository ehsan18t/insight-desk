// API Key Utility Functions
// Cryptographic functions for API key generation and validation

import { createHash, randomBytes } from "node:crypto";

// API key prefix for identification (identifies the app and environment)
const API_KEY_PREFIX = "idk"; // InsightDesk Key
const API_KEY_LIVE_SUFFIX = "live";
const API_KEY_TEST_SUFFIX = "test";

/**
 * Generate a new API key with prefix
 * Format: idk_live_<32 random chars> or idk_test_<32 random chars>
 *
 * @param isTest - Whether this is a test key (for sandbox/dev environments)
 * @returns Object containing the full key and the prefix for storage
 */
export function generateApiKey(isTest = false): { key: string; prefix: string } {
  const suffix = isTest ? API_KEY_TEST_SUFFIX : API_KEY_LIVE_SUFFIX;
  const randomPart = randomBytes(24).toString("base64url"); // ~32 chars, URL-safe

  const fullKey = `${API_KEY_PREFIX}_${suffix}_${randomPart}`;
  const prefix = `${API_KEY_PREFIX}_${suffix}_${randomPart.substring(0, 4)}`;

  return { key: fullKey, prefix };
}

/**
 * Hash an API key using SHA-256 for secure storage
 * We only store the hash, never the plain key
 *
 * @param apiKey - The full API key to hash
 * @returns SHA-256 hash of the key
 */
export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

/**
 * Validate the format of an API key
 *
 * @param apiKey - The API key to validate
 * @returns True if the key has valid format
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  // Match: idk_(live|test)_<base64url chars>
  const pattern = /^idk_(live|test)_[A-Za-z0-9_-]{20,}$/;
  return pattern.test(apiKey);
}

/**
 * Check if an API key is a test key
 *
 * @param apiKey - The API key to check
 * @returns True if this is a test key
 */
export function isTestKey(apiKey: string): boolean {
  return apiKey.startsWith(`${API_KEY_PREFIX}_${API_KEY_TEST_SUFFIX}_`);
}

/**
 * Extract the prefix from an API key (for display/identification)
 *
 * @param apiKey - The full API key
 * @returns The prefix portion (e.g., "idk_live_Abc1")
 */
export function extractPrefix(apiKey: string): string {
  const parts = apiKey.split("_");
  if (parts.length < 3) return apiKey.substring(0, 12);

  const [prefix, env, random] = parts;
  return `${prefix}_${env}_${random.substring(0, 4)}`;
}
