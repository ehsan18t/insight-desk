# Background Jobs

> BullMQ patterns for async task processing with Valkey/Redis

## Table of Contents

1. [Overview](#overview)
2. [BullMQ Setup](#bullmq-setup)
3. [Job Definitions](#job-definitions)
4. [Email Jobs](#email-jobs)
5. [SLA Monitoring](#sla-monitoring)
6. [Scheduled Tasks](#scheduled-tasks)
7. [Error Handling](#error-handling)
8. [Monitoring & Debugging](#monitoring--debugging)

---

## Overview

### Why BullMQ?

| Feature        | BullMQ                 | pg-boss         |
| -------------- | ---------------------- | --------------- |
| Infrastructure | Uses Redis/Valkey      | Uses PostgreSQL |
| Performance    | ⚡ Very fast            | Slower (SQL)    |
| Scheduling     | ✅ Built-in             | ✅ Built-in      |
| Retries        | ✅ Exponential backoff  | ✅ Configurable  |
| Priorities     | ✅ Yes                  | ✅ Yes           |
| Concurrency    | ✅ Per-worker control   | Limited         |
| DB Load        | None (separate system) | Adds to DB load |

**Why we chose BullMQ:** Since we're already using Valkey for caching and Socket.IO, using it for job queues too means:
- No additional load on PostgreSQL
- Faster job processing
- Better separation of concerns
- Unified Redis/Valkey infrastructure

### Common Job Types for MVP

| Job                | Priority | Description                            |
| ------------------ | -------- | -------------------------------------- |
| Send email         | High     | Welcome, notifications, password reset |
| SLA check          | High     | Monitor response/resolution times      |
| Auto-close tickets | Medium   | Close resolved tickets after X days    |
| Daily digest       | Low      | Summary email for agents               |
| Cleanup            | Low      | Archive old tickets, purge logs        |

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Express API Server                           │
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │  Enqueue    │    │   Workers   │    │ Schedulers  │        │
│  │    Jobs     │    │  (Process)  │    │  (Cron)     │        │
│  └──────┬──────┘    └──────▲──────┘    └──────┬──────┘        │
│         │                  │                   │               │
│         ▼                  │                   ▼               │
│  ┌─────────────────────────┴───────────────────────────┐      │
│  │                     BullMQ                          │      │
│  │              (Queues + Workers)                     │      │
│  └─────────────────────────┬───────────────────────────┘      │
│                            │                                   │
└────────────────────────────┼───────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Valkey (Redis-compatible)                    │
│                                                                 │
│  bull:email:*  │  bull:notifications:*  │  bull:scheduled:*    │
└─────────────────────────────────────────────────────────────────┘
```

---

## BullMQ Setup

### Installation

```bash
bun add bullmq
```

### Configuration

```ts
// src/lib/jobs.ts
import { Queue, Worker, type Job } from "bullmq";
import { config } from "@/config";

// Parse Valkey URL for connection
function parseValkeyUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || "localhost",
    port: Number.parseInt(parsed.port, 10) || 6379,
    password: parsed.password || undefined,
  };
}

const connectionConfig = {
  ...parseValkeyUrl(config.VALKEY_URL),
  maxRetriesPerRequest: null, // Required for BullMQ workers
};

// Job data types
export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
}

export interface TicketNotificationJobData {
  ticketId: string;
  action: "created" | "assigned" | "updated" | "message_added" | "resolved" | "closed";
  actorId: string;
  recipientIds: string[];
}

export interface SLACheckJobData {
  ticketId: string;
  slaDeadline: string;
}

// Queue names
export const QueueNames = {
  EMAIL: "email",
  TICKET_NOTIFICATION: "ticket-notification",
  SLA_CHECK: "sla-check",
  SLA_BREACHED: "sla-breached",
  SCHEDULED: "scheduled",
} as const;

// Queues (initialized on startup)
let emailQueue: Queue<EmailJobData>;
let ticketNotificationQueue: Queue<TicketNotificationJobData>;
let slaCheckQueue: Queue<SLACheckJobData>;
let scheduledQueue: Queue;

// Workers
let emailWorker: Worker<EmailJobData>;
let ticketNotificationWorker: Worker<TicketNotificationJobData>;
let slaCheckWorker: Worker<SLACheckJobData>;
let scheduledWorker: Worker;
```

### Initialize Queues & Workers

```ts
export async function initializeJobQueue(): Promise<void> {
  // Create queues with default options
  emailQueue = new Queue<EmailJobData>(QueueNames.EMAIL, {
    connection: connectionConfig,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });

  ticketNotificationQueue = new Queue<TicketNotificationJobData>(
    QueueNames.TICKET_NOTIFICATION,
    {
      connection: connectionConfig,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 500 },
        removeOnComplete: { count: 100 },
      },
    }
  );

  slaCheckQueue = new Queue<SLACheckJobData>(QueueNames.SLA_CHECK, {
    connection: connectionConfig,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "fixed", delay: 5000 },
    },
  });

  scheduledQueue = new Queue(QueueNames.SCHEDULED, {
    connection: connectionConfig,
  });

  // Create workers
  await createWorkers();

  // Schedule recurring jobs
  await scheduleRecurringJobs();

  console.log("BullMQ job queue initialized");
}
```

### Creating Workers

```ts
async function createWorkers(): Promise<void> {
  // Email worker with concurrency
  emailWorker = new Worker<EmailJobData>(
    QueueNames.EMAIL,
    async (job: Job<EmailJobData>) => {
      console.log(`Processing email job ${job.id}`);
      await sendEmail(job.data);
    },
    {
      connection: connectionConfig,
      concurrency: 5, // Process 5 emails at once
    }
  );

  emailWorker.on("completed", (job) => {
    console.log(`Email job ${job.id} completed`);
  });

  emailWorker.on("failed", (job, err) => {
    console.error(`Email job ${job?.id} failed:`, err);
  });

  // Ticket notification worker
  ticketNotificationWorker = new Worker<TicketNotificationJobData>(
    QueueNames.TICKET_NOTIFICATION,
    async (job) => {
      const { ticketId, action, recipientIds } = job.data;
      // Send notifications via Socket.IO
      for (const userId of recipientIds) {
        sendNotification({ type: "notification", userId, data: { ticketId, action } });
      }
    },
    { connection: connectionConfig, concurrency: 5 }
  );

  // SLA check worker
  slaCheckWorker = new Worker<SLACheckJobData>(
    QueueNames.SLA_CHECK,
    async (job) => {
      const { ticketId, slaDeadline } = job.data;
      const now = new Date();
      if (now > new Date(slaDeadline)) {
        await db.update(tickets).set({ slaBreached: true }).where(eq(tickets.id, ticketId));
        // Queue breach notification
        await queueSLABreached({ ticketId, organizationId: ticket.organizationId });
      }
    },
    { connection: connectionConfig, concurrency: 3 }
  );
}
```

### Express Integration

```ts
// src/index.ts
import express from "express";
import { initializeJobQueue, stopJobQueue } from "@/lib/jobs";

const app = express();

async function bootstrap() {
  // Initialize BullMQ
  await initializeJobQueue();

  // Start Express server
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down...");
  await stopJobQueue();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down...");
  await stopJobQueue();
  process.exit(0);
});

bootstrap().catch(console.error);
```

---

## Job Definitions

### Job Types

```ts
// apps/api/src/lib/jobs/types.ts

// Email jobs
export interface SendEmailJob {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}

export interface WelcomeEmailJob {
  userId: string;
  email: string;
  name: string;
}

export interface TicketNotificationJob {
  ticketId: string;
  recipientId: string;
  type: "new_message" | "status_change" | "assignment";
}

// SLA jobs
export interface SlaCheckJob {
  ticketId: string;
  checkType: "first_response" | "resolution";
}

export interface SlaBreach {
  ticketId: string;
  breachType: "first_response" | "resolution";
  breachedAt: Date;
}

// Ticket jobs
export interface AutoCloseTicketJob {
  ticketId: string;
  reason: string;
}

// Report jobs
export interface DailyDigestJob {
  organizationId: string;
  date: string; // ISO date string
}

export interface ExportReportJob {
  organizationId: string;
  reportType: string;
  filters: Record<string, unknown>;
  requestedBy: string;
}
```

### Queue Names

```ts
// apps/api/src/lib/jobs/queues.ts
export const QUEUES = {
  // High priority
  EMAIL: "email",
  SLA_CHECK: "sla-check",

  // Medium priority
  TICKET_ACTIONS: "ticket-actions",
  NOTIFICATIONS: "notifications",

  // Low priority
  REPORTS: "reports",
  CLEANUP: "cleanup",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
```

---

## Email Jobs

### Email Worker

```ts
// apps/api/src/lib/jobs/workers/email.ts
import { Worker, Job } from "bullmq";
import { connection } from "@/lib/cache";
import { QUEUES } from "../queues";
import { sendEmail } from "@/lib/email";
import type { SendEmailJob, WelcomeEmailJob, TicketNotificationJob } from "../types";

// Generic email worker
export const emailWorker = new Worker<SendEmailJob>(
  QUEUES.EMAIL,
  async (job: Job<SendEmailJob>) => {
    console.log(`Processing email job: ${job.id}`);

    await sendEmail({
      to: job.data.to,
      subject: job.data.subject,
      template: job.data.template,
      data: job.data.data,
    });

    console.log(`Email sent to ${job.data.to}`);
  },
  { connection, concurrency: 5 }
);

// Welcome email worker
export const welcomeEmailWorker = new Worker<WelcomeEmailJob>(
  `${QUEUES.EMAIL}-welcome`,
  async (job: Job<WelcomeEmailJob>) => {
    await sendEmail({
      to: job.data.email,
      subject: "Welcome to InsightDesk!",
      template: "welcome",
      data: {
        name: job.data.name,
        userId: job.data.userId,
      },
    });
  },
  { connection }
);

// Ticket notification worker
export const ticketNotificationWorker = new Worker<TicketNotificationJob>(
  `${QUEUES.EMAIL}-ticket-notification`,
  async (job: Job<TicketNotificationJob>) => {
    await handleTicketNotification(job.data);
  },
  { connection, concurrency: 10 }
);

console.log("Email workers registered");

async function handleTicketNotification(data: TicketNotificationJob) {
  // Fetch ticket and recipient details
  const ticket = await ticketService.findById(data.ticketId);
  const recipient = await userService.findById(data.recipientId);

  if (!ticket || !recipient) {
    throw new Error("Ticket or recipient not found");
  }

  const templates = {
    new_message: {
      subject: `New message on ticket: ${ticket.subject}`,
      template: "ticket-new-message",
    },
    status_change: {
      subject: `Ticket status updated: ${ticket.subject}`,
      template: "ticket-status-change",
    },
    assignment: {
      subject: `Ticket assigned to you: ${ticket.subject}`,
      template: "ticket-assigned",
    },
  };

  const config = templates[data.type];

  await sendEmail({
    to: recipient.email,
    subject: config.subject,
    template: config.template,
    data: { ticket, recipient },
  });
}
```

### Enqueueing Email Jobs

```ts
// apps/api/src/services/email/index.ts
import { getBoss } from "@/lib/jobs/boss";
import { QUEUES } from "@/lib/jobs/queues";
import type { WelcomeEmailJob, TicketNotificationJob } from "@/lib/jobs/types";

export async function enqueueWelcomeEmail(data: WelcomeEmailJob) {
  const boss = getBoss();

  await boss.send(`${QUEUES.EMAIL}-welcome`, data, {
    retryLimit: 5,
    retryDelay: 60, // 1 minute
    priority: 1, // Higher priority
  });
}

export async function enqueueTicketNotification(data: TicketNotificationJob) {
  const boss = getBoss();

  await boss.send(`${QUEUES.EMAIL}-ticket-notification`, data, {
    retryLimit: 3,
    retryDelay: 30,
    // Deduplicate: don't send same notification twice in 5 minutes
    singletonKey: `${data.ticketId}-${data.recipientId}-${data.type}`,
    singletonSeconds: 300,
  });
}

// Use in ticket service
export async function notifyOnNewMessage(ticketId: string, senderId: string) {
  const ticket = await ticketService.findById(ticketId);

  if (!ticket) return;

  // Notify all participants except sender
  const participants = await ticketService.getParticipants(ticketId);

  for (const participant of participants) {
    if (participant.id !== senderId) {
      await enqueueTicketNotification({
        ticketId,
        recipientId: participant.id,
        type: "new_message",
      });
    }
  }
}
```

### Email Service (Resend)

```ts
// apps/api/src/lib/email/index.ts
import { Resend } from "resend";
import { render } from "@react-email/render";
import * as templates from "./templates";

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendEmailOptions {
  to: string;
  subject: string;
  template: keyof typeof templates;
  data: Record<string, unknown>;
}

export async function sendEmail(options: SendEmailOptions) {
  const Template = templates[options.template];

  if (!Template) {
    throw new Error(`Email template not found: ${options.template}`);
  }

  const html = render(Template(options.data as any));

  const result = await resend.emails.send({
    from: process.env.EMAIL_FROM || "noreply@insightdesk.app",
    to: options.to,
    subject: options.subject,
    html,
  });

  if (result.error) {
    throw new Error(`Failed to send email: ${result.error.message}`);
  }

  return result;
}
```

---

## SLA Monitoring

### SLA Check Worker

```ts
// apps/api/src/lib/jobs/workers/sla.ts
import { Queue, Worker, Job } from "bullmq";
import { connection } from "@/lib/cache";
import { QUEUES } from "../queues";
import { db } from "@/db";
import { tickets, slaConfigs, slaBreaches } from "@/db/schema";
import { eq, and, lt, isNull } from "drizzle-orm";
import type { SlaCheckJob, SlaBreach } from "../types";

// Create SLA queue
const slaQueue = new Queue(QUEUES.SLA_CHECK, { connection });

// SLA check worker
export const slaWorker = new Worker<SlaCheckJob>(
  QUEUES.SLA_CHECK,
  async (job: Job<SlaCheckJob>) => {
    await checkTicketSla(job.data);
  },
  { connection, concurrency: 5 }
);

// Schedule recurring SLA check (every 5 minutes)
export async function initSlaScheduler() {
  await slaQueue.upsertJobScheduler(
    "sla-scan",
    { pattern: "*/5 * * * *" },
    { name: "scan" }
  );
}

// Scan worker for scheduled checks
export const slaScanWorker = new Worker(
  QUEUES.SLA_CHECK,
  async (job: Job) => {
    if (job.name === "scan") {
      await scanAllTicketsForSlaBreaches();
    }
  },
  { connection }
);

console.log("SLA workers registered");

async function checkTicketSla(data: SlaCheckJob) {
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, data.ticketId),
    with: {
      slaConfig: true,
    },
  });

  if (!ticket || !ticket.slaConfig) {
    return;
  }

  const now = new Date();
  const sla = ticket.slaConfig;

  if (data.checkType === "first_response") {
    // Check first response time
    if (!ticket.firstResponseAt) {
      const deadline = new Date(
        ticket.createdAt.getTime() + sla.firstResponseMinutes * 60 * 1000
      );

      if (now > deadline) {
        await recordSlaBreach({
          ticketId: ticket.id,
          breachType: "first_response",
          breachedAt: deadline,
        });
      }
    }
  } else if (data.checkType === "resolution") {
    // Check resolution time
    if (ticket.status !== "resolved" && ticket.status !== "closed") {
      const deadline = new Date(
        ticket.createdAt.getTime() + sla.resolutionMinutes * 60 * 1000
      );

      if (now > deadline) {
        await recordSlaBreach({
          ticketId: ticket.id,
          breachType: "resolution",
          breachedAt: deadline,
        });
      }
    }
  }
}

async function recordSlaBreach(breach: SlaBreach) {
  // Check if already recorded
  const existing = await db.query.slaBreaches.findFirst({
    where: and(
      eq(slaBreaches.ticketId, breach.ticketId),
      eq(slaBreaches.breachType, breach.breachType)
    ),
  });

  if (existing) return;

  // Record breach
  await db.insert(slaBreaches).values({
    ticketId: breach.ticketId,
    breachType: breach.breachType,
    breachedAt: breach.breachedAt,
  });

  // Send notification to assignee and admin
  await notifySlaBreached(breach);
}

async function scanAllTicketsForSlaBreaches() {
  console.log("Scanning tickets for SLA breaches...");

  // Find tickets that might breach SLA
  const atRiskTickets = await db.query.tickets.findMany({
    where: and(
      eq(tickets.status, "open"),
      isNull(tickets.firstResponseAt)
    ),
    with: { slaConfig: true },
    limit: 100,
  });

  for (const ticket of atRiskTickets) {
    if (ticket.slaConfig) {
      // Enqueue individual SLA check
      await slaQueue.add("check", {
        ticketId: ticket.id,
        checkType: "first_response",
      });
    }
  }

  console.log(`Enqueued SLA checks for ${atRiskTickets.length} tickets`);
}

async function notifySlaBreached(breach: SlaBreach) {
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, breach.ticketId),
    with: { assignee: true },
  });

  if (!ticket) return;

  // Notify assignee
  if (ticket.assigneeId) {
    await enqueueTicketNotification({
      ticketId: breach.ticketId,
      recipientId: ticket.assigneeId,
      type: "sla_breach",
    });
  }

  // Notify admins
  const admins = await db.query.users.findMany({
    where: and(
      eq(users.organizationId, ticket.organizationId),
      eq(users.role, "admin")
    ),
  });

  for (const admin of admins) {
    await enqueueTicketNotification({
      ticketId: breach.ticketId,
      recipientId: admin.id,
      type: "sla_breach",
    });
  }
}
```

### Enqueueing SLA Checks

```ts
// apps/api/src/services/ticket/index.ts
import { getBoss } from "@/lib/jobs/boss";
import { QUEUES } from "@/lib/jobs/queues";

export async function createTicket(data: CreateTicketInput) {
  const ticket = await db.insert(tickets).values(data).returning();

  // Schedule SLA checks based on SLA config
  if (ticket.slaConfigId) {
    const slaConfig = await db.query.slaConfigs.findFirst({
      where: eq(slaConfigs.id, ticket.slaConfigId),
    });

    if (slaConfig) {
      const boss = getBoss();

      // Schedule first response check
      const firstResponseDeadline = new Date(
        Date.now() + slaConfig.firstResponseMinutes * 60 * 1000
      );

      await boss.send(
        QUEUES.SLA_CHECK,
        { ticketId: ticket.id, checkType: "first_response" },
        { startAfter: firstResponseDeadline }
      );

      // Schedule resolution check
      const resolutionDeadline = new Date(
        Date.now() + slaConfig.resolutionMinutes * 60 * 1000
      );

      await boss.send(
        QUEUES.SLA_CHECK,
        { ticketId: ticket.id, checkType: "resolution" },
        { startAfter: resolutionDeadline }
      );
    }
  }

  return ticket;
}
```

---

## Scheduled Tasks

### Schedule Definitions

```ts
// apps/api/src/lib/jobs/schedules.ts
import { getBoss } from "./boss";
import { QUEUES } from "./queues";

interface ScheduleConfig {
  name: string;
  cron: string;
  queue: string;
  data?: Record<string, unknown>;
}

const schedules: ScheduleConfig[] = [
  {
    name: "auto-close-resolved",
    cron: "0 * * * *", // Every hour
    queue: QUEUES.TICKET_ACTIONS,
    data: { action: "auto-close" },
  },
  {
    name: "daily-digest",
    cron: "0 8 * * 1-5", // 8 AM on weekdays
    queue: QUEUES.REPORTS,
    data: { type: "daily-digest" },
  },
  {
    name: "weekly-report",
    cron: "0 9 * * 1", // 9 AM on Monday
    queue: QUEUES.REPORTS,
    data: { type: "weekly-report" },
  },
  {
    name: "cleanup-old-data",
    cron: "0 3 * * *", // 3 AM daily
    queue: QUEUES.CLEANUP,
    data: { action: "archive" },
  },
  {
    name: "sla-scan",
    cron: "*/5 * * * *", // Every 5 minutes
    queue: QUEUES.SLA_CHECK,
    data: { action: "scan" },
  },
];

export async function scheduleRecurringJobs(): Promise<void> {
  const boss = getBoss();

  for (const schedule of schedules) {
    await boss.schedule(schedule.name, schedule.cron, schedule.data || {}, {
      tz: "UTC",
    });

    console.log(`Scheduled: ${schedule.name} (${schedule.cron})`);
  }
}
```

### Ticket Auto-Close Worker

```ts
// apps/api/src/lib/jobs/workers/ticket.ts
import { Queue, Worker, Job } from "bullmq";
import { connection } from "@/lib/cache";
import { QUEUES } from "../queues";
import { db } from "@/db";
import { tickets } from "@/db/schema";
import { eq, and, lt } from "drizzle-orm";

const AUTO_CLOSE_DAYS = 7; // Close resolved tickets after 7 days

// Create ticket actions queue
const ticketQueue = new Queue(QUEUES.TICKET_ACTIONS, { connection });

// Ticket actions worker
export const ticketWorker = new Worker(
  QUEUES.TICKET_ACTIONS,
  async (job: Job) => {
    if (job.name === "auto-close-scan") {
      await autoCloseResolvedTickets();
    } else if (job.name === "auto-close") {
      await closeTicket(job.data.ticketId, job.data.reason);
    }
  },
  { connection }
);

// Schedule daily auto-close scan
export async function initTicketScheduler() {
  await ticketQueue.upsertJobScheduler(
    "auto-close-daily",
    { pattern: "0 2 * * *" }, // 2 AM UTC
    { name: "auto-close-scan" }
  );
}

console.log("Ticket workers registered");

async function autoCloseResolvedTickets() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - AUTO_CLOSE_DAYS);

  // Find resolved tickets older than cutoff
  const ticketsToClose = await db.query.tickets.findMany({
    where: and(
      eq(tickets.status, "resolved"),
      lt(tickets.resolvedAt, cutoffDate)
    ),
    limit: 100, // Process in batches
  });

  console.log(`Found ${ticketsToClose.length} tickets to auto-close`);

  for (const ticket of ticketsToClose) {
    await db
      .update(tickets)
      .set({
        status: "closed",
        closedAt: new Date(),
        closedReason: "auto_closed_after_resolution",
      })
      .where(eq(tickets.id, ticket.id));

    // Notify customer
    await enqueueTicketNotification({
      ticketId: ticket.id,
      recipientId: ticket.customerId,
      type: "ticket_closed",
    });
  }

  console.log(`Auto-closed ${ticketsToClose.length} tickets`);
}

async function closeTicket(ticketId: string, reason: string) {
  await db
    .update(tickets)
    .set({
      status: "closed",
      closedAt: new Date(),
      closedReason: reason,
    })
    .where(eq(tickets.id, ticketId));
}
```

### Report Worker

```ts
// apps/api/src/lib/jobs/workers/report.ts
import { Queue, Worker, Job } from "bullmq";
import { connection } from "@/lib/cache";
import { QUEUES } from "../queues";
import { db } from "@/db";
import type { DailyDigestJob, ExportReportJob } from "../types";

// Create reports queue
const reportQueue = new Queue(QUEUES.REPORTS, { connection });

// Report worker (handles scheduled and direct jobs)
export const reportWorker = new Worker(
  QUEUES.REPORTS,
  async (job: Job) => {
    switch (job.name) {
      case "daily-digest-scan":
        await generateDailyDigests();
        break;
      case "weekly-report":
        await generateWeeklyReports();
        break;
      case "daily-digest":
        await sendDailyDigest(job.data as DailyDigestJob);
        break;
      case "export":
        await generateExportReport(job.data as ExportReportJob);
        break;
    }
  },
  { connection, concurrency: 2 }
);

// Schedule daily digest at 8 AM
export async function initReportScheduler() {
  await reportQueue.upsertJobScheduler(
    "daily-digest-schedule",
    { pattern: "0 8 * * *" },
    { name: "daily-digest-scan" }
  );

  await reportQueue.upsertJobScheduler(
    "weekly-report-schedule",
    { pattern: "0 9 * * 1" }, // Monday 9 AM
    { name: "weekly-report" }
  );
}

console.log("Report workers registered");

async function generateDailyDigests() {
  // Get all organizations with active agents
  const organizations = await db.query.organizations.findMany({
    where: eq(organizations.isActive, true),
  });

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  for (const org of organizations) {
    await reportQueue.add("daily-digest", {
      organizationId: org.id,
      date: yesterday.toISOString().split("T")[0],
    });
  }
}

async function sendDailyDigest(data: DailyDigestJob) {
  const { organizationId, date } = data;

  // Get stats for the day
  const stats = await getTicketStatsForDay(organizationId, date);

  // Get agents to notify
  const agents = await db.query.users.findMany({
    where: and(
      eq(users.organizationId, organizationId),
      eq(users.role, "agent")
    ),
  });

  // Send digest to each agent
  for (const agent of agents) {
    await sendEmail({
      to: agent.email,
      subject: `Daily Digest - ${date}`,
      template: "daily-digest",
      data: { agent, stats, date },
    });
  }
}

async function generateExportReport(data: ExportReportJob) {
  const { organizationId, reportType, filters, requestedBy } = data;

  // Generate report based on type
  const reportData = await generateReportData(
    organizationId,
    reportType,
    filters
  );

  // Create CSV/PDF file
  const file = await createReportFile(reportType, reportData);

  // Upload to storage and get URL
  const downloadUrl = await uploadReportFile(file, organizationId);

  // Notify user that report is ready
  const user = await db.query.users.findFirst({
    where: eq(users.id, requestedBy),
  });

  if (user) {
    await sendEmail({
      to: user.email,
      subject: `Your ${reportType} report is ready`,
      template: "report-ready",
      data: { reportType, downloadUrl },
    });
  }
}
```

---

## Error Handling

### Retry Configuration

```ts
// apps/api/src/lib/jobs/config.ts
import type { JobsOptions } from "bullmq";

// Default job options by priority
export const jobOptions = {
  high: {
    attempts: 5,
    backoff: { type: "exponential", delay: 30000 }, // 30 seconds
    priority: 1,
  } satisfies JobsOptions,

  medium: {
    attempts: 3,
    backoff: { type: "exponential", delay: 60000 }, // 1 minute
    priority: 5,
  } satisfies JobsOptions,

  low: {
    attempts: 2,
    backoff: { type: "exponential", delay: 300000 }, // 5 minutes
    priority: 10,
  } satisfies JobsOptions,
};

// Custom options for specific job types
export const emailJobOptions: JobsOptions = {
  ...jobOptions.high,
  removeOnComplete: { age: 3600 }, // Keep completed for 1 hour
  removeOnFail: { age: 86400 }, // Keep failed for 24 hours
};

export const reportJobOptions: JobsOptions = {
  ...jobOptions.low,
  removeOnComplete: { age: 14400 }, // 4 hours for large reports
};
```

### Error Handler with Worker Events

```ts
// apps/api/src/lib/jobs/error-handler.ts
import { Worker, Job } from "bullmq";

interface JobError extends Error {
  jobId?: string;
  queue?: string;
  attempt?: number;
}

// Attach error handling to any worker
export function attachErrorHandlers(worker: Worker) {
  worker.on("completed", (job: Job) => {
    console.log(`[Job ${job.id}] Completed successfully`);
  });

  worker.on("failed", (job: Job | undefined, error: Error) => {
    if (job) {
      console.error(
        `[Job ${job.id}] Failed on attempt ${job.attemptsMade}:`,
        error.message
      );
    }
  });

  worker.on("error", (error: Error) => {
    console.error(`[Worker ${worker.name}] Error:`, error);
  });
}

// Helper to create processor with logging
export function createProcessor<T>(
  handler: (data: T) => Promise<void>
) {
  return async (job: Job<T>) => {
    const startTime = Date.now();
    console.log(`[Job ${job.id}] Starting (attempt ${job.attemptsMade + 1})`);

    try {
      await handler(job.data);
      console.log(`[Job ${job.id}] Completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error(`[Job ${job.id}] Failed:`, error);
      throw error; // Re-throw to trigger retry
    }
  };
}

// Usage
await boss.work<SendEmailJob>(
  QUEUES.EMAIL,
  createJobHandler(async (data) => {
    await sendEmail(data);
  })
);
```

### Dead Letter Queue

```ts
// apps/api/src/lib/jobs/dead-letter.ts
import { Worker, Job } from "bullmq";
import { connection } from "@/lib/cache";
import { db } from "@/db";
import { deadLetterJobs } from "@/db/schema";

// Handle permanently failed jobs
export function setupDeadLetterHandling(worker: Worker) {
  worker.on("failed", async (job: Job | undefined, error: Error) => {
    if (!job) return;

    // Check if this is the final failure (no more retries)
    const opts = job.opts;
    const maxAttempts = opts.attempts ?? 1;

    if (job.attemptsMade >= maxAttempts) {
      console.error(`Job permanently failed:`, {
        id: job.id,
        name: job.name,
        data: job.data,
        error: error.message,
      });

      // Store in dead letter table for manual review
      await db.insert(deadLetterJobs).values({
        originalJobId: job.id ?? "unknown",
        queue: job.queueName,
        data: job.data,
        error: error.message,
        failedAt: new Date(),
      });

      // Alert admin
      await alertAdminOfFailedJob(job, error);
    }
  });
}

async function alertAdminOfFailedJob(job: Job, error: Error) {
  // Send to error tracking service (Sentry, etc.)
  console.error("Job permanently failed:", {
    queue: job.queueName,
    name: job.name,
    id: job.id,
    error: error.message,
  });

  // Optionally send email to admin
  // Be careful not to create infinite loops!
}
```

---

## Monitoring & Debugging

### Job Stats API

```ts
// apps/api/src/routes/admin/jobs.ts
import { Router } from "express";
import { getQueues } from "@/lib/jobs";
import { requireRole } from "@/middleware/auth";

const router = Router();

// Only admins can access job monitoring
router.use(requireRole("admin"));

// Get queue stats
router.get("/stats", async (req, res) => {
  const { emailQueue, slaQueue, ticketQueue, reportQueue } = getQueues();

  const [email, sla, ticket, report] = await Promise.all([
    emailQueue.getJobCounts(),
    slaQueue.getJobCounts(),
    ticketQueue.getJobCounts(),
    reportQueue.getJobCounts(),
  ]);

  res.json({
    success: true,
    data: {
      email,
      slaCheck: sla,
      ticketActions: ticket,
      reports: report,
    },
  });
});

// Get failed jobs
router.get("/failed", async (req, res) => {
  const failed = await db.query.deadLetterJobs.findMany({
    orderBy: [desc(deadLetterJobs.failedAt)],
    limit: 50,
  });

  res.json({
    success: true,
    data: failed,
  });
});

// Retry failed job
router.post("/retry/:jobId", async (req, res) => {
  const { jobId } = req.params;

  const deadJob = await db.query.deadLetterJobs.findFirst({
    where: eq(deadLetterJobs.id, jobId),
  });

  if (!deadJob) {
    return res.status(404).json({
      success: false,
      error: "Job not found",
    });
  }

  const { emailQueue } = getQueues(); // Get appropriate queue

  // Re-enqueue the job
  await emailQueue.add("retry", deadJob.data);

  // Mark as retried
  await db
    .update(deadLetterJobs)
    .set({ retriedAt: new Date() })
    .where(eq(deadLetterJobs.id, jobId));

  res.json({
    success: true,
    message: "Job re-enqueued",
  });
});

export default router;
```

### Logging Best Practices

```ts
// apps/api/src/lib/jobs/logger.ts
import { Worker, Queue } from "bullmq";

export function setupWorkerLogging(worker: Worker) {
  // Log all job events in development
  if (process.env.NODE_ENV === "development") {
    worker.on("active", (job) => {
      console.log(`[BullMQ] Job started:`, {
        id: job.id,
        name: job.name,
        queue: job.queueName,
      });
    });

    worker.on("completed", (job) => {
      console.log(`[BullMQ] Job completed:`, {
        id: job.id,
        name: job.name,
        duration: Date.now() - job.timestamp,
      });
    });
  }

  // Always log errors
  worker.on("error", (error) => {
    console.error("[BullMQ] Worker error:", error);
  });

  worker.on("failed", (job, error) => {
    console.error("[BullMQ] Job failed:", {
      id: job?.id,
      name: job?.name,
      error: error.message,
    });
  });
}

export async function logQueueStats(queue: Queue) {
  const counts = await queue.getJobCounts();
  console.log(`[BullMQ] Queue ${queue.name} stats:`, counts);
}
```

### Health Check

```ts
// apps/api/src/routes/health.ts
import { Router } from "express";
import { getQueues } from "@/lib/jobs";

const router = Router();

router.get("/health", async (req, res) => {
  try {
    const { emailQueue, slaQueue } = getQueues();

    // Check Valkey connection via queue
    const [emailCounts, slaCounts] = await Promise.all([
      emailQueue.getJobCounts(),
      slaQueue.getJobCounts(),
    ]);

    res.json({
      status: "healthy",
      jobs: {
        connected: true,
        queues: {
          email: emailCounts,
          slaCheck: slaCounts,
        },
      },
    });
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
```

---

## Next Steps

- **11-testing.md** - Testing background jobs
- **12-devops-lite.md** - Monitoring jobs in production

---

*Solo Developer Note: Start with email notifications only. Add SLA monitoring and scheduled tasks once the basic job infrastructure is proven reliable.*
