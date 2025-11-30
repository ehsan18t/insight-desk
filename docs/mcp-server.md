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

| Variable                      | Description                       | Default                            |
| ----------------------------- | --------------------------------- | ---------------------------------- |
| `ENABLE_MCP`                  | Enable/disable MCP server         | `true` (dev), `false` (prod)       |
| `MCP_PORT`                    | HTTP transport port               | `3100`                             |
| `MCP_TRANSPORT`               | Transport type: `stdio` or `http` | `stdio`                            |
| `INSIGHTDESK_API_URL`         | Base URL of the InsightDesk API   | `http://localhost:3001` (dev only) |
| `INSIGHTDESK_API_KEY`         | API key for authentication        | Auto-set by `db:seed`              |
| `INSIGHTDESK_ORGANIZATION_ID` | Default organization ID           | Auto-set by `db:seed`              |

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
INSIGHTDESK_API_URL=https://api.yourdomain.com \
INSIGHTDESK_API_KEY=your-production-key \
bun run mcp
```

**Security considerations:**
- Use HTTPS for the API URL in production
- Use production API keys with minimal required scopes
- Consider running MCP on a private network if using HTTP transport
