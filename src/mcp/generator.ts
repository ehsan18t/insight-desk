/**
 * OpenAPI to MCP Tool Generator
 *
 * Parses the OpenAPI specification and generates MCP tool definitions.
 */

import type {
  ApiEndpoint,
  ApiParameter,
  ApiSchema,
  McpToolDefinition,
  ModuleGroup,
  OpenApiOperation,
  OpenApiSpec,
} from "./types.js";

/**
 * Parse OpenAPI spec and generate MCP tool definitions
 */
export function generateToolsFromOpenApi(spec: OpenApiSpec): McpToolDefinition[] {
  const tools: McpToolDefinition[] = [];

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (method === "parameters" || typeof operation !== "object") {
        continue;
      }

      const endpoint = parseEndpoint(path, method, operation as OpenApiOperation, spec);
      const tool = createToolDefinition(endpoint);
      tools.push(tool);
    }
  }
  return tools;
}

/**
 * Group tools by module (tag)
 */
export function groupToolsByModule(tools: McpToolDefinition[], spec: OpenApiSpec): ModuleGroup[] {
  const groups = new Map<string, ModuleGroup>();

  // Initialize groups from tags
  for (const tag of spec.tags || []) {
    groups.set(tag.name.toLowerCase(), {
      name: tag.name,
      description: tag.description || `${tag.name} operations`,
      tools: [],
    });
  }

  // Add "Other" group for untagged operations
  groups.set("other", {
    name: "Other",
    description: "Miscellaneous operations",
    tools: [],
  });

  // Assign tools to groups
  for (const tool of tools) {
    const primaryTag = tool.endpoint.tags[0]?.toLowerCase() || "other";
    const group = groups.get(primaryTag) || groups.get("other");
    if (group) {
      group.tools.push(tool);
    }
  }

  // Remove empty groups and sort by name
  return Array.from(groups.values())
    .filter((g) => g.tools.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Parse an OpenAPI operation into an ApiEndpoint
 */
function parseEndpoint(
  path: string,
  method: string,
  operation: OpenApiOperation,
  spec: OpenApiSpec,
): ApiEndpoint {
  const parameters: ApiParameter[] = [];

  // Parse path, query, and header parameters
  for (const param of operation.parameters || []) {
    parameters.push({
      name: param.name,
      in: param.in as "path" | "query" | "header",
      required: param.required || param.in === "path",
      description: param.description,
      schema: resolveSchema(param.schema || { type: "string" }, spec),
    });
  }

  // Determine security requirements
  const security: string[] = [];
  if (operation.security) {
    for (const req of operation.security) {
      security.push(...Object.keys(req));
    }
  }

  // Generate operationId if not present
  const operationId = operation.operationId || generateOperationId(method, path);

  return {
    path,
    method: method.toUpperCase(),
    operationId,
    summary: operation.summary || "",
    description: operation.description,
    tags: operation.tags || [],
    parameters,
    requestBody: operation.requestBody
      ? {
          required: operation.requestBody.required || false,
          description: operation.requestBody.description,
          content: parseRequestBodyContent(operation.requestBody.content, spec),
        }
      : undefined,
    responses: parseResponses(operation.responses, spec),
    security,
  };
}

/**
 * Generate an operationId from method and path
 * e.g., POST /api/tickets -> createTicket
 *       GET /api/tickets/{ticketId} -> getTicketByTicketId
 */
function generateOperationId(method: string, path: string): string {
  // Remove /api prefix and clean up
  const cleanPath = path.replace(/^\/api/, "");

  // Extract path segments
  const segments = cleanPath.split("/").filter((s) => s.length > 0);

  // Method prefixes
  const methodPrefixes: Record<string, string> = {
    GET: "get",
    POST: "create",
    PUT: "update",
    PATCH: "update",
    DELETE: "delete",
  };

  const prefix = methodPrefixes[method.toUpperCase()] || method.toLowerCase();

  // Build operation name from segments
  const parts: string[] = [];

  for (const segment of segments) {
    if (segment.startsWith("{") && segment.endsWith("}")) {
      // Path parameter - add "By" prefix if we have a resource already
      const paramName = segment.slice(1, -1);
      if (parts.length > 0) {
        parts.push("By");
      }
      parts.push(capitalize(paramName));
    } else {
      // Resource name - singularize for some methods
      let resourceName = segment;
      if (
        ["POST", "GET"].includes(method.toUpperCase()) &&
        segment.endsWith("s") &&
        !segment.endsWith("ss")
      ) {
        // Keep plural for GET (list) operations on collections
        if (method.toUpperCase() === "GET" && segments.indexOf(segment) === segments.length - 1) {
          resourceName = segment; // Keep plural for listing
        }
      }
      parts.push(capitalize(resourceName));
    }
  }

  // Adjust prefix for specific patterns
  let finalPrefix = prefix;
  if (method.toUpperCase() === "GET" && segments.length > 0) {
    const lastSegment = segments[segments.length - 1];
    if (!lastSegment.startsWith("{")) {
      finalPrefix = "list"; // GET on collection is "list"
    }
  }
  if (method.toUpperCase() === "POST" && segments.length > 0) {
    const lastSegment = segments[segments.length - 1];
    if (lastSegment.startsWith("{")) {
      // POST to specific resource - could be action like "revoke"
      finalPrefix = "post";
    }
  }

  return `${finalPrefix}${parts.join("")}`;
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
} /**
 * Parse request body content schemas
 */
function parseRequestBodyContent(
  content: Record<string, { schema?: ApiSchema }> | undefined,
  spec: OpenApiSpec,
): Record<string, { schema: ApiSchema }> {
  const result: Record<string, { schema: ApiSchema }> = {};

  if (!content) {
    return result;
  }

  for (const [mediaType, { schema }] of Object.entries(content)) {
    if (schema) {
      result[mediaType] = { schema: resolveSchema(schema, spec) };
    }
  }

  return result;
}

/**
 * Parse response schemas
 */
function parseResponses(
  responses:
    | Record<string, { description?: string; content?: Record<string, { schema?: ApiSchema }> }>
    | undefined,
  spec: OpenApiSpec,
): Record<string, { description: string; content?: Record<string, { schema: ApiSchema }> }> {
  const result: Record<
    string,
    { description: string; content?: Record<string, { schema: ApiSchema }> }
  > = {};

  if (!responses) {
    return result;
  }

  for (const [code, response] of Object.entries(responses)) {
    result[code] = {
      description: response.description || "",
      content: response.content ? parseRequestBodyContent(response.content, spec) : undefined,
    };
  }

  return result;
}

/**
 * Resolve $ref references in schemas
 */
function resolveSchema(schema: ApiSchema, spec: OpenApiSpec): ApiSchema {
  if (!schema) {
    return { type: "string" };
  }

  if (schema.$ref) {
    const refPath = schema.$ref.replace("#/components/schemas/", "");
    const resolved = spec.components?.schemas?.[refPath];
    if (resolved) {
      return resolveSchema(resolved, spec);
    }
  }

  // Resolve nested schemas
  const result: ApiSchema = { ...schema };

  if (result.properties) {
    const resolvedProps: Record<string, ApiSchema> = {};
    for (const [key, value] of Object.entries(result.properties)) {
      resolvedProps[key] = resolveSchema(value, spec);
    }
    result.properties = resolvedProps;
  }

  if (result.items) {
    result.items = resolveSchema(result.items, spec);
  }

  return result;
}

/**
 * Create an MCP tool definition from an endpoint
 */
function createToolDefinition(endpoint: ApiEndpoint): McpToolDefinition {
  const properties: Record<string, ApiSchema> = {};
  const required: string[] = [];

  // Add path and query parameters
  for (const param of endpoint.parameters) {
    const propSchema: ApiSchema = {
      type: param.schema.type || "string",
      description: param.description || `${param.name} parameter`,
    };

    if (param.schema.enum) {
      propSchema.enum = param.schema.enum;
    }
    if (param.schema.format) {
      propSchema.format = param.schema.format;
    }
    if (param.schema.default !== undefined) {
      propSchema.default = param.schema.default;
    }

    properties[param.name] = propSchema;

    if (param.required) {
      required.push(param.name);
    }
  }

  // Add request body properties (for JSON content)
  const jsonBody = endpoint.requestBody?.content["application/json"];
  if (jsonBody?.schema?.properties) {
    for (const [key, value] of Object.entries(jsonBody.schema.properties)) {
      properties[key] = {
        type: value.type || "string",
        description: value.description || `${key} field`,
        ...value,
      };
    }

    // Add required fields from body
    if (jsonBody.schema.required) {
      required.push(...jsonBody.schema.required);
    }
  }

  // Build description with examples
  let description = endpoint.summary || endpoint.operationId;
  if (endpoint.description) {
    description += `\n\n${endpoint.description}`;
  }
  description += `\n\nHTTP: ${endpoint.method} ${endpoint.path}`;

  return {
    name: endpoint.operationId,
    description,
    inputSchema: {
      type: "object" as const,
      properties,
      required,
    },
    endpoint,
  };
}

/**
 * Get a summary of all available tools
 */
export function getToolsSummary(tools: McpToolDefinition[]): string {
  const groups = new Map<string, string[]>();

  for (const tool of tools) {
    const tag = tool.endpoint.tags[0] || "Other";
    if (!groups.has(tag)) {
      groups.set(tag, []);
    }
    groups.get(tag)?.push(`  - ${tool.name}: ${tool.endpoint.summary}`);
  }

  const lines: string[] = ["Available API Tools:", ""];

  for (const [tag, toolLines] of groups) {
    lines.push(`## ${tag}`);
    lines.push(...toolLines);
    lines.push("");
  }

  return lines.join("\n");
}
