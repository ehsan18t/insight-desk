/**
 * Jobs Module - OpenAPI Route Definitions
 *
 * Registers all background job management endpoints with the OpenAPI registry.
 * Covers job status, manual triggering, SLA statistics, and auto-close preview.
 */

import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "@/lib/openapi";
import {
  createDataResponseSchema,
  commonErrorResponses,
  UuidSchema,
  TimestampSchema,
} from "@/lib/openapi/responses";

extendZodWithOpenApi(z);

// ═══════════════════════════════════════════════════════════════════════════
// JOB SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Job info schema for individual scheduled job
 */
const JobInfoSchema = z
  .object({
    name: z.string().describe("Job name identifier"),
    schedule: z.string().describe("Cron schedule expression"),
    lastRun: TimestampSchema.nullable().describe("Timestamp of last execution"),
    nextRun: TimestampSchema.nullable().describe("Timestamp of next scheduled execution"),
    running: z.boolean().describe("Whether the job is currently running"),
  })
  .openapi("JobInfo");

/**
 * Job status response schema
 */
const JobStatusSchema = z
  .object({
    jobs: z.array(JobInfoSchema).describe("List of all scheduled jobs"),
    uptime: z.number().describe("Scheduler uptime in milliseconds"),
  })
  .openapi("JobStatus");

/**
 * Job trigger request parameters
 */
const JobTriggerParamsSchema = z
  .object({
    name: z.string().describe("Name of the job to trigger"),
  })
  .openapi("JobTriggerParams");

/**
 * Job trigger success response
 */
const JobTriggerResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string().describe("Success message"),
  })
  .openapi("JobTriggerResponse");

/**
 * SLA statistics schema
 */
const SlaStatsSchema = z
  .object({
    totalTickets: z.number().int().describe("Total tickets with SLA"),
    breachedCount: z.number().int().describe("Number of tickets that breached SLA"),
    atRiskCount: z.number().int().describe("Number of tickets at risk of breaching"),
    onTrackCount: z.number().int().describe("Number of tickets on track"),
    breachRate: z.number().describe("Percentage of tickets that breached SLA"),
    averageResponseTime: z.number().nullable().describe("Average first response time in minutes"),
    averageResolutionTime: z.number().nullable().describe("Average resolution time in minutes"),
  })
  .openapi("SlaStats");

/**
 * Auto-close preview ticket schema
 */
const AutoCloseTicketSchema = z
  .object({
    id: UuidSchema.describe("Ticket ID"),
    title: z.string().describe("Ticket title"),
    status: z.string().describe("Current ticket status"),
    lastActivityAt: TimestampSchema.describe("Timestamp of last activity"),
    daysSinceActivity: z.number().describe("Days since last activity"),
  })
  .openapi("AutoCloseTicket");

/**
 * Auto-close preview response schema
 */
const AutoClosePreviewSchema = z
  .object({
    candidateCount: z.number().int().describe("Number of tickets eligible for auto-close"),
    tickets: z.array(AutoCloseTicketSchema).describe("List of auto-close candidate tickets"),
    settings: z
      .object({
        daysInactive: z.number().int().describe("Days of inactivity before auto-close"),
        targetStatus: z.string().describe("Status to transition tickets to"),
      })
      .describe("Auto-close configuration"),
  })
  .openapi("AutoClosePreview");

// ═══════════════════════════════════════════════════════════════════════════
// JOB ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/jobs/status
registry.registerPath({
  method: "get",
  path: "/api/jobs/status",
  tags: ["Jobs"],
  summary: "Get status of all scheduled jobs",
  description: `
Retrieve the current status of all scheduled background jobs.

**Access Control:**
- Requires admin or owner role

**Response:**
Returns a list of all scheduled jobs with their:
- Schedule (cron expression)
- Last run timestamp
- Next scheduled run
- Current running state
- Scheduler uptime
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Job status information",
      content: {
        "application/json": {
          schema: createDataResponseSchema(JobStatusSchema, "JobStatusResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// POST /api/jobs/:name/trigger
registry.registerPath({
  method: "post",
  path: "/api/jobs/{name}/trigger",
  tags: ["Jobs"],
  summary: "Manually trigger a job",
  description: `
Manually trigger execution of a specific background job.

**Access Control:**
- Requires admin or owner role

**Available Jobs:**
- \`sla-breach\`: Check for SLA breaches and send notifications
- \`auto-close\`: Close inactive tickets automatically
- \`subscription-reset\`: Reset monthly usage counters

**Use Cases:**
- Testing job behavior
- Forcing immediate execution outside schedule
- Recovery after system issues
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: JobTriggerParamsSchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Job triggered successfully",
      content: {
        "application/json": {
          schema: JobTriggerResponseSchema,
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// GET /api/jobs/sla/stats
registry.registerPath({
  method: "get",
  path: "/api/jobs/sla/stats",
  tags: ["Jobs"],
  summary: "Get SLA statistics",
  description: `
Retrieve SLA compliance statistics for the organization.

**Access Control:**
- Requires admin or owner role

**Statistics Include:**
- Total tickets with SLA policies applied
- Number of breached tickets
- Number of at-risk tickets
- Number of on-track tickets
- Overall breach rate percentage
- Average first response time
- Average resolution time

**Note:**
Statistics are calculated based on tickets within the current organization.
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "SLA statistics",
      content: {
        "application/json": {
          schema: createDataResponseSchema(SlaStatsSchema, "SlaStatsResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/jobs/auto-close/preview
registry.registerPath({
  method: "get",
  path: "/api/jobs/auto-close/preview",
  tags: ["Jobs"],
  summary: "Preview auto-close candidates",
  description: `
Preview tickets that would be affected by the auto-close job.

**Access Control:**
- Requires admin or owner role

**Response:**
Returns a list of tickets that meet the auto-close criteria:
- Have been inactive for the configured number of days
- Are in an eligible status for auto-close

**Use Cases:**
- Reviewing tickets before they are automatically closed
- Adjusting auto-close settings based on preview
- Identifying tickets that may need attention
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Auto-close preview",
      content: {
        "application/json": {
          schema: createDataResponseSchema(AutoClosePreviewSchema, "AutoClosePreviewResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});
