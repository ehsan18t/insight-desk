# Testing Strategy

> Comprehensive testing approach for InsightDesk ensuring quality, reliability, and maintainability.

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Test Pyramid](#test-pyramid)
3. [Test Types Overview](#test-types-overview)
4. [Testing Tools](#testing-tools)
5. [Code Coverage](#code-coverage)
6. [Test Organization](#test-organization)
7. [CI/CD Integration](#cicd-integration)
8. [Related Documentation](#related-documentation)

---

## Testing Philosophy

### Core Principles

1. **Test Behavior, Not Implementation**
   - Focus on what the code does, not how it does it
   - Tests should survive refactoring

2. **Fast Feedback Loop**
   - Unit tests complete in seconds
   - Integration tests complete in minutes
   - E2E tests run before deployment

3. **Confidence Over Coverage**
   - Prioritize critical paths
   - Meaningful tests over metric gaming

4. **Maintainability**
   - Tests are first-class code
   - Clear, readable test cases
   - DRY test utilities

### Testing Standards

```typescript
// Good test example
describe('TicketService', () => {
  describe('createTicket', () => {
    it('should create a ticket with valid data', async () => {
      // Arrange
      const input = createTicketInput({ title: 'Test Issue' });
      
      // Act
      const ticket = await ticketService.create(input);
      
      // Assert
      expect(ticket.title).toBe('Test Issue');
      expect(ticket.status).toBe('open');
      expect(ticket.createdAt).toBeInstanceOf(Date);
    });

    it('should fail with missing required fields', async () => {
      // Arrange
      const input = { title: '' };
      
      // Act & Assert
      await expect(ticketService.create(input))
        .rejects.toThrow('Title is required');
    });
  });
});
```

---

## Test Pyramid

```
                    ┌───────────┐
                    │   E2E     │  Few, slow, high confidence
                    │  Tests    │  Critical user journeys
                    └───────────┘
                   ╱             ╲
                  ╱               ╲
                 ╱                 ╲
            ┌─────────────────────────┐
            │   Integration Tests     │  Some, medium speed
            │   (API, Database)       │  Component boundaries
            └─────────────────────────┘
           ╱                           ╲
          ╱                             ╲
         ╱                               ╲
    ┌─────────────────────────────────────────┐
    │            Unit Tests                    │  Many, fast
    │   (Functions, Classes, Hooks)            │  Business logic
    └─────────────────────────────────────────┘
```

### Recommended Distribution

| Test Type | Coverage Target | Execution Time | Count |
|-----------|----------------|----------------|-------|
| Unit | 80%+ of logic | < 1 min | 500+ |
| Integration | Key APIs | < 5 min | 100-200 |
| E2E | Critical paths | < 15 min | 20-50 |

---

## Test Types Overview

### Unit Tests

**Purpose**: Test individual functions, classes, and hooks in isolation.

```typescript
// Example: Testing a utility function
describe('formatTicketNumber', () => {
  it('should format number with prefix', () => {
    expect(formatTicketNumber(123)).toBe('TKT-000123');
  });

  it('should handle large numbers', () => {
    expect(formatTicketNumber(999999)).toBe('TKT-999999');
  });
});

// Example: Testing a React hook
describe('useTickets', () => {
  it('should fetch tickets on mount', async () => {
    const { result } = renderHook(() => useTickets(), {
      wrapper: QueryClientProvider,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(10);
  });
});
```

### Integration Tests

**Purpose**: Test component interactions and API endpoints.

```typescript
// Example: Testing API endpoint
describe('POST /api/v1/tickets', () => {
  it('should create ticket for authenticated user', async () => {
    const response = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Integration Test Ticket',
        description: 'Testing ticket creation',
        priority: 'medium',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.title).toBe('Integration Test Ticket');
    
    // Verify in database
    const ticket = await prisma.ticket.findUnique({
      where: { id: response.body.data.id },
    });
    expect(ticket).not.toBeNull();
  });
});
```

### End-to-End Tests

**Purpose**: Test complete user journeys through the application.

```typescript
// Example: Testing ticket creation flow
test('user can create and view a ticket', async ({ page }) => {
  // Login
  await page.goto('/login');
  await page.fill('[name="email"]', 'user@example.com');
  await page.fill('[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  
  // Navigate to tickets
  await page.waitForURL('/dashboard');
  await page.click('text=New Ticket');
  
  // Create ticket
  await page.fill('[name="title"]', 'E2E Test Ticket');
  await page.fill('[name="description"]', 'Created via E2E test');
  await page.selectOption('[name="priority"]', 'high');
  await page.click('button[type="submit"]');
  
  // Verify creation
  await expect(page).toHaveURL(/\/tickets\/\d+/);
  await expect(page.locator('h1')).toContainText('E2E Test Ticket');
});
```

---

## Testing Tools

### Backend (API Server)

| Tool | Purpose |
|------|---------|
| Vitest | Test runner and assertions |
| Supertest | HTTP testing |
| Prisma | Test database utilities |
| Testcontainers | Docker containers for tests |
| MSW | Mock external APIs |
| Faker | Generate test data |

### Frontend (Next.js)

| Tool | Purpose |
|------|---------|
| Vitest | Test runner (unit tests) |
| React Testing Library | Component testing |
| Playwright | E2E testing |
| MSW | API mocking |
| Storybook | Component development/testing |

### Package Configuration

```json
{
  "devDependencies": {
    "vitest": "^1.0.0",
    "@vitest/coverage-v8": "^1.0.0",
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/user-event": "^14.0.0",
    "@playwright/test": "^1.40.0",
    "supertest": "^6.3.0",
    "@types/supertest": "^2.0.0",
    "msw": "^2.0.0",
    "@faker-js/faker": "^8.0.0",
    "testcontainers": "^10.0.0"
  },
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:e2e": "playwright test",
    "test:ci": "vitest run --coverage && playwright test",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/types/**',
      ],
      thresholds: {
        global: {
          statements: 80,
          branches: 75,
          functions: 80,
          lines: 80,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

---

## Code Coverage

### Coverage Targets

| Area | Minimum | Target |
|------|---------|--------|
| Overall | 70% | 80% |
| Business Logic | 85% | 95% |
| API Routes | 80% | 90% |
| UI Components | 60% | 75% |
| Utilities | 90% | 100% |

### What to Cover

```markdown
## High Priority (Must Cover)
- [ ] Authentication flows
- [ ] Authorization checks
- [ ] Payment processing
- [ ] Data validation
- [ ] Core business logic
- [ ] Error handling

## Medium Priority (Should Cover)
- [ ] API endpoints
- [ ] Data transformations
- [ ] Form submissions
- [ ] State management

## Lower Priority (Nice to Have)
- [ ] UI styling
- [ ] Third-party integrations (mock)
- [ ] Analytics events
```

### Coverage Reporting

```yaml
# In CI pipeline
- name: Run tests with coverage
  run: bun run test:coverage

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v4
  with:
    files: ./coverage/lcov.info
    fail_ci_if_error: true
    verbose: true
```

---

## Test Organization

### Directory Structure

```
project/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── services/
│   │   │   │   ├── ticket.service.ts
│   │   │   │   └── ticket.service.test.ts  # Co-located unit tests
│   │   │   └── routes/
│   │   │       ├── tickets.ts
│   │   │       └── tickets.test.ts
│   │   └── tests/
│   │       ├── setup.ts                     # Test configuration
│   │       ├── helpers/                     # Test utilities
│   │       │   ├── auth.ts
│   │       │   ├── database.ts
│   │       │   └── factories.ts
│   │       └── integration/                 # Integration tests
│   │           ├── tickets.test.ts
│   │           └── auth.test.ts
│   └── web/
│       ├── src/
│       │   └── components/
│       │       ├── Button/
│       │       │   ├── Button.tsx
│       │       │   ├── Button.test.tsx      # Component tests
│       │       │   └── Button.stories.tsx   # Storybook
│       └── tests/
│           └── e2e/                         # E2E tests
│               ├── auth.spec.ts
│               ├── tickets.spec.ts
│               └── fixtures/
└── packages/
    └── shared/
        └── src/
            ├── utils/
            │   ├── format.ts
            │   └── format.test.ts
```

### Naming Conventions

```typescript
// Unit tests: *.test.ts
// ticket.service.test.ts

// Integration tests: *.integration.test.ts or in integration/
// tickets.integration.test.ts

// E2E tests: *.spec.ts
// ticket-creation.spec.ts

// Test utilities: no .test extension
// factories.ts, helpers.ts
```

---

## CI/CD Integration

### Test Pipeline

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  unit:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install --frozen-lockfile
      - run: bun run test:unit

  integration:
    name: Integration Tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        ports:
          - 5432:5432
      valkey:
        image: valkey/valkey:7-alpine
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install --frozen-lockfile
      - run: bunx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test
      - run: bun run test:integration
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test
          VALKEY_URL: redis://localhost:6379

  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install --frozen-lockfile
      - run: bunx playwright install --with-deps
      - run: bun run build
      - run: bun run test:e2e
```

### Pre-commit Hooks

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "vitest related --run"
    ]
  }
}
```

---

## Related Documentation

- [Unit Tests](./unit-tests.md) - Detailed unit testing patterns
- [Integration Tests](./integration-tests.md) - API and database testing
- [E2E Tests](./e2e-tests.md) - Playwright end-to-end testing

---

## Quick Reference

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test:watch

# Run only unit tests
bun test:unit

# Run integration tests
bun test:integration

# Run E2E tests
bun test:e2e

# Run E2E tests with UI
bunx playwright test --ui

# Generate coverage report
bun test:coverage

# Update snapshots
bun test -- --updateSnapshot
```
