#!/usr/bin/env node
/**
 * MCP Configuration Generator
 *
 * Queries the database for existing API keys and generates
 * Claude Desktop configuration for the MCP server.
 *
 * Usage:
 *   bun run mcp:config
 */

import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { db, checkDatabaseConnection, closeDatabaseConnection } from "../src/db";
import * as schema from "../src/db/schema";
import { eq, and, isNull, isNotNull } from "drizzle-orm";

const projectRoot = join(import.meta.dirname, "..");

interface McpConfig {
  apiKey: string;
  organizationId: string;
  organizationName: string;
}

/**
 * Query the database for the first active API key
 */
async function getFirstApiKey(): Promise<McpConfig | null> {
  // Find the first active, non-revoked API key with its organization
  const result = await db
    .select({
      keyId: schema.apiKeys.id,
      keyHash: schema.apiKeys.keyHash,
      keyName: schema.apiKeys.name,
      keyPrefix: schema.apiKeys.prefix,
      organizationId: schema.apiKeys.organizationId,
      organizationName: schema.organizations.name,
    })
    .from(schema.apiKeys)
    .innerJoin(schema.organizations, eq(schema.apiKeys.organizationId, schema.organizations.id))
    .where(
      and(
        eq(schema.apiKeys.isActive, true),
        isNull(schema.apiKeys.revokedAt),
      ),
    )
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const { organizationId, organizationName, keyPrefix } = result[0];

  // For test keys, we can reconstruct them from the prefix pattern
  // Test keys follow pattern: idk_test_{keyBase}_org{index}_{i}
  // But we can't reconstruct the actual key since only hash is stored
  // So we need to look for the key in .env or advise the user to re-seed

  // Check if there's already an API key in .env
  const envPath = join(projectRoot, ".env");
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    const apiKeyMatch = envContent.match(/INSIGHTDESK_API_KEY=(.+)/);
    if (apiKeyMatch && apiKeyMatch[1]) {
      return {
        apiKey: apiKeyMatch[1].trim(),
        organizationId,
        organizationName,
      };
    }
  }

  // If no API key in .env, advise user to re-seed
  return {
    apiKey: "<run 'bun run db:seed' to generate new API key>",
    organizationId,
    organizationName,
  };
}

/**
 * Generate Claude Desktop configuration JSON
 */
function generateClaudeDesktopConfig(config: McpConfig): string {
  const cwd = projectRoot.replace(/\\/g, "/");
  return JSON.stringify(
    {
      mcpServers: {
        insightdesk: {
          command: "bun",
          args: ["run", "mcp"],
          cwd,
          env: {
            INSIGHTDESK_API_KEY: config.apiKey,
            INSIGHTDESK_ORGANIZATION_ID: config.organizationId,
          },
        },
      },
    },
    null,
    2,
  );
}

/**
 * Update .env file with organization ID if missing
 */
function updateEnvWithOrgId(organizationId: string): void {
  const envPath = join(projectRoot, ".env");

  if (!existsSync(envPath)) {
    console.log("⚠️  .env file not found");
    return;
  }

  let envContent = readFileSync(envPath, "utf-8");

  // Update or add INSIGHTDESK_ORGANIZATION_ID
  if (envContent.includes("INSIGHTDESK_ORGANIZATION_ID=")) {
    const currentOrgId = envContent.match(/INSIGHTDESK_ORGANIZATION_ID=(.+)/)?.[1]?.trim();
    if (!currentOrgId) {
      envContent = envContent.replace(
        /INSIGHTDESK_ORGANIZATION_ID=.*/g,
        `INSIGHTDESK_ORGANIZATION_ID=${organizationId}`,
      );
      writeFileSync(envPath, envContent);
      console.log("✅ Updated INSIGHTDESK_ORGANIZATION_ID in .env");
    }
  } else {
    envContent += `INSIGHTDESK_ORGANIZATION_ID=${organizationId}\n`;
    writeFileSync(envPath, envContent);
    console.log("✅ Added INSIGHTDESK_ORGANIZATION_ID to .env");
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║           MCP Configuration Generator                    ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log();

  // Check database connection
  const connected = await checkDatabaseConnection();
  if (!connected) {
    console.error("❌ Failed to connect to database");
    console.log("   Make sure Docker is running: bun run docker:up");
    process.exit(1);
  }

  try {
    const config = await getFirstApiKey();

    if (!config) {
      console.log("❌ No API keys found in database");
      console.log("");
      console.log("Run the following to seed the database with test data:");
      console.log("   bun run db:seed");
      process.exit(1);
    }

    // Update .env with organization ID if needed
    updateEnvWithOrgId(config.organizationId);

    console.log(`Organization: ${config.organizationName}`);
    console.log(`Organization ID: ${config.organizationId}`);
    console.log();

    if (config.apiKey.includes("run 'bun run db:seed'")) {
      console.log("⚠️  API key not found in .env file");
      console.log("   Run 'bun run db:seed' to generate new API keys");
      console.log();
    } else {
      console.log(`API Key: ${config.apiKey.substring(0, 20)}...`);
      console.log();
    }

    console.log("╔══════════════════════════════════════════════════════════╗");
    console.log("║           Claude Desktop Configuration                   ║");
    console.log("╚══════════════════════════════════════════════════════════╝");
    console.log();
    console.log("Add the following to your Claude Desktop config:");
    console.log("  macOS: ~/Library/Application Support/Claude/claude_desktop_config.json");
    console.log("  Windows: %APPDATA%\\Claude\\claude_desktop_config.json");
    console.log();
    console.log(generateClaudeDesktopConfig(config));
    console.log();
    console.log("═".repeat(60));
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await closeDatabaseConnection();
  }
}

main();
