# End-to-End Testing Guide

> Complete user journey testing with Playwright for InsightDesk.

## Table of Contents

1. [Playwright Setup](#playwright-setup)
2. [Test Configuration](#test-configuration)
3. [Page Object Model](#page-object-model)
4. [Test Fixtures](#test-fixtures)
5. [Core User Journeys](#core-user-journeys)
6. [Visual Testing](#visual-testing)
7. [Accessibility Testing](#accessibility-testing)
8. [CI/CD Integration](#cicd-integration)
9. [Best Practices](#best-practices)

---

## Playwright Setup

### Installation

```bash
# Install Playwright
bun add -D @playwright/test

# Install browsers
bunx playwright install --with-deps
```

### Project Structure

```
tests/
├── e2e/
│   ├── playwright.config.ts
│   ├── fixtures/
│   │   ├── auth.fixture.ts
│   │   ├── database.fixture.ts
│   │   └── test-data.ts
│   ├── pages/
│   │   ├── login.page.ts
│   │   ├── dashboard.page.ts
│   │   ├── tickets.page.ts
│   │   └── base.page.ts
│   ├── specs/
│   │   ├── auth.spec.ts
│   │   ├── tickets.spec.ts
│   │   ├── knowledge-base.spec.ts
│   │   └── admin.spec.ts
│   └── utils/
│       ├── helpers.ts
│       └── api.ts
```

---

## Test Configuration

### Playwright Configuration

```typescript
// tests/e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    process.env.CI ? ['github'] : ['list'],
  ],
  
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    // Auth setup project
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    
    // Desktop browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      dependencies: ['setup'],
    },

    // Mobile browsers
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },

  expect: {
    timeout: 10000,
    toHaveScreenshot: {
      maxDiffPixels: 100,
    },
  },
});
```

### Global Setup

```typescript
// tests/e2e/global-setup.ts
import { chromium, FullConfig } from '@playwright/test';
import { prisma } from './fixtures/database.fixture';

async function globalSetup(config: FullConfig) {
  // Clean test database
  await prisma.$executeRawUnsafe('TRUNCATE TABLE users CASCADE');
  
  // Seed test users
  await prisma.user.createMany({
    data: [
      {
        id: 'test-admin',
        email: 'admin@test.com',
        name: 'Test Admin',
        role: 'admin',
        passwordHash: await hashPassword('AdminPass123!'),
      },
      {
        id: 'test-agent',
        email: 'agent@test.com',
        name: 'Test Agent',
        role: 'agent',
        passwordHash: await hashPassword('AgentPass123!'),
      },
      {
        id: 'test-customer',
        email: 'customer@test.com',
        name: 'Test Customer',
        role: 'customer',
        passwordHash: await hashPassword('CustomerPass123!'),
      },
    ],
  });
  
  // Create authenticated states
  const browser = await chromium.launch();
  
  for (const user of ['admin', 'agent', 'customer']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto(`${config.projects[0].use.baseURL}/login`);
    await page.fill('[name="email"]', `${user}@test.com`);
    await page.fill('[name="password"]', `${capitalize(user)}Pass123!`);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
    
    await context.storageState({ path: `.auth/${user}.json` });
    await context.close();
  }
  
  await browser.close();
}

export default globalSetup;
```

---

## Page Object Model

### Base Page

```typescript
// tests/e2e/pages/base.page.ts
import { Page, Locator, expect } from '@playwright/test';

export abstract class BasePage {
  readonly page: Page;
  
  constructor(page: Page) {
    this.page = page;
  }

  // Common elements
  get header(): Locator {
    return this.page.locator('header');
  }

  get sidebar(): Locator {
    return this.page.locator('[data-testid="sidebar"]');
  }

  get userMenu(): Locator {
    return this.page.locator('[data-testid="user-menu"]');
  }

  get toast(): Locator {
    return this.page.locator('[role="alert"]');
  }

  // Common actions
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  async expectToast(message: string): Promise<void> {
    await expect(this.toast).toContainText(message);
  }

  async logout(): Promise<void> {
    await this.userMenu.click();
    await this.page.click('text=Logout');
    await this.page.waitForURL('/login');
  }

  async navigateTo(path: string): Promise<void> {
    await this.page.goto(path);
    await this.waitForPageLoad();
  }
}
```

### Login Page

```typescript
// tests/e2e/pages/login.page.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class LoginPage extends BasePage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly forgotPasswordLink: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.locator('[name="email"]');
    this.passwordInput = page.locator('[name="password"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.errorMessage = page.locator('[data-testid="error-message"]');
    this.forgotPasswordLink = page.locator('text=Forgot password');
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectLoginSuccess(): Promise<void> {
    await this.page.waitForURL('/dashboard');
  }

  async expectLoginError(message: string): Promise<void> {
    await expect(this.errorMessage).toContainText(message);
  }

  async expectValidationError(field: string): Promise<void> {
    const error = this.page.locator(`[data-testid="${field}-error"]`);
    await expect(error).toBeVisible();
  }
}
```

### Dashboard Page

```typescript
// tests/e2e/pages/dashboard.page.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class DashboardPage extends BasePage {
  readonly welcomeMessage: Locator;
  readonly statsCards: Locator;
  readonly recentTickets: Locator;
  readonly quickActions: Locator;

  constructor(page: Page) {
    super(page);
    this.welcomeMessage = page.locator('[data-testid="welcome-message"]');
    this.statsCards = page.locator('[data-testid="stats-card"]');
    this.recentTickets = page.locator('[data-testid="recent-tickets"]');
    this.quickActions = page.locator('[data-testid="quick-actions"]');
  }

  async goto(): Promise<void> {
    await this.page.goto('/dashboard');
    await this.waitForPageLoad();
  }

  async expectWelcome(name: string): Promise<void> {
    await expect(this.welcomeMessage).toContainText(`Welcome, ${name}`);
  }

  async getStatValue(statName: string): Promise<string> {
    const card = this.statsCards.filter({ hasText: statName });
    const value = card.locator('[data-testid="stat-value"]');
    return await value.textContent() || '';
  }

  async clickQuickAction(action: string): Promise<void> {
    await this.quickActions.locator(`text=${action}`).click();
  }
}
```

### Tickets Page

```typescript
// tests/e2e/pages/tickets.page.ts
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class TicketsPage extends BasePage {
  readonly newTicketButton: Locator;
  readonly ticketsList: Locator;
  readonly searchInput: Locator;
  readonly statusFilter: Locator;
  readonly priorityFilter: Locator;
  readonly pagination: Locator;

  constructor(page: Page) {
    super(page);
    this.newTicketButton = page.locator('[data-testid="new-ticket-btn"]');
    this.ticketsList = page.locator('[data-testid="tickets-list"]');
    this.searchInput = page.locator('[data-testid="search-input"]');
    this.statusFilter = page.locator('[data-testid="status-filter"]');
    this.priorityFilter = page.locator('[data-testid="priority-filter"]');
    this.pagination = page.locator('[data-testid="pagination"]');
  }

  async goto(): Promise<void> {
    await this.page.goto('/tickets');
    await this.waitForPageLoad();
  }

  async createTicket(data: {
    title: string;
    description: string;
    priority?: string;
  }): Promise<void> {
    await this.newTicketButton.click();
    await this.page.fill('[name="title"]', data.title);
    await this.page.fill('[name="description"]', data.description);
    
    if (data.priority) {
      await this.page.selectOption('[name="priority"]', data.priority);
    }
    
    await this.page.click('button[type="submit"]');
    await this.expectToast('Ticket created successfully');
  }

  async searchTickets(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.page.keyboard.press('Enter');
    await this.page.waitForResponse('**/api/v1/tickets*');
  }

  async filterByStatus(status: string): Promise<void> {
    await this.statusFilter.selectOption(status);
    await this.page.waitForResponse('**/api/v1/tickets*');
  }

  async getTicketCount(): Promise<number> {
    return await this.ticketsList.locator('[data-testid="ticket-row"]').count();
  }

  async clickTicket(ticketNumber: string): Promise<void> {
    await this.ticketsList.locator(`text=${ticketNumber}`).click();
  }

  async expectTicketVisible(title: string): Promise<void> {
    await expect(this.ticketsList.locator(`text=${title}`)).toBeVisible();
  }

  async expectNoTickets(): Promise<void> {
    await expect(this.page.locator('text=No tickets found')).toBeVisible();
  }
}
```

---

## Test Fixtures

### Auth Fixture

```typescript
// tests/e2e/fixtures/auth.fixture.ts
import { test as base, Page } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { DashboardPage } from '../pages/dashboard.page';
import { TicketsPage } from '../pages/tickets.page';

type Fixtures = {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  ticketsPage: TicketsPage;
  authenticatedPage: Page;
};

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },

  ticketsPage: async ({ page }, use) => {
    await use(new TicketsPage(page));
  },

  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: '.auth/customer.json',
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

// Role-specific fixtures
export const adminTest = base.extend({
  page: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: '.auth/admin.json',
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export const agentTest = base.extend({
  page: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: '.auth/agent.json',
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect } from '@playwright/test';
```

### Database Fixture

```typescript
// tests/e2e/fixtures/database.fixture.ts
import { PrismaClient } from '@prisma/client';
import { test as base } from '@playwright/test';
import { createTicketFactory } from './factories';

export const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.E2E_DATABASE_URL },
  },
});

export const test = base.extend({
  // Seed test data before each test
  testData: async ({}, use) => {
    const ticketFactory = createTicketFactory();
    
    const data = {
      tickets: await prisma.ticket.createMany({
        data: ticketFactory.buildList(10, { createdById: 'test-customer' }),
      }),
    };
    
    await use(data);
    
    // Cleanup after test
    await prisma.ticket.deleteMany({
      where: { createdById: 'test-customer' },
    });
  },
});
```

---

## Core User Journeys

### Authentication Tests

```typescript
// tests/e2e/specs/auth.spec.ts
import { test, expect } from '../fixtures/auth.fixture';

test.describe('Authentication', () => {
  test.describe('Login', () => {
    test('should login with valid credentials', async ({ loginPage }) => {
      await loginPage.goto();
      await loginPage.login('customer@test.com', 'CustomerPass123!');
      await loginPage.expectLoginSuccess();
    });

    test('should show error for invalid credentials', async ({ loginPage }) => {
      await loginPage.goto();
      await loginPage.login('customer@test.com', 'wrongpassword');
      await loginPage.expectLoginError('Invalid email or password');
    });

    test('should validate required fields', async ({ loginPage }) => {
      await loginPage.goto();
      await loginPage.submitButton.click();
      await loginPage.expectValidationError('email');
      await loginPage.expectValidationError('password');
    });

    test('should redirect authenticated users to dashboard', async ({ 
      authenticatedPage 
    }) => {
      await authenticatedPage.goto('/login');
      await expect(authenticatedPage).toHaveURL('/dashboard');
    });
  });

  test.describe('Logout', () => {
    test('should logout successfully', async ({ authenticatedPage }) => {
      const dashboardPage = new DashboardPage(authenticatedPage);
      await dashboardPage.goto();
      await dashboardPage.logout();
      await expect(authenticatedPage).toHaveURL('/login');
    });
  });

  test.describe('Session', () => {
    test('should persist session across page refresh', async ({ 
      authenticatedPage 
    }) => {
      await authenticatedPage.goto('/dashboard');
      await authenticatedPage.reload();
      await expect(authenticatedPage).toHaveURL('/dashboard');
    });

    test('should redirect to login when session expires', async ({ 
      page, context 
    }) => {
      // Clear storage to simulate session expiry
      await context.clearCookies();
      await page.goto('/dashboard');
      await expect(page).toHaveURL('/login');
    });
  });
});
```

### Ticket Management Tests

```typescript
// tests/e2e/specs/tickets.spec.ts
import { test, expect } from '../fixtures/auth.fixture';
import { TicketsPage } from '../pages/tickets.page';

test.describe('Ticket Management', () => {
  test.describe('Creating Tickets', () => {
    test('should create a new ticket', async ({ authenticatedPage }) => {
      const ticketsPage = new TicketsPage(authenticatedPage);
      await ticketsPage.goto();
      
      await ticketsPage.createTicket({
        title: 'E2E Test Ticket',
        description: 'This is a test ticket created by E2E tests',
        priority: 'high',
      });
      
      // Should redirect to ticket detail
      await expect(authenticatedPage).toHaveURL(/\/tickets\/\d+/);
      await expect(authenticatedPage.locator('h1')).toContainText('E2E Test Ticket');
    });

    test('should validate required fields', async ({ authenticatedPage }) => {
      const ticketsPage = new TicketsPage(authenticatedPage);
      await ticketsPage.goto();
      await ticketsPage.newTicketButton.click();
      
      await authenticatedPage.click('button[type="submit"]');
      
      await expect(authenticatedPage.locator('text=Title is required')).toBeVisible();
    });

    test('should handle file attachments', async ({ authenticatedPage }) => {
      const ticketsPage = new TicketsPage(authenticatedPage);
      await ticketsPage.goto();
      await ticketsPage.newTicketButton.click();
      
      await authenticatedPage.fill('[name="title"]', 'Ticket with attachment');
      await authenticatedPage.fill('[name="description"]', 'Testing file upload');
      
      // Upload file
      await authenticatedPage.setInputFiles(
        'input[type="file"]',
        'tests/fixtures/test-file.pdf'
      );
      
      await authenticatedPage.click('button[type="submit"]');
      
      // Verify attachment is displayed
      await expect(authenticatedPage.locator('text=test-file.pdf')).toBeVisible();
    });
  });

  test.describe('Viewing Tickets', () => {
    test('should display tickets list', async ({ authenticatedPage, testData }) => {
      const ticketsPage = new TicketsPage(authenticatedPage);
      await ticketsPage.goto();
      
      const ticketCount = await ticketsPage.getTicketCount();
      expect(ticketCount).toBeGreaterThan(0);
    });

    test('should filter tickets by status', async ({ authenticatedPage }) => {
      const ticketsPage = new TicketsPage(authenticatedPage);
      await ticketsPage.goto();
      
      await ticketsPage.filterByStatus('open');
      
      const rows = authenticatedPage.locator('[data-testid="ticket-row"]');
      const statusBadges = rows.locator('[data-testid="status-badge"]');
      
      const count = await statusBadges.count();
      for (let i = 0; i < count; i++) {
        await expect(statusBadges.nth(i)).toContainText('Open');
      }
    });

    test('should search tickets', async ({ authenticatedPage }) => {
      const ticketsPage = new TicketsPage(authenticatedPage);
      await ticketsPage.goto();
      
      // Create a ticket with unique title
      await ticketsPage.createTicket({
        title: 'UniqueSearchTerm12345',
        description: 'Test',
      });
      
      await ticketsPage.goto();
      await ticketsPage.searchTickets('UniqueSearchTerm12345');
      
      await ticketsPage.expectTicketVisible('UniqueSearchTerm12345');
    });

    test('should paginate tickets', async ({ authenticatedPage }) => {
      const ticketsPage = new TicketsPage(authenticatedPage);
      await ticketsPage.goto();
      
      // Check pagination exists
      await expect(ticketsPage.pagination).toBeVisible();
      
      // Navigate to next page
      await ticketsPage.pagination.locator('text=Next').click();
      
      // URL should have page parameter
      await expect(authenticatedPage).toHaveURL(/page=2/);
    });
  });

  test.describe('Ticket Details', () => {
    test('should display ticket details', async ({ authenticatedPage, testData }) => {
      const ticketsPage = new TicketsPage(authenticatedPage);
      await ticketsPage.goto();
      
      // Click first ticket
      await authenticatedPage.locator('[data-testid="ticket-row"]').first().click();
      
      // Verify detail page elements
      await expect(authenticatedPage.locator('[data-testid="ticket-title"]')).toBeVisible();
      await expect(authenticatedPage.locator('[data-testid="ticket-status"]')).toBeVisible();
      await expect(authenticatedPage.locator('[data-testid="ticket-priority"]')).toBeVisible();
    });

    test('should add comment to ticket', async ({ authenticatedPage, testData }) => {
      const ticketsPage = new TicketsPage(authenticatedPage);
      await ticketsPage.goto();
      await authenticatedPage.locator('[data-testid="ticket-row"]').first().click();
      
      // Add comment
      await authenticatedPage.fill('[data-testid="comment-input"]', 'Test comment from E2E');
      await authenticatedPage.click('[data-testid="submit-comment"]');
      
      // Verify comment appears
      await expect(authenticatedPage.locator('text=Test comment from E2E')).toBeVisible();
    });
  });
});
```

### Agent Workflow Tests

```typescript
// tests/e2e/specs/agent-workflow.spec.ts
import { agentTest as test, expect } from '../fixtures/auth.fixture';

test.describe('Agent Workflow', () => {
  test('should claim unassigned ticket', async ({ page }) => {
    await page.goto('/tickets?status=open&unassigned=true');
    
    // Click first unassigned ticket
    await page.locator('[data-testid="ticket-row"]').first().click();
    
    // Claim ticket
    await page.click('[data-testid="claim-ticket-btn"]');
    
    // Verify assignment
    await expect(page.locator('[data-testid="assigned-to"]')).toContainText('Test Agent');
  });

  test('should update ticket status', async ({ page }) => {
    await page.goto('/tickets?assignee=me');
    await page.locator('[data-testid="ticket-row"]').first().click();
    
    // Change status
    await page.click('[data-testid="status-dropdown"]');
    await page.click('text=In Progress');
    
    // Verify status update
    await expect(page.locator('[data-testid="ticket-status"]')).toContainText('In Progress');
    await expect(page.locator('[role="alert"]')).toContainText('Status updated');
  });

  test('should add internal note', async ({ page }) => {
    await page.goto('/tickets?assignee=me');
    await page.locator('[data-testid="ticket-row"]').first().click();
    
    // Switch to internal notes tab
    await page.click('text=Internal Notes');
    
    // Add internal note
    await page.fill('[data-testid="internal-note-input"]', 'Internal note for team');
    await page.click('[data-testid="submit-internal-note"]');
    
    // Verify note appears
    await expect(page.locator('text=Internal note for team')).toBeVisible();
    await expect(page.locator('[data-testid="internal-badge"]')).toBeVisible();
  });

  test('should resolve ticket with resolution notes', async ({ page }) => {
    await page.goto('/tickets?assignee=me&status=in_progress');
    await page.locator('[data-testid="ticket-row"]').first().click();
    
    // Click resolve
    await page.click('[data-testid="resolve-ticket-btn"]');
    
    // Fill resolution modal
    await page.fill('[data-testid="resolution-notes"]', 'Issue resolved by clearing cache');
    await page.click('text=Confirm Resolution');
    
    // Verify resolution
    await expect(page.locator('[data-testid="ticket-status"]')).toContainText('Resolved');
    await expect(page.locator('text=Issue resolved by clearing cache')).toBeVisible();
  });
});
```

---

## Visual Testing

### Screenshot Tests

```typescript
// tests/e2e/specs/visual.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
  test('login page matches snapshot', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveScreenshot('login-page.png', {
      fullPage: true,
      mask: [page.locator('[data-testid="dynamic-content"]')],
    });
  });

  test('dashboard matches snapshot', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('dashboard.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('ticket form matches snapshot', async ({ page }) => {
    await page.goto('/tickets/new');
    await expect(page.locator('[data-testid="ticket-form"]'))
      .toHaveScreenshot('ticket-form.png');
  });

  test('dark mode matches snapshot', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Toggle dark mode
    await page.click('[data-testid="theme-toggle"]');
    
    await expect(page).toHaveScreenshot('dashboard-dark.png', {
      fullPage: true,
    });
  });
});
```

---

## Accessibility Testing

### Axe Integration

```typescript
// tests/e2e/specs/accessibility.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('login page should have no accessibility violations', async ({ page }) => {
    await page.goto('/login');
    
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    
    expect(results.violations).toEqual([]);
  });

  test('dashboard should be accessible', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    const results = await new AxeBuilder({ page })
      .exclude('[data-testid="chart"]') // Charts may have known issues
      .analyze();
    
    expect(results.violations).toEqual([]);
  });

  test('should navigate with keyboard only', async ({ page }) => {
    await page.goto('/login');
    
    // Tab through form
    await page.keyboard.press('Tab');
    await expect(page.locator('[name="email"]')).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(page.locator('[name="password"]')).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(page.locator('button[type="submit"]')).toBeFocused();
    
    // Submit with Enter
    await page.keyboard.type('test@example.com');
    await page.keyboard.press('Tab');
    await page.keyboard.type('password');
    await page.keyboard.press('Enter');
  });

  test('should announce form errors to screen readers', async ({ page }) => {
    await page.goto('/login');
    await page.click('button[type="submit"]');
    
    // Check aria-invalid
    await expect(page.locator('[name="email"]')).toHaveAttribute('aria-invalid', 'true');
    
    // Check error is linked
    const emailInput = page.locator('[name="email"]');
    const describedBy = await emailInput.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    
    const errorElement = page.locator(`#${describedBy}`);
    await expect(errorElement).toContainText('required');
  });
});
```

---

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: insightdesk_test
        ports:
          - 5432:5432
        options: --health-cmd pg_isready --health-interval 10s
      
      valkey:
        image: valkey/valkey:7-alpine
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4
      
      - uses: oven-sh/setup-bun@v1
      
      - name: Install dependencies
        run: bun install --frozen-lockfile
      
      - name: Install Playwright browsers
        run: bunx playwright install --with-deps chromium
      
      - name: Setup database
        run: bunx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/insightdesk_test
      
      - name: Build application
        run: bun run build
      
      - name: Run E2E tests
        run: bun run test:e2e
        env:
          E2E_BASE_URL: http://localhost:3000
          E2E_DATABASE_URL: postgresql://test:test@localhost:5432/insightdesk_test
      
      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

---

## Best Practices

### Test Isolation

```typescript
// ✅ Each test is independent
test('test 1', async ({ page }) => {
  await page.goto('/tickets');
  // Create own test data
});

test('test 2', async ({ page }) => {
  await page.goto('/tickets');
  // Create own test data
});
```

### Wait Strategies

```typescript
// ✅ Wait for specific elements
await page.waitForSelector('[data-testid="tickets-loaded"]');

// ✅ Wait for network idle
await page.waitForLoadState('networkidle');

// ✅ Wait for API response
await page.waitForResponse('**/api/v1/tickets');

// ❌ Avoid arbitrary waits
await page.waitForTimeout(5000);
```

### Data-TestId Usage

```typescript
// ✅ Use stable selectors
await page.click('[data-testid="submit-button"]');

// ❌ Avoid brittle selectors
await page.click('.btn-primary:nth-child(2)');
```

### Test Data Management

```typescript
// ✅ Use unique identifiers
const uniqueTitle = `Test Ticket ${Date.now()}`;

// ✅ Clean up after tests
test.afterEach(async () => {
  await cleanupTestData();
});
```
