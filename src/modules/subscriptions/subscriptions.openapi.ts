/**
 * Subscriptions Module - OpenAPI Route Definitions
 *
 * Registers all subscription and usage management endpoints with the OpenAPI registry.
 * Covers subscription status, usage tracking, plan changes, and subscription lifecycle.
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
// SUBSCRIPTION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Subscription status enum
 */
const SubscriptionStatusSchema = z
  .enum(["active", "canceled", "past_due", "trialing", "paused"])
  .openapi({
    description: "Current subscription status",
    example: "active",
  });

/**
 * Usage type enum
 */
const UsageTypeSchema = z.enum(["tickets", "messages", "storage", "api"]).openapi({
  description: "Type of usage metric",
  example: "tickets",
});

/**
 * Plan summary schema (for subscription responses)
 */
const PlanSummarySchema = z
  .object({
    id: UuidSchema.describe("Plan ID"),
    name: z.string().describe("Plan display name"),
    slug: z.string().describe("URL-friendly plan identifier"),
  })
  .openapi("PlanSummary");

/**
 * Plan limits schema
 */
const PlanLimitsSchema = z
  .object({
    ticketsPerMonth: z.int().describe("Maximum tickets per month"),
    messagesPerMonth: z.int().describe("Maximum messages per month"),
    storagePerOrgMB: z.int().describe("Maximum storage in MB"),
    apiRequestsPerMinute: z.int().describe("API rate limit per minute"),
    agentsPerOrg: z.int().describe("Maximum agents per organization"),
    customersPerOrg: z.int().describe("Maximum customers per organization"),
    slaEnabled: z.boolean().describe("Whether SLA management is enabled"),
    customFieldsEnabled: z.boolean().describe("Whether custom fields are enabled"),
    reportingEnabled: z.boolean().describe("Whether reporting is enabled"),
    apiAccessEnabled: z.boolean().describe("Whether API access is enabled"),
    prioritySupport: z.boolean().describe("Whether priority support is included"),
  })
  .openapi("SubscriptionPlanLimits");

/**
 * Full plan schema for subscription responses
 */
const SubscriptionPlanSchema = z
  .object({
    id: UuidSchema.describe("Plan ID"),
    name: z.string().describe("Plan display name"),
    slug: z.string().describe("URL-friendly plan identifier"),
    limits: PlanLimitsSchema,
    alertsEnabled: z.boolean().describe("Whether usage alerts are enabled"),
    alertThreshold: z.int().describe("Usage percentage to trigger alerts"),
  })
  .openapi("SubscriptionPlan");

/**
 * Subscription schema
 */
const SubscriptionSchema = z
  .object({
    id: UuidSchema.describe("Subscription ID"),
    organizationId: UuidSchema.describe("Organization ID"),
    plan: SubscriptionPlanSchema,
    status: SubscriptionStatusSchema,
    currentPeriodStart: TimestampSchema.describe("Current billing period start"),
    currentPeriodEnd: TimestampSchema.describe("Current billing period end"),
    cancelAtPeriodEnd: z.boolean().describe("Whether subscription will cancel at period end"),
    canceledAt: TimestampSchema.nullable().describe("Cancellation timestamp"),
    createdAt: TimestampSchema.describe("Creation timestamp"),
    updatedAt: TimestampSchema.describe("Last update timestamp"),
  })
  .openapi("Subscription");

/**
 * Usage metric schema
 */
const UsageMetricSchema = z
  .object({
    used: z.int().describe("Amount used"),
    limit: z.int().describe("Maximum allowed (-1 = unlimited)"),
    remaining: z.int().describe("Remaining amount"),
    percentUsed: z.number().describe("Percentage of limit used"),
  })
  .openapi("UsageMetric");

/**
 * Storage usage metric schema
 */
const StorageUsageSchema = z
  .object({
    usedMB: z.number().describe("Storage used in MB"),
    limitMB: z.int().describe("Storage limit in MB"),
    remainingMB: z.number().describe("Remaining storage in MB"),
    percentUsed: z.number().describe("Percentage of storage used"),
  })
  .openapi("StorageUsage");

/**
 * API usage metric schema
 */
const ApiUsageSchema = z
  .object({
    count: z.int().describe("Current request count"),
    rateLimit: z.int().describe("Rate limit per minute"),
  })
  .openapi("ApiUsage");

/**
 * Full usage data schema
 */
const UsageDataSchema = z
  .object({
    tickets: UsageMetricSchema,
    messages: UsageMetricSchema,
    storage: StorageUsageSchema,
    apiRequests: ApiUsageSchema,
    periodStart: TimestampSchema.describe("Usage period start"),
    periodEnd: TimestampSchema.describe("Usage period end"),
  })
  .openapi("UsageData");

/**
 * Usage response schema
 */
const UsageResponseSchema = z
  .object({
    plan: PlanSummarySchema,
    usage: UsageDataSchema.nullable(),
    alertsEnabled: z.boolean().describe("Whether usage alerts are enabled"),
    alertThreshold: z.int().describe("Usage percentage to trigger alerts"),
  })
  .openapi("UsageResponse");

/**
 * Usage history entry schema
 */
const UsageHistoryEntrySchema = z
  .object({
    id: UuidSchema.describe("Usage record ID"),
    organizationId: UuidSchema.describe("Organization ID"),
    periodStart: TimestampSchema.describe("Period start date"),
    periodEnd: TimestampSchema.describe("Period end date"),
    ticketsCreated: z.int().describe("Tickets created in period"),
    messagesCreated: z.int().describe("Messages created in period"),
    storageUsedMB: z.number().describe("Storage used in MB"),
    apiRequestsCount: z.int().describe("API requests made"),
    createdAt: TimestampSchema.describe("Record creation timestamp"),
    updatedAt: TimestampSchema.describe("Record update timestamp"),
  })
  .openapi("UsageHistoryEntry");

/**
 * Limit check result schema
 */
const LimitCheckResultSchema = z
  .object({
    allowed: z.boolean().describe("Whether the action is allowed"),
    usageType: UsageTypeSchema,
    current: z.int().describe("Current usage"),
    limit: z.int().describe("Maximum allowed"),
    remaining: z.int().describe("Remaining amount"),
    percentUsed: z.number().describe("Percentage used"),
    shouldAlert: z.boolean().describe("Whether alert threshold is exceeded"),
    upgradeUrl: z.string().optional().describe("URL to upgrade plan"),
  })
  .openapi("LimitCheckResult");

/**
 * Change plan request schema
 */
const ChangePlanRequestSchema = z
  .object({
    planId: UuidSchema.describe("ID of the plan to switch to"),
  })
  .openapi("ChangePlanRequest");

/**
 * Change plan response schema
 */
const ChangePlanResponseSchema = z
  .object({
    subscription: SubscriptionSchema,
    isUpgrade: z.boolean().describe("Whether this was an upgrade"),
    message: z.string().describe("Success message"),
  })
  .openapi("ChangePlanResponse");

/**
 * Cancel subscription request schema
 */
const CancelSubscriptionRequestSchema = z
  .object({
    immediately: z.boolean().optional().describe("Cancel immediately vs at period end"),
  })
  .openapi("CancelSubscriptionRequest");

/**
 * Cancel subscription response schema
 */
const CancelSubscriptionResponseSchema = z
  .object({
    subscription: SubscriptionSchema,
    message: z.string().describe("Cancellation message"),
  })
  .openapi("CancelSubscriptionResponse");

/**
 * Reactivate subscription response schema
 */
const ReactivateSubscriptionResponseSchema = z
  .object({
    subscription: SubscriptionSchema,
    message: z.string().describe("Reactivation message"),
  })
  .openapi("ReactivateSubscriptionResponse");

/**
 * Usage query parameters schema
 */
const UsageQueryParamsSchema = z
  .object({
    periodStart: z.iso.datetime().optional().describe("Filter from date (ISO 8601)"),
    periodEnd: z.iso.datetime().optional().describe("Filter to date (ISO 8601)"),
  })
  .openapi("UsageQueryParams");

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/subscriptions/current
registry.registerPath({
  method: "get",
  path: "/api/subscriptions/current",
  tags: ["Subscriptions"],
  summary: "Get current subscription",
  description: `
Retrieve the current subscription for the organization.

**Access Control:**
- Requires authentication (any role)

**Response:**
Returns the complete subscription details including:
- Plan information and limits
- Subscription status
- Billing period dates
- Cancellation status
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Current subscription details",
      content: {
        "application/json": {
          schema: createDataResponseSchema(SubscriptionSchema, "CurrentSubscriptionResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// GET /api/subscriptions/usage
registry.registerPath({
  method: "get",
  path: "/api/subscriptions/usage",
  tags: ["Subscriptions"],
  summary: "Get current usage",
  description: `
Retrieve current usage statistics for the organization.

**Access Control:**
- Requires authentication (any role)

**Response:**
Returns usage data for all tracked metrics:
- Tickets created this period
- Messages sent this period
- Storage used
- API requests made

Each metric includes the current value, limit, remaining, and percentage used.
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Current usage statistics",
      content: {
        "application/json": {
          schema: createDataResponseSchema(UsageResponseSchema, "UsageStatsResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// GET /api/subscriptions/usage/history
registry.registerPath({
  method: "get",
  path: "/api/subscriptions/usage/history",
  tags: ["Subscriptions"],
  summary: "Get usage history",
  description: `
Retrieve historical usage data for the organization.

**Access Control:**
- Requires admin or owner role

**Query Parameters:**
- \`periodStart\`: Filter records from this date (ISO 8601)
- \`periodEnd\`: Filter records until this date (ISO 8601)

**Response:**
Returns a list of usage records for past billing periods.
`,
  security: [{ cookieAuth: [] }],
  request: {
    query: UsageQueryParamsSchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Usage history records",
      content: {
        "application/json": {
          schema: createDataResponseSchema(
            z.array(UsageHistoryEntrySchema),
            "UsageHistoryResponse",
          ),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/subscriptions/limits/:type
registry.registerPath({
  method: "get",
  path: "/api/subscriptions/limits/{type}",
  tags: ["Subscriptions"],
  summary: "Check specific limit",
  description: `
Check if a specific usage type is within limits.

**Access Control:**
- Requires authentication (any role)

**Path Parameters:**
- \`type\`: The usage type to check (tickets, messages, storage, api)

**Response:**
Returns detailed limit information including:
- Whether the action is allowed
- Current usage and limit
- Remaining capacity
- Alert status
- Upgrade URL if limit is reached
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      type: UsageTypeSchema.describe("Usage type to check"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Limit check result",
      content: {
        "application/json": {
          schema: createDataResponseSchema(LimitCheckResultSchema, "LimitCheckResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// POST /api/subscriptions/change-plan
registry.registerPath({
  method: "post",
  path: "/api/subscriptions/change-plan",
  tags: ["Subscriptions"],
  summary: "Change subscription plan",
  description: `
Change the organization's subscription to a different plan.

**Access Control:**
- Requires owner role

**Request Body:**
- \`planId\`: UUID of the plan to switch to

**Behavior:**
- Upgrades take effect immediately
- Downgrades may take effect at the end of the billing period
- Usage limits are updated according to the new plan

**Note:**
Changing plans may affect billing. Review the plan details before confirming.
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
    body: {
      content: {
        "application/json": {
          schema: ChangePlanRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Plan changed successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(ChangePlanResponseSchema, "ChangePlanSuccessResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// POST /api/subscriptions/cancel
registry.registerPath({
  method: "post",
  path: "/api/subscriptions/cancel",
  tags: ["Subscriptions"],
  summary: "Cancel subscription",
  description: `
Cancel the organization's subscription.

**Access Control:**
- Requires owner role

**Request Body:**
- \`immediately\`: If true, cancels immediately. If false/omitted, cancels at period end.

**Behavior:**
- Immediate cancellation stops access immediately
- End-of-period cancellation allows continued access until the billing period ends
- Canceled subscriptions can be reactivated before the cancellation takes effect
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
    body: {
      content: {
        "application/json": {
          schema: CancelSubscriptionRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Subscription canceled",
      content: {
        "application/json": {
          schema: createDataResponseSchema(
            CancelSubscriptionResponseSchema,
            "CancelSubscriptionSuccessResponse",
          ),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// POST /api/subscriptions/reactivate
registry.registerPath({
  method: "post",
  path: "/api/subscriptions/reactivate",
  tags: ["Subscriptions"],
  summary: "Reactivate canceled subscription",
  description: `
Reactivate a subscription that was scheduled for cancellation.

**Access Control:**
- Requires owner role

**Behavior:**
- Only works for subscriptions canceled at period end
- Removes the pending cancellation
- Subscription continues as normal

**Note:**
Cannot reactivate immediately canceled subscriptions.
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Subscription reactivated",
      content: {
        "application/json": {
          schema: createDataResponseSchema(
            ReactivateSubscriptionResponseSchema,
            "ReactivateSubscriptionSuccessResponse",
          ),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});
