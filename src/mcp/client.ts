/**
 * InsightDesk API Client
 *
 * HTTP client for making API requests from MCP tools.
 */

import type { ApiEndpoint, ApiResponse, ApiSchema } from "./types.js";

/**
 * API client for making requests to the InsightDesk backend
 */
export class InsightDeskClient {
  private baseUrl: string;
  private apiKey?: string;
  private organizationId?: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  /**
   * Set API key for authentication
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Set default organization ID
   */
  setOrganizationId(organizationId: string): void {
    this.organizationId = organizationId;
  }

  /**
   * Execute an API endpoint with the given arguments
   */
  async execute(endpoint: ApiEndpoint, args: Record<string, unknown>): Promise<ApiResponse> {
    // Build URL with path parameters
    let url = `${this.baseUrl}${endpoint.path}`;

    // Replace path parameters
    for (const param of endpoint.parameters.filter((p) => p.in === "path")) {
      const value = args[param.name];
      if (value !== undefined) {
        url = url.replace(`{${param.name}}`, encodeURIComponent(String(value)));
      }
    }

    // Add query parameters
    const queryParams = new URLSearchParams();
    for (const param of endpoint.parameters.filter((p) => p.in === "query")) {
      const value = args[param.name];
      if (value !== undefined) {
        queryParams.append(param.name, String(value));
      }
    }
    if (queryParams.toString()) {
      url += `?${queryParams.toString()}`;
    }

    // Build headers
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    // Add API key if available
    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }

    // Add organization ID if available
    if (this.organizationId) {
      headers["X-Organization-ID"] = this.organizationId;
    }

    // Build request body
    let body: string | undefined;
    if (endpoint.requestBody && ["POST", "PUT", "PATCH"].includes(endpoint.method)) {
      const bodyData: Record<string, unknown> = {};
      const bodySchema = endpoint.requestBody.content["application/json"]?.schema;

      if (bodySchema?.properties) {
        for (const [key] of Object.entries(bodySchema.properties)) {
          if (args[key] !== undefined) {
            bodyData[key] = args[key];
          }
        }
      }

      if (Object.keys(bodyData).length > 0) {
        body = JSON.stringify(bodyData);
        headers["Content-Type"] = "application/json";
      }
    }

    try {
      const response = await fetch(url, {
        method: endpoint.method,
        headers,
        body,
      });

      const contentType = response.headers.get("content-type");
      let data: unknown;

      if (contentType?.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      return {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        data,
        error: response.ok ? undefined : this.extractErrorMessage(data),
      };
    } catch (error) {
      return {
        success: false,
        status: 0,
        statusText: "Network Error",
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Extract error message from response data
   */
  private extractErrorMessage(data: unknown): string {
    if (typeof data === "string") {
      return data;
    }
    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;
      if (typeof obj.error === "string") {
        return obj.error;
      }
      if (typeof obj.message === "string") {
        return obj.message;
      }
    }
    return "Request failed";
  }

  /**
   * Test the connection to the API
   */
  async testConnection(): Promise<{ connected: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (response.ok) {
        return { connected: true, message: "Successfully connected to InsightDesk API" };
      }

      return {
        connected: false,
        message: `API returned status ${response.status}: ${response.statusText}`,
      };
    } catch (error) {
      return {
        connected: false,
        message: error instanceof Error ? error.message : "Connection failed",
      };
    }
  }
}

/**
 * Build tool input schema description for documentation
 */
export function describeInputSchema(schema: {
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
