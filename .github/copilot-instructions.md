# GitHub Copilot Instructions for InsightDesk

> **Project**: InsightDesk - Multi-tenant Customer Support Ticketing System  
> **Runtime**: Bun | **Framework**: Express 5.1 + TypeScript | **Database**: PostgreSQL + Drizzle ORM | **Auth**: better-auth

---

## 🎯 Core Principles

- This is **battle-tested production software** - write code accordingly
- Prioritize **reliability, security, and maintainability** over cleverness
- Follow **existing patterns** in the codebase - consistency is key
- When in doubt, check how similar features are implemented
- Always check for **deprecated APIs** and replace with newer alternatives

---

## ✅ After Every Task (MANDATORY)

1. **Run TypeScript check**: `bunx tsc --noEmit`
2. **Run linter**: `bun run lint`
3. **Run formatter**: `bun run format`
4. **Run tests**: `bun run test`
5. **Commit in small, logical chunks** - each commit should represent ONE logical change

**Never skip these steps. Every task must pass all checks before moving on.**

### 🔄 Commit Strategy (ENFORCED)

- **Break work into small, atomic commits** - don't bundle unrelated changes
- Each commit should be self-contained and pass all checks independently
- Use descriptive commit messages following conventional commits format
- Example: `feat(tickets): add bulk status update endpoint`
- If a feature requires multiple files, commit related changes together but separate from other features
- **Never make one giant commit at the end** - commit progressively as you complete each part

---

## 🏗️ Architecture Rules

### Project Structure
- Modules live in `src/modules/[feature]/` with routes, service, schema, and index files
- Database schema in `src/db/schema/` - tables and relations are separate files
- Shared utilities in `src/lib/`
- Middleware in `src/middleware/`
- Background jobs in `src/jobs/`

### Module Pattern
- Every module exports via `index.ts`
- Routes handle HTTP, services handle business logic
- Schemas define Zod validation
- Keep routes thin - logic belongs in services

---

## 🔐 Authentication & Authorization

- Use `authenticate` middleware for protected routes
- Use `requireRole()` for role-based access control
- Access user via `req.user`, organization via `req.organizationId`, role via `req.userRole`
- Role hierarchy: `customer < agent < admin < owner`
- Never trust client-side data - always validate server-side

---

## 🗄️ Database Rules

- Always use **UUID** for primary keys
- Always include `createdAt` and `updatedAt` timestamps with timezone
- Use `pgEnum` for enumerated values
- Add **indexes** for frequently queried columns
- Use **`returning()`** after insert/update to avoid extra queries
- Use **transactions** for multi-step operations
- Keep relations in `relations.ts` to avoid circular imports
- Never use raw SQL without parameterization

---

## 🌱 Database Schema Changes (MANDATORY)

**Every schema change MUST include seed updates to maintain data consistency.**

### When to Update Seeds
- Adding a new table → Add seed function in `src/lib/seed/drizzle-seed.ts`
- Adding a new column → Update the corresponding seed function
- Adding a new enum → Update seed data to use new enum values
- Changing column constraints → Verify seed data still validates
- Removing/renaming columns → Update seed functions accordingly

### Seed Architecture
- **Auth tables** (`user`, `session`, `account`, `verification`): Use `src/lib/seed/auth-seed.ts` (better-auth API)
- **All other tables**: Use `src/lib/seed/drizzle-seed.ts` (table-specific seed functions)
- **Orchestrator**: `src/lib/seed/index.ts` coordinates dev/test seeds

### How to Update
1. Open `src/lib/seed/drizzle-seed.ts`
2. Find or create the seed function for the affected table
3. Add/modify seed data to match new schema
4. For new tables, add function to `seedAllTables()` in proper order (respect FK constraints)
5. For test seeds, ensure deterministic data (use fixed values, not random)

### Verification
```bash
bun run db:reset      # Reset and reseed database
bun run test:seed     # Verify test seeds work
bun run test          # Run tests to ensure seeds are compatible
```

**Schema changes without seed updates will cause database errors.**

---

## ✏️ Code Style

### Naming
- Files: `kebab-case` (e.g., `ticket-activities.ts`)
- Variables/Functions: `camelCase`
- Types/Interfaces: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Database enums: `snake_case` values

### Imports (Biome-managed order)
1. External packages
2. Internal aliases (`@/`)
3. Relative imports

### Types
- **Never use `any`** - use `unknown` with type guards
- **Never use `null` in metadata objects** - use `undefined` instead
- Export types alongside schemas: `export type X = z.infer<typeof xSchema>`

---

## ⚠️ Error Handling

- Use custom error classes: `NotFoundError`, `ForbiddenError`, `BadRequestError`, `UnauthorizedError`, `ConflictError`
- Always wrap async route handlers in try-catch and call `next(error)`
- Never expose internal error details to clients
- Log errors with appropriate context for debugging

---

## 🧪 Testing Rules (CRITICAL - MANDATORY)

**Every service file MUST have a corresponding test file with comprehensive coverage.**

### Test File Requirements
- **File naming**: `[service-name].service.test.ts` alongside the service file
- **Minimum coverage**: Every public function must have at least 2 tests (success + failure)
- **Zero coverage is NEVER acceptable** - every new service must include tests

### What to Test (MANDATORY for each function)
1. **Success path**: Normal operation with valid inputs
2. **Error paths**: NotFoundError, ForbiddenError, BadRequestError, ConflictError scenarios
3. **Edge cases**: Empty arrays, null values, boundary conditions
4. **Authorization**: Verify role-based access is enforced
5. **Validation**: Verify invalid inputs are rejected

### Mock Rules (ANTI-MOCK-ABUSE)
```typescript
// ❌ BAD: Test only verifies mock returns what was mocked (USELESS)
it("should return data", async () => {
  vi.mocked(db.select).mockResolvedValue([mockData]);
  const result = await service.getData();
  expect(result).toEqual([mockData]); // Just testing the mock!
});

// ✅ GOOD: Test verifies actual business logic
it("should calculate total correctly", async () => {
  vi.mocked(db.select).mockResolvedValue([{ price: 100 }, { price: 50 }]);
  const result = await service.getTotal();
  expect(result).toBe(150); // Tests calculation logic
});

// ✅ GOOD: Test verifies error handling
it("should throw NotFoundError when item missing", async () => {
  vi.mocked(db.select).mockResolvedValue([]);
  await expect(service.getById("123")).rejects.toThrow(NotFoundError);
});

// ✅ GOOD: Test verifies data transformation
it("should filter inactive items", async () => {
  vi.mocked(db.select).mockResolvedValue([
    { id: "1", isActive: true },
    { id: "2", isActive: false },
  ]);
  const result = await service.getActiveItems();
  expect(result).toHaveLength(1);
  expect(result[0].id).toBe("1");
});
```

### Test Structure Template
```typescript
describe("serviceName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("functionName", () => {
    it("should [success case description]", async () => { /* ... */ });
    it("should throw [ErrorType] when [condition]", async () => { /* ... */ });
    it("should handle [edge case]", async () => { /* ... */ });
  });
});
```

### Mock Setup Pattern
```typescript
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  closeDatabaseConnection: vi.fn(), // REQUIRED for test setup
}));
```

### Prohibited Test Patterns
- ❌ Tests that only verify mock returns (mock abuse)
- ❌ Tests without assertions (`expect()`)
- ❌ Tests that skip error scenarios
- ❌ Tests that don't clear mocks between runs
- ❌ Services without any test file (zero coverage)
- ❌ Using `.skip()` or `.todo()` without a plan to implement

### Test Categories Required
| Category | Description | Example |
|----------|-------------|---------|
| Unit | Test individual functions | `service.create()` with mocked DB |
| Error | Test all error paths | NotFoundError, ForbiddenError |
| Edge | Boundary conditions | Empty arrays, max values |
| Auth | Authorization checks | Role-based access control |

### Before Committing Tests
- [ ] Every function has success test
- [ ] Every function has failure test
- [ ] Error messages are meaningful
- [ ] Mocks are cleared in `beforeEach`
- [ ] No `.skip()` or `.todo()` tests
- [ ] Tests actually verify business logic (not just mock returns)

---

## 🔗 Integration Test Rules (MANDATORY)

**Integration tests verify interactions with real external services.**

### When Integration Tests Are Required

| Change Type | Requires Integration Test |
|-------------|---------------------------|
| New database query with RLS | ✅ Yes |
| New Valkey/caching usage | ✅ Yes |
| New file upload/storage feature | ✅ Yes |
| New email sending feature | ✅ Yes |
| New external API integration | ✅ Yes |
| Pure business logic (no external services) | ❌ Unit test only |

### Integration Test File Naming
- Pattern: `*.integration.test.ts`
- Location: Same directory as unit tests or `src/test/`

### Integration Test Structure
```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import {
  skipIntegrationTests,
  resetTestEnvironment,
} from "@/test/integration";

describe.skipIf(skipIntegrationTests())("Feature Integration", () => {
  beforeEach(async () => {
    await resetTestEnvironment(); // Clean state between tests
  });

  it("should work with real database", async () => {
    // Test with real PostgreSQL
  });
});
```

### External Service Test Requirements

| Service | Test Must Verify |
|---------|-----------------|
| **PostgreSQL** | RLS policies, transactions, complex queries |
| **Valkey** | Cache hit/miss, TTL expiration, rate limiting |
| **MinIO** | Upload, download, presigned URLs, bucket policies |
| **Mailpit** | Email content, recipients, attachments |

### Mandatory Updates (ENFORCED)

**When you change any of these, you MUST update integration test infrastructure:**

1. **New external service connection** → Update:
   - `docker-compose.test.yml` (add container)
   - `.env.test` (add connection config)
   - `src/test/integration/services.ts` (add health check)
   - `src/test/integration/cleanup.ts` (add cleanup function)
   - `scripts/setup-integration-tests.ts` (add setup step)
   - `docs/testing.md` (document the service)

2. **New RLS policy** → Update:
   - `scripts/setup-integration-tests.ts` (add policy creation)
   - Add integration test verifying the policy

3. **Schema change affecting integration tests** → Update:
   - `src/test/integration/cleanup.ts` (update `TABLES_TO_TRUNCATE`)
   - Verify `test:setup` still works

4. **New environment variable for external service** → Update:
   - `.env.test`
   - `src/test/integration/services.ts` (`TEST_CONFIG`)
   - `docs/testing.md`

### Running Integration Tests
```bash
# Setup (first time or after schema changes)
npm run test:setup

# Run integration tests
npm run test:integration

# Run all tests
npm run test:all
```

### Integration Test Checklist
- [ ] Test uses `skipIntegrationTests()` for conditional execution
- [ ] Test uses `resetTestEnvironment()` for isolation
- [ ] Test verifies actual external service behavior
- [ ] Test doesn't depend on dev container state
- [ ] Test cleans up after itself
- [ ] `docs/testing.md` updated if new pattern introduced

---

## 📝 Validation Rules

- **Always validate** request body, query, and params with Zod schemas
- Use `z.coerce` for query parameters that need type conversion
- Provide meaningful error messages in schemas
- Use `.default()` for optional fields with defaults
- Export input types from schema files
- Validate file uploads (size, type, count)

---

## 🔄 API Response Format

- Success: `{ success: true, data: ..., pagination?: ... }`
- Created: `{ success: true, data: ... }` with status 201
- Error: `{ success: false, error: "message", details?: [...] }`
- Always use consistent response structure

---

## 📖 OpenAPI Documentation (MANDATORY)

**Every API route change MUST include OpenAPI documentation updates.**

### When to Update
- Adding a new endpoint → Add route registration in `[module].openapi.ts`
- Modifying request/response schema → Update corresponding OpenAPI schemas
- Changing endpoint path or method → Update the route registration
- Adding/removing query parameters → Update the request schema
- Changing authentication requirements → Update security settings

### How to Update
1. Each module has a `[module].openapi.ts` file (e.g., `tickets.openapi.ts`)
2. Register schemas using `registry.register()` with `.openapi()` metadata
3. Register routes using `registry.registerPath()` with full request/response definitions
4. Import the openapi file in the module's `index.ts`: `import "./[module].openapi";`

### Documentation Requirements
- Include `summary` and `description` for every endpoint
- Document all request parameters (path, query, body)
- Document all possible response codes (200, 201, 400, 401, 403, 404, 500)
- Use reusable response schemas from `src/lib/openapi/responses.ts`
- Add meaningful examples where helpful

### Verification
- Start dev server: `bun dev`
- Check Swagger UI at: `http://localhost:3001/api-docs`
- Verify new/updated endpoints appear correctly
- Test the "Try it out" functionality

### Environment Configuration
- `ENABLE_API_DOCS`: Set to `"true"` to enable live Swagger UI (defaults to `true` in development, `false` in production)
- `API_DOCS_PATH`: Path where Swagger UI is mounted (defaults to `/api-docs`)

### Static Documentation
- Run `bun run docs:generate` to generate static OpenAPI documentation
- Output files are created in `docs/` directory:
  - `openapi.json` - OpenAPI spec in JSON format
  - `openapi.yaml` - OpenAPI spec in YAML format
  - `index.html` - Redoc HTML viewer
- Static docs can be hosted on any static file server or CDN

**API changes without documentation updates will be rejected.**

---

## ⚡ Performance Rules

- Always use **pagination** for list endpoints
- Use database **indexes** for filtered/sorted columns
- **Batch operations** when processing multiple items
- Avoid N+1 queries - use proper joins or batch fetches
- Use `limit` on all queries
- Cache expensive computations when appropriate

---

## 🔒 Security Rules

- Sanitize all user input
- Use parameterized queries - never concatenate SQL
- Validate file uploads strictly
- Implement rate limiting on sensitive endpoints
- Never log sensitive data (passwords, tokens)
- Always verify organization context to prevent data leaks
- Use HTTPS in production

---

## 🚫 Things to Avoid

- Using `any` type
- Skipping validation
- Hardcoding values (use config/constants)
- Mixing route and business logic
- Using `null` where `undefined` is appropriate
- Exposing stack traces in production
- Writing tests that only cover happy paths
- **Mock abuse** - tests that only verify mock returns (not business logic)
- **Zero test coverage** - every service MUST have tests
- Using deprecated APIs - always check for newer alternatives
- Committing without running quality checks
- Ignoring TypeScript errors
- Using `.skip()` or `.todo()` tests without immediate plan to implement
- Tests without meaningful assertions

---

## 🔍 Code Quality Checks

- **Always check for deprecated code** and replace with newer APIs
- Review TypeScript errors before committing
- Ensure no linting warnings
- Verify tests pass before pushing
- Check for security vulnerabilities in dependencies
- Keep dependencies up to date

---

## 📋 New Feature Checklist

- [ ] Create Zod schema with validation
- [ ] Create service with business logic
- [ ] Create routes with proper middleware
- [ ] **Create/update OpenAPI documentation** in `[module].openapi.ts`
- [ ] Create index.ts with exports (include openapi import)
- [ ] Register route in app.ts
- [ ] Write SUCCESS test cases
- [ ] Write FAILURE/edge case tests
- [ ] Add database indexes if needed
- [ ] Add activity logging if user-facing
- [ ] Add real-time events if applicable
- [ ] Run TypeScript check: `bunx tsc --noEmit`
- [ ] Run linter: `bun run lint`
- [ ] Run formatter: `bun run format`
- [ ] Run tests: `bun run test`
- [ ] **Verify Swagger UI** shows new endpoints correctly
- [ ] **Commit each logical change separately** (not one big commit)

---

## 🛠️ Commands Reference

```bash
bun run dev           # Development server
bun run test          # Run tests
bun run lint          # Lint code
bun run format        # Format code
bunx tsc --noEmit     # TypeScript check
npm run db:generate   # Generate migrations
npm run db:migrate    # Run migrations
npm run db:studio     # Drizzle Studio
npm run db:seed       # Seed development database
npm run db:reset      # Reset and reseed database
npm run test:seed     # Seed test database
npm run test:setup    # Setup integration test environment
npm run test:integration # Run integration tests
npm run docs:generate # Generate static OpenAPI documentation
```

---

## 📚 Key Files Reference

- `src/app.ts` - Express app setup and route registration
- `src/db/schema/tables.ts` - All database table definitions
- `src/db/schema/relations.ts` - Drizzle relations
- `src/middleware/error-handler.ts` - Error classes and handler
- `src/middleware/validate.ts` - Zod validation middleware
- `src/modules/auth/auth.middleware.ts` - Authentication middleware
- `src/lib/openapi/` - OpenAPI configuration (registry, responses, security)
- `src/modules/*/[module].openapi.ts` - Module-specific API documentation
- `src/lib/seed/` - Seed data architecture (auth-seed, drizzle-seed, orchestrator)
- `src/test/integration/` - Integration test utilities (services, setup, cleanup)
- `docker-compose.test.yml` - Test container configuration
- `scripts/setup-integration-tests.ts` - Integration test setup script
- `docs/testing.md` - Comprehensive testing documentation

---

## 💡 Additional Guidelines

- Document complex business logic with comments
- Use meaningful variable and function names
- Keep functions small and focused
- Prefer composition over inheritance
- Handle promise rejections properly
- Use proper HTTP status codes
- Version control database migrations
- Write self-documenting code where possible
