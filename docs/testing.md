# Testing Guide

> Comprehensive guide for running and writing tests in InsightDesk

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Test Types](#test-types)
- [Integration Test Setup](#integration-test-setup)
- [Writing Tests](#writing-tests)
- [Test Utilities](#test-utilities)
- [External Services](#external-services)
- [Troubleshooting](#troubleshooting)

---

## Overview

InsightDesk uses [Vitest](https://vitest.dev/) as the test framework. Tests are organized into two categories:

| Type                  | Description                      | Services | Speed         |
| --------------------- | -------------------------------- | -------- | ------------- |
| **Unit Tests**        | Test business logic in isolation | Mocked   | Fast (~5s)    |
| **Integration Tests** | Test with real external services | Real     | Slower (~30s) |

### Test Architecture

```
src/test/
├── setup.ts                 # Global test setup (mocks vs real)
├── helpers.ts               # Test utilities
├── factories.ts             # Test data factories
├── fixtures/                # Static test fixtures
├── integration/             # Integration test utilities
│   ├── index.ts             # Re-exports
│   ├── services.ts          # Container management
│   ├── setup.ts             # Integration setup
│   └── cleanup.ts           # Data cleanup utilities
├── routes/                  # Route-level tests
└── *.test.ts                # Test files
```

---

## Quick Start

### Running Unit Tests

```bash
# Run unit tests only (skip integration tests)
bun run test:unit

# Watch mode
bun run test:watch

# With coverage
bun run test:coverage
```

### Running Integration Tests

```bash
# 1. Set up test environment (automatically starts containers, creates DB, etc.)
bun run test:setup

# 2. Run integration tests
bun run test:integration

# Or run ALL tests (unit + integration)
bun run test
```

### Stopping Test Containers

```bash
bun run test:containers:down
```

---

## Test Types

### Unit Tests

Unit tests mock all external services and focus on testing business logic:

```typescript
// src/modules/tickets/tickets.service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db", () => ({
  db: { select: vi.fn(), insert: vi.fn() },
  closeDatabaseConnection: vi.fn(),
}));

describe("ticketsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a ticket", async () => {
    // Test with mocked database
  });
});
```

**When to write unit tests:**
- Testing service business logic
- Testing validation rules
- Testing data transformations
- Testing error handling

### Integration Tests

Integration tests use real external services:

```typescript
// src/test/valkey.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { skipIntegrationTests, flushValkey } from "@/test/integration";

describe.skipIf(skipIntegrationTests())("Valkey Integration", () => {
  beforeAll(async () => {
    flushValkey(); // Clean state
  });

  it("should cache and retrieve data", async () => {
    // Test with real Valkey
  });
});
```

**When to write integration tests:**
- Testing database queries and RLS policies
- Testing caching behavior
- Testing file uploads
- Testing email sending
- Testing multi-service workflows

---

## Integration Test Setup

### Prerequisites

1. **Docker** installed and running
2. **docker-compose.test.yml** services available

### Test Containers

The test environment uses isolated Docker containers:

| Service    | Container                   | Port      | Dev Port  |
| ---------- | --------------------------- | --------- | --------- |
| PostgreSQL | `insightdesk-postgres-test` | 5433      | 5432      |
| Valkey     | `insightdesk-valkey-test`   | 6380      | 6379      |
| MinIO      | `insightdesk-minio-test`    | 9002      | 9000      |
| Mailpit    | `insightdesk-mailpit-test`  | 1026/8026 | 1025/8025 |

### Setup Script

The `bun run test:setup` command:

1. ✅ Starts test containers (if not running)
2. ✅ Waits for all services to be healthy
3. ✅ Creates/resets test database
4. ✅ Pushes schema directly using `drizzle-kit push`
5. ✅ Grants RLS role permissions using shared `db-setup` module
6. ✅ Creates MinIO test bucket
7. ✅ Flushes Valkey cache

> **Note:** Test setup uses `drizzle-kit push` for fast schema sync without migration files.
> Production uses `drizzle-kit migrate` with versioned migrations. See [Deployment Guide](./deployment.md).

### Environment Configuration

Test environment is configured in `.env.test`:

```dotenv
DATABASE_URL=postgresql://insightdesk:insightdesk_test@localhost:5433/insightdesk_test
VALKEY_URL=redis://localhost:6380
STORAGE_S3_ENDPOINT=http://localhost:9002
SMTP_PORT=1026
```

---

## Writing Tests

### File Naming Convention

```
*.test.ts           # Unit tests (default)
*.integration.test.ts   # Integration tests
```

### Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("ModuleName", () => {
  // Setup
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Group by function
  describe("functionName", () => {
    it("should [expected behavior]", async () => {
      // Arrange
      const input = { ... };

      // Act
      const result = await functionName(input);

      // Assert
      expect(result).toEqual(expected);
    });

    it("should throw [ErrorType] when [condition]", async () => {
      await expect(functionName(invalid)).rejects.toThrow(ErrorType);
    });
  });
});
```

### Integration Test Pattern

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  skipIntegrationTests,
  resetTestEnvironment,
  getMailpitMessages,
  clearMailpit,
} from "@/test/integration";

describe.skipIf(skipIntegrationTests())("Feature Integration", () => {
  beforeAll(async () => {
    // One-time setup
  });

  beforeEach(async () => {
    // Reset between tests for isolation (Option B)
    await resetTestEnvironment();
  });

  afterAll(async () => {
    // Cleanup
  });

  it("should work with real services", async () => {
    // Test implementation
  });
});
```

---

## Test Utilities

### Available Imports

```typescript
// Unit test utilities
import {
  createTestUser,
  createTestOrganization,
  createTestTicket,
  authenticatedRequest,
  expectSuccess,
  expectError,
} from "@/test";

// Integration test utilities
import {
  skipIntegrationTests,
  resetTestEnvironment,
  truncateAllTables,
  flushValkey,
  clearMinioBucket,
  clearMailpit,
  getMailpitMessages,
  execSql,
  execValkey,
} from "@/test/integration";
```

### Factory Functions

```typescript
// Create test data
const user = createTestUser({ name: "Test User" });
const org = createTestOrganization({ name: "Test Org" });
const ticket = createTestTicket({ subject: "Test Ticket" });

// Create complete scenario
const scenario = createTestScenario();
// { organization, owner, agent, customer, ticket, message }
```

### Authenticated Requests

```typescript
import { authenticatedRequest, createMockSession } from "@/test";

const session = createMockSession({
  userId: user.id,
  organizationId: org.id,
  role: "agent",
});

const response = await authenticatedRequest(app, session)
  .get("/api/tickets")
  .expect(200);
```

### Database Cleanup

```typescript
import { truncateAllTables, truncateTables } from "@/test/integration";

// Truncate all tables
await truncateAllTables();

// Truncate specific tables
await truncateTables(["tickets", "ticket_messages"]);
```

### Valkey Operations

```typescript
import { flushValkey, execValkey, getAllValkeyKeys } from "@/test/integration";

// Flush all data
flushValkey();

// Execute command
const result = execValkey("GET mykey");

// Debug: see all keys
const keys = getAllValkeyKeys();
```

### Mailpit Operations

```typescript
import { getMailpitMessages, getMailpitMessage, clearMailpit } from "@/test/integration";

// Get all messages
const messages = await getMailpitMessages();

// Get specific message
const message = await getMailpitMessage(messages[0].ID);
console.log(message.Subject, message.HTML);

// Clear all messages
await clearMailpit();
```

---

## External Services

### PostgreSQL

- **Test Database**: `insightdesk_test`
- **RLS Enabled**: Yes (with app_user, service_role)
- **Schema**: Copied from development database

```typescript
// Execute raw SQL
import { execSql } from "@/test/integration";
await execSql("SELECT * FROM users");
```

### Valkey (Redis)

- **Port**: 6380 (test), 6379 (dev)
- **Used for**: Caching, rate limiting, sessions

```typescript
import { cache } from "@/utils/cache";

await cache.set("key", "value", 60);
const value = await cache.get("key");
```

### MinIO (S3)

- **Port**: 9002 (test), 9000 (dev)
- **Bucket**: `insightdesk-test`

```typescript
import { getTestMinioConfig, ensureMinioBucket } from "@/test/integration";

const config = getTestMinioConfig();
// { endpoint, bucket, accessKey, secretKey, region, forcePathStyle }
```

### Mailpit (Email)

- **SMTP Port**: 1026 (test), 1025 (dev)
- **Web UI**: http://localhost:8026 (test), http://localhost:8025 (dev)

```typescript
import { getMailpitMessages } from "@/test/integration";

// Send email through your app...

// Verify it was received
const messages = await getMailpitMessages();
expect(messages).toHaveLength(1);
expect(messages[0].Subject).toBe("Welcome!");
```

---

## Troubleshooting

### Common Issues

#### Tests timeout

```bash
# Increase timeout in test file
import { describe, it, expect } from "vitest";

describe("slow tests", () => {
  it("should complete", async () => {
    // ...
  }, 30000); // 30 second timeout
});
```

#### Container not starting

```bash
# Check container logs
bun run test:containers:logs

# Restart containers
bun run test:containers:down
bun run test:containers:up
```

#### Database connection refused

```bash
# Verify PostgreSQL is running
docker exec insightdesk-postgres-test pg_isready

# Check .env.test has correct port (5433, not 5432)
```

#### Valkey connection refused

```bash
# Verify Valkey is running
docker exec insightdesk-valkey-test valkey-cli ping

# Check .env.test has correct port (6380, not 6379)
```

#### Tests polluting each other

```typescript
// Use resetTestEnvironment() in beforeEach
beforeEach(async () => {
  await resetTestEnvironment();
});
```

#### MinIO bucket not found

```bash
# Re-run setup
bun run test:setup

# Or manually ensure bucket
import { ensureMinioBucket } from "@/test/integration";
await ensureMinioBucket();
```

### Debug Mode

```bash
# Run single test file with verbose output
bun run test -- src/test/mytest.test.ts --reporter=verbose

# Run with Node debugger
node --inspect-brk ./node_modules/vitest/vitest.mjs run
```

### Checking Test Coverage

```bash
bun run test:coverage

# View HTML report
open coverage/index.html
```

---

## Commands Reference

| Command                        | Description                                |
| ------------------------------ | ------------------------------------------ |
| `bun run test`                 | Run all tests (unit + integration)         |
| `bun run test:unit`            | Run unit tests only (skip integration)     |
| `bun run test:integration`     | Run integration tests only (real services) |
| `bun run test:watch`           | Watch mode (unit tests)                    |
| `bun run test:coverage`        | Unit tests with coverage report            |
| `bun run test:ui`              | Vitest UI                                  |
| `bun run test:setup`           | Set up integration test environment        |
| `bun run test:containers:up`   | Start test containers                      |
| `bun run test:containers:down` | Stop test containers                       |
| `bun run test:containers:logs` | View container logs                        |

---

## Best Practices

1. **Test Isolation**: Each test should be independent; use `beforeEach` cleanup
2. **Meaningful Names**: Test names should describe expected behavior
3. **Arrange-Act-Assert**: Structure tests clearly
4. **Don't Test Mocks**: Ensure tests verify actual business logic
5. **Integration for Boundaries**: Use integration tests for external service interactions
6. **Fast Feedback**: Keep unit tests fast; run integration tests in CI
