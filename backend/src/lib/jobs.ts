import { PgBoss } from 'pg-boss';
import type { Job, SendOptions } from 'pg-boss';
import { config } from '../config';
import { logger } from './logger';
import { sendEmail } from './email';
import { db } from '../db';
import { tickets, users, userOrganizations } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { broadcastTicketEvent, sendNotification } from './socket';

let boss: PgBoss | null = null;

// Job types
export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
}

export interface TicketNotificationJobData {
  ticketId: string;
  action: 'created' | 'assigned' | 'updated' | 'message_added' | 'resolved' | 'closed';
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

// Job names
export const JobNames = {
  SEND_EMAIL: 'send-email',
  TICKET_NOTIFICATION: 'ticket-notification',
  SLA_CHECK: 'sla-check',
  SLA_BREACHED: 'sla-breached',
  CLEANUP_SESSIONS: 'cleanup-sessions',
  GENERATE_REPORTS: 'generate-reports',
} as const;

/**
 * Initialize pg-boss
 */
export async function initializeJobQueue(): Promise<PgBoss> {
  boss = new PgBoss({
    connectionString: config.DATABASE_URL,
    monitorIntervalSeconds: 60,
  });

  boss.on('error', (error: Error) => {
    logger.error({ err: error }, 'pg-boss error');
  });

  boss.on('wip', (data) => {
    logger.debug({ wip: data }, 'Job queue work in progress');
  });

  await boss.start();
  logger.info('pg-boss job queue started');

  await registerJobHandlers(boss);
  await scheduleRecurringJobs(boss);

  return boss;
}

/**
 * Register all job handlers
 */
async function registerJobHandlers(boss: PgBoss): Promise<void> {
  // Email sending job
  await boss.work<EmailJobData>(
    JobNames.SEND_EMAIL,
    { batchSize: 5, pollingIntervalSeconds: 5 },
    async (jobs: Job<EmailJobData>[]) => {
      for (const job of jobs) {
        logger.info({ jobId: job.id, to: job.data.to }, 'Processing email job');
        try {
          await sendEmail({
            to: job.data.to,
            subject: job.data.subject,
            html: job.data.html,
          });
          logger.info({ jobId: job.id }, 'Email sent successfully');
        } catch (error) {
          logger.error({ err: error, jobId: job.id }, 'Email job failed');
          throw error;
        }
      }
    }
  );

  // Ticket notification job
  await boss.work<TicketNotificationJobData>(
    JobNames.TICKET_NOTIFICATION,
    { batchSize: 5, pollingIntervalSeconds: 2 },
    async (jobs: Job<TicketNotificationJobData>[]) => {
      for (const job of jobs) {
        const { ticketId, action, actorId, recipientIds } = job.data;
        logger.info({ jobId: job.id, ticketId, action }, 'Processing notification job');

        try {
          const [ticket] = await db
            .select()
            .from(tickets)
            .where(eq(tickets.id, ticketId))
            .limit(1);

          if (!ticket) {
            logger.warn({ ticketId }, 'Ticket not found for notification');
            continue;
          }

          const [actor] = await db
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, actorId))
            .limit(1);

          const actorName = actor?.name || 'Someone';

          const notificationMessages: Record<string, { title: string; message: string }> = {
            created: {
              title: 'New Ticket Created',
              message: `${actorName} created ticket #${ticket.ticketNumber}: ${ticket.title}`,
            },
            assigned: {
              title: 'Ticket Assigned',
              message: `${actorName} assigned ticket #${ticket.ticketNumber} to you`,
            },
            updated: {
              title: 'Ticket Updated',
              message: `${actorName} updated ticket #${ticket.ticketNumber}`,
            },
            message_added: {
              title: 'New Message',
              message: `${actorName} replied to ticket #${ticket.ticketNumber}`,
            },
            resolved: {
              title: 'Ticket Resolved',
              message: `Ticket #${ticket.ticketNumber} has been resolved`,
            },
            closed: {
              title: 'Ticket Closed',
              message: `Ticket #${ticket.ticketNumber} has been closed`,
            },
          };

          const notification = notificationMessages[action];

          for (const userId of recipientIds) {
            if (userId !== actorId) {
              sendNotification({
                type: 'notification',
                userId,
                data: { ...notification, ticketId, action },
              });
            }
          }

          logger.info({ jobId: job.id }, 'Notification job completed');
        } catch (error) {
          logger.error({ err: error, jobId: job.id }, 'Notification job failed');
          throw error;
        }
      }
    }
  );

  // SLA check job
  await boss.work<SLACheckJobData>(
    JobNames.SLA_CHECK,
    { batchSize: 3, pollingIntervalSeconds: 10 },
    async (jobs: Job<SLACheckJobData>[]) => {
      for (const job of jobs) {
        const { ticketId, slaDeadline } = job.data;
        logger.info({ ticketId }, 'Processing SLA check');

        try {
          const [ticket] = await db
            .select()
            .from(tickets)
            .where(eq(tickets.id, ticketId))
            .limit(1);

          if (!ticket) {
            logger.warn({ ticketId }, 'Ticket not found for SLA check');
            continue;
          }

          const now = new Date();
          const deadline = new Date(slaDeadline);

          if (
            ticket.status !== 'closed' &&
            ticket.status !== 'resolved' &&
            now > deadline &&
            !ticket.slaBreached
          ) {
            await db
              .update(tickets)
              .set({ slaBreached: true, updatedAt: now })
              .where(eq(tickets.id, ticketId));

            await queueJob(JobNames.SLA_BREACHED, {
              ticketId,
              organizationId: ticket.organizationId,
            });

            broadcastTicketEvent({
              type: 'ticket:updated',
              ticketId,
              organizationId: ticket.organizationId,
              data: { slaBreached: true },
            });

            logger.info({ ticketId }, 'SLA breached');
          }
        } catch (error) {
          logger.error({ err: error, jobId: job.id }, 'SLA check job failed');
          throw error;
        }
      }
    }
  );

  // SLA breached notification
  await boss.work<SLABreachedJobData>(
    JobNames.SLA_BREACHED,
    { pollingIntervalSeconds: 5 },
    async (jobs: Job<SLABreachedJobData>[]) => {
      for (const job of jobs) {
        const { ticketId, organizationId } = job.data;
        logger.info({ ticketId }, 'Processing SLA breach notification');

        try {
          const [ticket] = await db
            .select()
            .from(tickets)
            .where(eq(tickets.id, ticketId))
            .limit(1);

          if (!ticket) continue;

          const notifyUserIds: string[] = [];
          if (ticket.assigneeId) {
            notifyUserIds.push(ticket.assigneeId);
          }

          const admins = await db
            .select({ userId: userOrganizations.userId })
            .from(userOrganizations)
            .where(
              and(
                eq(userOrganizations.organizationId, organizationId),
                eq(userOrganizations.role, 'admin')
              )
            );

          for (const admin of admins) {
            if (!notifyUserIds.includes(admin.userId)) {
              notifyUserIds.push(admin.userId);
            }
          }

          for (const userId of notifyUserIds) {
            sendNotification({
              type: 'notification',
              userId,
              data: {
                title: 'SLA Breach Alert',
                message: `Ticket #${ticket.ticketNumber} has breached its SLA deadline`,
                ticketId,
                action: 'sla_breached',
              },
            });
          }

          logger.info({ ticketId }, 'SLA breach notification sent');
        } catch (error) {
          logger.error({ err: error, jobId: job.id }, 'SLA breach notification failed');
          throw error;
        }
      }
    }
  );

  logger.info('Job handlers registered');
}

/**
 * Schedule recurring jobs
 */
async function scheduleRecurringJobs(boss: PgBoss): Promise<void> {
  await boss.schedule(JobNames.CLEANUP_SESSIONS, '0 * * * *', {});
  await boss.schedule(JobNames.GENERATE_REPORTS, '0 0 * * *', {});

  await boss.work(JobNames.CLEANUP_SESSIONS, async () => {
    logger.info('Running session cleanup');
  });

  await boss.work(JobNames.GENERATE_REPORTS, async () => {
    logger.info('Running daily report generation');
  });

  logger.info('Recurring jobs scheduled');
}

/**
 * Get the pg-boss instance
 */
export function getJobQueue(): PgBoss {
  if (!boss) {
    throw new Error('Job queue not initialized');
  }
  return boss;
}

/**
 * Queue a job with retry options
 */
export async function queueJob<T extends object>(
  name: string,
  data: T,
  options?: SendOptions
): Promise<string | null> {
  const queue = getJobQueue();
  return await queue.send(name, data, {
    retryLimit: 3,
    retryDelay: 60,
    ...options,
  });
}

/**
 * Queue email job
 */
export async function queueEmail(data: EmailJobData): Promise<string | null> {
  return await queueJob(JobNames.SEND_EMAIL, data, { retryLimit: 3 });
}

/**
 * Queue ticket notification job
 */
export async function queueTicketNotification(
  data: TicketNotificationJobData
): Promise<string | null> {
  return await queueJob(JobNames.TICKET_NOTIFICATION, data, { retryLimit: 2 });
}

/**
 * Schedule SLA check job
 */
export async function scheduleSLACheck(
  ticketId: string,
  slaDeadline: Date
): Promise<string | null> {
  const queue = getJobQueue();
  const now = new Date();
  const delayMs = slaDeadline.getTime() - now.getTime();

  if (delayMs <= 0) {
    return await queueJob(JobNames.SLA_CHECK, {
      ticketId,
      slaDeadline: slaDeadline.toISOString(),
    });
  }

  return await queue.send(
    JobNames.SLA_CHECK,
    { ticketId, slaDeadline: slaDeadline.toISOString() },
    { startAfter: slaDeadline }
  );
}

/**
 * Stop the job queue
 */
export async function stopJobQueue(): Promise<void> {
  if (boss) {
    await boss.stop();
    logger.info('pg-boss job queue stopped');
  }
}
