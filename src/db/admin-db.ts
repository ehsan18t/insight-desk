/**
 * Admin database connection that bypasses Row-Level Security (RLS)
 *
 * This module provides a database connection intended for:
 * - Background jobs (cron tasks, queue workers)
 * - System maintenance operations
 * - Cross-tenant reporting
 * - Data migrations
 *
 * SECURITY WARNING:
 * - Only use this for operations that legitimately need cross-tenant access
 * - Never expose this connection to user-facing request handlers
 * - Always audit usage of this connection
 *
 * @module admin-db
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

// Get admin database URL from environment
// In production, this should be a connection string for a role with BYPASSRLS
// For development, it can be the same as DATABASE_URL (superuser bypasses RLS)
const adminDatabaseUrl = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL;

if (!adminDatabaseUrl) {
  throw new Error("ADMIN_DATABASE_URL or DATABASE_URL environment variable is required");
}

// Create postgres connection for admin operations
// Limited pool size since this is only for background jobs
const adminClient = postgres(adminDatabaseUrl, {
  max: 3, // Small pool - admin operations are infrequent
  idle_timeout: 60, // Keep alive longer for batch operations
  connect_timeout: 10,
  prepare: true,
});

/**
 * Admin database instance that bypasses RLS policies.
 *
 * Use this ONLY for:
 * - Background jobs (SLA checking, usage tracking, etc.)
 * - System maintenance
 * - Cross-tenant analytics
 * - Data migrations
 *
 * Example:
 *   import { adminDb } from "@/db/admin-db";
 *   // This query returns ALL tickets across ALL organizations
 *   const overdueTickets = await adminDb
 *     .select()
 *     .from(tickets)
 *     .where(lt(tickets.slaDeadline, new Date()));
 */
export const adminDb = drizzle(adminClient, {
  schema,
  logger: process.env.NODE_ENV === "development",
});

// Export type for dependency injection
export type AdminDatabase = typeof adminDb;

/**
 * Health check for admin database connection
 */
export async function checkAdminDatabaseConnection(): Promise<boolean> {
  try {
    await adminClient`SELECT 1`;
    return true;
  } catch (error) {
    console.error("Admin database connection failed:", error);
    return false;
  }
}

/**
 * Graceful shutdown for admin connection
 */
export async function closeAdminDatabaseConnection(): Promise<void> {
  await adminClient.end();
}
