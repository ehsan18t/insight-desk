/**
 * MCP Server Types
 *
 * Type definitions for the InsightDesk MCP server.
 */

/**
 * API endpoint definition parsed from OpenAPI spec
 */
export interface ApiEndpoint {
  path: string;
  method: string;
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  parameters: ApiParameter[];
  requestBody?: ApiRequestBody;
  responses: Record<string, ApiResponseSpec>;
  security: string[];
}

/**
 * API parameter definition
 */
export interface ApiParameter {
  name: string;
  in: "path" | "query" | "header";
  required: boolean;
  description?: string;
  schema: ApiSchema;
}

/**
 * API request body definition
 */
export interface ApiRequestBody {
  required: boolean;
  description?: string;
  content: Record<string, { schema: ApiSchema }>;
}

/**
 * API response definition
 */
export interface ApiResponseSpec {
  description: string;
  content?: Record<string, { schema: ApiSchema }>;
}

/**
 * API schema definition (simplified)
 */
export interface ApiSchema {
  type?: string;
  format?: string;
  items?: ApiSchema;
  properties?: Record<string, ApiSchema>;
  required?: string[];
  enum?: string[];
  description?: string;
  default?: unknown;
  $ref?: string;
  [key: string]: unknown;
}

/**
 * API response structure returned by tools
 */
export interface ApiResponse {
  success: boolean;
  status: number;
  statusText: string;
  data?: unknown;
  error?: string;
  [key: string]: unknown;
}

/**
 * MCP tool definition with metadata
 */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, ApiSchema>;
    required: string[];
  };
  endpoint: ApiEndpoint;
}

/**
 * Module grouping for tools
 */
export interface ModuleGroup {
  name: string;
  description: string;
  tools: McpToolDefinition[];
}

/**
 * Configuration for the MCP server
 */
export interface McpServerConfig {
  apiBaseUrl: string;
  openApiSpec: object;
  serverName?: string;
  serverVersion?: string;
}

/**
 * OpenAPI specification structure
 */
export interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: {
    schemas?: Record<string, ApiSchema>;
    securitySchemes?: Record<string, unknown>;
  };
  tags?: Array<{
    name: string;
    description?: string;
  }>;
}

/**
 * OpenAPI operation definition
 */
export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
    description?: string;
    schema?: ApiSchema;
  }>;
  requestBody?: {
    required?: boolean;
    description?: string;
    content?: Record<string, { schema?: ApiSchema }>;
  };
  responses?: Record<
    string,
    {
      description?: string;
      content?: Record<string, { schema?: ApiSchema }>;
    }
  >;
  security?: Array<Record<string, string[]>>;
}
