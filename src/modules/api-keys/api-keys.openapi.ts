/**
 * API Keys Module - OpenAPI Route Definitions
 *
 * Registers all API key management endpoints with the OpenAPI registry.
 */

import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "@/lib/openapi";
import {
  createDataResponseSchema,
  createMessageResponseSchema,
  commonErrorResponses,
  UuidSchema,
  TimestampSchema,
} from "@/lib/openapi/responses";

extendZodWithOpenApi(z);

// ═══════════════════════════════════════════════════════════════════════════
// API KEY SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * API Key scope enum
 */
const ApiKeyScopeSchema = z
  .enum(["read", "write", "delete", "admin"])
  .describe("Permission scope for API key")
  .openapi("ApiKeyScope");

/**
 * Create API key request body
 */
const CreateApiKeyRequestSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(100)
      .describe("A friendly name to identify this API key (e.g., 'Production API')"),
    scopes: z
      .array(ApiKeyScopeSchema)
      .min(1)
      .default(["read"])
      .describe("Permissions granted to this API key"),
    expiresInDays: z
      .number()
      .int()
      .positive()
      .max(365)
      .optional()
      .describe("Number of days until the key expires (optional, no expiration if not set)"),
  })
  .openapi("CreateApiKeyRequest");

/**
 * API key response (without the full key)
 */
const ApiKeyResponseSchema = z
  .object({
    id: UuidSchema.describe("Unique API key identifier"),
    name: z.string().describe("Friendly name for the API key"),
    prefix: z.string().describe("Key prefix for identification (e.g., 'idk_live_Abc1')"),
    scopes: z.array(z.string()).describe("Permissions granted to this key"),
    lastUsedAt: TimestampSchema.nullable().describe("Last time this key was used"),
    usageCount: z.number().describe("Total number of times this key has been used"),
    expiresAt: TimestampSchema.nullable().describe("When this key will expire (null if never)"),
    isActive: z.boolean().describe("Whether this key is currently active"),
    createdAt: TimestampSchema.describe("When this key was created"),
  })
  .openapi("ApiKeyResponse");

/**
 * API key with full secret (only returned on creation)
 */
const ApiKeyWithSecretSchema = ApiKeyResponseSchema.extend({
  key: z
    .string()
    .describe("The full API key secret. Store this securely - it will not be shown again!"),
}).openapi("ApiKeyWithSecret");

/**
 * API key statistics
 */
const ApiKeyStatsSchema = z
  .object({
    total: z.number().describe("Total number of API keys"),
    active: z.number().describe("Number of active (usable) keys"),
    expired: z.number().describe("Number of expired keys"),
    revoked: z.number().describe("Number of revoked keys"),
  })
  .openapi("ApiKeyStats");

// ═══════════════════════════════════════════════════════════════════════════
// API KEY ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/organizations/:organizationId/api-keys
 * Create a new API key
 */
registry.registerPath({
  method: "post",
  path: "/api/organizations/{organizationId}/api-keys",
  tags: ["API Keys"],
  summary: "Create a new API key",
  description: `
Create a new API key for programmatic access to the InsightDesk API.

**Important:**
- The full API key is only returned once, in the response to this request
- Store the key securely - it cannot be retrieved again
- API keys inherit the permissions of the user who created them
- Only admins and owners can create API keys

**Scopes:**
- \`read\`: Read-only access to resources
- \`write\`: Create and update resources
- \`delete\`: Delete resources
- \`admin\`: Full administrative access
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
    }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: CreateApiKeyRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "API key created successfully",
      content: {
        "application/json": {
          schema: z
            .object({
              success: z.literal(true),
              data: ApiKeyWithSecretSchema,
              message: z
                .string()
                .default(
                  "API key created successfully. Store the key securely - it will not be shown again!",
                ),
            })
            .openapi("CreateApiKeyResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

/**
 * GET /api/organizations/:organizationId/api-keys
 * List all API keys
 */
registry.registerPath({
  method: "get",
  path: "/api/organizations/{organizationId}/api-keys",
  tags: ["API Keys"],
  summary: "List all API keys",
  description: `
List all API keys for an organization.

**Note:** The full key secrets are never returned - only the prefix for identification.
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "List of API keys",
      content: {
        "application/json": {
          schema: createDataResponseSchema(z.array(ApiKeyResponseSchema), "ListApiKeysResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

/**
 * GET /api/organizations/:organizationId/api-keys/stats
 * Get API key statistics
 */
registry.registerPath({
  method: "get",
  path: "/api/organizations/{organizationId}/api-keys/stats",
  tags: ["API Keys"],
  summary: "Get API key statistics",
  description: "Get aggregate statistics about API keys for an organization.",
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "API key statistics",
      content: {
        "application/json": {
          schema: createDataResponseSchema(ApiKeyStatsSchema, "ApiKeyStatsResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

/**
 * GET /api/organizations/:organizationId/api-keys/:keyId
 * Get a specific API key
 */
registry.registerPath({
  method: "get",
  path: "/api/organizations/{organizationId}/api-keys/{keyId}",
  tags: ["API Keys"],
  summary: "Get API key details",
  description: "Get details about a specific API key. The full key secret is never returned.",
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
      keyId: UuidSchema.describe("API key ID"),
    }),
  },
  responses: {
    200: {
      description: "API key details",
      content: {
        "application/json": {
          schema: createDataResponseSchema(ApiKeyResponseSchema, "GetApiKeyResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

/**
 * POST /api/organizations/:organizationId/api-keys/:keyId/revoke
 * Revoke an API key
 */
registry.registerPath({
  method: "post",
  path: "/api/organizations/{organizationId}/api-keys/{keyId}/revoke",
  tags: ["API Keys"],
  summary: "Revoke an API key",
  description: `
Revoke an API key, preventing its use for authentication.

**Note:** Revoked keys are kept for audit purposes but cannot be reactivated.
Use DELETE to permanently remove a key.
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
      keyId: UuidSchema.describe("API key ID"),
    }),
  },
  responses: {
    200: {
      description: "API key revoked successfully",
      content: {
        "application/json": {
          schema: createMessageResponseSchema("RevokeApiKeyResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

/**
 * DELETE /api/organizations/:organizationId/api-keys/:keyId
 * Delete an API key permanently
 */
registry.registerPath({
  method: "delete",
  path: "/api/organizations/{organizationId}/api-keys/{keyId}",
  tags: ["API Keys"],
  summary: "Delete an API key permanently",
  description: `
Permanently delete an API key.

**Warning:** This action cannot be undone. Only organization owners can delete API keys.
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
      keyId: UuidSchema.describe("API key ID"),
    }),
  },
  responses: {
    200: {
      description: "API key deleted permanently",
      content: {
        "application/json": {
          schema: createMessageResponseSchema("DeleteApiKeyResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});
