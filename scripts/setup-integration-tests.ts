#!/usr/bin/env node
/**
 * Integration Test Setup Script
 *
 * Comprehensive setup for integration tests that:
 * 1. Starts test containers (PostgreSQL, Valkey, MinIO, Mailpit)
 * 2. Waits for all services to be healthy
 * 3. Sets up test database with schema and RLS
 * 4. Creates MinIO test bucket
 * 5. Verifies all services are ready
 *
 * Usage:
 *   npm run test:setup
 *   npx tsx scripts/setup-integration-tests.ts
 *
 * Options:
 *   --skip-containers  Skip starting containers (assumes already running)
 *   --reset-only       Only reset test data without full setup
 */

import { execSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import { exec } from "node:child_process";

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

  // Drop roles if they exist (they are cluster-wide, not per-database)
  // This ensures fresh migration can create them
  console.log("   Dropping existing roles for clean state...");
  await runPsql(
    CONFIG.containers.postgres,
    "postgres",
    CONFIG.postgres.user,
    `DROP ROLE IF EXISTS app_user; DROP ROLE IF EXISTS service_role;`,
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
  console.log("   Pushing schema using Drizzle migration...");

  const dbUrl = `postgresql://${CONFIG.postgres.user}:${CONFIG.postgres.password}@${CONFIG.postgres.host}:${CONFIG.postgres.port}/${CONFIG.postgres.database}`;

  try {
    // First, run drizzle-kit generate to create a migration file
    execSync(`bunx drizzle-kit generate --config=drizzle.config.ts --name=integration_test`, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
      },
    });

    // Then run drizzle-kit migrate to apply it
    execSync(`bunx drizzle-kit migrate --config=drizzle.config.ts`, {
      stdio: ["pipe", "inherit", "inherit"],
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
      },
    });

    console.log("   ✅ Schema pushed successfully");
  } catch (error) {
    // Check if error is because schema already exists (no changes needed)
    const errorStr = String(error);
    if (errorStr.includes("No schema changes") || errorStr.includes("nothing to migrate")) {
      console.log("   ✅ Schema already up to date");
      return;
    }
    throw new Error(`drizzle-kit migration failed: ${error}`);
  }
}

async function setupRoles(): Promise<void> {
  console.log("\n👤 Setting up RLS roles...");

  const createRolesSql = `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user WITH LOGIN;
      END IF;
    END $$;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role WITH LOGIN BYPASSRLS;
      ELSE
        ALTER ROLE service_role BYPASSRLS;
      END IF;
    END $$;
  `;

  await runPsql(CONFIG.containers.postgres, "postgres", CONFIG.postgres.user, createRolesSql);

  const grantPermissionsSql = `
    GRANT app_user TO ${CONFIG.postgres.user};
    GRANT service_role TO ${CONFIG.postgres.user};
    GRANT USAGE ON SCHEMA public TO app_user;
    GRANT USAGE ON SCHEMA public TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO app_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO service_role;
  `;

  await runPsql(
    CONFIG.containers.postgres,
    CONFIG.postgres.database,
    CONFIG.postgres.user,
    grantPermissionsSql,
  );
  console.log("   ✅ RLS roles created and configured");
}

async function enableRLS(): Promise<void> {
  console.log("\n🔒 Enabling Row-Level Security...");

  const rlsTables = [
    "tickets",
    "ticket_messages",
    "ticket_activities",
    "user_organizations",
    "categories",
    "tags",
    "sla_policies",
    "canned_responses",
    "saved_filters",
    "csat_surveys",
    "organization_subscriptions",
    "subscription_usage",
    "audit_logs",
    "organizations",
    "organization_invitations",
    "attachments",
  ];

  let enabled = 0;
  for (const table of rlsTables) {
    try {
      await runPsql(
        CONFIG.containers.postgres,
        CONFIG.postgres.database,
        CONFIG.postgres.user,
        `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`,
      );
      enabled++;
    } catch {
      // Table might not exist
    }
  }

  console.log(`   ✅ RLS enabled on ${enabled} tables`);
}

async function createRLSPolicies(): Promise<void> {
  console.log("\n📜 Creating RLS policies...");

  const policies = [
    {
      table: "tickets",
      sql: `CREATE POLICY IF NOT EXISTS tickets_tenant_isolation ON tickets FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
    },
    {
      table: "ticket_messages",
      sql: `CREATE POLICY IF NOT EXISTS messages_tenant_isolation ON ticket_messages FOR ALL USING (EXISTS (SELECT 1 FROM tickets t WHERE t.id = ticket_messages.ticket_id AND t.organization_id = current_setting('app.current_org_id', true)::uuid))`,
    },
    {
      table: "ticket_activities",
      sql: `CREATE POLICY IF NOT EXISTS activities_tenant_isolation ON ticket_activities FOR ALL USING (EXISTS (SELECT 1 FROM tickets t WHERE t.id = ticket_activities.ticket_id AND t.organization_id = current_setting('app.current_org_id', true)::uuid))`,
    },
    {
      table: "user_organizations",
      sql: `CREATE POLICY IF NOT EXISTS user_orgs_by_org ON user_organizations FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
    },
    {
      table: "categories",
      sql: `CREATE POLICY IF NOT EXISTS categories_tenant_isolation ON categories FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
    },
    {
      table: "tags",
      sql: `CREATE POLICY IF NOT EXISTS tags_tenant_isolation ON tags FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
    },
    {
      table: "sla_policies",
      sql: `CREATE POLICY IF NOT EXISTS sla_tenant_isolation ON sla_policies FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
    },
    {
      table: "canned_responses",
      sql: `CREATE POLICY IF NOT EXISTS canned_tenant_isolation ON canned_responses FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
    },
    {
      table: "saved_filters",
      sql: `CREATE POLICY IF NOT EXISTS filters_tenant_isolation ON saved_filters FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
    },
    {
      table: "csat_surveys",
      sql: `CREATE POLICY IF NOT EXISTS csat_tenant_isolation ON csat_surveys FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
    },
    {
      table: "organization_subscriptions",
      sql: `CREATE POLICY IF NOT EXISTS subs_tenant_isolation ON organization_subscriptions FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
    },
    {
      table: "subscription_usage",
      sql: `CREATE POLICY IF NOT EXISTS usage_tenant_isolation ON subscription_usage FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
    },
    {
      table: "audit_logs",
      sql: `CREATE POLICY IF NOT EXISTS audit_tenant_isolation ON audit_logs FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
    },
    {
      table: "organizations",
      sql: `CREATE POLICY IF NOT EXISTS orgs_tenant_isolation ON organizations FOR ALL USING (id = current_setting('app.current_org_id', true)::uuid)`,
    },
    {
      table: "organization_invitations",
      sql: `CREATE POLICY IF NOT EXISTS invites_tenant_isolation ON organization_invitations FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
    },
    {
      table: "attachments",
      sql: `CREATE POLICY IF NOT EXISTS attachments_tenant_isolation ON attachments FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
    },
  ];

  let created = 0;
  for (const { sql } of policies) {
    try {
      await runPsql(
        CONFIG.containers.postgres,
        CONFIG.postgres.database,
        CONFIG.postgres.user,
        sql,
      );
      created++;
    } catch {
      // Policy might already exist or table doesn't exist
    }
  }

  console.log(`   ✅ Created ${created} RLS policies`);
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
    await copySchemaFromDev(); // This will use migrations that create roles
    await setupRoles(); // This sets up grants and permissions (roles created by migration)
    await enableRLS();
    await createRLSPolicies();
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
