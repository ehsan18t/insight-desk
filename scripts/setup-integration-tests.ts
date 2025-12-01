#!/usr/bin/env node
/**
 * Integration Test Setup Script
 *
 * Comprehensive setup for integration tests that:
 * 1. Starts test containers (PostgreSQL, Valkey, MinIO, Mailpit)
 * 2. Waits for all services to be healthy
 * 3. Sets up test database with schema using drizzle-kit push
 * 4. Applies RLS policy expressions (USING/WITH CHECK clauses)
 * 5. Grants RLS role permissions
 * 6. Creates MinIO test bucket
 * 7. Verifies all services are ready
 *
 * Usage:
 *   bun run test:setup
 *   bunx tsx scripts/setup-integration-tests.ts
 *
 * Options:
 *   --skip-containers  Skip starting containers (assumes already running)
 *   --reset-only       Only reset test data without full setup
 */

import { execSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import { exec } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import {
  runSchemaPush,
  grantRolePermissions,
  detectPackageManager,
} from "../src/lib/db-setup";

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execAsync = promisify(exec);

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  composeFile: "docker-compose.test.yml",

  containers: {
    postgres: "insightdesk-postgres-test",
    valkey: "insightdesk-valkey-test",
    minio: "insightdesk-minio-test",
    mailpit: "insightdesk-mailpit-test",
  },

  postgres: {
    host: "localhost",
    port: 5433,
    user: "insightdesk",
    password: "insightdesk_test",
    database: "insightdesk_test",
  },

  mainPostgres: {
    container: "insightdesk-postgres",
    database: "insightdesk",
    user: "insightdesk",
  },

  minio: {
    endpoint: "http://localhost:9002",
    accessKey: "minioadmin",
    secretKey: "minioadmin",
    bucket: "insightdesk-test",
  },

  valkey: {
    host: "localhost",
    port: 6380,
  },

  mailpit: {
    apiUrl: "http://localhost:8026",
  },
};

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isContainerRunning(containerName: string): boolean {
  try {
    const result = execSync(`docker inspect -f "{{.State.Running}}" ${containerName}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim() === "true";
  } catch {
    return false;
  }
}

async function runPsql(
  container: string,
  database: string,
  user: string,
  sql: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("docker", ["exec", "-i", container, "psql", "-U", user, "-d", database], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0 && stderr && !stderr.includes("NOTICE:")) {
        reject(new Error(stderr || `Process exited with code ${code}`));
      } else {
        resolve(stdout);
      }
    });

    proc.on("error", reject);

    proc.stdin.write(sql);
    proc.stdin.end();
  });
}

// ─────────────────────────────────────────────────────────────
// Container Management
// ─────────────────────────────────────────────────────────────

async function startTestContainers(): Promise<void> {
  console.log("\n🐳 Starting test containers...");

  return new Promise((resolve, reject) => {
    const proc = spawn("docker", ["compose", "-f", CONFIG.composeFile, "up", "-d"], {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    proc.on("close", (code) => {
      if (code === 0) {
        console.log("   ✅ Test containers started");
        resolve();
      } else {
        reject(new Error(`docker compose up failed with code ${code}`));
      }
    });

    proc.on("error", reject);
  });
}

function checkContainers(): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(CONFIG.containers).map(([name, container]) => [
      name,
      isContainerRunning(container),
    ]),
  );
}

// ─────────────────────────────────────────────────────────────
// Health Checks
// ─────────────────────────────────────────────────────────────

async function waitForPostgres(maxAttempts = 30): Promise<void> {
  console.log("   ⏳ Waiting for PostgreSQL...");

  for (let i = 0; i < maxAttempts; i++) {
    try {
      execSync(
        `docker exec ${CONFIG.containers.postgres} pg_isready -U ${CONFIG.postgres.user} -d postgres`,
        { stdio: "pipe" },
      );
      console.log("      ✅ PostgreSQL is ready");
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error("PostgreSQL failed to become ready");
}

async function waitForValkey(maxAttempts = 30): Promise<void> {
  console.log("   ⏳ Waiting for Valkey...");

  for (let i = 0; i < maxAttempts; i++) {
    try {
      execSync(`docker exec ${CONFIG.containers.valkey} valkey-cli ping`, { stdio: "pipe" });
      console.log("      ✅ Valkey is ready");
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error("Valkey failed to become ready");
}

async function waitForMinio(maxAttempts = 30): Promise<void> {
  console.log("   ⏳ Waiting for MinIO...");

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${CONFIG.minio.endpoint}/minio/health/live`);
      if (response.ok) {
        console.log("      ✅ MinIO is ready");
        return;
      }
    } catch {
      await sleep(1000);
    }
  }
  throw new Error("MinIO failed to become ready");
}

async function waitForMailpit(maxAttempts = 30): Promise<void> {
  console.log("   ⏳ Waiting for Mailpit...");

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${CONFIG.mailpit.apiUrl}/api/v1/messages`);
      if (response.ok) {
        console.log("      ✅ Mailpit is ready");
        return;
      }
    } catch {
      await sleep(1000);
    }
  }
  throw new Error("Mailpit failed to become ready");
}

async function waitForAllServices(): Promise<void> {
  console.log("\n🏥 Health checks...");
  await waitForPostgres();
  await waitForValkey();
  await waitForMinio();
  await waitForMailpit();
}

// ─────────────────────────────────────────────────────────────
// Database Setup
// ─────────────────────────────────────────────────────────────

async function databaseExists(database: string): Promise<boolean> {
  try {
    const result = await runPsql(
      CONFIG.containers.postgres,
      "postgres",
      CONFIG.postgres.user,
      `SELECT 1 FROM pg_database WHERE datname = '${database}'`,
    );
    return result.includes("1");
  } catch {
    return false;
  }
}

async function setupTestDatabase(): Promise<void> {
  console.log("\n📦 Setting up test database...");

  const exists = await databaseExists(CONFIG.postgres.database);
  if (exists) {
    console.log(`   Database '${CONFIG.postgres.database}' already exists`);
    console.log("   Dropping and recreating for clean state...");

    // Terminate connections
    await runPsql(
      CONFIG.containers.postgres,
      "postgres",
      CONFIG.postgres.user,
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${CONFIG.postgres.database}'`,
    );

    // Drop database
    await runPsql(
      CONFIG.containers.postgres,
      "postgres",
      CONFIG.postgres.user,
      `DROP DATABASE ${CONFIG.postgres.database}`,
    );
  }

  // Create roles idempotently (they are cluster-wide, not per-database)
  // Using DO block with IF NOT EXISTS pattern for PostgreSQL compatibility
  console.log("   Creating RLS roles (if not exist)...");
  await runPsql(
    CONFIG.containers.postgres,
    "postgres",
    CONFIG.postgres.user,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user WITH LOGIN;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role WITH LOGIN BYPASSRLS;
      END IF;
    END $$;`,
  );

  // Create database
  await runPsql(
    CONFIG.containers.postgres,
    "postgres",
    CONFIG.postgres.user,
    `CREATE DATABASE ${CONFIG.postgres.database}`,
  );
  console.log(`   ✅ Database '${CONFIG.postgres.database}' created`);
}

async function copySchemaFromDev(): Promise<void> {
  console.log("\n📋 Copying schema from development database...");

  // Check if dev container and database exist
  if (!isContainerRunning(CONFIG.mainPostgres.container)) {
    console.log("   ⚠️  Development PostgreSQL container not running");
    console.log("   Will push schema directly using drizzle-kit instead...");
    await pushSchemaDirectly();
    return;
  }

  try {
    // Check if main database exists
    const mainExists = await runPsql(
      CONFIG.mainPostgres.container,
      "postgres",
      CONFIG.mainPostgres.user,
      `SELECT 1 FROM pg_database WHERE datname = '${CONFIG.mainPostgres.database}'`,
    );

    if (!mainExists.includes("1")) {
      console.log("   ⚠️  Development database not found");
      console.log("   Will push schema directly using drizzle-kit instead...");
      await pushSchemaDirectly();
      return;
    }

    // Copy schema using pg_dump
    const command = `docker exec ${CONFIG.mainPostgres.container} sh -c "pg_dump -U ${CONFIG.mainPostgres.user} -d ${CONFIG.mainPostgres.database} --schema-only --no-owner --no-privileges" | docker exec -i ${CONFIG.containers.postgres} psql -U ${CONFIG.postgres.user} -d ${CONFIG.postgres.database}`;

    await execAsync(command);
    console.log("   ✅ Schema copied from development database");
  } catch (error) {
    console.log("   ⚠️  Schema copy failed, pushing directly...");
    await pushSchemaDirectly();
  }
}

async function pushSchemaDirectly(): Promise<void> {
  const pm = detectPackageManager();
  console.log(`   Pushing schema using drizzle-kit push (${pm})...`);

  const dbUrl = `postgresql://${CONFIG.postgres.user}:${CONFIG.postgres.password}@${CONFIG.postgres.host}:${CONFIG.postgres.port}/${CONFIG.postgres.database}`;

  runSchemaPush({
    databaseUrl: dbUrl,
    verbose: true,
  });
}

async function applyRlsPolicyExpressions(): Promise<void> {
  console.log("\n🔒 Applying RLS policy expressions...");
  console.log("   (drizzle-kit push does not support USING/WITH CHECK clauses)");

  const dbUrl = `postgresql://${CONFIG.postgres.user}:${CONFIG.postgres.password}@${CONFIG.postgres.host}:${CONFIG.postgres.port}/${CONFIG.postgres.database}`;

  const pool = new Pool({
    connectionString: dbUrl,
    max: 1,
  });

  try {
    // Read and execute the SQL file with policy expressions
    const sqlPath = join(__dirname, "apply-rls-policies.sql");
    console.log(`   Reading SQL from: ${sqlPath}`);
    const sql = readFileSync(sqlPath, "utf-8");

    // Normalize line endings and remove comment lines FIRST
    const normalizedSql = sql
      .replace(/\r\n/g, "\n") // Windows -> Unix
      .replace(/\r/g, "\n") // Old Mac -> Unix
      .split("\n")
      .filter((line) => !line.trim().startsWith("--")) // Remove comment lines
      .join("\n");

    // Execute each statement separately (split by semicolon followed by newline)
    const statements = normalizedSql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(`   Found ${statements.length} SQL statements to execute`);

    let successCount = 0;
    let errorCount = 0;

    for (const statement of statements) {
      try {
        await pool.query(statement);
        successCount++;
      } catch (error) {
        // Ignore errors for policies that might not exist
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!errorMessage.includes("does not exist")) {
          console.warn(`   ⚠️  Warning: ${errorMessage}`);
          console.warn(`      Statement: ${statement.substring(0, 100)}...`);
        }
        errorCount++;
      }
    }

    console.log(`   ✅ RLS policy expressions applied (${successCount} succeeded, ${errorCount} errors)`);
  } finally {
    await pool.end();
  }
}

async function setupRolesAndPermissions(): Promise<void> {
  console.log("\n👤 Setting up RLS roles and permissions...");

  const dbUrl = `postgresql://${CONFIG.postgres.user}:${CONFIG.postgres.password}@${CONFIG.postgres.host}:${CONFIG.postgres.port}/${CONFIG.postgres.database}`;

  const pool = new Pool({
    connectionString: dbUrl,
    max: 1,
  });

  try {
    await grantRolePermissions(pool, CONFIG.postgres.user, true);
  } finally {
    await pool.end();
  }
}

// ─────────────────────────────────────────────────────────────
// MinIO Setup
// ─────────────────────────────────────────────────────────────

async function setupMinioBucket(): Promise<void> {
  console.log("\n📦 Setting up MinIO bucket...");

  const { S3Client, CreateBucketCommand, HeadBucketCommand } = await import("@aws-sdk/client-s3");

  const client = new S3Client({
    endpoint: CONFIG.minio.endpoint,
    region: "us-east-1",
    credentials: {
      accessKeyId: CONFIG.minio.accessKey,
      secretAccessKey: CONFIG.minio.secretKey,
    },
    forcePathStyle: true,
  });

  try {
    await client.send(new HeadBucketCommand({ Bucket: CONFIG.minio.bucket }));
    console.log(`   ✅ Bucket '${CONFIG.minio.bucket}' already exists`);
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: CONFIG.minio.bucket }));
    console.log(`   ✅ Created bucket '${CONFIG.minio.bucket}'`);
  }
}

// ─────────────────────────────────────────────────────────────
// Valkey Setup
// ─────────────────────────────────────────────────────────────

function flushValkey(): void {
  console.log("\n🔄 Flushing Valkey...");
  execSync(`docker exec ${CONFIG.containers.valkey} valkey-cli FLUSHALL`, { stdio: "pipe" });
  console.log("   ✅ Valkey flushed");
}

// ─────────────────────────────────────────────────────────────
// Verification
// ─────────────────────────────────────────────────────────────

async function verifySetup(): Promise<void> {
  console.log("\n🔍 Verifying setup...");

  // Check roles
  const rolesResult = await runPsql(
    CONFIG.containers.postgres,
    CONFIG.postgres.database,
    CONFIG.postgres.user,
    "SELECT rolname FROM pg_roles WHERE rolname IN ('app_user', 'service_role')",
  );

  const hasAppUser = rolesResult.includes("app_user");
  const hasServiceRole = rolesResult.includes("service_role");
  console.log(`   ${hasAppUser && hasServiceRole ? "✅" : "⚠️"} Roles: app_user, service_role`);

  // Check RLS policies
  const policiesResult = await runPsql(
    CONFIG.containers.postgres,
    CONFIG.postgres.database,
    CONFIG.postgres.user,
    "SELECT COUNT(*) FROM pg_policies",
  );
  const policyMatch = policiesResult.match(/(\d+)/);
  const policyCount = policyMatch ? parseInt(policyMatch[1], 10) : 0;
  console.log(`   ✅ RLS policies: ${policyCount}`);

  // Check tables
  const tablesResult = await runPsql(
    CONFIG.containers.postgres,
    CONFIG.postgres.database,
    CONFIG.postgres.user,
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'",
  );
  const tableMatch = tablesResult.match(/(\d+)/);
  const tableCount = tableMatch ? parseInt(tableMatch[1], 10) : 0;
  console.log(`   ✅ Tables: ${tableCount}`);
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const skipContainers = args.includes("--skip-containers");
  const resetOnly = args.includes("--reset-only");

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║       InsightDesk Integration Test Setup                 ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  try {
    // Check/start containers
    if (!skipContainers) {
      console.log("\n🐳 Checking containers...");
      const status = checkContainers();

      const allRunning = Object.values(status).every(Boolean);
      if (!allRunning) {
        console.log("   Container status:");
        for (const [name, running] of Object.entries(status)) {
          console.log(`      ${running ? "✅" : "❌"} ${name}`);
        }
        await startTestContainers();
        await sleep(2000); // Give containers time to initialize
      } else {
        console.log("   ✅ All containers running");
      }
    }

    // Wait for services
    await waitForAllServices();

    if (resetOnly) {
      // Just reset data without full setup
      console.log("\n🔄 Reset mode: cleaning test data only...");
      flushValkey();
      console.log("\n✅ Test data reset complete");
      return;
    }

    // Full setup
    await setupTestDatabase();
    await copySchemaFromDev(); // Uses drizzle-kit push (creates tables, roles, RLS, policies without expressions)
    await applyRlsPolicyExpressions(); // Apply USING/WITH CHECK clauses (drizzle-kit limitation workaround)
    await setupRolesAndPermissions(); // Grants BYPASSRLS and permissions
    await setupMinioBucket();
    flushValkey();
    await verifySetup();

    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log("║       ✅ Integration Test Setup Complete!                ║");
    console.log("╚══════════════════════════════════════════════════════════╝");
    console.log("\nYou can now run tests:");
    console.log("  bun run test:integration  # Run integration tests only");
    console.log("  bun run test              # Run all tests");
    console.log("");
  } catch (error) {
    console.error("\n❌ Setup failed:", error);
    process.exit(1);
  }
}

main();
