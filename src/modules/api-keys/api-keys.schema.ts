// API Key Validation Schemas
import { z } from "zod";

// Available scopes
export const apiKeyScopeSchema = z.enum(["read", "write", "delete", "admin"]);

// Create API key input
export const createApiKeySchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less")
    .describe("A friendly name to identify this API key"),
  scopes: z
    .array(apiKeyScopeSchema)
    .min(1, "At least one scope is required")
    .default(["read"])
    .describe("Permissions granted to this API key"),
  expiresInDays: z
    .number()
    .int()
    .positive()
    .max(365, "Expiration cannot exceed 365 days")
    .optional()
    .describe("Number of days until the key expires (optional, no expiration if not set)"),
});

// API key response schema
export const apiKeyResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.string()),
  lastUsedAt: z.string().datetime().nullable(),
  usageCount: z.number(),
  expiresAt: z.string().datetime().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
});

// API key with secret (only on creation)
export const apiKeyWithSecretSchema = apiKeyResponseSchema.extend({
  key: z.string().describe("The full API key. Store this securely - it will not be shown again!"),
});

// API key stats response
export const apiKeyStatsSchema = z.object({
  total: z.number(),
  active: z.number(),
  expired: z.number(),
  revoked: z.number(),
});

// Path params
export const apiKeyIdParamSchema = z.object({
  keyId: z.string().uuid("Invalid API key ID"),
});

// Types
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type ApiKeyResponse = z.infer<typeof apiKeyResponseSchema>;
export type ApiKeyWithSecret = z.infer<typeof apiKeyWithSecretSchema>;
export type ApiKeyStats = z.infer<typeof apiKeyStatsSchema>;
