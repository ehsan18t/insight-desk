/**
 * Tenant-aware database operations
 *
 * This module provides utilities for executing database operations with
 * Row-Level Security (RLS) tenant context. It sets PostgreSQL session
 * variables that are used by RLS policies to filter data by organization.
 *
 * @module with-tenant
 */

import { sql, type SQL } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";

import { db as baseDb } from "./index";
import type * as schema from "./schema/index";

// Type for our schema
type Schema = typeof schema;

/**
 * Context for tenant-scoped database operations
 */
export interface TenantContext {
  /** The organization ID for RLS filtering */
  organizationId: string;
  /** Optional user ID for user-specific policies */
  userId?: string;
}

/**
 * Transaction type with our schema
 */
export type TenantTransaction = PgTransaction<
  PostgresJsQueryResultHKT,
  Schema,
  ExtractTablesWithRelations<Schema>
>;

/**
 * Transaction callback function type
 */
type TransactionCallback<T> = (tx: TenantTransaction) => Promise<T>;

/**
 * Sets the tenant context for RLS policies using SET LOCAL.
 * SET LOCAL ensures the settings only apply to the current transaction.
 *
 * @param ctx - The tenant context containing organizationId and optional userId
 * @returns SQL statement to set tenant context
 */
function buildSetTenantContextSQL(ctx: TenantContext): SQL {
  const statements: string[] = [];

  // Always set organization context
  statements.push(`SET LOCAL app.current_org_id = '${ctx.organizationId}'`);

  // Optionally set user context if provided
  if (ctx.userId) {
    statements.push(`SET LOCAL app.current_user_id = '${ctx.userId}'`);
  }

  return sql.raw(statements.join("; "));
}

/**
 * Execute a database operation within a tenant-scoped transaction.
 *
 * This function wraps database operations in a transaction that:
 * 1. Sets the tenant context (organization_id, user_id) via SET LOCAL
 * 2. Executes the provided callback with RLS policies active
 * 3. Automatically commits or rolls back the transaction
 *
 * The SET LOCAL ensures that context variables are:
 * - Scoped only to this transaction
 * - Automatically cleared when transaction ends
 * - Not visible to other concurrent connections
 *
 * @example
 * ```typescript
 * // In a route handler
 * const tickets = await withTenant(
 *   { organizationId: req.organizationId, userId: req.user.id },
 *   async (tx) => {
 *     return await tx.select().from(tickets);
 *   }
 * );
 * ```
 *
 * @param ctx - The tenant context for RLS
 * @param callback - The database operation to execute
 * @returns The result of the callback
 * @throws Rethrows any error from the callback (transaction is rolled back)
 */
export async function withTenant<T>(
  ctx: TenantContext,
  callback: TransactionCallback<T>,
): Promise<T> {
  return await baseDb.transaction(async (tx) => {
    // Set tenant context for this transaction only
    await tx.execute(buildSetTenantContextSQL(ctx));

    // Execute the callback with RLS policies active
    return await callback(tx);
  });
}

/**
 * Execute a read-only database query with tenant context.
 *
 * Similar to withTenant but optimized for read operations.
 * Still uses a transaction to ensure SET LOCAL is properly scoped.
 *
 * @example
 * ```typescript
 * const ticket = await withTenantRead(
 *   { organizationId: req.organizationId },
 *   async (tx) => {
 *     return await tx.query.tickets.findFirst({
 *       where: eq(tickets.id, ticketId)
 *     });
 *   }
 * );
 * ```
 *
 * @param ctx - The tenant context for RLS
 * @param callback - The read operation to execute
 * @returns The result of the callback
 */
export async function withTenantRead<T>(
  ctx: TenantContext,
  callback: TransactionCallback<T>,
): Promise<T> {
  // For now, same as withTenant
  // In the future, could use READ ONLY transaction mode
  return await withTenant(ctx, callback);
}

/**
 * Utility to create a tenant-scoped database instance for a request.
 *
 * This is useful when you want to pass a tenant-aware db to services
 * that don't need to know about the tenant context.
 *
 * @example
 * ```typescript
 * // In middleware
 * const tenantDb = createTenantDb({
 *   organizationId: req.organizationId,
 *   userId: req.user.id
 * });
 * req.tenantDb = tenantDb;
 *
 * // In service
 * const tickets = await req.tenantDb(async (tx) => {
 *   return await tx.select().from(tickets);
 * });
 * ```
 *
 * @param ctx - The tenant context for RLS
 * @returns A function that wraps callbacks with tenant context
 */
export function createTenantDb(ctx: TenantContext) {
  return async <T>(callback: TransactionCallback<T>): Promise<T> => {
    return await withTenant(ctx, callback);
  };
}

/**
 * Type for the tenant-scoped database function
 */
export type TenantDb = ReturnType<typeof createTenantDb>;
