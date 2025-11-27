# Background Jobs

> pg-boss patterns for async task processing

## Table of Contents

1. [Overview](#overview)
2. [pg-boss Setup](#pg-boss-setup)
3. [Job Definitions](#job-definitions)
4. [Email Jobs](#email-jobs)
5. [SLA Monitoring](#sla-monitoring)
6. [Scheduled Tasks](#scheduled-tasks)
7. [Error Handling](#error-handling)
8. [Monitoring & Debugging](#monitoring--debugging)

---

## Overview

### Why pg-boss?

| Feature         | pg-boss                 | BullMQ           |
| --------------- | ----------------------- | ---------------- |
| Infrastructure  | Uses PostgreSQL         | Requires Redis   |
| ACID compliance | ✅ Yes                   | ❌ No             |
| Scheduling      | ✅ Built-in              | ✅ Built-in       |
| Retries         | ✅ Configurable          | ✅ Configurable   |
| Priorities      | ✅ Yes                   | ✅ Yes            |
| Maintenance     | None (uses existing DB) | Redis management |

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
│  │  Enqueue    │    │   Workers   │    │  Scheduled  │        │
│  │    Jobs     │    │  (Process)  │    │    Jobs     │        │
│  └──────┬──────┘    └──────▲──────┘    └──────┬──────┘        │
│         │                  │                   │               │
│         ▼                  │                   ▼               │
│  ┌─────────────────────────┴───────────────────────────┐      │
│  │                    pg-boss                          │      │
│  │            (Job Queue in PostgreSQL)                │      │
│  └─────────────────────────┬───────────────────────────┘      │
│                            │                                   │
└────────────────────────────┼───────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       PostgreSQL                                │
│                                                                 │
│  pgboss.job  │  pgboss.schedule  │  pgboss.archive             │
└─────────────────────────────────────────────────────────────────┘
```

---

## pg-boss Setup

### Installation

```bash
bun add pg-boss
```

### Configuration

```ts
// apps/api/src/lib/jobs/boss.ts
import PgBoss from "pg-boss";

let boss: PgBoss;

export async function initializeJobQueue(): Promise<PgBoss> {
  boss = new PgBoss({
    connectionString: process.env.DATABASE_URL,

    // Schema for pg-boss tables
    schema: "pgboss",

    // How long to keep completed jobs (for debugging)
    archiveCompletedAfterSeconds: 60 * 60 * 24 * 7, // 7 days

    // How long to keep failed jobs
    archiveFailedAfterSeconds: 60 * 60 * 24 * 30, // 30 days

    // Retry configuration
    retryLimit: 3,
    retryDelay: 30, // 30 seconds between retries
    retryBackoff: true, // Exponential backoff

    // Maintenance
    deleteAfterSeconds: 60 * 60 * 24 * 14, // Delete archived after 14 days
    maintenanceIntervalSeconds: 60 * 5, // Run maintenance every 5 minutes

    // Monitoring
    monitorStateIntervalSeconds: 30,
  });

  // Error handling
  boss.on("error", (error) => {
    console.error("pg-boss error:", error);
  });

  boss.on("monitor-states", (states) => {
    console.log("Job queue states:", states);
  });

  await boss.start();

  console.log("pg-boss started");

  return boss;
}

export function getBoss(): PgBoss {
  if (!boss) {
    throw new Error("pg-boss not initialized");
  }
  return boss;
}

export async function stopJobQueue(): Promise<void> {
  if (boss) {
    await boss.stop();
    console.log("pg-boss stopped");
  }
}
```

### Starting Workers

```ts
// apps/api/src/lib/jobs/workers.ts
import { getBoss } from "./boss";
import { emailWorker } from "./workers/email";
import { slaWorker } from "./workers/sla";
import { ticketWorker } from "./workers/ticket";
import { reportWorker } from "./workers/report";

export async function startWorkers(): Promise<void> {
  const boss = getBoss();

  // Register all workers
  await Promise.all([
    emailWorker.register(boss),
    slaWorker.register(boss),
    ticketWorker.register(boss),
    reportWorker.register(boss),
  ]);

  console.log("All workers registered");
}
```

### Express Integration

```ts
// apps/api/src/index.ts
import express from "express";
import { initializeJobQueue, stopJobQueue } from "@/lib/jobs/boss";
import { startWorkers } from "@/lib/jobs/workers";
import { scheduleRecurringJobs } from "@/lib/jobs/schedules";

const app = express();

// Initialize job queue and workers
async function bootstrap() {
  // Start pg-boss
  await initializeJobQueue();

  // Register workers
  await startWorkers();

  // Schedule recurring jobs
  await scheduleRecurringJobs();

  // Start Express server
  const PORT = process.env.PORT || 4000;
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
import PgBoss from "pg-boss";
import { QUEUES } from "../queues";
import { sendEmail } from "@/lib/email";
import type { SendEmailJob, WelcomeEmailJob, TicketNotificationJob } from "../types";

export const emailWorker = {
  async register(boss: PgBoss): Promise<void> {
    // Generic email sending
    await boss.work<SendEmailJob>(
      QUEUES.EMAIL,
      { teamSize: 5, teamConcurrency: 2 },
      async (job) => {
        console.log(`Processing email job: ${job.id}`);

        await sendEmail({
          to: job.data.to,
          subject: job.data.subject,
          template: job.data.template,
          data: job.data.data,
        });

        console.log(`Email sent to ${job.data.to}`);
      }
    );

    // Welcome email (specific handler)
    await boss.work<WelcomeEmailJob>(
      `${QUEUES.EMAIL}-welcome`,
      async (job) => {
        await sendEmail({
          to: job.data.email,
          subject: "Welcome to InsightDesk!",
          template: "welcome",
          data: {
            name: job.data.name,
            userId: job.data.userId,
          },
        });
      }
    );

    // Ticket notifications
    await boss.work<TicketNotificationJob>(
      `${QUEUES.EMAIL}-ticket-notification`,
      { teamSize: 10, teamConcurrency: 5 },
      async (job) => {
        await handleTicketNotification(job.data);
      }
    );

    console.log("Email workers registered");
  },
};

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
import PgBoss from "pg-boss";
import { QUEUES } from "../queues";
import { db } from "@/db";
import { tickets, slaConfigs, slaBreaches } from "@/db/schema";
import { eq, and, lt, isNull } from "drizzle-orm";
import type { SlaCheckJob, SlaBreach } from "../types";

export const slaWorker = {
  async register(boss: PgBoss): Promise<void> {
    // Process SLA checks
    await boss.work<SlaCheckJob>(
      QUEUES.SLA_CHECK,
      { teamSize: 5 },
      async (job) => {
        await checkTicketSla(job.data);
      }
    );

    // Schedule recurring SLA check (every 5 minutes)
    await boss.schedule(
      `${QUEUES.SLA_CHECK}-scan`,
      "*/5 * * * *", // Every 5 minutes
      {}
    );

    // Worker for scheduled scan
    await boss.work(`${QUEUES.SLA_CHECK}-scan`, async () => {
      await scanAllTicketsForSlaBreaches();
    });

    console.log("SLA workers registered");
  },
};

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
      const boss = getBoss();
      await boss.send(QUEUES.SLA_CHECK, {
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
import PgBoss from "pg-boss";
import { QUEUES } from "../queues";
import { db } from "@/db";
import { tickets } from "@/db/schema";
import { eq, and, lt } from "drizzle-orm";

const AUTO_CLOSE_DAYS = 7; // Close resolved tickets after 7 days

export const ticketWorker = {
  async register(boss: PgBoss): Promise<void> {
    // Handle scheduled auto-close
    await boss.work(
      QUEUES.TICKET_ACTIONS,
      async (job) => {
        if (job.data.action === "auto-close") {
          await autoCloseResolvedTickets();
        }
      }
    );

    // Handle individual ticket auto-close
    await boss.work<AutoCloseTicketJob>(
      `${QUEUES.TICKET_ACTIONS}-auto-close`,
      async (job) => {
        await closeTicket(job.data.ticketId, job.data.reason);
      }
    );

    console.log("Ticket workers registered");
  },
};

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
import PgBoss from "pg-boss";
import { QUEUES } from "../queues";
import { db } from "@/db";
import type { DailyDigestJob, ExportReportJob } from "../types";

export const reportWorker = {
  async register(boss: PgBoss): Promise<void> {
    // Handle scheduled reports
    await boss.work(QUEUES.REPORTS, async (job) => {
      switch (job.data.type) {
        case "daily-digest":
          await generateDailyDigests();
          break;
        case "weekly-report":
          await generateWeeklyReports();
          break;
      }
    });

    // Handle specific digest
    await boss.work<DailyDigestJob>(
      `${QUEUES.REPORTS}-daily-digest`,
      async (job) => {
        await sendDailyDigest(job.data);
      }
    );

    // Handle export requests
    await boss.work<ExportReportJob>(
      `${QUEUES.REPORTS}-export`,
      { teamConcurrency: 2 },
      async (job) => {
        await generateExportReport(job.data);
      }
    );

    console.log("Report workers registered");
  },
};

async function generateDailyDigests() {
  // Get all organizations with active agents
  const organizations = await db.query.organizations.findMany({
    where: eq(organizations.isActive, true),
  });

  const boss = getBoss();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  for (const org of organizations) {
    await boss.send(`${QUEUES.REPORTS}-daily-digest`, {
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
import type { SendOptions } from "pg-boss";

// Default job options by priority
export const jobOptions = {
  high: {
    retryLimit: 5,
    retryDelay: 30, // 30 seconds
    retryBackoff: true,
    priority: 1,
  } satisfies SendOptions,

  medium: {
    retryLimit: 3,
    retryDelay: 60, // 1 minute
    retryBackoff: true,
    priority: 5,
  } satisfies SendOptions,

  low: {
    retryLimit: 2,
    retryDelay: 300, // 5 minutes
    retryBackoff: true,
    priority: 10,
  } satisfies SendOptions,
};

// Custom options for specific job types
export const emailJobOptions: SendOptions = {
  ...jobOptions.high,
  expireInMinutes: 60, // Expire after 1 hour
};

export const reportJobOptions: SendOptions = {
  ...jobOptions.low,
  expireInMinutes: 60 * 4, // 4 hours for large reports
};
```

### Error Handler Wrapper

```ts
// apps/api/src/lib/jobs/error-handler.ts
import PgBoss from "pg-boss";

interface JobError extends Error {
  jobId?: string;
  queue?: string;
  attempt?: number;
}

export function createJobHandler<T>(
  handler: (data: T) => Promise<void>
): PgBoss.WorkHandler<T> {
  return async (job) => {
    const startTime = Date.now();

    try {
      console.log(`[Job ${job.id}] Starting (attempt ${job.retrycount + 1})`);

      await handler(job.data);

      console.log(
        `[Job ${job.id}] Completed in ${Date.now() - startTime}ms`
      );
    } catch (error) {
      const jobError = error as JobError;
      jobError.jobId = job.id;
      jobError.queue = job.name;
      jobError.attempt = job.retrycount + 1;

      console.error(
        `[Job ${job.id}] Failed on attempt ${job.retrycount + 1}:`,
        error
      );

      // Re-throw to trigger retry
      throw jobError;
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
import { getBoss } from "./boss";
import { QUEUES } from "./queues";

export async function setupDeadLetterHandling() {
  const boss = getBoss();

  // Monitor failed jobs
  boss.onComplete(QUEUES.EMAIL, async (job) => {
    if (job.failed) {
      console.error(`Email job failed permanently:`, {
        id: job.id,
        data: job.data,
        error: job.output,
      });

      // Store in dead letter table for manual review
      await db.insert(deadLetterJobs).values({
        originalJobId: job.id,
        queue: QUEUES.EMAIL,
        data: job.data,
        error: job.output,
        failedAt: new Date(),
      });

      // Alert admin
      await alertAdminOfFailedJob(job);
    }
  });
}

async function alertAdminOfFailedJob(job: any) {
  // Send to error tracking service (Sentry, etc.)
  console.error("Job permanently failed:", job);

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
import { getBoss } from "@/lib/jobs/boss";
import { requireRole } from "@/middleware/auth";

const router = Router();

// Only admins can access job monitoring
router.use(requireRole("admin"));

// Get queue stats
router.get("/stats", async (req, res) => {
  const boss = getBoss();

  const stats = await Promise.all([
    boss.getQueueSize("email"),
    boss.getQueueSize("sla-check"),
    boss.getQueueSize("ticket-actions"),
    boss.getQueueSize("reports"),
  ]);

  res.json({
    success: true,
    data: {
      email: stats[0],
      slaCheck: stats[1],
      ticketActions: stats[2],
      reports: stats[3],
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

  const boss = getBoss();

  // Re-enqueue the job
  await boss.send(deadJob.queue, deadJob.data);

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
import { getBoss } from "./boss";

export function setupJobLogging() {
  const boss = getBoss();

  // Log all job events in development
  if (process.env.NODE_ENV === "development") {
    boss.on("job", (job) => {
      console.log(`[pg-boss] Job event:`, {
        id: job.id,
        name: job.name,
        state: job.state,
      });
    });
  }

  // Always log errors
  boss.on("error", (error) => {
    console.error("[pg-boss] Error:", error);
  });

  // Log maintenance stats
  boss.on("maintenance", (data) => {
    console.log("[pg-boss] Maintenance completed:", data);
  });

  // Log queue states periodically
  boss.on("monitor-states", (states) => {
    const summary = Object.entries(states).map(([queue, counts]) => ({
      queue,
      ...counts,
    }));

    console.log("[pg-boss] Queue states:", summary);
  });
}
```

### Health Check

```ts
// apps/api/src/routes/health.ts
import { Router } from "express";
import { getBoss } from "@/lib/jobs/boss";

const router = Router();

router.get("/health", async (req, res) => {
  try {
    const boss = getBoss();

    // Check if pg-boss is connected
    const isConnected = boss.isConnected;

    if (!isConnected) {
      return res.status(503).json({
        status: "unhealthy",
        jobs: "disconnected",
      });
    }

    // Get queue depths
    const emailQueueSize = await boss.getQueueSize("email");
    const slaQueueSize = await boss.getQueueSize("sla-check");

    res.json({
      status: "healthy",
      jobs: {
        connected: true,
        queues: {
          email: emailQueueSize,
          slaCheck: slaQueueSize,
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
