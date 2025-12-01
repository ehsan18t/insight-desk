import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

// Get database URL from environment
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Log database connection info (redacted for security)
const dbHost = databaseUrl.includes("@")
  ? databaseUrl.split("@")[1]?.split(":")[0]?.split("/")[0]
  : "unknown";
console.log(`[db] Connecting to PostgreSQL at host: ${dbHost}`);

// Create postgres connection
// PG18: Benefits from improved hash joins, GROUP BY performance, and AIO
const client = postgres(databaseUrl, {
  max: 10, // Maximum connections
  idle_timeout: 20, // Close idle connections after 20s
  connect_timeout: 10, // Connection timeout
  prepare: true, // Enable prepared statements for repeated query performance
});

// Create drizzle instance with schema
export const db = drizzle(client, {
  schema,
  logger: process.env.NODE_ENV === "development",
});

// Export types
export type Database = typeof db;

// Health check function
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await client`SELECT 1`;
    return true;
  } catch (error) {
    console.error("Database connection failed:", error);
    return false;
  }
}

// Graceful shutdown
export async function closeDatabaseConnection(): Promise<void> {
  await client.end();
}

// Export tenant-aware utilities
export {
  createTenantDb,
  withTenant,
  withTenantRead,
  type TenantContext,
  type TenantDb,
} from "./with-tenant";
