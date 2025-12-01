#!/usr/bin/env node
/**
 * VS Code MCP Configuration Generator
 *
 * Generates .vscode/mcp.json for VS Code Copilot and Continue.dev integration.
 * This allows frontend developers to use the MCP server with AI assistants in VS Code.
 *
 * Usage:
 *   bun run mcp:vscode
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const projectRoot = join(import.meta.dirname, "..");
const vscodeDir = join(projectRoot, ".vscode");
const mcpConfigPath = join(vscodeDir, "mcp.json");
const envPath = join(projectRoot, ".env");

interface McpServerConfig {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

interface McpInputConfig {
  type: "promptString";
  id: string;
  description: string;
  password?: boolean;
}

interface VscodeMcpConfig {
  servers: Record<string, McpServerConfig>;
  inputs?: McpInputConfig[];
}

/**
 * Read environment variables from .env file
 */
function readEnvFile(): Record<string, string> {
  if (!existsSync(envPath)) {
    return {};
  }

  const content = readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join("=").trim();
      }
    }
  }

  return env;
}

/**
 * Generate VS Code MCP configuration
 */
function generateVscodeMcpConfig(): VscodeMcpConfig {
  const env = readEnvFile();
  const apiKey = env.INSIGHTDESK_API_KEY || "";
  const organizationId = env.INSIGHTDESK_ORGANIZATION_ID || "";
  const apiUrl = env.INSIGHTDESK_API_URL || "http://localhost:3001";

  // Determine if we should use stdio or http transport
  // For VS Code, stdio is more reliable for local development
  const useHttp = process.argv.includes("--http");

  if (useHttp) {
    // HTTP transport configuration
    // This requires the MCP server to be running separately
    return {
      servers: {
        "insightdesk-api": {
          command: "curl",
          args: [
            "-X", "POST",
            "-H", "Content-Type: application/json",
            "-H", `X-API-Key: ${apiKey || "${input:insightdesk-api-key}"}`,
            "-d", "@-",
            `http://localhost:3100/mcp`,
          ],
          env: {},
        },
      },
      inputs: apiKey
        ? undefined
        : [
            {
              type: "promptString",
              id: "insightdesk-api-key",
              description: "InsightDesk API Key (format: idk_test_xxx or idk_live_xxx)",
              password: true,
            },
          ],
    };
  }

  // Stdio transport configuration (default, recommended)
  const config: VscodeMcpConfig = {
    servers: {
      "insightdesk-api": {
        command: "bun",
        args: ["run", "mcp"],
        cwd: projectRoot.replace(/\\/g, "/"),
        env: {
          NODE_ENV: "development",
          INSIGHTDESK_API_URL: apiUrl,
        },
      },
    },
  };

  // Add API key if available in .env
  if (apiKey) {
    config.servers["insightdesk-api"].env!.INSIGHTDESK_API_KEY = apiKey;
  } else {
    // Prompt for API key if not in .env
    config.inputs = [
      {
        type: "promptString",
        id: "insightdesk-api-key",
        description: "InsightDesk API Key (run 'bun run db:seed' to generate one)",
        password: true,
      },
    ];
    config.servers["insightdesk-api"].env!.INSIGHTDESK_API_KEY = "${input:insightdesk-api-key}";
  }

  // Add organization ID if available
  if (organizationId) {
    config.servers["insightdesk-api"].env!.INSIGHTDESK_ORGANIZATION_ID = organizationId;
  }

  return config;
}

/**
 * Main entry point
 */
function main(): void {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║         VS Code MCP Configuration Generator              ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log();

  // Ensure .vscode directory exists
  if (!existsSync(vscodeDir)) {
    mkdirSync(vscodeDir, { recursive: true });
    console.log("✅ Created .vscode directory");
  }

  // Generate configuration
  const config = generateVscodeMcpConfig();

  // Write configuration
  const configJson = JSON.stringify(config, null, 2);
  writeFileSync(mcpConfigPath, configJson);
  console.log(`✅ Generated ${mcpConfigPath}`);
  console.log();

  // Display configuration
  console.log("Generated configuration:");
  console.log("─".repeat(60));
  console.log(configJson);
  console.log("─".repeat(60));
  console.log();

  // Check for missing credentials
  const env = readEnvFile();
  if (!env.INSIGHTDESK_API_KEY) {
    console.log("⚠️  No API key found in .env file");
    console.log("   Run 'bun run db:seed' to generate API keys");
    console.log("   Or manually add INSIGHTDESK_API_KEY to .env");
    console.log();
  }

  if (!env.INSIGHTDESK_ORGANIZATION_ID) {
    console.log("⚠️  No organization ID found in .env file");
    console.log("   Run 'bun run mcp:config' to set organization ID");
    console.log();
  }

  // Instructions
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║                     Usage Instructions                   ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log();
  console.log("1. Ensure the InsightDesk API is running:");
  console.log("   bun run dev");
  console.log();
  console.log("2. In VS Code, the MCP server will be available to:");
  console.log("   - GitHub Copilot (via MCP extension)");
  console.log("   - Continue.dev extension");
  console.log("   - Other MCP-compatible AI assistants");
  console.log();
  console.log("3. Available MCP tools include:");
  console.log("   - api-help: Browse available API operations");
  console.log("   - api-test-connection: Verify API connectivity");
  console.log("   - All InsightDesk API endpoints as tools");
  console.log();
  console.log("For HTTP transport (advanced), run with --http flag:");
  console.log("   bun run mcp:vscode -- --http");
  console.log();
}

main();
