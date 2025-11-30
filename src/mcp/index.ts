#!/usr/bin/env node
/**
 * InsightDesk MCP Server
 *
 * Model Context Protocol server that exposes the InsightDesk API
 * for AI agents and LLM-based tools like Claude Desktop.
 *
 * Usage:
 *   bun run mcp              # stdio transport (for Claude Desktop)
 *   bun run mcp:http         # HTTP transport on port 3100
 *
 * Environment Variables:
 *   ENABLE_MCP               - Enable MCP server (default: true in dev, false in prod)
 *   MCP_PORT                 - HTTP transport port (default: 3100)
 *   MCP_TRANSPORT            - Transport type: "stdio" or "http" (default: stdio)
 *   INSIGHTDESK_API_URL      - API base URL (auto-resolved in dev mode)
 *   INSIGHTDESK_API_KEY      - API key for authentication
 *   INSIGHTDESK_ORGANIZATION_ID - Default organization ID
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { InsightDeskClient } from "./client.js";
import { generateToolsFromOpenApi, groupToolsByModule } from "./generator.js";
import type { ApiSchema, McpToolDefinition, OpenApiSpec } from "./types.js";

// Constants
const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = join(__dirname, "../../docs/openapi.json");

// Environment configuration
const NODE_ENV = process.env.NODE_ENV || "development";
const isDev = NODE_ENV === "development";
const isProd = NODE_ENV === "production";

// MCP is disabled by default in production
const ENABLE_MCP =
  process.env.ENABLE_MCP !== undefined ? process.env.ENABLE_MCP === "true" : !isProd;

const MCP_PORT = Number.parseInt(process.env.MCP_PORT || "3100", 10);
const MCP_TRANSPORT = process.env.MCP_TRANSPORT || "stdio";

// Auto-resolve API URL: use localhost in dev mode, require explicit URL in production
const DEFAULT_API_URL = isDev ? "http://localhost:3001" : "";
const API_URL = process.env.INSIGHTDESK_API_URL || DEFAULT_API_URL;

const API_KEY = process.env.INSIGHTDESK_API_KEY;
const ORGANIZATION_ID = process.env.INSIGHTDESK_ORGANIZATION_ID;

/**
 * Load OpenAPI specification from file
 */
async function loadOpenApiSpec(): Promise<OpenApiSpec> {
  const content = await readFile(OPENAPI_PATH, "utf-8");
  return JSON.parse(content) as OpenApiSpec;
}

/**
 * Convert OpenAPI schema to Zod schema for tool registration
 */
function apiSchemaToZod(schema: ApiSchema): z.ZodTypeAny {
  if (schema.enum) {
    return z.enum(schema.enum as [string, ...string[]]);
  }

  switch (schema.type) {
    case "string":
      return z.string().describe(schema.description || "");
    case "number":
    case "integer":
      return z.number().describe(schema.description || "");
    case "boolean":
      return z.boolean().describe(schema.description || "");
    case "array":
      if (schema.items) {
        return z.array(apiSchemaToZod(schema.items)).describe(schema.description || "");
      }
      return z.array(z.unknown()).describe(schema.description || "");
    case "object":
      if (schema.properties) {
        const shape: Record<string, z.ZodTypeAny> = {};
        for (const [key, value] of Object.entries(schema.properties)) {
          shape[key] = apiSchemaToZod(value);
        }
        return z.object(shape).describe(schema.description || "");
      }
      return z.record(z.string(), z.unknown()).describe(schema.description || "");
    default:
      return z.unknown().describe(schema.description || "");
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Check if MCP is enabled
  if (!ENABLE_MCP) {
    console.error("MCP Server is disabled. Set ENABLE_MCP=true to enable.");
    console.error("Note: MCP is disabled by default in production.");
    process.exit(0);
  }

  // Validate API URL in production
  if (isProd && !API_URL) {
    console.error("Error: INSIGHTDESK_API_URL is required in production mode.");
    process.exit(1);
  }

  console.error("Starting InsightDesk MCP Server...");
  console.error(`Environment: ${NODE_ENV}`);
  console.error(`API URL: ${API_URL}`);
  console.error(`Transport: ${MCP_TRANSPORT}`);
  if (MCP_TRANSPORT === "http") {
    console.error(`HTTP Port: ${MCP_PORT}`);
  }

  // Load OpenAPI spec
  let openApiSpec: OpenApiSpec;
  try {
    openApiSpec = await loadOpenApiSpec();
    console.error(`Loaded OpenAPI spec: ${openApiSpec.info.title} v${openApiSpec.info.version}`);
  } catch (error) {
    console.error("Failed to load OpenAPI spec:", error);
    console.error("Run 'bun run docs:generate' to generate the OpenAPI spec first.");
    process.exit(1);
  }

  // Generate tools from OpenAPI spec
  const tools = generateToolsFromOpenApi(openApiSpec);
  const toolMap = new Map<string, McpToolDefinition>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  console.error(`Generated ${tools.length} tools from OpenAPI spec`);

  // Group tools by module for documentation
  const moduleGroups = groupToolsByModule(tools, openApiSpec);
  console.error(`Organized into ${moduleGroups.length} modules`);

  // Initialize API client
  const client = new InsightDeskClient(API_URL);
  if (API_KEY) {
    client.setApiKey(API_KEY);
    console.error("API key configured");
  }
  if (ORGANIZATION_ID) {
    client.setOrganizationId(ORGANIZATION_ID);
    console.error(`Organization ID: ${ORGANIZATION_ID}`);
  }

  // Create MCP server using the new McpServer API
  const server = new McpServer({
    name: "insightdesk-api",
    version: openApiSpec.info.version,
  });

  // Register meta tools

  // api-help tool
  server.registerTool(
    "api-help",
    {
      title: "API Help",
      description:
        "Get help about available API tools. Shows all modules and their operations.\n\n" +
        "Use this tool first to understand what API operations are available.",
      inputSchema: {
        module: z
          .string()
          .optional()
          .describe("Filter help by module name (e.g., 'Tickets', 'Users')"),
        search: z.string().optional().describe("Search for tools by name or description"),
      },
    },
    async ({ module, search }) => {
      const text = generateHelpText(module, search, moduleGroups, tools);
      return { content: [{ type: "text", text }] };
    },
  );

  // api-configure tool
  server.registerTool(
    "api-configure",
    {
      title: "API Configure",
      description:
        "Configure API connection settings.\n\n" +
        "Set the API key and organization ID for subsequent API calls.\n" +
        "The API key is required for most operations.",
      inputSchema: {
        apiKey: z
          .string()
          .optional()
          .describe("API key for authentication (format: idk_live_xxx or idk_test_xxx)"),
        organizationId: z
          .string()
          .optional()
          .describe("Default organization ID for multi-tenant operations"),
      },
    },
    async ({ apiKey, organizationId }) => {
      const messages: string[] = [];

      if (apiKey) {
        client.setApiKey(apiKey);
        messages.push(`API key configured: ${apiKey.substring(0, 15)}...`);
      }

      if (organizationId) {
        client.setOrganizationId(organizationId);
        messages.push(`Organization ID configured: ${organizationId}`);
      }

      if (messages.length === 0) {
        messages.push("No configuration changes made.");
        messages.push("Provide 'apiKey' and/or 'organizationId' to configure.");
      }

      return { content: [{ type: "text", text: messages.join("\n") }] };
    },
  );

  // api-test-connection tool
  server.registerTool(
    "api-test-connection",
    {
      title: "API Test Connection",
      description:
        "Test the connection to the InsightDesk API.\n\n" +
        "Use this to verify the API is accessible before making other calls.",
      inputSchema: {},
    },
    async () => {
      const result = await client.testConnection();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  // Register all API tools from OpenAPI spec
  for (const tool of tools) {
    // Build zod schema from tool input schema
    const zodSchema: Record<string, z.ZodTypeAny> = {};
    for (const [key, value] of Object.entries(tool.inputSchema.properties)) {
      let zodType = apiSchemaToZod(value);
      // Make optional if not required
      if (!tool.inputSchema.required.includes(key)) {
        zodType = zodType.optional();
      }
      zodSchema[key] = zodType;
    }

    server.registerTool(
      tool.name,
      {
        title: tool.name,
        description: tool.description,
        inputSchema: zodSchema,
      },
      async (args) => {
        try {
          const response = await client.execute(tool.endpoint, args as Record<string, unknown>);
          return {
            content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
            isError: !response.success,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error executing ${tool.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      },
    );
  }

  // Start server with the selected transport
  if (MCP_TRANSPORT === "http") {
    await startHttpTransport(server);
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP Server running on stdio");
  }
}

/**
 * Start MCP server with HTTP transport using StreamableHTTPServerTransport
 */
async function startHttpTransport(server: McpServer): Promise<void> {
  const app = express();
  app.use(express.json());

  // CORS middleware
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
    next();
  });

  app.options("*", (_req, res) => {
    res.sendStatus(204);
  });

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", transport: "http", port: MCP_PORT });
  });

  // MCP endpoint - stateless mode (new transport per request)
  app.post("/mcp", async (req, res) => {
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      res.on("close", () => {
        transport.close();
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  app.listen(MCP_PORT, () => {
    console.error(`MCP Server running on http://localhost:${MCP_PORT}`);
    console.error(`  - Health: http://localhost:${MCP_PORT}/health`);
    console.error(`  - MCP: http://localhost:${MCP_PORT}/mcp`);
  });
}

/**
 * Generate help text for api-help tool
 */
function generateHelpText(
  module: string | undefined,
  search: string | undefined,
  moduleGroups: ReturnType<typeof groupToolsByModule>,
  tools: McpToolDefinition[],
): string {
  if (search) {
    const searchLower = search.toLowerCase();
    const matches = tools.filter(
      (t) =>
        t.name.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower),
    );

    if (matches.length === 0) {
      return `No tools found matching "${search}".`;
    }

    const lines = [`Found ${matches.length} tools matching "${search}":\n`];
    for (const tool of matches) {
      lines.push(`## ${tool.name}`);
      lines.push(tool.endpoint.summary);
      lines.push(`HTTP: ${tool.endpoint.method} ${tool.endpoint.path}`);
      if (Object.keys(tool.inputSchema.properties).length > 0) {
        lines.push("\nParameters:");
        lines.push(describeInputSchema(tool.inputSchema));
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  if (module) {
    const moduleLower = module.toLowerCase();
    const group = moduleGroups.find((g) => g.name.toLowerCase() === moduleLower);

    if (!group) {
      const available = moduleGroups.map((g) => g.name).join(", ");
      return `Module "${module}" not found. Available modules: ${available}`;
    }

    const lines = [`# ${group.name} Module\n`, group.description, "\n## Available Operations:\n"];

    for (const tool of group.tools) {
      lines.push(`### ${tool.name}`);
      lines.push(tool.endpoint.summary);
      lines.push(`HTTP: ${tool.endpoint.method} ${tool.endpoint.path}`);
      if (Object.keys(tool.inputSchema.properties).length > 0) {
        lines.push("\nParameters:");
        lines.push(describeInputSchema(tool.inputSchema));
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  // Default: show all modules overview
  const lines = [
    "# InsightDesk API - Available Modules\n",
    "Use `api-help` with `module` parameter to see detailed operations for a module.\n",
    "Use `api-help` with `search` parameter to search for specific tools.\n",
  ];

  for (const group of moduleGroups) {
    lines.push(`## ${group.name} (${group.tools.length} operations)`);
    lines.push(group.description);
    lines.push(`Tools: ${group.tools.map((t) => t.name).join(", ")}`);
    lines.push("");
  }

  lines.push("\n## Quick Tips:");
  lines.push("1. Use `api-configure` to set your API key and organization ID");
  lines.push("2. Use `api-test-connection` to verify API connectivity");
  lines.push("3. Most operations require authentication via API key");

  return lines.join("\n");
}

/**
 * Build tool input schema description for documentation
 */
function describeInputSchema(schema: {
  properties: Record<string, ApiSchema>;
  required: string[];
}): string {
  const lines: string[] = [];

  for (const [name, prop] of Object.entries(schema.properties)) {
    const isRequired = schema.required.includes(name);
    const reqStr = isRequired ? "(required)" : "(optional)";
    let typeStr = prop.type || "any";

    if (prop.enum) {
      typeStr = prop.enum.map((e) => `"${e}"`).join(" | ");
    }

    lines.push(`- ${name} ${reqStr}: ${typeStr}`);
    if (prop.description) {
      lines.push(`    ${prop.description}`);
    }
  }

  return lines.join("\n");
}

// Run the server
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
