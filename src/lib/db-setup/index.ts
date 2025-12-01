/**
 * Database Setup Module
 *
 * Shared utilities for setting up PostgreSQL databases with RLS
 * for both development/test (push) and production (migrate) environments.
 *
 * Usage:
 *   - Test/Dev: runSchemaPush() + grantRolePermissions()
 *   - Production: runMigrations() + grantRolePermissions()
 */

import { execSync } from "node:child_process";
import type { Pool } from "pg";
import { detectPackageManager, getExecCommand } from "@/lib/utils/package-manager";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SetupOptions {
  /** Database URL for schema operations */
  databaseUrl: string;
  /** Working directory for drizzle commands */
  cwd?: string;
  /** Whether to output verbose logs */
  verbose?: boolean;
}

export interface VerifyResult {
  roles: {
    appUser: boolean;
    serviceRole: boolean;
  };
  rls: {
    tablesWithRLS: number;
    totalPolicies: number;
  };
  tables: {
    total: number;
  };
  success: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Push schema directly to database using drizzle-kit push
 *
 * Best for: Development and test environments
 * - Fast, no migration files created
 * - Automatically syncs schema with database
 * - Creates tables, roles, and RLS policies from Drizzle schema
 */
export function runSchemaPush(options: SetupOptions): void {
  const { databaseUrl, cwd = process.cwd(), verbose = false } = options;
  const pm = detectPackageManager(cwd);
  const exec = getExecCommand(pm);

  if (verbose) {
    console.log(`   Using ${pm} to push schema...`);
  }

  try {
    // Roles should be pre-created before running this
    // Don't use --force as it tries to drop system roles like pg_database_owner
    // Use pipe for stdin to prevent interactive prompts, inherit stdout/stderr for verbose output
    execSync(`${exec} drizzle-kit push --config=drizzle.config.ts`, {
      stdio: verbose ? ["pipe", "inherit", "inherit"] : ["pipe", "pipe", "pipe"],
      cwd,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        CI: "true", // Ensure CI mode is set for drizzle config
      },
    });

    if (verbose) {
      console.log("   ✅ Schema pushed successfully");
    }
  } catch (error) {
    const errorStr = String(error);
    // Check if "nothing to push" (schema already up to date)
    if (errorStr.includes("No changes") || errorStr.includes("nothing to push")) {
      if (verbose) {
        console.log("   ✅ Schema already up to date");
      }
      return;
    }
    throw new Error(`Schema push failed: ${error}`);
  }
}

/**
 * Run migrations using drizzle-kit migrate
 *
 * Best for: Production environments
 * - Uses versioned migration files
 * - Safe, reversible changes
 * - Tracks migration history
 */
export function runMigrations(options: SetupOptions): void {
  const { databaseUrl, cwd = process.cwd(), verbose = false } = options;
  const pm = detectPackageManager(cwd);
  const exec = getExecCommand(pm);

  if (verbose) {
    console.log(`   Using ${pm} to run migrations...`);
  }

  try {
    execSync(`${exec} drizzle-kit migrate --config=drizzle.config.ts`, {
      stdio: verbose ? "inherit" : ["pipe", "pipe", "pipe"],
      cwd,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    });

    if (verbose) {
      console.log("   ✅ Migrations applied successfully");
    }
  } catch (error) {
    const errorStr = String(error);
    if (errorStr.includes("nothing to migrate") || errorStr.includes("No migrations")) {
      if (verbose) {
        console.log("   ✅ No pending migrations");
      }
      return;
    }
    throw new Error(`Migration failed: ${error}`);
  }
}

/**
 * Generate migration files from schema changes
 *
 * Best for: Production workflow - generate before deploy
 */
export function generateMigrations(options: SetupOptions & { name?: string }): void {
  const { databaseUrl, cwd = process.cwd(), verbose = false, name } = options;
  const pm = detectPackageManager(cwd);
  const exec = getExecCommand(pm);

  const nameFlag = name ? ` --name=${name}` : "";

  if (verbose) {
    console.log(`   Generating migration${name ? ` "${name}"` : ""}...`);
  }

  try {
    execSync(`${exec} drizzle-kit generate --config=drizzle.config.ts${nameFlag}`, {
      stdio: verbose ? "inherit" : ["pipe", "pipe", "pipe"],
      cwd,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    });

    if (verbose) {
      console.log("   ✅ Migration generated successfully");
    }
  } catch (error) {
    const errorStr = String(error);
    if (errorStr.includes("No schema changes")) {
      if (verbose) {
        console.log("   ✅ No schema changes to migrate");
      }
      return;
    }
    throw new Error(`Migration generation failed: ${error}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ROLE & PERMISSION SETUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Grant permissions to RLS roles after schema creation
 *
 * Drizzle creates the roles (app_user, service_role) but doesn't set up:
 * - BYPASSRLS for service_role
 * - GRANT to database user
 * - Schema and table permissions
 *
 * @param pool - PostgreSQL connection pool
 * @param dbUser - The database user to grant role membership to
 */
export async function grantRolePermissions(
  pool: Pool,
  dbUser: string,
  verbose = false,
): Promise<void> {
  if (verbose) {
    console.log("   Granting role permissions...");
  }

  // Ensure roles exist (they should be created by Drizzle schema)
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user WITH LOGIN;
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role WITH LOGIN;
      END IF;
    END $$;
  `);

  // Grant BYPASSRLS to service_role (not supported in Drizzle schema)
  await pool.query(`ALTER ROLE service_role BYPASSRLS;`);

  // Grant role membership to database user
  await pool.query(`GRANT app_user TO ${dbUser};`);
  await pool.query(`GRANT service_role TO ${dbUser};`);

  // Grant schema permissions
  await pool.query(`GRANT USAGE ON SCHEMA public TO app_user;`);
  await pool.query(`GRANT USAGE ON SCHEMA public TO service_role;`);

  // Grant table permissions
  await pool.query(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
  `);
  await pool.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;`);

  await pool.query(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
  `);
  await pool.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;`);

  // Set default privileges for future tables
  await pool.query(`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
  `);
  await pool.query(`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT USAGE ON SEQUENCES TO app_user;
  `);
  await pool.query(`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
  `);
  await pool.query(`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT USAGE ON SEQUENCES TO service_role;
  `);

  if (verbose) {
    console.log("   ✅ Role permissions granted");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verify database setup is complete and correct
 *
 * Checks:
 * - Roles exist (app_user, service_role)
 * - RLS is enabled on expected tables
 * - Policies are created
 * - Tables exist
 */
export async function verifySetup(pool: Pool, verbose = false): Promise<VerifyResult> {
  if (verbose) {
    console.log("   Verifying setup...");
  }

  // Check roles
  const rolesResult = await pool.query(`
    SELECT rolname, rolbypassrls 
    FROM pg_roles 
    WHERE rolname IN ('app_user', 'service_role')
  `);

  const roles = {
    appUser: rolesResult.rows.some((r) => r.rolname === "app_user"),
    serviceRole: rolesResult.rows.some((r) => r.rolname === "service_role" && r.rolbypassrls),
  };

  // Check RLS tables
  const rlsResult = await pool.query(`
    SELECT COUNT(*) as count 
    FROM pg_tables t
    JOIN pg_class c ON t.tablename = c.relname
    WHERE t.schemaname = 'public' 
    AND c.relrowsecurity = true
  `);
  const tablesWithRLS = parseInt(rlsResult.rows[0].count, 10);

  // Check policies
  const policiesResult = await pool.query(`
    SELECT COUNT(*) as count FROM pg_policies
  `);
  const totalPolicies = parseInt(policiesResult.rows[0].count, 10);

  // Check tables
  const tablesResult = await pool.query(`
    SELECT COUNT(*) as count 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);
  const totalTables = parseInt(tablesResult.rows[0].count, 10);

  const result: VerifyResult = {
    roles,
    rls: {
      tablesWithRLS,
      totalPolicies,
    },
    tables: {
      total: totalTables,
    },
    success: roles.appUser && roles.serviceRole && tablesWithRLS > 0 && totalPolicies > 0,
  };

  if (verbose) {
    console.log(`      Roles: app_user=${roles.appUser}, service_role=${roles.serviceRole}`);
    console.log(`      RLS: ${tablesWithRLS} tables, ${totalPolicies} policies`);
    console.log(`      Tables: ${totalTables}`);
    console.log(
      `   ${result.success ? "✅" : "⚠️"} Verification ${result.success ? "passed" : "incomplete"}`,
    );
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  detectPackageManager,
  getExecCommand,
  getInstallCommand,
  getRunCommand,
} from "@/lib/utils/package-manager";
