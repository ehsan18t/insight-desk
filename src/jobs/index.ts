/**
 * Job Scheduler
 * Runs background jobs on a schedule using node-cron
 */

import { createLogger } from "@/lib/logger";
import { autoCloseStaleTickets, getAutoClosePreview } from "./auto-close";
import { checkSlaBreaches, getSlaStats } from "./sla-breach";
import { getExpiringSubscriptions, resetExpiredSubscriptionUsage } from "./subscription-reset";

const logger = createLogger("jobs:scheduler");

interface ScheduledJob {
  name: string;
  interval: number; // in milliseconds
  lastRun: Date | null;
  isRunning: boolean;
  handler: () => Promise<void>;
}

// Job registry
const jobs: Map<string, ScheduledJob> = new Map();
const intervalIds: Map<string, NodeJS.Timeout> = new Map();

/**
 * Register a job
 */
function registerJob(name: string, intervalMs: number, handler: () => Promise<void>): void {
  jobs.set(name, {
    name,
    interval: intervalMs,
    lastRun: null,
    isRunning: false,
    handler,
  });

  logger.info({ name, intervalMs }, "Job registered");
}

/**
 * Run a job
 */
async function runJob(name: string): Promise<void> {
  const job = jobs.get(name);
  if (!job) {
    logger.error({ name }, "Job not found");
    return;
  }

  if (job.isRunning) {
    logger.warn({ name }, "Job is already running, skipping");
    return;
  }

  job.isRunning = true;
  const startTime = Date.now();

  try {
    logger.info({ name }, "Job started");
    await job.handler();
    job.lastRun = new Date();
    logger.info({ name, duration: Date.now() - startTime }, "Job completed");
  } catch (error) {
    logger.error({ name, error }, "Job failed");
  } finally {
    job.isRunning = false;
  }
}

/**
 * Start all scheduled jobs
 */
export function startScheduler(): void {
  logger.info("Starting job scheduler");

  // Register default jobs
  registerJob("sla-breach-check", 5 * 60 * 1000, async () => {
    await checkSlaBreaches();
  }); // Every 5 minutes

  registerJob("auto-close-tickets", 60 * 60 * 1000, async () => {
    await autoCloseStaleTickets();
  }); // Every hour

  registerJob("subscription-reset", 60 * 60 * 1000, async () => {
    await resetExpiredSubscriptionUsage();
  }); // Every hour

  // Start job intervals
  for (const [name, job] of jobs) {
    const intervalId = setInterval(() => runJob(name), job.interval);
    intervalIds.set(name, intervalId);
    logger.info({ name, interval: job.interval }, "Job scheduled");
  }

  // Run SLA check immediately on startup
  setTimeout(() => runJob("sla-breach-check"), 1000);
}

/**
 * Stop all scheduled jobs
 */
export function stopScheduler(): void {
  logger.info("Stopping job scheduler");

  for (const [name, intervalId] of intervalIds) {
    clearInterval(intervalId);
    logger.info({ name }, "Job stopped");
  }

  intervalIds.clear();
}

/**
 * Get job status
 */
export function getJobStatus(): Array<{
  name: string;
  interval: number;
  lastRun: Date | null;
  isRunning: boolean;
}> {
  return Array.from(jobs.values()).map((job) => ({
    name: job.name,
    interval: job.interval,
    lastRun: job.lastRun,
    isRunning: job.isRunning,
  }));
}

/**
 * Manually trigger a job
 */
export async function triggerJob(name: string): Promise<boolean> {
  const job = jobs.get(name);
  if (!job) {
    return false;
  }

  await runJob(name);
  return true;
}

// Export individual job functions for manual use
export {
  checkSlaBreaches,
  getSlaStats,
  autoCloseStaleTickets,
  getAutoClosePreview,
  resetExpiredSubscriptionUsage,
  getExpiringSubscriptions,
};
