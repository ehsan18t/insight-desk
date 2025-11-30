#!/usr/bin/env node
/**
 * Production Database Setup Script
 *
 * Sets up a production PostgreSQL database with:
 * - Schema migrations (versioned, safe)
 * - RLS roles and permissions
 * - Optional seeding
 *
 * Usage:
 *   bun run db:setup:prod
 *   bun run db:setup:prod --dry-run
 *   bun run db:setup:prod --seed
 *
 * Options:
 *   --dry-run    Show what would be done without making changes
 *   --seed       Run seed after setup (not recommended for production)
 *   --verbose    Show detailed output
 */

import { Pool } from "pg";
import {
  runMigrations,
  grantRolePermissions,
  verifySetup,
  detectPackageManager,
} from "../src/lib/db-setup";

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

interface Config {
  databaseUrl: string;
  dbUser: string;
  dryRun: boolean;
  seed: boolean;
  verbose: boolean;
}

function parseArgs(): Config {
  const args = process.argv.slice(2);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is required");
    console.error("   Set it in your .env file or export it before running this script");
    process.exit(1);
  }

  // Extract username from DATABASE_URL
  const urlMatch = databaseUrl.match(/postgresql:\/\/([^:]+):/);
  const dbUser = urlMatch?.[1] ?? "postgres";

  return {
    databaseUrl,
    dbUser,
    dryRun: args.includes("--dry-run"),
    seed: args.includes("--seed"),
    verbose: args.includes("--verbose") || args.includes("-v"),
  };
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = parseArgs();
  const pm = detectPackageManager();

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║       InsightDesk Production Database Setup              ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log();

  if (config.dryRun) {
    console.log("🔍 DRY RUN MODE - No changes will be made\n");
  }

  console.log(`📦 Package manager: ${pm}`);
  console.log(`🗄️  Database user: ${config.dbUser}`);
  console.log();

  // Create connection pool
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 1,
  });

  try {
    // Test connection
    console.log("🔌 Testing database connection...");
    await pool.query("SELECT 1");
    console.log("   ✅ Connected to database\n");

    // Step 1: Run migrations
    console.log("📋 Step 1: Running migrations...");
    if (config.dryRun) {
      console.log("   [DRY RUN] Would run: drizzle-kit migrate\n");
    } else {
      runMigrations({
        databaseUrl: config.databaseUrl,
        verbose: config.verbose,
      });
      console.log("   ✅ Migrations complete\n");
    }

    // Step 2: Grant role permissions
    console.log("👤 Step 2: Setting up RLS roles and permissions...");
    if (config.dryRun) {
      console.log("   [DRY RUN] Would grant permissions to app_user and service_role\n");
    } else {
      await grantRolePermissions(pool, config.dbUser, config.verbose);
      console.log("   ✅ Role permissions granted\n");
    }

    // Step 3: Verify setup
    console.log("🔍 Step 3: Verifying setup...");
    if (config.dryRun) {
      console.log("   [DRY RUN] Would verify roles, RLS, and policies\n");
    } else {
      const result = await verifySetup(pool, config.verbose);

      if (!result.success) {
        console.warn("   ⚠️  Setup verification incomplete");
        console.warn("   Some components may need manual configuration");
      } else {
        console.log("   ✅ Setup verified\n");
      }
    }

    // Step 4: Optional seeding
    if (config.seed) {
      console.log("🌱 Step 4: Seeding database...");
      if (config.dryRun) {
        console.log("   [DRY RUN] Would run seed process\n");
      } else {
        console.log("   ⚠️  Seeding in production - are you sure?");
        console.log("   Importing seed module...");

        const { runSeed } = await import("../src/lib/seed");
        await runSeed({ reset: false, isTest: false });
        console.log("   ✅ Seeding complete\n");
      }
    }

    // Done
    console.log("╔══════════════════════════════════════════════════════════╗");
    console.log("║       ✅ Production Database Setup Complete!             ║");
    console.log("╚══════════════════════════════════════════════════════════╝");
    console.log();

    if (!config.dryRun) {
      const verify = await verifySetup(pool, false);
      console.log("Summary:");
      console.log(`  • Tables: ${verify.tables.total}`);
      console.log(`  • RLS-enabled tables: ${verify.rls.tablesWithRLS}`);
      console.log(`  • Security policies: ${verify.rls.totalPolicies}`);
      console.log(`  • Roles: app_user, service_role`);
      console.log();
    }
  } catch (error) {
    console.error("\n❌ Setup failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
