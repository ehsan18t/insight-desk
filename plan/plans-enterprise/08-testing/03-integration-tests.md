# Integration Testing Guide

> Testing API endpoints, database operations, and service integrations.

## Table of Contents

1. [Setup and Configuration](#setup-and-configuration)
2. [Database Testing](#database-testing)
3. [API Endpoint Testing](#api-endpoint-testing)
4. [Authentication Testing](#authentication-testing)
5. [Queue and Job Testing](#queue-and-job-testing)
6. [External Service Testing](#external-service-testing)
7. [Best Practices](#best-practices)

---

## Setup and Configuration

### Integration Test Setup

```typescript
// tests/integration/setup.ts
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';
import { Express } from 'express';
import { createApp } from '@/app';

// Test database client
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL,
    },
  },
});

// Test Valkey client
export const valkey = createClient({
  url: process.env.TEST_VALKEY_URL || 'redis://localhost:6379',
});

// Express app instance
export let app: Express;

beforeAll(async () => {
  // Connect to test database
  await prisma.$connect();
  await valkey.connect();
  
  // Create Express app
  app = createApp();
  
  // Run migrations
  await prisma.$executeRawUnsafe(`
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
  `);
  
  // Apply Prisma migrations
  const { execSync } = await import('child_process');
  execSync('bunx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
  await valkey.quit();
});

beforeEach(async () => {
  // Clear Valkey
  await valkey.flushDb();
});

afterEach(async () => {
  // Clean up database tables (in order for foreign keys)
  const tableNames = [
    'ticket_comments',
    'ticket_history',
    'tickets',
    'refresh_tokens',
    'users',
  ];
  
  for (const table of tableNames) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "${table}" CASCADE`
    );
  }
});
```

### Test Docker Compose

```yaml
# docker-compose.test.yml
version: '3.8'

services:
  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: insightdesk_test
    ports:
      - "5433:5432"
    tmpfs:
      - /var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test -d insightdesk_test"]
      interval: 5s
      timeout: 5s
      retries: 5

  valkey-test:
    image: valkey/valkey:7-alpine
    ports:
      - "6380:6379"
    command: valkey-server --appendonly no
```

### Testcontainers Setup

```typescript
// tests/integration/containers.ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, StartedTestContainer } from 'testcontainers';

let postgresContainer: StartedPostgreSqlContainer;
let valkeyContainer: StartedTestContainer;

export async function startContainers() {
  // Start PostgreSQL
  postgresContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('insightdesk_test')
    .withUsername('test')
    .withPassword('test')
    .start();
  
  // Start Valkey
  valkeyContainer = await new GenericContainer('valkey/valkey:7-alpine')
    .withExposedPorts(6379)
    .start();
  
  // Set environment variables
  process.env.TEST_DATABASE_URL = postgresContainer.getConnectionUri();
  process.env.TEST_VALKEY_URL = `redis://${valkeyContainer.getHost()}:${valkeyContainer.getMappedPort(6379)}`;
}

export async function stopContainers() {
  await postgresContainer?.stop();
  await valkeyContainer?.stop();
}
```

---

## Database Testing

### Repository Integration Tests

```typescript
// tests/integration/repositories/ticket.repository.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../setup';
import { TicketRepository } from '@/repositories/ticket.repository';
import { createUserFactory } from '@/tests/factories/user';
import { createTicketFactory } from '@/tests/factories/ticket';

const userFactory = createUserFactory();
const ticketFactory = createTicketFactory();

describe('TicketRepository', () => {
  let repository: TicketRepository;
  let testUser: any;

  beforeEach(async () => {
    repository = new TicketRepository(prisma);
    
    // Create test user
    testUser = await prisma.user.create({
      data: userFactory.build(),
    });
  });

  describe('create', () => {
    it('should create a ticket in the database', async () => {
      const ticketData = {
        title: 'Integration Test Ticket',
        description: 'Testing database creation',
        priority: 'high' as const,
        createdById: testUser.id,
      };

      const ticket = await repository.create(ticketData);

      expect(ticket.id).toBeDefined();
      expect(ticket.title).toBe(ticketData.title);
      expect(ticket.number).toBeGreaterThan(0);
      expect(ticket.status).toBe('open');

      // Verify in database
      const dbTicket = await prisma.ticket.findUnique({
        where: { id: ticket.id },
      });
      expect(dbTicket).not.toBeNull();
      expect(dbTicket!.title).toBe(ticketData.title);
    });

    it('should auto-increment ticket number', async () => {
      const ticket1 = await repository.create({
        title: 'First Ticket',
        description: 'Test',
        priority: 'low',
        createdById: testUser.id,
      });

      const ticket2 = await repository.create({
        title: 'Second Ticket',
        description: 'Test',
        priority: 'low',
        createdById: testUser.id,
      });

      expect(ticket2.number).toBe(ticket1.number + 1);
    });
  });

  describe('findWithFilters', () => {
    beforeEach(async () => {
      // Create test tickets
      await prisma.ticket.createMany({
        data: [
          { ...ticketFactory.build({ status: 'open', priority: 'high', createdById: testUser.id }) },
          { ...ticketFactory.build({ status: 'open', priority: 'low', createdById: testUser.id }) },
          { ...ticketFactory.build({ status: 'resolved', priority: 'high', createdById: testUser.id }) },
          { ...ticketFactory.build({ status: 'closed', priority: 'medium', createdById: testUser.id }) },
        ],
      });
    });

    it('should filter by status', async () => {
      const { data, total } = await repository.findWithFilters({
        status: 'open',
      });

      expect(total).toBe(2);
      expect(data.every(t => t.status === 'open')).toBe(true);
    });

    it('should filter by multiple criteria', async () => {
      const { data } = await repository.findWithFilters({
        status: 'open',
        priority: 'high',
      });

      expect(data).toHaveLength(1);
      expect(data[0].status).toBe('open');
      expect(data[0].priority).toBe('high');
    });

    it('should paginate results', async () => {
      const page1 = await repository.findWithFilters({ page: 1, limit: 2 });
      const page2 = await repository.findWithFilters({ page: 2, limit: 2 });

      expect(page1.data).toHaveLength(2);
      expect(page2.data).toHaveLength(2);
      expect(page1.data[0].id).not.toBe(page2.data[0].id);
    });

    it('should sort results', async () => {
      const { data } = await repository.findWithFilters({
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      for (let i = 0; i < data.length - 1; i++) {
        expect(new Date(data[i].createdAt).getTime())
          .toBeGreaterThanOrEqual(new Date(data[i + 1].createdAt).getTime());
      }
    });
  });

  describe('transactions', () => {
    it('should rollback on error', async () => {
      const ticketData = {
        title: 'Transaction Test',
        description: 'Testing rollback',
        priority: 'medium' as const,
        createdById: testUser.id,
      };

      try {
        await prisma.$transaction(async (tx) => {
          await tx.ticket.create({ data: ticketData });
          throw new Error('Simulated error');
        });
      } catch (e) {
        // Expected
      }

      // Verify ticket was not created
      const ticket = await prisma.ticket.findFirst({
        where: { title: 'Transaction Test' },
      });
      expect(ticket).toBeNull();
    });
  });
});
```

---

## API Endpoint Testing

### Full API Test Suite

```typescript
// tests/integration/api/tickets.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, prisma } from '../setup';
import { createUserFactory } from '@/tests/factories/user';
import { createTicketFactory } from '@/tests/factories/ticket';
import { generateAuthToken } from '@/tests/helpers/auth';

const userFactory = createUserFactory();
const ticketFactory = createTicketFactory();

describe('Tickets API', () => {
  let authToken: string;
  let testUser: any;
  let agentUser: any;

  beforeEach(async () => {
    // Create test users
    testUser = await prisma.user.create({
      data: userFactory.customer(),
    });
    agentUser = await prisma.user.create({
      data: userFactory.agent(),
    });
    
    authToken = generateAuthToken(testUser);
  });

  describe('POST /api/v1/tickets', () => {
    it('should create a ticket for authenticated user', async () => {
      const response = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'API Test Ticket',
          description: 'Testing via API',
          priority: 'medium',
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        title: 'API Test Ticket',
        status: 'open',
        priority: 'medium',
        createdById: testUser.id,
      });
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.number).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/tickets')
        .send({
          title: 'Unauthenticated Request',
          description: 'Should fail',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
    });

    it('should return 400 for invalid data', async () => {
      const response = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: '', // Empty title
          priority: 'invalid', // Invalid priority
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({ field: 'title' })
      );
    });

    it('should sanitize input to prevent XSS', async () => {
      const response = await request(app)
        .post('/api/v1/tickets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: '<script>alert("xss")</script>Test',
          description: '<img onerror="alert(1)" src="x">',
          priority: 'low',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.title).not.toContain('<script>');
      expect(response.body.data.description).not.toContain('onerror');
    });
  });

  describe('GET /api/v1/tickets', () => {
    beforeEach(async () => {
      // Create test tickets
      await prisma.ticket.createMany({
        data: Array.from({ length: 25 }, (_, i) => ({
          ...ticketFactory.build({
            createdById: testUser.id,
            status: i < 10 ? 'open' : 'resolved',
          }),
        })),
      });
    });

    it('should return paginated tickets', async () => {
      const response = await request(app)
        .get('/api/v1/tickets')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(10);
      expect(response.body.meta).toMatchObject({
        page: 1,
        limit: 10,
        total: 25,
        totalPages: 3,
      });
    });

    it('should filter tickets by status', async () => {
      const response = await request(app)
        .get('/api/v1/tickets')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'open' });

      expect(response.status).toBe(200);
      expect(response.body.data.every((t: any) => t.status === 'open')).toBe(true);
    });

    it('should search tickets by title', async () => {
      // Create ticket with specific title
      await prisma.ticket.create({
        data: ticketFactory.build({
          title: 'Unique Searchable Title XYZ123',
          createdById: testUser.id,
        }),
      });

      const response = await request(app)
        .get('/api/v1/tickets')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ search: 'XYZ123' });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toContain('XYZ123');
    });
  });

  describe('GET /api/v1/tickets/:id', () => {
    let ticket: any;

    beforeEach(async () => {
      ticket = await prisma.ticket.create({
        data: ticketFactory.build({ createdById: testUser.id }),
      });
    });

    it('should return ticket by ID', async () => {
      const response = await request(app)
        .get(`/api/v1/tickets/${ticket.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(ticket.id);
    });

    it('should return 404 for non-existent ticket', async () => {
      const response = await request(app)
        .get('/api/v1/tickets/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    it('should return 403 for unauthorized access', async () => {
      // Create another user's ticket
      const otherUser = await prisma.user.create({
        data: userFactory.customer(),
      });
      const otherTicket = await prisma.ticket.create({
        data: ticketFactory.build({ createdById: otherUser.id }),
      });

      const response = await request(app)
        .get(`/api/v1/tickets/${otherTicket.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('PATCH /api/v1/tickets/:id', () => {
    let ticket: any;

    beforeEach(async () => {
      ticket = await prisma.ticket.create({
        data: ticketFactory.build({
          createdById: testUser.id,
          status: 'open',
        }),
      });
    });

    it('should update ticket fields', async () => {
      const response = await request(app)
        .patch(`/api/v1/tickets/${ticket.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Updated Title',
          priority: 'critical',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.title).toBe('Updated Title');
      expect(response.body.data.priority).toBe('critical');

      // Verify in database
      const updated = await prisma.ticket.findUnique({
        where: { id: ticket.id },
      });
      expect(updated!.title).toBe('Updated Title');
    });

    it('should record history for status change', async () => {
      const agentToken = generateAuthToken(agentUser);
      
      await request(app)
        .patch(`/api/v1/tickets/${ticket.id}`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ status: 'in_progress' });

      const history = await prisma.ticketHistory.findFirst({
        where: { ticketId: ticket.id, field: 'status' },
      });

      expect(history).not.toBeNull();
      expect(history!.oldValue).toBe('open');
      expect(history!.newValue).toBe('in_progress');
      expect(history!.changedById).toBe(agentUser.id);
    });
  });

  describe('POST /api/v1/tickets/:id/comments', () => {
    let ticket: any;

    beforeEach(async () => {
      ticket = await prisma.ticket.create({
        data: ticketFactory.build({ createdById: testUser.id }),
      });
    });

    it('should add comment to ticket', async () => {
      const response = await request(app)
        .post(`/api/v1/tickets/${ticket.id}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: 'Test comment content',
          isInternal: false,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.content).toBe('Test comment content');
      expect(response.body.data.authorId).toBe(testUser.id);
    });

    it('should not allow customers to add internal comments', async () => {
      const response = await request(app)
        .post(`/api/v1/tickets/${ticket.id}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: 'Internal note',
          isInternal: true,
        });

      expect(response.status).toBe(403);
    });

    it('should allow agents to add internal comments', async () => {
      const agentToken = generateAuthToken(agentUser);
      
      const response = await request(app)
        .post(`/api/v1/tickets/${ticket.id}/comments`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          content: 'Internal agent note',
          isInternal: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.isInternal).toBe(true);
    });
  });
});
```

---

## Authentication Testing

```typescript
// tests/integration/api/auth.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, prisma, valkey } from '../setup';
import { createUserFactory } from '@/tests/factories/user';
import { hashPassword } from '@/lib/auth';

const userFactory = createUserFactory();

describe('Auth API', () => {
  describe('POST /api/v1/auth/register', () => {
    it('should register new user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'SecurePass123!',
          name: 'New User',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.user.email).toBe('newuser@example.com');
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();

      // Verify user in database
      const user = await prisma.user.findUnique({
        where: { email: 'newuser@example.com' },
      });
      expect(user).not.toBeNull();
    });

    it('should reject duplicate email', async () => {
      await prisma.user.create({
        data: {
          ...userFactory.build(),
          email: 'existing@example.com',
        },
      });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'existing@example.com',
          password: 'SecurePass123!',
          name: 'Another User',
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already exists');
    });

    it('should reject weak password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'weak@example.com',
          password: '123456',
          name: 'Weak Password',
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({ field: 'password' })
      );
    });
  });

  describe('POST /api/v1/auth/login', () => {
    let testUser: any;
    const password = 'TestPassword123!';

    beforeEach(async () => {
      testUser = await prisma.user.create({
        data: {
          ...userFactory.build(),
          email: 'test@example.com',
          passwordHash: await hashPassword(password),
        },
      });
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: password,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
      expect(response.body.data.user.id).toBe(testUser.id);
    });

    it('should reject invalid password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'WrongPassword123!',
        });

      expect(response.status).toBe(401);
    });

    it('should reject non-existent user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: password,
        });

      expect(response.status).toBe(401);
    });

    it('should rate limit after multiple failures', async () => {
      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'test@example.com',
            password: 'wrong',
          });
      }

      // 6th attempt should be rate limited
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: password,
        });

      expect(response.status).toBe(429);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should refresh access token', async () => {
      // First login
      const user = await prisma.user.create({
        data: {
          ...userFactory.build(),
          passwordHash: await hashPassword('Password123!'),
        },
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: 'Password123!',
        });

      const { refreshToken } = loginResponse.body.data;

      // Refresh token
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
      // Old refresh token should be different
      expect(response.body.data.refreshToken).not.toBe(refreshToken);
    });

    it('should reject reused refresh token', async () => {
      const user = await prisma.user.create({
        data: {
          ...userFactory.build(),
          passwordHash: await hashPassword('Password123!'),
        },
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: 'Password123!',
        });

      const { refreshToken } = loginResponse.body.data;

      // Use refresh token once
      await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      // Try to reuse old refresh token
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should invalidate refresh token', async () => {
      const user = await prisma.user.create({
        data: {
          ...userFactory.build(),
          passwordHash: await hashPassword('Password123!'),
        },
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: 'Password123!',
        });

      const { accessToken, refreshToken } = loginResponse.body.data;

      // Logout
      await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken });

      // Try to use refresh token
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(401);
    });
  });
});
```

---

## Queue and Job Testing

```typescript
// tests/integration/queues/email.queue.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Queue, Worker, Job } from 'bullmq';
import { valkey } from '../setup';
import { EmailQueue, processEmailJob } from '@/queues/email.queue';

describe('Email Queue', () => {
  let queue: Queue;
  let worker: Worker;
  let processedJobs: Job[] = [];

  beforeEach(async () => {
    queue = new Queue('test-email', {
      connection: valkey,
    });

    worker = new Worker(
      'test-email',
      async (job) => {
        processedJobs.push(job);
        return processEmailJob(job);
      },
      { connection: valkey }
    );

    await worker.waitUntilReady();
  });

  afterEach(async () => {
    await worker.close();
    await queue.close();
    processedJobs = [];
  });

  it('should process email job', async () => {
    const jobData = {
      to: 'test@example.com',
      subject: 'Test Email',
      template: 'welcome',
      data: { name: 'Test User' },
    };

    const job = await queue.add('send-email', jobData);

    // Wait for job to complete
    await job.waitUntilFinished(worker);

    expect(processedJobs).toHaveLength(1);
    expect(processedJobs[0].data).toEqual(jobData);
  });

  it('should retry failed jobs', async () => {
    let attempts = 0;
    
    const failingWorker = new Worker(
      'test-email',
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Simulated failure');
        }
      },
      {
        connection: valkey,
        settings: {
          backoffStrategies: {
            custom: () => 10, // 10ms backoff for testing
          },
        },
      }
    );

    const job = await queue.add('send-email', { to: 'test@example.com' }, {
      attempts: 3,
      backoff: { type: 'custom' },
    });

    await job.waitUntilFinished(failingWorker);
    
    expect(attempts).toBe(3);
    
    await failingWorker.close();
  });

  it('should move to failed after max retries', async () => {
    const alwaysFailWorker = new Worker(
      'test-email',
      async () => {
        throw new Error('Always fails');
      },
      { connection: valkey }
    );

    const job = await queue.add('send-email', { to: 'test@example.com' }, {
      attempts: 2,
    });

    try {
      await job.waitUntilFinished(alwaysFailWorker);
    } catch {
      // Expected to fail
    }

    const failedJob = await Job.fromId(queue, job.id!);
    expect(failedJob?.failedReason).toBe('Always fails');

    await alwaysFailWorker.close();
  });
});
```

---

## External Service Testing

```typescript
// tests/integration/services/email.service.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { EmailService } from '@/services/email.service';

// Mock SMTP server using MSW
const server = setupServer(
  http.post('https://api.sendgrid.com/v3/mail/send', () => {
    return HttpResponse.json({ message: 'success' }, { status: 202 });
  })
);

describe('EmailService', () => {
  let emailService: EmailService;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'bypass' });
    emailService = new EmailService();
  });

  afterAll(() => {
    server.close();
  });

  it('should send email via provider', async () => {
    const result = await emailService.send({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(true);
  });

  it('should handle provider errors', async () => {
    server.use(
      http.post('https://api.sendgrid.com/v3/mail/send', () => {
        return HttpResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      })
    );

    const result = await emailService.send({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Rate limit');
  });
});
```

---

## Best Practices

### Test Isolation

```typescript
// ✅ Each test is independent
describe('Feature', () => {
  beforeEach(async () => {
    // Fresh setup for each test
    await cleanDatabase();
    await seedTestData();
  });
  
  it('test 1', () => { /* ... */ });
  it('test 2', () => { /* ... */ });
});
```

### Database Transactions

```typescript
// Use transactions for test isolation without cleanup
describe('with transaction rollback', () => {
  it('should rollback changes', async () => {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({ data: userData });
      
      // Test assertions here
      
      throw new Error('Rollback');
    }).catch(() => {});
    
    // Database unchanged
  });
});
```

### Parallel Test Safety

```typescript
// Use unique identifiers for parallel tests
describe('parallel safe', () => {
  it('test 1', async () => {
    const uniqueEmail = `test-${Date.now()}-1@example.com`;
    // Use uniqueEmail
  });
  
  it('test 2', async () => {
    const uniqueEmail = `test-${Date.now()}-2@example.com`;
    // Use uniqueEmail
  });
});
```

### Test Timeouts

```typescript
// Configure appropriate timeouts
describe('slow operations', () => {
  it('should handle long operation', async () => {
    // ...
  }, { timeout: 30000 }); // 30 second timeout
});
```
