# InsightDesk MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the InsightDesk API for AI agents and LLM-based tools like Claude Desktop.

## Overview

The MCP server provides a programmatic interface to the InsightDesk API, allowing AI assistants to:

- Browse available API operations by module
- Execute API calls with proper authentication
- Manage organization context for multi-tenant operations

**Note:** MCP is enabled by default in development and disabled in production. Set `ENABLE_MCP=true` to enable in production.

## Quick Start

### Option 1: Full Project Setup (Recommended)

If you're setting up the project for the first time:

```bash
bun run setup
```

This will:
1. Install dependencies
2. Start Docker services
3. Push database schema
4. Seed the database with test data
5. Generate API keys for MCP
6. Output Claude Desktop configuration

The setup script automatically:
- Creates API keys and adds them to your `.env` file
- Displays the Claude Desktop configuration JSON
- Provides ready-to-use credentials

### Option 2: Manual Setup

If you already have the project set up:

```bash
# 1. Ensure services are running
bun run docker:up

# 2. Generate OpenAPI spec (required for MCP)
bun run docs:generate

# 3. Seed database (creates API keys)
bun run db:seed

# 4. Start MCP server
bun run mcp
```

### Regenerate MCP Configuration

If you've re-seeded the database and need to regenerate the MCP configuration:

```bash
bun run mcp:config
```

This queries the database for API keys and outputs the Claude Desktop configuration.

## Claude Desktop Configuration

After running `bun run setup` or `bun run db:seed`, you'll see a configuration JSON output.

Copy it to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Example configuration:

```json
{
  "mcpServers": {
    "insightdesk": {
      "command": "bun",
      "args": ["run", "mcp"],
      "cwd": "/path/to/insight-desk",
      "env": {
        "INSIGHTDESK_API_KEY": "idk_test_development_key_org0_0",
        "INSIGHTDESK_ORGANIZATION_ID": "your-org-uuid"
      }
    }
  }
}
```

**Note:** The `cwd` and credentials are automatically filled in by the setup scripts.

## Running the MCP Server

**Stdio transport** (for Claude Desktop):
```bash
bun run mcp
```

**HTTP transport** (for web-based agents, runs on port 3100):
```bash
bun run mcp:http
```

## Environment Variables

| Variable                      | Description                                | Default                            |
| ----------------------------- | ------------------------------------------ | ---------------------------------- |
| `ENABLE_MCP`                  | Enable/disable MCP server                  | `true` (dev), `false` (prod)       |
| `MCP_PORT`                    | HTTP transport port                        | `3100`                             |
| `MCP_TRANSPORT`               | Transport type: `stdio` or `http`          | `stdio`                            |
| `MCP_HTTP_AUTH_REQUIRED`      | Require API key auth for HTTP transport    | `true` (prod), `false` (dev)       |
| `MCP_RATE_LIMIT_MAX`          | Max requests per minute per API key (HTTP) | `60`                               |
| `MCP_ALLOWED_ORIGINS`         | CORS allowed origins (comma-separated)     | `*` (dev), none (prod)             |
| `INSIGHTDESK_API_URL`         | Base URL of the InsightDesk API            | `http://localhost:3001` (dev only) |
| `INSIGHTDESK_API_KEY`         | API key for authentication                 | Auto-set by `db:seed`              |
| `INSIGHTDESK_ORGANIZATION_ID` | Default organization ID                    | Auto-set by `db:seed`              |

## Available Tools

### Meta Tools

These tools help you navigate and configure the API:

| Tool                  | Description                                         |
| --------------------- | --------------------------------------------------- |
| `api-help`            | Browse available API operations by module or search |
| `api-configure`       | Set API key and organization ID at runtime          |
| `api-test-connection` | Verify API connectivity                             |

### API Tools

All API endpoints are automatically converted to MCP tools:

- **Auth** - Authentication and session management
- **Users** - User profiles and role management
- **Organizations** - Multi-tenant organization management
- **Tickets** - Support ticket CRUD operations
- **Messages** - Ticket messages and replies
- **Categories** - Ticket categorization
- **Tags** - Flexible tagging system
- **Attachments** - File uploads and downloads
- **SLA Policies** - Service level agreement configuration
- **Canned Responses** - Response templates
- **CSAT** - Customer satisfaction surveys
- **Dashboard** - Analytics and metrics
- **Export** - Data export functionality
- **Jobs** - Background job management
- **Plans** - Subscription plans
- **Subscriptions** - Usage tracking and billing
- **Audit** - Audit logs for compliance

## Usage Examples

### Browsing the API

```
User: What API operations are available for tickets?

Claude: I'll check the Tickets module for you.
[Uses api-help with module="Tickets"]
```

### Making API Calls

```
User: Create a new ticket for me

Claude: I'll create a ticket. First, let me configure the API connection.
[Uses api-configure with apiKey and organizationId]
[Uses createTicket with subject, description, etc.]
```

### Runtime Configuration

The API key and organization ID can be configured in three ways (in order of precedence):

1. **`bun run setup` or `bun run db:seed`** (recommended for development)
   - Automatically generates API keys
   - Updates `.env` with credentials
   - Outputs Claude Desktop configuration

2. **Environment variables** (recommended for production)
   - Set `INSIGHTDESK_API_KEY` and `INSIGHTDESK_ORGANIZATION_ID`
   - Or pass in Claude Desktop `env` configuration

3. **`api-configure` tool** (for ad-hoc changes)
   - Use at runtime to switch API keys or organizations

## API Key Management

### Development (Automatic)

When you run `bun run setup` or `bun run db:seed`, test API keys are automatically created:

| Key Name                  | Scopes              | Purpose                 |
| ------------------------- | ------------------- | ----------------------- |
| Development API Key       | read, write         | General development use |
| CI/CD Pipeline Key        | read, write, delete | Automated pipelines     |
| Read-Only Integration Key | read                | Read-only integrations  |

The Development API Key is automatically configured for MCP use.

### Production (Manual)

Create production API keys via the InsightDesk API:

```bash
curl -X POST http://localhost:3000/api/organizations/{orgId}/api-keys \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=your-session" \
  -d '{
    "name": "MCP Server Key",
    "scopes": ["read", "write"]
  }'
```

Or via the UI/admin panel when available.

## Architecture

```
src/mcp/
├── index.ts     # Main entry point, MCP server setup
├── client.ts    # HTTP client for API requests
├── generator.ts # OpenAPI to MCP tool converter
└── types.ts     # Type definitions
```

The server:
1. Loads the OpenAPI spec from `docs/openapi.json`
2. Parses it to generate MCP tool definitions
3. Groups tools by module (API tags)
4. Handles tool execution via the HTTP client

## Troubleshooting

### "Failed to load OpenAPI spec"

Run `bun run docs:generate` to generate the OpenAPI specification.

### "Authentication required"

Set your API key via:
- Environment variable: `INSIGHTDESK_API_KEY`
- Claude Desktop config: `env.INSIGHTDESK_API_KEY`
- Runtime: Use `api-configure` tool

### "Organization not found"

Set the organization ID via:
- Environment variable: `INSIGHTDESK_ORGANIZATION_ID`
- Claude Desktop config: `env.INSIGHTDESK_ORGANIZATION_ID`
- Runtime: Use `api-configure` tool

### Connection Issues

1. Verify the API is running: `curl http://localhost:3001/health`
2. Check the API URL configuration
3. Use `api-test-connection` tool to diagnose

### MCP Disabled

If you see "MCP Server is disabled", either:
- You're in production mode (set `ENABLE_MCP=true` to override)
- `ENABLE_MCP` is explicitly set to `false`

### HTTP Transport: "Unauthorized" (401)

When using HTTP transport with `MCP_HTTP_AUTH_REQUIRED=true`:
- Include `X-API-Key` header with a valid InsightDesk API key
- Ensure the API key is not revoked
- Check that the InsightDesk API server is running

### HTTP Transport: "Rate limit exceeded" (429)

The HTTP transport rate-limits requests per API key:
- Default: 60 requests per minute
- Adjust via `MCP_RATE_LIMIT_MAX` environment variable
- Wait for the rate limit window to reset

### HTTP Transport: "Not Acceptable" (406)

The MCP protocol requires specific Accept headers:
```bash
# Correct headers
-H "Accept: application/json, text/event-stream"
-H "Content-Type: application/json"
```

### VS Code Configuration Not Working

1. Ensure `.vscode/mcp.json` exists (run `bun run mcp:vscode`)
2. Check that credentials in `.env` are valid
3. For stdio: ensure `bun` is in your PATH
4. For HTTP: ensure the MCP server is running (`bun run mcp:http`)

## Development

### Transport Options

| Transport | Command            | Port | Use Case                        |
| --------- | ------------------ | ---- | ------------------------------- |
| stdio     | `bun run mcp`      | N/A  | Claude Desktop, local CLI tools |
| HTTP/SSE  | `bun run mcp:http` | 3100 | Web-based agents, remote access |

### Adding New Tools

New API endpoints are automatically exposed as MCP tools when:
1. The endpoint has an `operationId` in the OpenAPI spec
2. `bun run docs:generate` is run to update the spec
3. The MCP server is restarted

### Testing

```bash
# Run the MCP server (stdio)
bun run mcp

# Run the MCP server (HTTP on port 3100)
bun run mcp:http

# Test HTTP health endpoint
curl http://localhost:3100/health

# In another terminal, test with MCP inspector
npx @modelcontextprotocol/inspector bun run mcp
```

## Production Deployment

MCP is **disabled by default in production** for security. To enable:

```bash
ENABLE_MCP=true \
MCP_HTTP_AUTH_REQUIRED=true \
MCP_RATE_LIMIT_MAX=60 \
MCP_ALLOWED_ORIGINS=https://your-frontend.com \
INSIGHTDESK_API_URL=https://api.yourdomain.com \
INSIGHTDESK_API_KEY=your-production-key \
bun run mcp:http
```

**Security considerations:**
- Use HTTPS for the API URL in production
- Use production API keys with minimal required scopes
- Consider running MCP on a private network if using HTTP transport
- **HTTP Authentication**: When `MCP_HTTP_AUTH_REQUIRED=true`, clients must include a valid `X-API-Key` header
- **Rate Limiting**: HTTP requests are rate-limited per API key (default: 60 req/min)
- **CORS**: Configure `MCP_ALLOWED_ORIGINS` for your frontend domains in production

### HTTP Transport Authentication

When using the HTTP transport in production, clients must authenticate via the `X-API-Key` header:

```bash
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-API-Key: your-insightdesk-api-key" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

The API key is validated against the InsightDesk API (`/api/auth/me`). Invalid or revoked keys are rejected with a `401 Unauthorized` response.

## VS Code MCP Configuration

For teams using VS Code with GitHub Copilot or Continue.dev that support MCP:

### Generate Configuration

```bash
# Generate .vscode/mcp.json (stdio transport - default)
bun run mcp:vscode

# Generate .vscode/mcp.json (HTTP transport)
bun run mcp:vscode -- --http
```

This creates a `.vscode/mcp.json` file that VS Code-compatible MCP clients can use.

### Sample Configuration

**Stdio transport** (recommended for local development):
```json
{
  "servers": {
    "insightdesk": {
      "type": "stdio",
      "command": "bun",
      "args": ["run", "mcp"],
      "cwd": "/path/to/insight-desk",
      "env": {
        "INSIGHTDESK_API_KEY": "your-api-key",
        "INSIGHTDESK_ORGANIZATION_ID": "your-org-id",
        "INSIGHTDESK_API_URL": "http://localhost:3001"
      }
    }
  }
}
```

**HTTP transport** (for remote servers):
```json
{
  "servers": {
    "insightdesk": {
      "type": "sse",
      "url": "http://localhost:3100/mcp",
      "headers": {
        "X-API-Key": "your-api-key",
        "X-Organization-ID": "your-org-id"
      }
    }
  }
}
```

### Usage Notes

- The stdio transport spawns a local MCP process and is ideal for development
- The HTTP transport connects to a running MCP server and supports authentication
- API credentials are read from your `.env` file when generating the configuration
- Regenerate the config after changing API keys: `bun run mcp:vscode`
