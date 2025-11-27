# Unit Testing Guide

> Best practices and patterns for writing effective unit tests in InsightDesk.

## Table of Contents

1. [Setup and Configuration](#setup-and-configuration)
2. [Testing Utilities](#testing-utilities)
3. [Backend Unit Tests](#backend-unit-tests)
4. [Frontend Unit Tests](#frontend-unit-tests)
5. [Mocking Patterns](#mocking-patterns)
6. [Test Data Factories](#test-data-factories)
7. [Common Patterns](#common-patterns)
8. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)

---

## Setup and Configuration

### Test Setup File

```typescript
// tests/setup.ts
import { beforeAll, afterAll, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Global test setup
beforeAll(() => {
  // Set up test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
});

afterEach(() => {
  // Clear all mocks between tests
  vi.clearAllMocks();
});

afterAll(() => {
  // Clean up
  vi.restoreAllMocks();
});

// Global mocks
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));
```

### Vitest Workspace Configuration

```typescript
// vitest.workspace.ts
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      include: ['**/*.test.ts', '**/*.test.tsx'],
      exclude: ['**/integration/**', '**/e2e/**'],
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'integration',
      include: ['**/integration/**/*.test.ts'],
      setupFiles: ['./tests/integration/setup.ts'],
      poolOptions: {
        threads: {
          singleThread: true,
        },
      },
    },
  },
]);
```

---

## Testing Utilities

### Custom Render Function (React)

```typescript
// tests/utils/render.tsx
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactElement, ReactNode } from 'react';

// Create a fresh QueryClient for each test
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

interface WrapperProps {
  children: ReactNode;
}

const createWrapper = () => {
  const queryClient = createTestQueryClient();
  
  return function Wrapper({ children }: WrapperProps) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
};

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, {
    wrapper: createWrapper(),
    ...options,
  });
}

export * from '@testing-library/react';
export { renderWithProviders as render };
```

### Test Helpers

```typescript
// tests/utils/helpers.ts
import { vi } from 'vitest';

// Wait for async operations
export const flushPromises = () => 
  new Promise(resolve => setTimeout(resolve, 0));

// Mock timers helper
export function useFakeTimers() {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  
  afterEach(() => {
    vi.useRealTimers();
  });
}

// Suppress console errors in tests
export function suppressConsole(method: 'error' | 'warn' | 'log' = 'error') {
  const spy = vi.spyOn(console, method).mockImplementation(() => {});
  return () => spy.mockRestore();
}

// Assert async error
export async function expectAsyncError(
  fn: () => Promise<unknown>,
  errorMessage?: string
) {
  try {
    await fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    if (errorMessage) {
      expect((error as Error).message).toContain(errorMessage);
    }
  }
}
```

---

## Backend Unit Tests

### Service Testing

```typescript
// services/ticket.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketService } from './ticket.service';
import { createMockPrisma } from '@/tests/mocks/prisma';
import { createMockValkey } from '@/tests/mocks/valkey';
import { createTicketFactory } from '@/tests/factories/ticket';

describe('TicketService', () => {
  let ticketService: TicketService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockValkey: ReturnType<typeof createMockValkey>;
  const ticketFactory = createTicketFactory();

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockValkey = createMockValkey();
    ticketService = new TicketService(mockPrisma, mockValkey);
  });

  describe('create', () => {
    it('should create a ticket with valid data', async () => {
      const input = {
        title: 'Test Ticket',
        description: 'Test description',
        priority: 'medium' as const,
        createdById: 'user-1',
      };

      const expectedTicket = ticketFactory.build({
        ...input,
        status: 'open',
      });

      mockPrisma.ticket.create.mockResolvedValue(expectedTicket);

      const result = await ticketService.create(input);

      expect(result).toEqual(expectedTicket);
      expect(mockPrisma.ticket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: input.title,
          status: 'open',
        }),
      });
    });

    it('should throw validation error for empty title', async () => {
      const input = {
        title: '',
        description: 'Test',
        priority: 'low' as const,
        createdById: 'user-1',
      };

      await expect(ticketService.create(input)).rejects.toThrow(
        'Title is required'
      );
      expect(mockPrisma.ticket.create).not.toHaveBeenCalled();
    });

    it('should invalidate cache after creation', async () => {
      const input = {
        title: 'Cache Test',
        description: 'Test',
        priority: 'high' as const,
        createdById: 'user-1',
      };

      mockPrisma.ticket.create.mockResolvedValue(ticketFactory.build(input));

      await ticketService.create(input);

      expect(mockValkey.del).toHaveBeenCalledWith(
        expect.stringContaining('tickets:list')
      );
    });
  });

  describe('findById', () => {
    it('should return ticket from cache if available', async () => {
      const cachedTicket = ticketFactory.build();
      mockValkey.get.mockResolvedValue(JSON.stringify(cachedTicket));

      const result = await ticketService.findById(cachedTicket.id);

      expect(result).toEqual(cachedTicket);
      expect(mockPrisma.ticket.findUnique).not.toHaveBeenCalled();
    });

    it('should fetch from database and cache if not in cache', async () => {
      const ticket = ticketFactory.build();
      mockValkey.get.mockResolvedValue(null);
      mockPrisma.ticket.findUnique.mockResolvedValue(ticket);

      const result = await ticketService.findById(ticket.id);

      expect(result).toEqual(ticket);
      expect(mockPrisma.ticket.findUnique).toHaveBeenCalled();
      expect(mockValkey.setex).toHaveBeenCalledWith(
        `ticket:${ticket.id}`,
        3600,
        JSON.stringify(ticket)
      );
    });

    it('should return null for non-existent ticket', async () => {
      mockValkey.get.mockResolvedValue(null);
      mockPrisma.ticket.findUnique.mockResolvedValue(null);

      const result = await ticketService.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update status and record history', async () => {
      const ticket = ticketFactory.build({ status: 'open' });
      mockPrisma.ticket.findUnique.mockResolvedValue(ticket);
      mockPrisma.ticket.update.mockResolvedValue({
        ...ticket,
        status: 'in_progress',
      });
      mockPrisma.ticketHistory.create.mockResolvedValue({} as any);

      await ticketService.updateStatus(ticket.id, 'in_progress', 'user-1');

      expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
        where: { id: ticket.id },
        data: { status: 'in_progress' },
      });
      expect(mockPrisma.ticketHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ticketId: ticket.id,
          field: 'status',
          oldValue: 'open',
          newValue: 'in_progress',
        }),
      });
    });
  });
});
```

### Utility Function Testing

```typescript
// utils/validation.test.ts
import { describe, it, expect } from 'vitest';
import {
  validateEmail,
  validatePassword,
  sanitizeInput,
  parseTicketNumber,
} from './validation';

describe('validateEmail', () => {
  it.each([
    ['user@example.com', true],
    ['user.name@example.co.uk', true],
    ['user+tag@example.com', true],
    ['invalid', false],
    ['@example.com', false],
    ['user@', false],
    ['', false],
  ])('validateEmail(%s) should return %s', (email, expected) => {
    expect(validateEmail(email)).toBe(expected);
  });
});

describe('validatePassword', () => {
  it('should accept valid passwords', () => {
    const result = validatePassword('SecurePass123!');
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject short passwords', () => {
    const result = validatePassword('Short1!');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Password must be at least 8 characters');
  });

  it('should require uppercase letters', () => {
    const result = validatePassword('lowercase123!');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Password must contain an uppercase letter');
  });

  it('should require special characters', () => {
    const result = validatePassword('NoSpecial123');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Password must contain a special character');
  });
});

describe('sanitizeInput', () => {
  it('should remove script tags', () => {
    const input = '<script>alert("xss")</script>Hello';
    expect(sanitizeInput(input)).toBe('Hello');
  });

  it('should escape HTML entities', () => {
    const input = '<div>Test & "quotes"</div>';
    expect(sanitizeInput(input)).toBe('&lt;div&gt;Test &amp; &quot;quotes&quot;&lt;/div&gt;');
  });

  it('should trim whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });
});

describe('parseTicketNumber', () => {
  it.each([
    ['TKT-000001', 1],
    ['TKT-123456', 123456],
    ['tkt-000100', 100], // case insensitive
  ])('parseTicketNumber(%s) should return %d', (input, expected) => {
    expect(parseTicketNumber(input)).toBe(expected);
  });

  it('should throw for invalid format', () => {
    expect(() => parseTicketNumber('INVALID')).toThrow('Invalid ticket number format');
  });
});
```

---

## Frontend Unit Tests

### Component Testing

```typescript
// components/TicketCard/TicketCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/tests/utils/render';
import userEvent from '@testing-library/user-event';
import { TicketCard } from './TicketCard';
import { createTicketFactory } from '@/tests/factories/ticket';

const ticketFactory = createTicketFactory();

describe('TicketCard', () => {
  it('renders ticket information', () => {
    const ticket = ticketFactory.build({
      title: 'Test Ticket',
      status: 'open',
      priority: 'high',
    });

    render(<TicketCard ticket={ticket} />);

    expect(screen.getByText('Test Ticket')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('displays priority badge with correct color', () => {
    const ticket = ticketFactory.build({ priority: 'critical' });

    render(<TicketCard ticket={ticket} />);

    const badge = screen.getByText('Critical');
    expect(badge).toHaveClass('bg-red-500');
  });

  it('calls onClick when card is clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    const ticket = ticketFactory.build();

    render(<TicketCard ticket={ticket} onClick={handleClick} />);

    await user.click(screen.getByRole('article'));

    expect(handleClick).toHaveBeenCalledWith(ticket);
  });

  it('shows assigned agent avatar when assigned', () => {
    const ticket = ticketFactory.build({
      assignee: {
        id: '1',
        name: 'John Doe',
        avatar: 'https://example.com/avatar.jpg',
      },
    });

    render(<TicketCard ticket={ticket} />);

    expect(screen.getByRole('img', { name: 'John Doe' })).toBeInTheDocument();
  });

  it('shows unassigned indicator when no assignee', () => {
    const ticket = ticketFactory.build({ assignee: null });

    render(<TicketCard ticket={ticket} />);

    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('formats created date correctly', () => {
    const ticket = ticketFactory.build({
      createdAt: new Date('2024-01-15T10:30:00Z'),
    });

    render(<TicketCard ticket={ticket} />);

    expect(screen.getByText(/Jan 15, 2024/)).toBeInTheDocument();
  });
});
```

### Hook Testing

```typescript
// hooks/useTickets.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTickets, useCreateTicket } from './useTickets';
import { ticketApi } from '@/lib/api/tickets';
import { createTicketFactory } from '@/tests/factories/ticket';

vi.mock('@/lib/api/tickets');

const ticketFactory = createTicketFactory();

describe('useTickets', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  it('fetches tickets successfully', async () => {
    const mockTickets = ticketFactory.buildList(3);
    vi.mocked(ticketApi.list).mockResolvedValue({
      data: mockTickets,
      total: 3,
    });

    const { result } = renderHook(() => useTickets(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockTickets);
    expect(ticketApi.list).toHaveBeenCalledWith({});
  });

  it('handles fetch error', async () => {
    const error = new Error('Failed to fetch');
    vi.mocked(ticketApi.list).mockRejectedValue(error);

    const { result } = renderHook(() => useTickets(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual(error);
  });

  it('passes filter parameters', async () => {
    vi.mocked(ticketApi.list).mockResolvedValue({ data: [], total: 0 });

    const filters = { status: 'open', priority: 'high' };
    renderHook(() => useTickets(filters), { wrapper });

    await waitFor(() => {
      expect(ticketApi.list).toHaveBeenCalledWith(filters);
    });
  });
});

describe('useCreateTicket', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  it('creates ticket and invalidates cache', async () => {
    const newTicket = ticketFactory.build();
    vi.mocked(ticketApi.create).mockResolvedValue(newTicket);

    const { result } = renderHook(() => useCreateTicket(), { wrapper });

    await result.current.mutateAsync({
      title: 'New Ticket',
      description: 'Description',
    });

    expect(ticketApi.create).toHaveBeenCalled();
  });
});
```

---

## Mocking Patterns

### Prisma Mock

```typescript
// tests/mocks/prisma.ts
import { vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep, mockReset } from 'vitest-mock-extended';

export type MockPrisma = DeepMockProxy<PrismaClient>;

export function createMockPrisma(): MockPrisma {
  return mockDeep<PrismaClient>();
}

// For global mock
export const prismaMock = createMockPrisma();

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

beforeEach(() => {
  mockReset(prismaMock);
});
```

### Valkey Mock

```typescript
// tests/mocks/valkey.ts
import { vi } from 'vitest';

export function createMockValkey() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
    incr: vi.fn(),
    decr: vi.fn(),
    hget: vi.fn(),
    hset: vi.fn(),
    hgetall: vi.fn(),
    hdel: vi.fn(),
    lpush: vi.fn(),
    rpush: vi.fn(),
    lpop: vi.fn(),
    rpop: vi.fn(),
    lrange: vi.fn(),
    publish: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
}
```

### API Mock with MSW

```typescript
// tests/mocks/handlers.ts
import { http, HttpResponse } from 'msw';
import { createTicketFactory } from '@/tests/factories/ticket';

const ticketFactory = createTicketFactory();

export const handlers = [
  // List tickets
  http.get('/api/v1/tickets', ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    
    let tickets = ticketFactory.buildList(10);
    if (status) {
      tickets = tickets.filter(t => t.status === status);
    }
    
    return HttpResponse.json({
      data: tickets,
      total: tickets.length,
      page: 1,
      limit: 20,
    });
  }),

  // Get single ticket
  http.get('/api/v1/tickets/:id', ({ params }) => {
    const ticket = ticketFactory.build({ id: params.id as string });
    return HttpResponse.json({ data: ticket });
  }),

  // Create ticket
  http.post('/api/v1/tickets', async ({ request }) => {
    const body = await request.json();
    const ticket = ticketFactory.build(body);
    return HttpResponse.json({ data: ticket }, { status: 201 });
  }),

  // Error case
  http.get('/api/v1/error', () => {
    return HttpResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }),
];
```

---

## Test Data Factories

### Factory Pattern

```typescript
// tests/factories/ticket.ts
import { faker } from '@faker-js/faker';
import { Ticket, TicketStatus, TicketPriority } from '@prisma/client';

type TicketOverrides = Partial<Ticket>;

export function createTicketFactory() {
  return {
    build(overrides: TicketOverrides = {}): Ticket {
      return {
        id: faker.string.uuid(),
        number: faker.number.int({ min: 1, max: 999999 }),
        title: faker.lorem.sentence(),
        description: faker.lorem.paragraphs(2),
        status: faker.helpers.arrayElement(['open', 'in_progress', 'resolved', 'closed']) as TicketStatus,
        priority: faker.helpers.arrayElement(['low', 'medium', 'high', 'critical']) as TicketPriority,
        createdById: faker.string.uuid(),
        assigneeId: faker.datatype.boolean() ? faker.string.uuid() : null,
        createdAt: faker.date.recent(),
        updatedAt: faker.date.recent(),
        resolvedAt: null,
        closedAt: null,
        ...overrides,
      };
    },

    buildList(count: number, overrides: TicketOverrides = {}): Ticket[] {
      return Array.from({ length: count }, () => this.build(overrides));
    },
  };
}

// Usage
const factory = createTicketFactory();
const ticket = factory.build({ status: 'open' });
const tickets = factory.buildList(5, { priority: 'high' });
```

### User Factory

```typescript
// tests/factories/user.ts
import { faker } from '@faker-js/faker';
import { User, UserRole } from '@prisma/client';

export function createUserFactory() {
  return {
    build(overrides: Partial<User> = {}): User {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      
      return {
        id: faker.string.uuid(),
        email: faker.internet.email({ firstName, lastName }),
        name: `${firstName} ${lastName}`,
        passwordHash: faker.string.alphanumeric(60),
        role: faker.helpers.arrayElement(['admin', 'agent', 'customer']) as UserRole,
        avatar: faker.image.avatar(),
        isActive: true,
        emailVerified: true,
        createdAt: faker.date.past(),
        updatedAt: faker.date.recent(),
        lastLoginAt: faker.date.recent(),
        ...overrides,
      };
    },

    buildList(count: number, overrides: Partial<User> = {}): User[] {
      return Array.from({ length: count }, () => this.build(overrides));
    },

    // Specific user types
    admin(overrides: Partial<User> = {}): User {
      return this.build({ role: 'admin', ...overrides });
    },

    agent(overrides: Partial<User> = {}): User {
      return this.build({ role: 'agent', ...overrides });
    },

    customer(overrides: Partial<User> = {}): User {
      return this.build({ role: 'customer', ...overrides });
    },
  };
}
```

---

## Common Patterns

### Testing Async Functions

```typescript
describe('async operations', () => {
  it('handles successful async call', async () => {
    const result = await asyncFunction();
    expect(result).toBeDefined();
  });

  it('handles rejected promise', async () => {
    await expect(failingAsyncFunction()).rejects.toThrow('Error message');
  });

  it('waits for state update', async () => {
    const { result } = renderHook(() => useAsyncHook());
    
    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });
  });
});
```

### Snapshot Testing

```typescript
describe('TicketCard snapshots', () => {
  it('matches snapshot for open ticket', () => {
    const ticket = ticketFactory.build({ status: 'open' });
    const { container } = render(<TicketCard ticket={ticket} />);
    expect(container).toMatchSnapshot();
  });
});
```

---

## Anti-Patterns to Avoid

```typescript
// ❌ BAD: Testing implementation details
it('calls internal method', () => {
  const spy = vi.spyOn(service, 'internalMethod');
  service.publicMethod();
  expect(spy).toHaveBeenCalled();
});

// ✅ GOOD: Test behavior/output
it('returns processed result', () => {
  const result = service.publicMethod();
  expect(result).toEqual(expectedOutput);
});

// ❌ BAD: Overly specific assertions
expect(result).toEqual({
  id: 'exact-id',
  createdAt: '2024-01-15T10:00:00Z',
  // ... many more fields
});

// ✅ GOOD: Assert what matters
expect(result).toMatchObject({
  status: 'success',
  data: expect.any(Object),
});

// ❌ BAD: Tests that depend on each other
let sharedState;
it('first test', () => { sharedState = 1; });
it('second test', () => { expect(sharedState).toBe(1); });

// ✅ GOOD: Independent tests
it('first test', () => {
  const state = createState();
  expect(state).toBe(1);
});
```
