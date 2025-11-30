// API Keys Service
// Business logic for API key management

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { type ApiKey, apiKeys, auditLogs } from "@/db/schema";
import { ForbiddenError, NotFoundError } from "@/middleware/error-handler";
import { generateApiKey, hashApiKey } from "./api-key.utils";

// Input types
export interface CreateApiKeyInput {
  name: string;
  scopes?: string[];
  expiresInDays?: number;
}

// Output types (key is only returned on creation, never again)
export interface ApiKeyResponse {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  usageCount: number;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}

export interface ApiKeyWithSecret extends ApiKeyResponse {
  key: string; // The full key, only returned on creation
}

// Available scopes for API keys
export const API_KEY_SCOPES = {
  read: "Read-only access to resources",
  write: "Create and update resources",
  delete: "Delete resources",
  admin: "Full administrative access",
} as const;

/**
 * Create a new API key for an organization
 */
export async function createApiKey(
  organizationId: string,
  userId: string,
  input: CreateApiKeyInput,
): Promise<ApiKeyWithSecret> {
  // Generate the API key
  const { key, prefix } = generateApiKey();
  const keyHash = hashApiKey(key);

  // Calculate expiration date if specified
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  // Default scopes to read-only if not specified
  const scopes = input.scopes ?? ["read"];

  // Insert the API key
  const [newKey] = await db
    .insert(apiKeys)
    .values({
      organizationId,
      createdById: userId,
      name: input.name,
      prefix,
      keyHash,
      scopes,
      expiresAt,
    })
    .returning();

  // Log the creation
  await db.insert(auditLogs).values({
    organizationId,
    userId,
    action: "api_key_created",
    resourceType: "api_key",
    resourceId: newKey.id,
    newValue: { name: input.name, prefix, scopes },
  });

  return {
    id: newKey.id,
    name: newKey.name,
    prefix: newKey.prefix,
    scopes: newKey.scopes || [],
    lastUsedAt: newKey.lastUsedAt,
    usageCount: newKey.usageCount,
    expiresAt: newKey.expiresAt,
    isActive: newKey.isActive,
    createdAt: newKey.createdAt,
    key, // Only returned on creation!
  };
}

/**
 * List all API keys for an organization
 */
export async function listApiKeys(organizationId: string): Promise<ApiKeyResponse[]> {
  const keys = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, organizationId))
    .orderBy(desc(apiKeys.createdAt));

  return keys.map(mapApiKeyToResponse);
}

/**
 * Get a specific API key by ID
 */
export async function getApiKeyById(
  organizationId: string,
  keyId: string,
): Promise<ApiKeyResponse> {
  const key = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.id, keyId), eq(apiKeys.organizationId, organizationId)),
  });

  if (!key) {
    throw new NotFoundError("API key not found");
  }

  return mapApiKeyToResponse(key);
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(
  organizationId: string,
  keyId: string,
  userId: string,
): Promise<void> {
  // Find the key
  const key = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.id, keyId), eq(apiKeys.organizationId, organizationId)),
  });

  if (!key) {
    throw new NotFoundError("API key not found");
  }

  if (!key.isActive || key.revokedAt) {
    throw new ForbiddenError("API key is already revoked");
  }

  // Revoke the key
  await db
    .update(apiKeys)
    .set({
      isActive: false,
      revokedAt: new Date(),
      revokedById: userId,
      updatedAt: new Date(),
    })
    .where(eq(apiKeys.id, keyId));

  // Log the revocation
  await db.insert(auditLogs).values({
    organizationId,
    userId,
    action: "api_key_revoked",
    resourceType: "api_key",
    resourceId: keyId,
    previousValue: { name: key.name, prefix: key.prefix },
  });
}

/**
 * Delete an API key permanently (admin only)
 */
export async function deleteApiKey(organizationId: string, keyId: string): Promise<void> {
  // First verify the key exists
  const key = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.id, keyId), eq(apiKeys.organizationId, organizationId)),
  });

  if (!key) {
    throw new NotFoundError("API key not found");
  }

  // Delete the key
  await db.delete(apiKeys).where(eq(apiKeys.id, keyId));
}

/**
 * Get API key statistics for an organization
 */
export async function getApiKeyStats(
  organizationId: string,
): Promise<{ total: number; active: number; expired: number; revoked: number }> {
  const stats = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${apiKeys.isActive} = true and ${apiKeys.revokedAt} is null and (${apiKeys.expiresAt} is null or ${apiKeys.expiresAt} > now()))::int`,
      expired: sql<number>`count(*) filter (where ${apiKeys.expiresAt} is not null and ${apiKeys.expiresAt} <= now())::int`,
      revoked: sql<number>`count(*) filter (where ${apiKeys.revokedAt} is not null)::int`,
    })
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, organizationId));

  return stats[0] || { total: 0, active: 0, expired: 0, revoked: 0 };
}

/**
 * Validate API key by hash and return details
 * Used internally by the auth middleware
 */
export async function validateApiKeyByHash(
  keyHash: string,
): Promise<(ApiKey & { user: { id: string; email: string; name: string } }) | null> {
  const key = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true), isNull(apiKeys.revokedAt)),
    with: {
      createdBy: true,
    },
  });

  if (!key || !key.createdBy) return null;

  // Check expiration
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
    return null;
  }

  return {
    ...key,
    user: {
      id: key.createdBy.id,
      email: key.createdBy.email,
      name: key.createdBy.name,
    },
  };
}

// Helper to map DB record to response
function mapApiKeyToResponse(key: ApiKey): ApiKeyResponse {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes || [],
    lastUsedAt: key.lastUsedAt,
    usageCount: key.usageCount,
    expiresAt: key.expiresAt,
    isActive: key.isActive && !key.revokedAt,
    createdAt: key.createdAt,
  };
}
