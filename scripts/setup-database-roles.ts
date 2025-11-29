/**
 * Database Roles Setup Script
 *
 * This script sets up the PostgreSQL roles required for Row-Level Security (RLS).
 * Run this once after creating the database and before running migrations.
 *
 * Usage: bun run scripts/setup-database-roles.ts
 */

import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

const execAsync = promisify(exec);

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is not set");
    console.error("   Set it in your .env file or export it before running this script");
    process.exit(1);
  }

  console.log("🔧 Setting up database roles for RLS...\n");

  // Read the SQL file
  const sqlPath = path.join(import.meta.dirname, "setup-database-roles.sql");
  const sqlContent = await readFile(sqlPath, "utf-8");

  // Run psql with the SQL file
  // We use psql directly to handle the DO blocks properly
  try {
    const { stdout, stderr } = await execAsync(
      `psql "${databaseUrl}" -f "${sqlPath}"`,
      { encoding: "utf-8" }
    );

    if (stdout) console.log(stdout);
    if (stderr && !stderr.includes("NOTICE:")) {
      console.error("Warnings:", stderr);
    }

    console.log("\n✅ Database roles setup complete!");
    console.log("\nRoles created:");
    console.log("  - app_user: For tenant-scoped queries (respects RLS)");
    console.log("  - service_role: For admin/background jobs (bypasses RLS)");
    console.log("\nYou can now run migrations: bun run db:migrate");
  } catch (error: unknown) {
    const execError = error as { stderr?: string; message: string };
    console.error("❌ Failed to setup database roles:");
    console.error(execError.stderr || execError.message);
    process.exit(1);
  }
}

main();
