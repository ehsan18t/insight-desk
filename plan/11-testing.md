# Testing Strategy

> Vitest + Playwright for solo developers

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Test Setup](#test-setup)
3. [Unit Testing](#unit-testing)
4. [Integration Testing](#integration-testing)
5. [E2E Testing](#e2e-testing)
6. [Test Database](#test-database)
7. [Mocking Strategies](#mocking-strategies)
8. [CI Integration](#ci-integration)

---

## Testing Philosophy

### Solo Developer Testing Pyramid

```
          ╱╲
         ╱  ╲
        ╱ E2E╲        ← 10%: Critical user journeys only
       ╱──────╲
      ╱        ╲
     ╱Integration╲    ← 30%: API endpoints, DB queries
    ╱──────────────╲
   ╱                ╲
  ╱      Unit        ╲ ← 60%: Services, utilities, pure functions
 ╱────────────────────╲
```

### What to Test (Prioritized)

| Priority   | What             | Why                 |
| ---------- | ---------------- | ------------------- |
| **High**   | Auth flows       | Security critical   |
| **High**   | Ticket CRUD      | Core business logic |
| **High**   | Payment/billing  | Money involved      |
| **Medium** | API endpoints    | Contract validation |
| **Medium** | Database queries | Data integrity      |
| **Low**    | UI components    | React handles most  |
| **Low**    | Real-time events | Complex to test     |

### What NOT to Test

- ❌ Framework internals (Express, React, Drizzle)
- ❌ External APIs (mock them instead)
- ❌ Every UI variation (snapshot test sparingly)
- ❌ Trivial getters/setters

---

## Test Setup

### Installation

```bash
# Backend testing
cd apps/api
bun add -D vitest @vitest/coverage-v8 supertest @types/supertest

# Frontend testing
cd apps/web
bun add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/user-event

# E2E testing
bun add -D @playwright/test
bunx playwright install
```

### Vitest Config (Backend)

```ts
// apps/api/vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist"],

    // Setup files
    setupFiles: ["./src/test/setup.ts"],

    // Coverage
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: [
        "node_modules",
        "src/test",
        "**/*.d.ts",
        "**/*.config.ts",
      ],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60,
      },
    },

    // Timeouts
    testTimeout: 10000,
    hookTimeout: 10000,

    // Parallelization
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true, // For database tests
      },
    },
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
});
```

### Vitest Config (Frontend)

```ts
// apps/web/vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],

  test: {
    globals: true,
    environment: "jsdom",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e"],

    setupFiles: ["./src/test/setup.ts"],

    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["node_modules", "src/test", ".next"],
    },
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

### Test Setup File (Backend)

```ts
// apps/api/src/test/setup.ts
import { beforeAll, afterAll, beforeEach } from "vitest";
import { db, closeDb } from "@/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Set test environment
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/insightdesk_test";

beforeAll(async () => {
  // Run migrations
  await migrate(db, { migrationsFolder: "./drizzle" });
});

beforeEach(async () => {
  // Clean database between tests
  await cleanDatabase();
});

afterAll(async () => {
  await closeDb();
});

async function cleanDatabase() {
  // Delete in order to respect foreign keys
  await db.delete(messages);
  await db.delete(tickets);
  await db.delete(sessions);
  await db.delete(users);
  await db.delete(organizations);
}
```

### Test Setup File (Frontend)

```ts
// apps/web/src/test/setup.ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: () => new Map(),
  cookies: () => ({
    get: vi.fn(),
    set: vi.fn(),
  }),
}));
```

---

## Unit Testing

### Testing Services

```ts
// apps/api/src/services/ticket/ticket.service.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ticketService } from "./ticket.service";
import { createTestUser, createTestOrganization } from "@/test/factories";

describe("TicketService", () => {
  let organization: Organization;
  let customer: User;
  let agent: User;

  beforeEach(async () => {
    organization = await createTestOrganization();
    customer = await createTestUser({ role: "customer", organizationId: organization.id });
    agent = await createTestUser({ role: "agent", organizationId: organization.id });
  });

  describe("create", () => {
    it("should create a ticket with valid data", async () => {
      const ticket = await ticketService.create({
        subject: "Test ticket",
        description: "This is a test",
        priority: "medium",
        customerId: customer.id,
        organizationId: organization.id,
      });

      expect(ticket).toBeDefined();
      expect(ticket.id).toBeDefined();
      expect(ticket.subject).toBe("Test ticket");
      expect(ticket.status).toBe("open");
      expect(ticket.ticketNumber).toMatch(/^TKT-\d+$/);
    });

    it("should generate unique ticket numbers", async () => {
      const ticket1 = await ticketService.create({
        subject: "Ticket 1",
        description: "Test",
        priority: "low",
        customerId: customer.id,
        organizationId: organization.id,
      });

      const ticket2 = await ticketService.create({
        subject: "Ticket 2",
        description: "Test",
        priority: "low",
        customerId: customer.id,
        organizationId: organization.id,
      });

      expect(ticket1.ticketNumber).not.toBe(ticket2.ticketNumber);
    });

    it("should throw error for missing required fields", async () => {
      await expect(
        ticketService.create({
          subject: "",
          description: "Test",
          priority: "low",
          customerId: customer.id,
          organizationId: organization.id,
        })
      ).rejects.toThrow();
    });
  });

  describe("update", () => {
    it("should update ticket status", async () => {
      const ticket = await ticketService.create({
        subject: "Test",
        description: "Test",
        priority: "low",
        customerId: customer.id,
        organizationId: organization.id,
      });

      const updated = await ticketService.update(ticket.id, {
        status: "in_progress",
      });

      expect(updated.status).toBe("in_progress");
    });

    it("should assign ticket to agent", async () => {
      const ticket = await ticketService.create({
        subject: "Test",
        description: "Test",
        priority: "high",
        customerId: customer.id,
        organizationId: organization.id,
      });

      const updated = await ticketService.assignTo(ticket.id, agent.id);

      expect(updated.assigneeId).toBe(agent.id);
      expect(updated.status).toBe("in_progress");
    });

    it("should record first response time", async () => {
      const ticket = await ticketService.create({
        subject: "Test",
        description: "Test",
        priority: "medium",
        customerId: customer.id,
        organizationId: organization.id,
      });

      expect(ticket.firstResponseAt).toBeNull();

      // Agent sends first response
      await ticketService.recordFirstResponse(ticket.id);

      const updated = await ticketService.findById(ticket.id);
      expect(updated?.firstResponseAt).toBeDefined();
    });
  });

  describe("findById", () => {
    it("should return ticket with relations", async () => {
      const ticket = await ticketService.create({
        subject: "Test",
        description: "Test",
        priority: "medium",
        customerId: customer.id,
        organizationId: organization.id,
      });

      const found = await ticketService.findById(ticket.id, {
        includeCustomer: true,
        includeAssignee: true,
      });

      expect(found).toBeDefined();
      expect(found?.customer).toBeDefined();
      expect(found?.customer?.id).toBe(customer.id);
    });

    it("should return null for non-existent ticket", async () => {
      const found = await ticketService.findById("non-existent-id");
      expect(found).toBeNull();
    });
  });
});
```

### Testing Utilities

```ts
// packages/shared/src/utils/ticket-number.test.ts
import { describe, it, expect } from "vitest";
import { generateTicketNumber, parseTicketNumber } from "./ticket-number";

describe("generateTicketNumber", () => {
  it("should generate ticket number with prefix", () => {
    const number = generateTicketNumber(1);
    expect(number).toBe("TKT-000001");
  });

  it("should pad numbers correctly", () => {
    expect(generateTicketNumber(1)).toBe("TKT-000001");
    expect(generateTicketNumber(123)).toBe("TKT-000123");
    expect(generateTicketNumber(999999)).toBe("TKT-999999");
  });

  it("should support custom prefix", () => {
    const number = generateTicketNumber(42, "ISSUE");
    expect(number).toBe("ISSUE-000042");
  });
});

describe("parseTicketNumber", () => {
  it("should extract sequence number", () => {
    expect(parseTicketNumber("TKT-000001")).toBe(1);
    expect(parseTicketNumber("TKT-000123")).toBe(123);
  });

  it("should return null for invalid format", () => {
    expect(parseTicketNumber("invalid")).toBeNull();
    expect(parseTicketNumber("TKT-")).toBeNull();
    expect(parseTicketNumber("")).toBeNull();
  });
});
```

### Testing Hooks (Frontend)

```tsx
// apps/web/hooks/use-tickets.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTickets, useCreateTicket } from "./use-tickets";

// Mock API
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { api } from "@/lib/api";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useTickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch tickets", async () => {
    const mockTickets = [
      { id: "1", subject: "Test 1", status: "open" },
      { id: "2", subject: "Test 2", status: "closed" },
    ];

    vi.mocked(api.get).mockResolvedValue({
      data: mockTickets,
      pagination: { page: 1, limit: 20, total: 2 },
    });

    const { result } = renderHook(() => useTickets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.data).toHaveLength(2);
    expect(api.get).toHaveBeenCalledWith("/api/v1/tickets", expect.any(Object));
  });
});

describe("useCreateTicket", () => {
  it("should create ticket", async () => {
    const newTicket = {
      id: "new-id",
      subject: "New ticket",
      status: "open",
    };

    vi.mocked(api.post).mockResolvedValue(newTicket);

    const { result } = renderHook(() => useCreateTicket(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      subject: "New ticket",
      description: "Description",
      priority: "medium",
    });

    expect(api.post).toHaveBeenCalledWith("/api/v1/tickets", {
      subject: "New ticket",
      description: "Description",
      priority: "medium",
    });
  });
});
```

---

## Integration Testing

### Testing API Routes

```ts
// apps/api/src/routes/tickets.test.ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { app } from "@/app";
import { createTestUser, createTestOrganization, createTestTicket } from "@/test/factories";
import { generateTestToken } from "@/test/auth";

describe("Tickets API", () => {
  let organization: Organization;
  let customer: User;
  let agent: User;
  let customerToken: string;
  let agentToken: string;

  beforeEach(async () => {
    organization = await createTestOrganization();
    customer = await createTestUser({ role: "customer", organizationId: organization.id });
    agent = await createTestUser({ role: "agent", organizationId: organization.id });
    customerToken = await generateTestToken(customer);
    agentToken = await generateTestToken(agent);
  });

  describe("GET /api/v1/tickets", () => {
    it("should return customer's tickets", async () => {
      // Create tickets for customer
      await createTestTicket({ customerId: customer.id, organizationId: organization.id });
      await createTestTicket({ customerId: customer.id, organizationId: organization.id });

      const response = await request(app)
        .get("/api/v1/tickets")
        .set("Cookie", `session=${customerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });

    it("should return all org tickets for agent", async () => {
      // Create tickets for different customers
      const customer2 = await createTestUser({
        role: "customer",
        organizationId: organization.id,
      });

      await createTestTicket({ customerId: customer.id, organizationId: organization.id });
      await createTestTicket({ customerId: customer2.id, organizationId: organization.id });

      const response = await request(app)
        .get("/api/v1/tickets")
        .set("Cookie", `session=${agentToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
    });

    it("should filter by status", async () => {
      await createTestTicket({
        customerId: customer.id,
        organizationId: organization.id,
        status: "open",
      });
      await createTestTicket({
        customerId: customer.id,
        organizationId: organization.id,
        status: "closed",
      });

      const response = await request(app)
        .get("/api/v1/tickets?status=open")
        .set("Cookie", `session=${customerToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe("open");
    });

    it("should require authentication", async () => {
      await request(app)
        .get("/api/v1/tickets")
        .expect(401);
    });
  });

  describe("POST /api/v1/tickets", () => {
    it("should create ticket", async () => {
      const response = await request(app)
        .post("/api/v1/tickets")
        .set("Cookie", `session=${customerToken}`)
        .send({
          subject: "Help needed",
          description: "I need assistance with...",
          priority: "medium",
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.subject).toBe("Help needed");
      expect(response.body.data.status).toBe("open");
    });

    it("should validate required fields", async () => {
      const response = await request(app)
        .post("/api/v1/tickets")
        .set("Cookie", `session=${customerToken}`)
        .send({
          subject: "", // Empty subject
          description: "Test",
          priority: "low",
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Validation failed");
    });

    it("should validate priority enum", async () => {
      const response = await request(app)
        .post("/api/v1/tickets")
        .set("Cookie", `session=${customerToken}`)
        .send({
          subject: "Test",
          description: "Test",
          priority: "invalid",
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe("PATCH /api/v1/tickets/:id", () => {
    it("should allow agent to update ticket", async () => {
      const ticket = await createTestTicket({
        customerId: customer.id,
        organizationId: organization.id,
      });

      const response = await request(app)
        .patch(`/api/v1/tickets/${ticket.id}`)
        .set("Cookie", `session=${agentToken}`)
        .send({ status: "in_progress" })
        .expect(200);

      expect(response.body.data.status).toBe("in_progress");
    });

    it("should not allow customer to update ticket", async () => {
      const ticket = await createTestTicket({
        customerId: customer.id,
        organizationId: organization.id,
      });

      await request(app)
        .patch(`/api/v1/tickets/${ticket.id}`)
        .set("Cookie", `session=${customerToken}`)
        .send({ status: "closed" })
        .expect(403);
    });
  });
});
```

### Testing Database Queries

```ts
// apps/api/src/db/queries/tickets.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { tickets, users, organizations } from "@/db/schema";
import {
  findTicketsByOrganization,
  findTicketWithDetails,
  countTicketsByStatus,
} from "./tickets";
import { createTestOrganization, createTestUser, createTestTicket } from "@/test/factories";

describe("Ticket Queries", () => {
  let org: Organization;
  let customer: User;

  beforeEach(async () => {
    org = await createTestOrganization();
    customer = await createTestUser({ organizationId: org.id, role: "customer" });
  });

  describe("findTicketsByOrganization", () => {
    it("should return paginated tickets", async () => {
      // Create 15 tickets
      for (let i = 0; i < 15; i++) {
        await createTestTicket({
          customerId: customer.id,
          organizationId: org.id,
        });
      }

      const result = await findTicketsByOrganization(org.id, {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(10);
      expect(result.pagination.total).toBe(15);
      expect(result.pagination.totalPages).toBe(2);
    });

    it("should filter by status", async () => {
      await createTestTicket({
        customerId: customer.id,
        organizationId: org.id,
        status: "open",
      });
      await createTestTicket({
        customerId: customer.id,
        organizationId: org.id,
        status: "resolved",
      });

      const result = await findTicketsByOrganization(org.id, {
        status: "open",
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe("open");
    });

    it("should order by createdAt desc by default", async () => {
      const ticket1 = await createTestTicket({
        customerId: customer.id,
        organizationId: org.id,
      });

      // Wait a bit
      await new Promise((r) => setTimeout(r, 10));

      const ticket2 = await createTestTicket({
        customerId: customer.id,
        organizationId: org.id,
      });

      const result = await findTicketsByOrganization(org.id, {
        page: 1,
        limit: 10,
      });

      expect(result.data[0].id).toBe(ticket2.id);
      expect(result.data[1].id).toBe(ticket1.id);
    });
  });

  describe("findTicketWithDetails", () => {
    it("should include customer and assignee", async () => {
      const agent = await createTestUser({ organizationId: org.id, role: "agent" });

      const ticket = await createTestTicket({
        customerId: customer.id,
        organizationId: org.id,
        assigneeId: agent.id,
      });

      const result = await findTicketWithDetails(ticket.id);

      expect(result).toBeDefined();
      expect(result?.customer.id).toBe(customer.id);
      expect(result?.assignee?.id).toBe(agent.id);
    });
  });

  describe("countTicketsByStatus", () => {
    it("should return counts per status", async () => {
      await createTestTicket({ customerId: customer.id, organizationId: org.id, status: "open" });
      await createTestTicket({ customerId: customer.id, organizationId: org.id, status: "open" });
      await createTestTicket({ customerId: customer.id, organizationId: org.id, status: "resolved" });

      const counts = await countTicketsByStatus(org.id);

      expect(counts.open).toBe(2);
      expect(counts.resolved).toBe(1);
      expect(counts.closed).toBe(0);
    });
  });
});
```

---

## E2E Testing

### Playwright Config

```ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html"], ["list"]],

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Add more browsers for CI
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
  ],

  webServer: [
    {
      command: "bun run dev:api",
      port: 4000,
      reuseExistingServer: !process.env.CI,
      cwd: "./apps/api",
    },
    {
      command: "bun run dev",
      port: 3000,
      reuseExistingServer: !process.env.CI,
      cwd: "./apps/web",
    },
  ],
});
```

### E2E Test: Authentication

```ts
// e2e/auth.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("should login successfully", async ({ page }) => {
    // Navigate to login
    await page.goto("/login");

    // Fill form
    await page.fill('input[name="email"]', "test@example.com");
    await page.fill('input[name="password"]', "password123");

    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL("/dashboard");

    // Should show user menu
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test("should show error for invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.fill('input[name="email"]', "wrong@example.com");
    await page.fill('input[name="password"]', "wrongpassword");
    await page.click('button[type="submit"]');

    // Should show error
    await expect(page.locator("text=Invalid credentials")).toBeVisible();

    // Should stay on login page
    await expect(page).toHaveURL("/login");
  });

  test("should logout successfully", async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.fill('input[name="email"]', "test@example.com");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');

    // Wait for dashboard
    await page.waitForURL("/dashboard");

    // Click user menu and logout
    await page.click('[data-testid="user-menu"]');
    await page.click("text=Sign Out");

    // Should redirect to login
    await expect(page).toHaveURL("/login");
  });
});
```

### E2E Test: Ticket Flow

```ts
// e2e/tickets.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Ticket Management", () => {
  test.beforeEach(async ({ page }) => {
    // Login as customer
    await page.goto("/login");
    await page.fill('input[name="email"]', "customer@example.com");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("/my-tickets");
  });

  test("should create new ticket", async ({ page }) => {
    // Click new ticket button
    await page.click("text=New Ticket");

    // Fill form
    await page.fill('input[name="subject"]', "E2E Test Ticket");
    await page.fill(
      'textarea[name="description"]',
      "This is an automated test ticket"
    );
    await page.selectOption('select[name="priority"]', "medium");

    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to ticket detail
    await expect(page).toHaveURL(/\/my-tickets\/TKT-/);

    // Should show ticket details
    await expect(page.locator("h1")).toContainText("E2E Test Ticket");
    await expect(page.locator("text=Open")).toBeVisible();
  });

  test("should send message on ticket", async ({ page }) => {
    // Navigate to existing ticket
    await page.goto("/my-tickets");
    await page.click(".ticket-card >> nth=0");

    // Type message
    await page.fill(
      '[data-testid="message-input"]',
      "This is a test message"
    );

    // Send
    await page.click('[data-testid="send-message"]');

    // Message should appear
    await expect(
      page.locator("text=This is a test message")
    ).toBeVisible();
  });

  test("should filter tickets by status", async ({ page }) => {
    await page.goto("/my-tickets");

    // Click status filter
    await page.click('[data-testid="status-filter"]');
    await page.click("text=Resolved");

    // URL should update
    await expect(page).toHaveURL(/status=resolved/);

    // Should only show resolved tickets
    const tickets = page.locator(".ticket-card");
    const count = await tickets.count();

    for (let i = 0; i < count; i++) {
      await expect(tickets.nth(i).locator(".status-badge")).toContainText(
        "Resolved"
      );
    }
  });
});
```

### E2E Test Fixtures

```ts
// e2e/fixtures.ts
import { test as base } from "@playwright/test";

// Define custom fixtures
interface TestFixtures {
  authenticatedPage: Page;
  agentPage: Page;
  adminPage: Page;
}

export const test = base.extend<TestFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Login as customer
    await page.goto("/login");
    await page.fill('input[name="email"]', "customer@example.com");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("/my-tickets");

    await use(page);
  },

  agentPage: async ({ page }, use) => {
    // Login as agent
    await page.goto("/login");
    await page.fill('input[name="email"]', "agent@example.com");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("/dashboard");

    await use(page);
  },

  adminPage: async ({ page }, use) => {
    // Login as admin
    await page.goto("/login");
    await page.fill('input[name="email"]', "admin@example.com");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("/dashboard");

    await use(page);
  },
});

export { expect } from "@playwright/test";
```

---

## Test Database

### Docker Compose for Tests

```yaml
# docker-compose.test.yml
services:
  postgres-test:
    image: postgres:18
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: insightdesk_test
    ports:
      - "5433:5432"
    tmpfs:
      - /var/lib/postgresql/data # Use tmpfs for speed
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  valkey-test:
    image: valkey/valkey:9.0
    ports:
      - "6380:6379"
```

### Test Database Setup Script

```ts
// scripts/test-db-setup.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function setupTestDatabase() {
  const pool = new Pool({
    connectionString: "postgresql://postgres:postgres@localhost:5433/insightdesk_test",
  });

  const db = drizzle(pool);

  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });

  console.log("Seeding test data...");
  await seedTestData(db);

  await pool.end();
  console.log("Test database ready!");
}

async function seedTestData(db: ReturnType<typeof drizzle>) {
  // Create test organization
  await db.insert(organizations).values({
    id: "test-org",
    name: "Test Organization",
    slug: "test-org",
  });

  // Create test users
  await db.insert(users).values([
    {
      id: "test-customer",
      email: "customer@example.com",
      name: "Test Customer",
      role: "customer",
      organizationId: "test-org",
    },
    {
      id: "test-agent",
      email: "agent@example.com",
      name: "Test Agent",
      role: "agent",
      organizationId: "test-org",
    },
    {
      id: "test-admin",
      email: "admin@example.com",
      name: "Test Admin",
      role: "admin",
      organizationId: "test-org",
    },
  ]);
}

setupTestDatabase().catch(console.error);
```

### Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest --coverage",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:db:setup": "docker-compose -f docker-compose.test.yml up -d && bun run scripts/test-db-setup.ts",
    "test:db:teardown": "docker-compose -f docker-compose.test.yml down -v"
  }
}
```

---

## Mocking Strategies

### Mocking External Services

```ts
// apps/api/src/test/mocks/email.ts
import { vi } from "vitest";

export const mockSendEmail = vi.fn().mockResolvedValue({
  id: "mock-email-id",
  success: true,
});

vi.mock("@/lib/email", () => ({
  sendEmail: mockSendEmail,
}));

// Usage in tests
import { mockSendEmail } from "@/test/mocks/email";

it("should send welcome email", async () => {
  await userService.create({ email: "new@example.com", name: "New User" });

  expect(mockSendEmail).toHaveBeenCalledWith({
    to: "new@example.com",
    subject: expect.stringContaining("Welcome"),
    template: "welcome",
    data: expect.any(Object),
  });
});
```

### Mocking Socket.IO

```ts
// apps/api/src/test/mocks/socket.ts
import { vi } from "vitest";

export const mockIO = {
  to: vi.fn().mockReturnThis(),
  emit: vi.fn(),
  in: vi.fn().mockReturnThis(),
  fetchSockets: vi.fn().mockResolvedValue([]),
};

vi.mock("@/lib/socket", () => ({
  getIO: () => mockIO,
}));

// Usage
it("should emit ticket update", async () => {
  await ticketService.update(ticketId, { status: "resolved" });

  expect(mockIO.to).toHaveBeenCalledWith(`ticket:${ticketId}`);
  expect(mockIO.emit).toHaveBeenCalledWith("ticket:updated", expect.any(Object));
});
```

### Test Factories

```ts
// apps/api/src/test/factories/index.ts
import { db } from "@/db";
import { organizations, users, tickets } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";

export async function createTestOrganization(
  overrides: Partial<NewOrganization> = {}
) {
  const [org] = await db
    .insert(organizations)
    .values({
      id: createId(),
      name: "Test Org",
      slug: `test-org-${createId().slice(0, 8)}`,
      ...overrides,
    })
    .returning();

  return org;
}

export async function createTestUser(
  overrides: Partial<NewUser> & { organizationId: string }
) {
  const [user] = await db
    .insert(users)
    .values({
      id: createId(),
      email: `user-${createId().slice(0, 8)}@test.com`,
      name: "Test User",
      role: "customer",
      ...overrides,
    })
    .returning();

  return user;
}

export async function createTestTicket(
  overrides: Partial<NewTicket> & {
    customerId: string;
    organizationId: string;
  }
) {
  const [ticket] = await db
    .insert(tickets)
    .values({
      id: createId(),
      ticketNumber: `TKT-${Date.now()}`,
      subject: "Test Ticket",
      description: "Test description",
      status: "open",
      priority: "medium",
      ...overrides,
    })
    .returning();

  return ticket;
}
```

---

## CI Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  unit-tests:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:18
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: insightdesk_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Run migrations
        run: bun run db:migrate
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/insightdesk_test

      - name: Run unit tests
        run: bun test:coverage
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/insightdesk_test

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info

  e2e-tests:
    runs-on: ubuntu-latest
    needs: unit-tests

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Install Playwright
        run: bunx playwright install --with-deps chromium

      - name: Start services
        run: docker-compose -f docker-compose.test.yml up -d

      - name: Wait for services
        run: sleep 10

      - name: Run E2E tests
        run: bun test:e2e

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Next Steps

- **12-devops-lite.md** - Deployment and monitoring
- **13-timeline.md** - Development schedule

---

*Solo Developer Note: Start with integration tests for critical API endpoints. Add E2E tests for the most important user journeys. Unit tests come naturally as you write services.*
