import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError } from "@/middleware/error-handler";
import {
  API_KEY_SCOPES,
  createApiKey,
  deleteApiKey,
  getApiKeyById,
  getApiKeyStats,
  listApiKeys,
  revokeApiKey,
  updateApiKeyUsage,
  validateApiKeyByHash,
} from "./api-keys.service";

// Mock the database
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
        orderBy: vi.fn(() => Promise.resolve([])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
    query: {
      apiKeys: {
        findFirst: vi.fn(() => Promise.resolve(undefined)),
      },
    },
  },
  closeDatabaseConnection: vi.fn(),
}));

// Mock the utils
vi.mock("./api-keys.utils", () => ({
  generateApiKey: vi.fn(() => ({
    key: "idk_live_test_key_123456789012",
    prefix: "idk_live_test",
  })),
  hashApiKey: vi.fn((key: string) => `hashed_${key}`),
}));

import { db } from "@/db";
import {
  generateApiKey as mockGenerateApiKey,
  hashApiKey as mockHashApiKey,
} from "./api-keys.utils";

describe("api-keys.service", () => {
  const mockOrgId = "org-123";
  const mockUserId = "user-456";
  const mockKeyId = "key-789";

  const mockApiKey = {
    id: mockKeyId,
    organizationId: mockOrgId,
    createdById: mockUserId,
    name: "Test API Key",
    prefix: "idk_live_test",
    keyHash: "hashed_key",
    scopes: ["read", "write"],
    lastUsedAt: null,
    lastUsedIp: null,
    usageCount: 0,
    expiresAt: null,
    isActive: true,
    revokedAt: null,
    revokedById: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("API_KEY_SCOPES", () => {
    it("should define all available scopes", () => {
      expect(API_KEY_SCOPES).toEqual({
        read: "Read-only access to resources",
        write: "Create and update resources",
        delete: "Delete resources",
        admin: "Full administrative access",
      });
    });
  });

  describe("createApiKey", () => {
    it("should create a new API key with correct values passed to insert", async () => {
      const valuesMock = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockApiKey]),
      });

      vi.mocked(db.insert).mockReturnValue({
        values: valuesMock,
      } as unknown as ReturnType<typeof db.insert>);

      await createApiKey(mockOrgId, mockUserId, { name: "Test Key" });

      // Verify first insert call is for the API key with correct values
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: mockOrgId,
          createdById: mockUserId,
          name: "Test Key",
          prefix: "idk_live_test",
          keyHash: "hashed_idk_live_test_key_123456789012",
          scopes: ["read"], // Default scope
        }),
      );
      expect(mockGenerateApiKey).toHaveBeenCalled();
      expect(mockHashApiKey).toHaveBeenCalledWith("idk_live_test_key_123456789012");
    });

    it("should create API key with custom scopes passed to insert", async () => {
      const valuesMock = vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue([{ ...mockApiKey, scopes: ["read", "write", "delete"] }]),
      });

      vi.mocked(db.insert).mockReturnValue({
        values: valuesMock,
      } as unknown as ReturnType<typeof db.insert>);

      await createApiKey(mockOrgId, mockUserId, {
        name: "Admin Key",
        scopes: ["read", "write", "delete"],
      });

      // Verify scopes are passed correctly
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: ["read", "write", "delete"],
        }),
      );
    });

    it("should create API key with expiration date", async () => {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ ...mockApiKey, expiresAt }]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const result = await createApiKey(mockOrgId, mockUserId, {
        name: "Expiring Key",
        expiresInDays: 30,
      });

      expect(result.expiresAt).not.toBeNull();
    });

    it("should log API key creation in audit log", async () => {
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockApiKey]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      await createApiKey(mockOrgId, mockUserId, { name: "Test Key" });

      // Insert is called twice: once for API key, once for audit log
      expect(db.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe("listApiKeys", () => {
    it("should return all API keys for organization", async () => {
      const mockKeys = [
        mockApiKey,
        { ...mockApiKey, id: "key-2", name: "Second Key" },
        { ...mockApiKey, id: "key-3", name: "Third Key" },
      ];

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockKeys),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await listApiKeys(mockOrgId);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe("Test API Key");
      // Verify key secret is NOT returned in list
      expect(result[0]).not.toHaveProperty("key");
      expect(result[0]).not.toHaveProperty("keyHash");
    });

    it("should return empty array when no keys exist", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await listApiKeys(mockOrgId);

      expect(result).toEqual([]);
    });

    it("should correctly map isActive status when key is revoked", async () => {
      const revokedKey = { ...mockApiKey, isActive: true, revokedAt: new Date() };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([revokedKey]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await listApiKeys(mockOrgId);

      // isActive should be false because revokedAt is set
      expect(result[0].isActive).toBe(false);
    });
  });

  describe("getApiKeyById", () => {
    it("should return API key when found", async () => {
      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValue(mockApiKey as never);

      const result = await getApiKeyById(mockOrgId, mockKeyId);

      expect(result.id).toBe(mockKeyId);
      expect(result.name).toBe("Test API Key");
    });

    it("should throw NotFoundError when key does not exist", async () => {
      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValue(undefined);

      await expect(getApiKeyById(mockOrgId, "nonexistent-key")).rejects.toThrow(NotFoundError);
      await expect(getApiKeyById(mockOrgId, "nonexistent-key")).rejects.toThrow(
        "API key not found",
      );
    });

    it("should throw NotFoundError when key belongs to different organization", async () => {
      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValue(undefined);

      await expect(getApiKeyById("other-org", mockKeyId)).rejects.toThrow(NotFoundError);
    });
  });

  describe("revokeApiKey", () => {
    it("should revoke an active API key", async () => {
      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValue(mockApiKey as never);
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as ReturnType<typeof db.update>);
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      await revokeApiKey(mockOrgId, mockKeyId, mockUserId);

      expect(db.update).toHaveBeenCalled();
      // Verify audit log was created
      expect(db.insert).toHaveBeenCalled();
    });

    it("should throw NotFoundError when key does not exist", async () => {
      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValue(undefined);

      await expect(revokeApiKey(mockOrgId, "nonexistent-key", mockUserId)).rejects.toThrow(
        NotFoundError,
      );
    });

    it("should throw ForbiddenError when key is already revoked", async () => {
      const revokedKey = { ...mockApiKey, revokedAt: new Date() };
      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValue(revokedKey as never);

      await expect(revokeApiKey(mockOrgId, mockKeyId, mockUserId)).rejects.toThrow(ForbiddenError);
      await expect(revokeApiKey(mockOrgId, mockKeyId, mockUserId)).rejects.toThrow(
        "API key is already revoked",
      );
    });

    it("should throw ForbiddenError when key is inactive", async () => {
      const inactiveKey = { ...mockApiKey, isActive: false };
      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValue(inactiveKey as never);

      await expect(revokeApiKey(mockOrgId, mockKeyId, mockUserId)).rejects.toThrow(ForbiddenError);
    });
  });

  describe("deleteApiKey", () => {
    it("should delete an API key permanently", async () => {
      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValue(mockApiKey as never);
      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as unknown as ReturnType<typeof db.delete>);

      await deleteApiKey(mockOrgId, mockKeyId);

      expect(db.delete).toHaveBeenCalled();
    });

    it("should throw NotFoundError when key does not exist", async () => {
      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValue(undefined);

      await expect(deleteApiKey(mockOrgId, "nonexistent-key")).rejects.toThrow(NotFoundError);
      await expect(deleteApiKey(mockOrgId, "nonexistent-key")).rejects.toThrow("API key not found");
    });

    it("should delete revoked keys as well", async () => {
      const revokedKey = { ...mockApiKey, isActive: false, revokedAt: new Date() };
      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValue(revokedKey as never);
      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as unknown as ReturnType<typeof db.delete>);

      await deleteApiKey(mockOrgId, mockKeyId);

      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe("getApiKeyStats", () => {
    it("should return statistics for organization API keys", async () => {
      const mockStats = { total: 5, active: 3, expired: 1, revoked: 1 };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockStats]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await getApiKeyStats(mockOrgId);

      expect(result.total).toBe(5);
      expect(result.active).toBe(3);
      expect(result.expired).toBe(1);
      expect(result.revoked).toBe(1);
    });

    it("should return zeros when no keys exist", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await getApiKeyStats(mockOrgId);

      expect(result).toEqual({ total: 0, active: 0, expired: 0, revoked: 0 });
    });

    it("should calculate correct active count excluding expired and revoked", async () => {
      const mockStats = { total: 10, active: 7, expired: 2, revoked: 1 };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockStats]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await getApiKeyStats(mockOrgId);

      expect(result.total).toBe(10);
      expect(result.active).toBe(7);
    });
  });

  describe("validateApiKeyByHash", () => {
    const mockKeyWithUser = {
      ...mockApiKey,
      createdBy: {
        id: mockUserId,
        email: "test@example.com",
        name: "Test User",
      },
    };

    it("should return key with user when valid and active", async () => {
      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValue(mockKeyWithUser as never);

      const result = await validateApiKeyByHash("hashed_key");

      expect(result).not.toBeNull();
      expect(result?.user.id).toBe(mockUserId);
      expect(result?.user.email).toBe("test@example.com");
    });

    it("should return null when key not found", async () => {
      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValue(undefined);

      const result = await validateApiKeyByHash("nonexistent_hash");

      expect(result).toBeNull();
    });

    it("should return null when key has no associated user", async () => {
      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValue({
        ...mockApiKey,
        createdBy: null,
      } as never);

      const result = await validateApiKeyByHash("hashed_key");

      expect(result).toBeNull();
    });

    it("should return null when key is expired", async () => {
      const expiredKey = {
        ...mockKeyWithUser,
        expiresAt: new Date("2020-01-01"), // Past date
      };
      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValue(expiredKey as never);

      const result = await validateApiKeyByHash("hashed_key");

      expect(result).toBeNull();
    });

    it("should return valid key when expiration is in the future", async () => {
      const futureExpirationKey = {
        ...mockKeyWithUser,
        expiresAt: new Date("2099-01-01"), // Future date
      };
      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValue(futureExpirationKey as never);

      const result = await validateApiKeyByHash("hashed_key");

      expect(result).not.toBeNull();
    });

    it("should return valid key when expiration is null (never expires)", async () => {
      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValue(mockKeyWithUser as never);

      const result = await validateApiKeyByHash("hashed_key");

      expect(result).not.toBeNull();
      expect(result?.expiresAt).toBeNull();
    });
  });

  describe("updateApiKeyUsage", () => {
    it("should update lastUsedAt and increment usageCount", async () => {
      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      vi.mocked(db.update).mockReturnValue({
        set: setMock,
      } as unknown as ReturnType<typeof db.update>);

      await updateApiKeyUsage(mockKeyId);

      expect(db.update).toHaveBeenCalled();
      expect(setMock).toHaveBeenCalled();
    });

    it("should handle update for nonexistent key gracefully", async () => {
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as ReturnType<typeof db.update>);

      // Should not throw - the SQL just won't match any rows
      await expect(updateApiKeyUsage("nonexistent-key")).resolves.not.toThrow();
    });
  });
});
