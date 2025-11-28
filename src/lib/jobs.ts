import { type Job, Queue, Worker } from "bullmq";
import { and, eq } from "drizzle-orm";
import { config } from "@/config";
import { db } from "@/db";
import { tickets, userOrganizations, users } from "@/db/schema";
import { sendEmail } from "./email";
import { createLogger } from "./logger";
import { broadcastTicketEvent, sendNotification } from "./socket";

const logger = createLogger("jobs");

// ─────────────────────────────────────────────────────────────
// BullMQ Connection Configuration
// ─────────────────────────────────────────────────────────────

// Parse Valkey URL for BullMQ connection
function parseValkeyUrl(url: string): { host: string; port: number; password?: string } {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "localhost",
      port: Number.parseInt(parsed.port, 10) || 6379,
      password: parsed.password || undefined,
    };
  } catch {
    return { host: "localhost", port: 6379 };
  }
}

const connectionConfig = {
  ...parseValkeyUrl(config.VALKEY_URL),
  maxRetriesPerRequest: null, // Required for BullMQ workers
};

// ─────────────────────────────────────────────────────────────
// Job Types
// ─────────────────────────────────────────────────────────────

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

export interface SLABreachedJobData {
  ticketId: string;
  organizationId: string;
}

// ─────────────────────────────────────────────────────────────
// Queue Names
// ─────────────────────────────────────────────────────────────

export const QueueNames = {
  EMAIL: "email",
  TICKET_NOTIFICATION: "ticket-notification",
  SLA_CHECK: "sla-check",
  SLA_BREACHED: "sla-breached",
  SCHEDULED: "scheduled",
} as const;

// ─────────────────────────────────────────────────────────────
// Queues
// ─────────────────────────────────────────────────────────────

let emailQueue: Queue<EmailJobData> | null = null;
let ticketNotificationQueue: Queue<TicketNotificationJobData> | null = null;
let slaCheckQueue: Queue<SLACheckJobData> | null = null;
let slaBreachedQueue: Queue<SLABreachedJobData> | null = null;
let scheduledQueue: Queue | null = null;

// Workers
let emailWorker: Worker<EmailJobData> | null = null;
let ticketNotificationWorker: Worker<TicketNotificationJobData> | null = null;
let slaCheckWorker: Worker<SLACheckJobData> | null = null;
let slaBreachedWorker: Worker<SLABreachedJobData> | null = null;
let scheduledWorker: Worker | null = null;

// ─────────────────────────────────────────────────────────────
// Initialize Job Queue System
// ─────────────────────────────────────────────────────────────

export async function initializeJobQueue(): Promise<void> {
  // Create queues
  emailQueue = new Queue<EmailJobData>(QueueNames.EMAIL, {
    connection: connectionConfig,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });

  ticketNotificationQueue = new Queue<TicketNotificationJobData>(QueueNames.TICKET_NOTIFICATION, {
    connection: connectionConfig,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 500 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  });

  slaCheckQueue = new Queue<SLACheckJobData>(QueueNames.SLA_CHECK, {
    connection: connectionConfig,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "fixed", delay: 5000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  });

  slaBreachedQueue = new Queue<SLABreachedJobData>(QueueNames.SLA_BREACHED, {
    connection: connectionConfig,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  });

  scheduledQueue = new Queue(QueueNames.SCHEDULED, {
    connection: connectionConfig,
    defaultJobOptions: {
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 50 },
    },
  });

  // Create workers
  await createWorkers();

  // Schedule recurring jobs
  await scheduleRecurringJobs();

  logger.info("BullMQ job queue system initialized");
}

// ─────────────────────────────────────────────────────────────
// Workers
// ─────────────────────────────────────────────────────────────

async function createWorkers(): Promise<void> {
  // Email worker
  emailWorker = new Worker<EmailJobData>(
    QueueNames.EMAIL,
    async (job: Job<EmailJobData>) => {
      logger.info({ jobId: job.id, to: job.data.to }, "Processing email job");
      await sendEmail({
        to: job.data.to,
        subject: job.data.subject,
        html: job.data.html,
      });
      logger.info({ jobId: job.id }, "Email sent successfully");
    },
    {
      connection: connectionConfig,
      concurrency: 5,
    },
  );

  emailWorker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "Email job failed");
  });

  // Ticket notification worker
  ticketNotificationWorker = new Worker<TicketNotificationJobData>(
    QueueNames.TICKET_NOTIFICATION,
    async (job: Job<TicketNotificationJobData>) => {
      const { ticketId, action, actorId, recipientIds } = job.data;
      logger.info({ jobId: job.id, ticketId, action }, "Processing notification job");

      const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);

      if (!ticket) {
        logger.warn({ ticketId }, "Ticket not found for notification");
        return;
      }

      const [actor] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, actorId))
        .limit(1);

      const actorName = actor?.name || "Someone";

      const notificationMessages: Record<string, { title: string; message: string }> = {
        created: {
          title: "New Ticket Created",
          message: `${actorName} created ticket #${ticket.ticketNumber}: ${ticket.title}`,
        },
        assigned: {
          title: "Ticket Assigned",
          message: `${actorName} assigned ticket #${ticket.ticketNumber} to you`,
        },
        updated: {
          title: "Ticket Updated",
          message: `${actorName} updated ticket #${ticket.ticketNumber}`,
        },
        message_added: {
          title: "New Message",
          message: `${actorName} replied to ticket #${ticket.ticketNumber}`,
        },
        resolved: {
          title: "Ticket Resolved",
          message: `Ticket #${ticket.ticketNumber} has been resolved`,
        },
        closed: {
          title: "Ticket Closed",
          message: `Ticket #${ticket.ticketNumber} has been closed`,
        },
      };

      const notification = notificationMessages[action];

      for (const userId of recipientIds) {
        if (userId !== actorId) {
          sendNotification({
            type: "notification",
            userId,
            data: { ...notification, ticketId, action },
          });
        }
      }

      logger.info({ jobId: job.id }, "Notification job completed");
    },
    {
      connection: connectionConfig,
      concurrency: 5,
    },
  );

  ticketNotificationWorker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "Notification job failed");
  });

  // SLA check worker
  slaCheckWorker = new Worker<SLACheckJobData>(
    QueueNames.SLA_CHECK,
    async (job: Job<SLACheckJobData>) => {
      const { ticketId, slaDeadline } = job.data;
      logger.info({ ticketId }, "Processing SLA check");

      const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);

      if (!ticket) {
        logger.warn({ ticketId }, "Ticket not found for SLA check");
        return;
      }

      const now = new Date();
      const deadline = new Date(slaDeadline);

      if (
        ticket.status !== "closed" &&
        ticket.status !== "resolved" &&
        now > deadline &&
        !ticket.slaBreached
      ) {
        await db
          .update(tickets)
          .set({ slaBreached: true, updatedAt: now })
          .where(eq(tickets.id, ticketId));

        // Queue SLA breached notification
        await queueSLABreached({
          ticketId,
          organizationId: ticket.organizationId,
        });

        broadcastTicketEvent({
          type: "ticket:updated",
          ticketId,
          organizationId: ticket.organizationId,
          data: { slaBreached: true },
        });

        logger.info({ ticketId }, "SLA breached");
      }
    },
    {
      connection: connectionConfig,
      concurrency: 3,
    },
  );

  slaCheckWorker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "SLA check job failed");
  });

  // SLA breached notification worker
  slaBreachedWorker = new Worker<SLABreachedJobData>(
    QueueNames.SLA_BREACHED,
    async (job: Job<SLABreachedJobData>) => {
      const { ticketId, organizationId } = job.data;
      logger.info({ ticketId }, "Processing SLA breach notification");

      const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);

      if (!ticket) return;

      const notifyUserIds: string[] = [];
      if (ticket.assigneeId) {
        notifyUserIds.push(ticket.assigneeId);
      }

      // Notify admins
      const admins = await db
        .select({ userId: userOrganizations.userId })
        .from(userOrganizations)
        .where(
          and(
            eq(userOrganizations.organizationId, organizationId),
            eq(userOrganizations.role, "admin"),
          ),
        );

      for (const admin of admins) {
        if (!notifyUserIds.includes(admin.userId)) {
          notifyUserIds.push(admin.userId);
        }
      }

      for (const userId of notifyUserIds) {
        sendNotification({
          type: "notification",
          userId,
          data: {
            title: "SLA Breach Alert",
            message: `Ticket #${ticket.ticketNumber} has breached its SLA deadline`,
            ticketId,
            action: "sla_breached",
          },
        });
      }

      logger.info({ ticketId }, "SLA breach notification sent");
    },
    {
      connection: connectionConfig,
      concurrency: 2,
    },
  );

  slaBreachedWorker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "SLA breach notification failed");
  });

  // Scheduled jobs worker
  scheduledWorker = new Worker(
    QueueNames.SCHEDULED,
    async (job: Job) => {
      switch (job.name) {
        case "cleanup-sessions":
          logger.info("Running session cleanup");
          // Add session cleanup logic here
          break;
        case "generate-reports":
          logger.info("Running daily report generation");
          // Add report generation logic here
          break;
        default:
          logger.warn({ jobName: job.name }, "Unknown scheduled job");
      }
    },
    {
      connection: connectionConfig,
      concurrency: 1,
    },
  );

  scheduledWorker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id, jobName: job?.name }, "Scheduled job failed");
  });

  logger.info("Workers created");
}

// ─────────────────────────────────────────────────────────────
// Recurring Jobs
// ─────────────────────────────────────────────────────────────

async function scheduleRecurringJobs(): Promise<void> {
  if (!scheduledQueue) return;

  // Session cleanup - every hour
  await scheduledQueue.upsertJobScheduler(
    "cleanup-sessions-scheduler",
    { pattern: "0 * * * *" }, // Every hour at minute 0
    { name: "cleanup-sessions", data: {} },
  );

  // Daily report generation - every day at midnight
  await scheduledQueue.upsertJobScheduler(
    "generate-reports-scheduler",
    { pattern: "0 0 * * *" }, // Every day at 00:00
    { name: "generate-reports", data: {} },
  );

  logger.info("Recurring jobs scheduled");
}

// ─────────────────────────────────────────────────────────────
// Queue Helper Functions
// ─────────────────────────────────────────────────────────────

/**
 * Queue an email job
 */
export async function queueEmail(data: EmailJobData): Promise<string | undefined> {
  if (!emailQueue) {
    throw new Error("Email queue not initialized");
  }
  const job = await emailQueue.add("send-email", data);
  return job.id;
}

/**
 * Queue a ticket notification job
 */
export async function queueTicketNotification(
  data: TicketNotificationJobData,
): Promise<string | undefined> {
  if (!ticketNotificationQueue) {
    throw new Error("Ticket notification queue not initialized");
  }
  const job = await ticketNotificationQueue.add("notify", data);
  return job.id;
}

/**
 * Schedule an SLA check job
 */
export async function scheduleSLACheck(
  ticketId: string,
  slaDeadline: Date,
): Promise<string | undefined> {
  if (!slaCheckQueue) {
    throw new Error("SLA check queue not initialized");
  }

  const now = new Date();
  const delayMs = slaDeadline.getTime() - now.getTime();

  const job = await slaCheckQueue.add(
    "sla-check",
    { ticketId, slaDeadline: slaDeadline.toISOString() },
    {
      delay: Math.max(0, delayMs), // Can't have negative delay
      jobId: `sla-${ticketId}`, // Unique job ID per ticket to avoid duplicates
    },
  );

  return job.id;
}

/**
 * Queue an SLA breached notification
 */
async function queueSLABreached(data: SLABreachedJobData): Promise<string | undefined> {
  if (!slaBreachedQueue) {
    throw new Error("SLA breached queue not initialized");
  }
  const job = await slaBreachedQueue.add("sla-breached", data);
  return job.id;
}

/**
 * Generic queue job function (for backwards compatibility)
 */
export async function queueJob<T extends object>(
  queueName: string,
  jobName: string,
  data: T,
  options?: { delay?: number; priority?: number },
): Promise<string | undefined> {
  const queue = new Queue(queueName, { connection: connectionConfig });
  const job = await queue.add(jobName, data, options);
  await queue.close();
  return job.id;
}

// ─────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────

/**
 * Stop all workers and close queues
 */
export async function stopJobQueue(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  // Close workers first
  if (emailWorker) closePromises.push(emailWorker.close());
  if (ticketNotificationWorker) closePromises.push(ticketNotificationWorker.close());
  if (slaCheckWorker) closePromises.push(slaCheckWorker.close());
  if (slaBreachedWorker) closePromises.push(slaBreachedWorker.close());
  if (scheduledWorker) closePromises.push(scheduledWorker.close());

  // Close queues
  if (emailQueue) closePromises.push(emailQueue.close());
  if (ticketNotificationQueue) closePromises.push(ticketNotificationQueue.close());
  if (slaCheckQueue) closePromises.push(slaCheckQueue.close());
  if (slaBreachedQueue) closePromises.push(slaBreachedQueue.close());
  if (scheduledQueue) closePromises.push(scheduledQueue.close());

  await Promise.all(closePromises);

  logger.info("BullMQ job queue system stopped");
}
