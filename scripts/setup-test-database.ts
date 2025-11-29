/**
 * Test Database Setup Script
 *
 * This script sets up the test database with all required:
 * - Database creation (insightdesk_test)
 * - Schema (copied from main database or pushed fresh)
 * - RLS roles (app_user, service_role)
 * - RLS policies for tenant isolation
 *
 * Usage: bun run test:setup
 *
 * Prerequisites:
 * - Docker containers running (bun run docker:up)
 * - Main database schema already pushed (bun run db:push)
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const POSTGRES_CONTAINER = "insightdesk-postgres";
const MAIN_DB = "insightdesk";
const TEST_DB = "insightdesk_test";
const DB_USER = "insightdesk";

async function runPsql(
  database: string,
  sql: string,
  silent = false
): Promise<string> {
  const command = `docker exec -i ${POSTGRES_CONTAINER} psql -U ${DB_USER} -d ${database} -c "${sql.replace(/"/g, '\\"')}"`;
  try {
    const { stdout, stderr } = await execAsync(command);
    if (!silent && stderr && !stderr.includes("NOTICE:")) {
      console.warn(stderr);
    }
    return stdout;
  } catch (error: unknown) {
    const execError = error as { stderr?: string; message: string };
    throw new Error(execError.stderr || execError.message);
  }
}

async function runPsqlFile(database: string, sql: string): Promise<string> {
  // Use spawn to properly pipe SQL without shell escaping issues
  const { spawn } = await import("node:child_process");

  return new Promise((resolve, reject) => {
    const proc = spawn(
      "docker",
      ["exec", "-i", POSTGRES_CONTAINER, "psql", "-U", DB_USER, "-d", database],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

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

    proc.on("error", (error) => {
      reject(error);
    });

    // Write SQL to stdin and close it
    proc.stdin.write(sql);
    proc.stdin.end();
  });
}

async function checkDockerRunning(): Promise<boolean> {
  try {
    await execAsync(
      `docker inspect -f "{{.State.Running}}" ${POSTGRES_CONTAINER}`
    );
    return true;
  } catch {
    return false;
  }
}

async function databaseExists(dbName: string): Promise<boolean> {
  try {
    const result = await runPsql(
      "postgres",
      `SELECT 1 FROM pg_database WHERE datname = '${dbName}'`,
      true
    );
    return result.includes("1");
  } catch {
    return false;
  }
}

async function createTestDatabase(): Promise<void> {
  console.log(`\n📦 Creating test database: ${TEST_DB}...`);

  const exists = await databaseExists(TEST_DB);
  if (exists) {
    console.log(`   Database ${TEST_DB} already exists, dropping...`);
    // Terminate connections
    await runPsql(
      "postgres",
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB}'`,
      true
    );
    await runPsql("postgres", `DROP DATABASE ${TEST_DB}`, true);
  }

  await runPsql("postgres", `CREATE DATABASE ${TEST_DB}`);
  console.log(`   ✅ Database ${TEST_DB} created`);
}

async function copySchemaFromMain(): Promise<void> {
  console.log(`\n📋 Copying schema from ${MAIN_DB} to ${TEST_DB}...`);

  // Use pg_dump and psql directly through docker exec with pipe
  const command = `docker exec ${POSTGRES_CONTAINER} sh -c "pg_dump -U ${DB_USER} -d ${MAIN_DB} --schema-only --no-owner --no-privileges | psql -U ${DB_USER} -d ${TEST_DB}"`;

  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr && !stderr.includes("NOTICE:") && !stderr.includes("ERROR:  role")) {
      // Ignore role-related errors from pg_dump
      const filteredStderr = stderr
        .split("\n")
        .filter((line) => !line.includes("role") && line.trim())
        .join("\n");
      if (filteredStderr) console.warn(filteredStderr);
    }
    console.log("   ✅ Schema copied successfully");
  } catch (error: unknown) {
    const execError = error as { stderr?: string; message: string };
    // Check if the error is just about roles (which we can ignore)
    if (
      execError.stderr?.includes("role") ||
      execError.message?.includes("role")
    ) {
      console.log("   ✅ Schema copied (with role warnings ignored)");
    } else {
      console.error("   ❌ Schema copy failed:", execError.message);
      throw error;
    }
  }
}

async function setupRoles(): Promise<void> {
  console.log("\n👤 Setting up RLS roles...");

  // First, create roles in postgres database (where role definitions live)
  const createRolesSql = `
    DO \\$\\$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user WITH LOGIN;
      END IF;
    END \\$\\$;

    DO \\$\\$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role WITH LOGIN BYPASSRLS;
      ELSE
        ALTER ROLE service_role BYPASSRLS;
      END IF;
    END \\$\\$;
  `;

  await runPsqlFile("postgres", createRolesSql);

  // Then grant roles and permissions in the test database
  const grantPermissionsSql = `
    -- Grant roles to main user
    GRANT app_user TO ${DB_USER};
    GRANT service_role TO ${DB_USER};

    -- Grant schema access
    GRANT USAGE ON SCHEMA public TO app_user;
    GRANT USAGE ON SCHEMA public TO service_role;

    -- Grant table permissions (must be done AFTER tables are created)
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;

    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

    -- Grant default privileges for future tables
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO app_user;

    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO service_role;
  `;

  await runPsqlFile(TEST_DB, grantPermissionsSql);
  console.log("   ✅ Roles created: app_user, service_role");
}

async function enableRLS(): Promise<void> {
  console.log("\n🔒 Enabling Row-Level Security...");

  // List of tables that need RLS
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

  for (const table of rlsTables) {
    try {
      await runPsql(TEST_DB, `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`, true);
    } catch {
      // Table might not exist, skip
    }
  }

  console.log(`   ✅ RLS enabled on ${rlsTables.length} tables`);
}

async function createRLSPolicies(): Promise<void> {
  console.log("\n📜 Creating RLS policies...");

  // Define policies for each table
  const policies: { table: string; policies: string[] }[] = [
    {
      table: "tickets",
      policies: [
        `CREATE POLICY tickets_tenant_isolation ON tickets FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
      ],
    },
    {
      table: "ticket_messages",
      policies: [
        `CREATE POLICY messages_tenant_isolation ON ticket_messages FOR ALL USING (EXISTS (SELECT 1 FROM tickets t WHERE t.id = ticket_messages.ticket_id AND t.organization_id = current_setting('app.current_org_id', true)::uuid))`,
      ],
    },
    {
      table: "ticket_activities",
      policies: [
        `CREATE POLICY activities_tenant_isolation ON ticket_activities FOR ALL USING (EXISTS (SELECT 1 FROM tickets t WHERE t.id = ticket_activities.ticket_id AND t.organization_id = current_setting('app.current_org_id', true)::uuid))`,
      ],
    },
    {
      table: "user_organizations",
      policies: [
        `CREATE POLICY user_orgs_by_org ON user_organizations FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
        `CREATE POLICY user_orgs_by_user ON user_organizations FOR SELECT USING (user_id = current_setting('app.current_user_id', true)::uuid)`,
      ],
    },
    {
      table: "categories",
      policies: [
        `CREATE POLICY categories_tenant_isolation ON categories FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
      ],
    },
    {
      table: "tags",
      policies: [
        `CREATE POLICY tags_tenant_isolation ON tags FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
      ],
    },
    {
      table: "sla_policies",
      policies: [
        `CREATE POLICY sla_tenant_isolation ON sla_policies FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
      ],
    },
    {
      table: "canned_responses",
      policies: [
        `CREATE POLICY canned_tenant_isolation ON canned_responses FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
      ],
    },
    {
      table: "saved_filters",
      policies: [
        `CREATE POLICY filters_tenant_isolation ON saved_filters FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
      ],
    },
    {
      table: "csat_surveys",
      policies: [
        `CREATE POLICY csat_tenant_isolation ON csat_surveys FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
      ],
    },
    {
      table: "organization_subscriptions",
      policies: [
        `CREATE POLICY subs_tenant_isolation ON organization_subscriptions FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
      ],
    },
    {
      table: "subscription_usage",
      policies: [
        `CREATE POLICY usage_tenant_isolation ON subscription_usage FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
      ],
    },
    {
      table: "audit_logs",
      policies: [
        `CREATE POLICY audit_tenant_isolation ON audit_logs FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
      ],
    },
    {
      table: "organizations",
      policies: [
        `CREATE POLICY orgs_tenant_isolation ON organizations FOR ALL USING (id = current_setting('app.current_org_id', true)::uuid)`,
      ],
    },
    {
      table: "organization_invitations",
      policies: [
        `CREATE POLICY invites_tenant_isolation ON organization_invitations FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
      ],
    },
    {
      table: "attachments",
      policies: [
        `CREATE POLICY attachments_tenant_isolation ON attachments FOR ALL USING (organization_id = current_setting('app.current_org_id', true)::uuid)`,
      ],
    },
  ];

  let policyCount = 0;
  for (const { table, policies: tablePolicies } of policies) {
    for (const policy of tablePolicies) {
      try {
        await runPsql(TEST_DB, policy, true);
        policyCount++;
      } catch (error) {
        // Policy might already exist or table doesn't exist
      }
    }
  }

  console.log(`   ✅ Created ${policyCount} RLS policies`);
}

async function verifySetup(): Promise<void> {
  console.log("\n🔍 Verifying setup...");

  // Check roles
  const rolesResult = await runPsql(
    TEST_DB,
    "SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('app_user', 'service_role')",
    true
  );

  if (rolesResult.includes("app_user") && rolesResult.includes("service_role")) {
    console.log("   ✅ Roles verified");
  } else {
    console.log("   ⚠️  Some roles missing");
  }

  // Check RLS policies
  const policiesResult = await runPsql(
    TEST_DB,
    "SELECT COUNT(*) FROM pg_policies",
    true
  );

  const policyMatch = policiesResult.match(/(\d+)/);
  const policyCount = policyMatch ? parseInt(policyMatch[1], 10) : 0;
  console.log(`   ✅ Found ${policyCount} RLS policies`);

  // Check tables
  const tablesResult = await runPsql(
    TEST_DB,
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'",
    true
  );

  const tableMatch = tablesResult.match(/(\d+)/);
  const tableCount = tableMatch ? parseInt(tableMatch[1], 10) : 0;
  console.log(`   ✅ Found ${tableCount} tables`);
}

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║           InsightDesk Test Database Setup                ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  // Check Docker
  console.log("\n🐳 Checking Docker...");
  const dockerRunning = await checkDockerRunning();
  if (!dockerRunning) {
    console.error(`\n❌ Docker container '${POSTGRES_CONTAINER}' is not running.`);
    console.error("   Run: bun run docker:up");
    process.exit(1);
  }
  console.log("   ✅ Docker container running");

  // Check main database exists
  const mainExists = await databaseExists(MAIN_DB);
  if (!mainExists) {
    console.error(`\n❌ Main database '${MAIN_DB}' does not exist.`);
    console.error("   Run: bun run db:push");
    process.exit(1);
  }
  console.log(`   ✅ Main database '${MAIN_DB}' exists`);

  try {
    await createTestDatabase();
    await copySchemaFromMain();
    await setupRoles();
    await enableRLS();
    await createRLSPolicies();
    await verifySetup();

    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log("║           ✅ Test Database Setup Complete!               ║");
    console.log("╚══════════════════════════════════════════════════════════╝");
    console.log("\nYou can now run integration tests:");
    console.log("  bun run test:integration    # Run tenant isolation tests");
    console.log("  bun run test:all            # Run all tests including integration");
    console.log("");
  } catch (error) {
    console.error("\n❌ Setup failed:", error);
    process.exit(1);
  }
}

main();
