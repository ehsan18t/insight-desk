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
 *   MCP_HTTP_AUTH_REQUIRED   - Require API key auth for HTTP transport (default: true in prod)
 *   MCP_RATE_LIMIT_MAX       - Max requests per minute for HTTP transport (default: 60)
 *   MCP_ALLOWED_ORIGINS      - Comma-separated allowed CORS origins (default: * in dev)
 *   INSIGHTDESK_API_URL      - API base URL (auto-resolved in dev mode)
 *   INSIGHTDESK_API_KEY      - API key for authentication
 *   INSIGHTDESK_ORGANIZATION_ID - Default organization ID
 */

import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { NextFunction, Request, Response } from "express";
import express from "express";
import pino from "pino";
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

// HTTP transport security settings
const MCP_HTTP_AUTH_REQUIRED =
  process.env.MCP_HTTP_AUTH_REQUIRED !== undefined
    ? process.env.MCP_HTTP_AUTH_REQUIRED === "true"
    : isProd; // Required in production by default

const MCP_RATE_LIMIT_MAX = Number.parseInt(process.env.MCP_RATE_LIMIT_MAX || "60", 10);
const MCP_ALLOWED_ORIGINS = process.env.MCP_ALLOWED_ORIGINS || (isDev ? "*" : "");

// Auto-resolve API URL: use localhost in dev mode, require explicit URL in production
const DEFAULT_API_URL = isDev ? "http://localhost:3001" : "";
const API_URL = process.env.INSIGHTDESK_API_URL || DEFAULT_API_URL;

const API_KEY = process.env.INSIGHTDESK_API_KEY;
const ORGANIZATION_ID = process.env.INSIGHTDESK_ORGANIZATION_ID;

// =============================================================================
// Logging
// =============================================================================

// Create a pino logger that writes to stderr (stdout reserved for MCP protocol in stdio mode)
const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
          destination: 2, // stderr
        },
      }
    : undefined,
}).child({ module: "mcp" });

// Helper to log to stderr (for stdio mode compatibility)
const log = {
  info: (msg: string, data?: Record<string, unknown>) => logger.info(data, msg),
  error: (msg: string, data?: Record<string, unknown>) => logger.error(data, msg),
  warn: (msg: string, data?: Record<string, unknown>) => logger.warn(data, msg),
  debug: (msg: string, data?: Record<string, unknown>) => logger.debug(data, msg),
};

// =============================================================================
// HTTP Transport Security
// =============================================================================

// In-memory rate limit store (for standalone MCP server)
// Note: For production with multiple instances, consider using external store
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Hash an API key using SHA-256
 */
function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

/**
 * Simple in-memory rate limiter for MCP HTTP transport
 */
function checkRateLimit(clientId: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const resetAt = Math.ceil(now / windowMs) * windowMs;

  let entry = rateLimitStore.get(clientId);

  // Reset if window has passed
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt };
    rateLimitStore.set(clientId, entry);
  }

  entry.count++;

  // Clean up old entries periodically
  if (rateLimitStore.size > 10000) {
    for (const [key, value] of rateLimitStore.entries()) {
      if (value.resetAt <= now) {
        rateLimitStore.delete(key);
      }
    }
  }

  return {
    allowed: entry.count <= MCP_RATE_LIMIT_MAX,
    remaining: Math.max(0, MCP_RATE_LIMIT_MAX - entry.count),
    resetAt: Math.ceil(resetAt / 1000),
  };
}

/**
 * Validate API key against the InsightDesk API
 * Makes a request to the API to validate the key
 */
async function validateMcpApiKey(
  apiKey: string,
  apiBaseUrl: string,
): Promise<{ valid: boolean; organizationId?: string }> {
  try {
    // Call the InsightDesk API to validate the key
    const response = await fetch(`${apiBaseUrl}/api/auth/me`, {
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
    });

    if (response.ok) {
      const data = (await response.json()) as {
        success: boolean;
        data?: { organizationId?: string };
      };
      return {
        valid: true,
        organizationId: data.data?.organizationId,
      };
    }

    return { valid: false };
  } catch (error) {
    log.warn("API key validation failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { valid: false };
  }
}

/**
 * Authentication middleware for HTTP transport
 */
function createAuthMiddleware(apiBaseUrl: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = randomUUID();
    (req as Request & { requestId: string }).requestId = requestId;

    // Log incoming request
    log.debug("MCP HTTP request", {
      requestId,
      method: req.method,
      path: req.path,
      ip: req.ip,
    });

    // Skip auth for health check
    if (req.path === "/health") {
      next();
      return;
    }

    // Check if auth is required
    if (!MCP_HTTP_AUTH_REQUIRED) {
      next();
      return;
    }

    // Get API key from header
    const apiKey = req.headers["x-api-key"] as string | undefined;

    if (!apiKey) {
      log.warn("MCP request without API key", { requestId, ip: req.ip });
      res.status(401).json({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Authentication required. Provide X-API-Key header.",
        },
        id: null,
      });
      return;
    }

    // Rate limit by API key hash (to avoid storing raw keys)
    const keyHash = hashApiKey(apiKey).substring(0, 16);
    const rateLimit = checkRateLimit(keyHash);

    res.set({
      "X-RateLimit-Limit": MCP_RATE_LIMIT_MAX.toString(),
      "X-RateLimit-Remaining": rateLimit.remaining.toString(),
      "X-RateLimit-Reset": rateLimit.resetAt.toString(),
    });

    if (!rateLimit.allowed) {
      log.warn("MCP rate limit exceeded", { requestId, keyHash });
      res.status(429).json({
        jsonrpc: "2.0",
        error: {
          code: -32002,
          message: "Rate limit exceeded. Try again later.",
        },
        id: null,
      });
      return;
    }

    // Validate API key
    const validation = await validateMcpApiKey(apiKey, apiBaseUrl);

    if (!validation.valid) {
      log.warn("MCP invalid API key", { requestId, keyHash });
      res.status(401).json({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Invalid API key",
        },
        id: null,
      });
      return;
    }

    // Store organization ID for later use
    (req as Request & { organizationId?: string }).organizationId = validation.organizationId;

    log.debug("MCP request authenticated", { requestId, keyHash });
    next();
  };
}

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
    log.info("MCP Server is disabled. Set ENABLE_MCP=true to enable.");
    log.info("Note: MCP is disabled by default in production.");
    process.exit(0);
  }

  // Validate API URL in production
  if (isProd && !API_URL) {
    log.error("INSIGHTDESK_API_URL is required in production mode.");
    process.exit(1);
  }

  log.info("Starting InsightDesk MCP Server...");
  log.info("Configuration", {
    environment: NODE_ENV,
    apiUrl: API_URL,
    transport: MCP_TRANSPORT,
    httpPort: MCP_TRANSPORT === "http" ? MCP_PORT : undefined,
    httpAuthRequired: MCP_TRANSPORT === "http" ? MCP_HTTP_AUTH_REQUIRED : undefined,
    rateLimitMax: MCP_TRANSPORT === "http" ? MCP_RATE_LIMIT_MAX : undefined,
  });

  // Load OpenAPI spec
  let openApiSpec: OpenApiSpec;
  try {
    openApiSpec = await loadOpenApiSpec();
    log.info("Loaded OpenAPI spec", {
      title: openApiSpec.info.title,
      version: openApiSpec.info.version,
    });
  } catch (error) {
    log.error("Failed to load OpenAPI spec", { error });
    log.error("Run 'bun run docs:generate' to generate the OpenAPI spec first.");
    process.exit(1);
  }

  // Generate tools from OpenAPI spec
  const tools = generateToolsFromOpenApi(openApiSpec);
  const toolMap = new Map<string, McpToolDefinition>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  log.info("Generated tools from OpenAPI spec", { count: tools.length });

  // Group tools by module for documentation
  const moduleGroups = groupToolsByModule(tools, openApiSpec);
  log.info("Organized tools into modules", { moduleCount: moduleGroups.length });

  // Initialize API client
  const client = new InsightDeskClient(API_URL);
  if (API_KEY) {
    client.setApiKey(API_KEY);
    log.info("API key configured from environment");
  }
  if (ORGANIZATION_ID) {
    client.setOrganizationId(ORGANIZATION_ID);
    log.info("Organization ID configured", { organizationId: ORGANIZATION_ID });
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
    log.info("MCP Server running on stdio transport");
  }
}

/**
 * Start MCP server with HTTP transport using StreamableHTTPServerTransport
 */
async function startHttpTransport(server: McpServer): Promise<void> {
  const app = express();
  app.use(express.json());

  // CORS middleware with configurable origins
  app.use((_req, res, next) => {
    const allowedOrigins = MCP_ALLOWED_ORIGINS || "*";
    res.setHeader("Access-Control-Allow-Origin", allowedOrigins);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key, mcp-session-id");

    // Handle preflight requests
    if (_req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  });

  // Authentication middleware (applies to all routes except health)
  app.use(createAuthMiddleware(API_URL));

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      transport: "http",
      port: MCP_PORT,
      authRequired: MCP_HTTP_AUTH_REQUIRED,
      rateLimitMax: MCP_RATE_LIMIT_MAX,
    });
  });

  // MCP endpoint - stateless mode (new transport per request)
  app.post("/mcp", async (req, res) => {
    const requestId = (req as Request & { requestId?: string }).requestId || randomUUID();

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

      log.debug("MCP request completed", { requestId });
    } catch (error) {
      log.error("Error handling MCP request", {
        requestId,
        error: error instanceof Error ? error.message : "Unknown error",
      });

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
    log.info("MCP Server running on HTTP transport", {
      url: `http://localhost:${MCP_PORT}`,
      healthEndpoint: `http://localhost:${MCP_PORT}/health`,
      mcpEndpoint: `http://localhost:${MCP_PORT}/mcp`,
      authRequired: MCP_HTTP_AUTH_REQUIRED,
    });
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
  log.error("Fatal error", { error: error instanceof Error ? error.message : error });
  process.exit(1);
});
