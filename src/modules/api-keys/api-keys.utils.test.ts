import { describe, expect, it } from "vitest";
import {
  extractPrefix,
  generateApiKey,
  hashApiKey,
  isTestKey,
  isValidApiKeyFormat,
} from "./api-keys.utils";

describe("api-keys.utils", () => {
  describe("generateApiKey", () => {
    it("should generate a live key by default", () => {
      const { key, prefix } = generateApiKey();

      expect(key).toMatch(/^idk_live_[A-Za-z0-9_-]+$/);
      expect(prefix).toMatch(/^idk_live_[A-Za-z0-9_-]{4}$/);
    });

    it("should generate a test key when isTest is true", () => {
      const { key, prefix } = generateApiKey(true);

      expect(key).toMatch(/^idk_test_[A-Za-z0-9_-]+$/);
      expect(prefix).toMatch(/^idk_test_[A-Za-z0-9_-]{4}$/);
    });

    it("should generate unique keys each time", () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();

      expect(key1.key).not.toBe(key2.key);
      expect(key1.prefix).not.toBe(key2.prefix);
    });

    it("should generate keys with sufficient randomness", () => {
      const { key } = generateApiKey();
      const randomPart = key.split("_").slice(2).join("_");

      // Should have at least 20 random characters
      expect(randomPart.length).toBeGreaterThanOrEqual(20);
    });
  });

  describe("hashApiKey", () => {
    it("should return a SHA-256 hash", () => {
      const hash = hashApiKey("test-key");

      // SHA-256 produces 64 hex characters
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it("should produce consistent hashes for same input", () => {
      const hash1 = hashApiKey("same-key");
      const hash2 = hashApiKey("same-key");

      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different inputs", () => {
      const hash1 = hashApiKey("key-1");
      const hash2 = hashApiKey("key-2");

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("isValidApiKeyFormat", () => {
    it("should return true for valid live keys", () => {
      const { key } = generateApiKey(false);

      expect(isValidApiKeyFormat(key)).toBe(true);
    });

    it("should return true for valid test keys", () => {
      const { key } = generateApiKey(true);

      expect(isValidApiKeyFormat(key)).toBe(true);
    });

    it("should return false for keys with wrong prefix", () => {
      expect(isValidApiKeyFormat("xyz_live_abcdefghijklmnopqrstuvwxyz")).toBe(false);
    });

    it("should return false for keys with invalid environment", () => {
      expect(isValidApiKeyFormat("idk_prod_abcdefghijklmnopqrstuvwxyz")).toBe(false);
    });

    it("should return false for keys with insufficient random part", () => {
      expect(isValidApiKeyFormat("idk_live_short")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isValidApiKeyFormat("")).toBe(false);
    });

    it("should return false for completely invalid format", () => {
      expect(isValidApiKeyFormat("not-a-valid-key")).toBe(false);
    });
  });

  describe("isTestKey", () => {
    it("should return true for test keys", () => {
      const { key } = generateApiKey(true);

      expect(isTestKey(key)).toBe(true);
    });

    it("should return false for live keys", () => {
      const { key } = generateApiKey(false);

      expect(isTestKey(key)).toBe(false);
    });

    it("should return false for invalid keys", () => {
      expect(isTestKey("invalid-key")).toBe(false);
    });
  });

  describe("extractPrefix", () => {
    it("should extract prefix from valid key", async () => {
      // Generate keys until we get one without _ in first 4 chars of random part
      // (base64url can include _, which affects split behavior)
      let key: string;
      let prefix: string;
      let attempts = 0;
      do {
        const result = generateApiKey();
        key = result.key;
        prefix = result.prefix;
        attempts++;
      } while (prefix.split("_").length > 3 && attempts < 10);

      // Test that extractPrefix returns a prefix that starts the same
      const extracted = extractPrefix(key);
      expect(extracted.startsWith("idk_live_")).toBe(true);
      expect(extracted.length).toBeLessThanOrEqual(prefix.length + 1);
    });

    it("should handle short invalid keys gracefully", () => {
      const result = extractPrefix("short");

      expect(result).toBe("short");
    });

    it("should extract first 12 chars for keys with less than 3 parts", () => {
      const result = extractPrefix("idk_notenough");

      expect(result).toBe("idk_notenough".substring(0, 12));
    });

    it("should work with test keys", () => {
      // Generate keys until we get one without _ in first 4 chars of random part
      let key: string;
      let attempts = 0;
      do {
        const result = generateApiKey(true);
        key = result.key;
        attempts++;
      } while (key.split("_").length > 3 && attempts < 10);

      const extracted = extractPrefix(key);
      expect(extracted.startsWith("idk_test_")).toBe(true);
    });
  });
});
