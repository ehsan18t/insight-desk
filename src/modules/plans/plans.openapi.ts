/**
 * Plans Module - OpenAPI Route Definitions
 *
 * Registers all subscription plan management endpoints with the OpenAPI registry.
 * Covers public plan listing, admin CRUD operations, and plan seeding.
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
// PLAN SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Billing interval enum
 */
const BillingIntervalSchema = z.enum(["monthly", "yearly", "lifetime"]).openapi({
  description: "Billing cycle interval for the plan",
  example: "monthly",
});

/**
 * Plan limits schema - defines usage quotas
 */
const PlanLimitsSchema = z
  .object({
    ticketsPerMonth: z.number().int().describe("Maximum tickets per month (-1 = unlimited)"),
    messagesPerMonth: z.number().int().describe("Maximum messages per month (-1 = unlimited)"),
    storagePerOrgMB: z
      .number()
      .int()
      .describe("Maximum storage in MB per organization (-1 = unlimited)"),
    apiRequestsPerMinute: z.number().int().describe("API rate limit per minute"),
    agentsPerOrg: z.number().int().describe("Maximum agents per organization (-1 = unlimited)"),
    customersPerOrg: z
      .number()
      .int()
      .describe("Maximum customers per organization (-1 = unlimited)"),
    slaEnabled: z.boolean().describe("Whether SLA management is enabled"),
    customFieldsEnabled: z.boolean().describe("Whether custom fields are enabled"),
    reportingEnabled: z.boolean().describe("Whether reporting is enabled"),
    apiAccessEnabled: z.boolean().describe("Whether API access is enabled"),
    prioritySupport: z.boolean().describe("Whether priority support is included"),
  })
  .openapi("PlanLimits");

/**
 * Plan features schema - defines available features
 */
const PlanFeaturesSchema = z
  .object({
    ticketManagement: z.boolean().describe("Basic ticket management"),
    emailChannel: z.boolean().describe("Email channel support"),
    chatWidget: z.boolean().describe("Chat widget support"),
    apiChannel: z.boolean().describe("API channel support"),
    cannedResponses: z.boolean().describe("Canned responses feature"),
    tags: z.boolean().describe("Ticket tagging"),
    categories: z.boolean().describe("Ticket categories"),
    fileAttachments: z.boolean().describe("File attachment support"),
    csatSurveys: z.boolean().describe("Customer satisfaction surveys"),
    slaManagement: z.boolean().describe("SLA policy management"),
    customFields: z.boolean().describe("Custom ticket fields"),
    analytics: z.boolean().describe("Basic analytics"),
    advancedReporting: z.boolean().describe("Advanced reporting features"),
    dataExport: z.boolean().describe("Data export functionality"),
    customBranding: z.boolean().describe("Custom branding options"),
    singleSignOn: z.boolean().describe("Single Sign-On support"),
    auditLog: z.boolean().describe("Audit log access"),
    multipleWorkspaces: z.boolean().describe("Multiple workspaces support"),
  })
  .openapi("PlanFeatures");

/**
 * Full plan schema (admin view)
 */
const PlanSchema = z
  .object({
    id: UuidSchema.describe("Plan ID"),
    name: z.string().describe("Plan display name"),
    slug: z.string().describe("URL-friendly plan identifier"),
    description: z.string().nullable().describe("Plan description"),
    price: z.number().int().describe("Price in cents"),
    currency: z.string().describe("Currency code (e.g., USD)"),
    billingInterval: BillingIntervalSchema,
    limits: PlanLimitsSchema,
    features: PlanFeaturesSchema,
    isActive: z.boolean().describe("Whether the plan is active"),
    isDefault: z.boolean().describe("Whether this is the default plan"),
    isVisible: z.boolean().describe("Whether the plan is visible to users"),
    alertsEnabled: z.boolean().describe("Whether usage alerts are enabled"),
    alertThreshold: z.number().int().describe("Usage percentage to trigger alerts"),
    position: z.number().int().describe("Display order position"),
    stripeProductId: z.string().nullable().describe("Stripe product ID"),
    stripePriceId: z.string().nullable().describe("Stripe price ID"),
    metadata: z.record(z.string(), z.unknown()).describe("Additional metadata"),
    createdAt: TimestampSchema.describe("Creation timestamp"),
    updatedAt: TimestampSchema.describe("Last update timestamp"),
  })
  .openapi("Plan");

/**
 * Public plan schema (limited fields for pricing page)
 */
const PublicPlanSchema = z
  .object({
    id: UuidSchema.describe("Plan ID"),
    name: z.string().describe("Plan display name"),
    slug: z.string().describe("URL-friendly plan identifier"),
    description: z.string().nullable().describe("Plan description"),
    price: z.number().int().describe("Price in cents"),
    currency: z.string().describe("Currency code (e.g., USD)"),
    billingInterval: BillingIntervalSchema,
    limits: PlanLimitsSchema,
    features: PlanFeaturesSchema,
    position: z.number().int().describe("Display order position"),
  })
  .openapi("PublicPlan");

/**
 * Create plan request schema
 */
const CreatePlanRequestSchema = z
  .object({
    name: z.string().min(1).max(100).describe("Plan name (1-100 characters)"),
    slug: z
      .string()
      .min(1)
      .max(50)
      .regex(/^[a-z0-9-]+$/)
      .describe("URL-friendly slug (lowercase alphanumeric with dashes)"),
    description: z.string().max(500).optional().describe("Plan description"),
    price: z.number().int().min(0).default(0).describe("Price in cents"),
    currency: z.string().length(3).default("USD").describe("Currency code"),
    billingInterval: BillingIntervalSchema.default("monthly"),
    limits: PlanLimitsSchema,
    features: PlanFeaturesSchema,
    isActive: z.boolean().default(true).describe("Whether the plan is active"),
    isDefault: z.boolean().default(false).describe("Whether this is the default plan"),
    isVisible: z.boolean().default(true).describe("Whether the plan is visible"),
    alertsEnabled: z.boolean().default(true).describe("Whether usage alerts are enabled"),
    alertThreshold: z.number().int().min(50).max(100).default(90).describe("Alert threshold"),
    position: z.number().int().min(0).default(0).describe("Display order position"),
    stripeProductId: z.string().optional().describe("Stripe product ID"),
    stripePriceId: z.string().optional().describe("Stripe price ID"),
    metadata: z.record(z.string(), z.unknown()).default({}).describe("Additional metadata"),
  })
  .openapi("CreatePlanRequest");

/**
 * Update plan request schema
 */
const UpdatePlanRequestSchema = z
  .object({
    name: z.string().min(1).max(100).optional().describe("Plan name"),
    slug: z
      .string()
      .min(1)
      .max(50)
      .regex(/^[a-z0-9-]+$/)
      .optional()
      .describe("URL-friendly slug"),
    description: z.string().max(500).optional().nullable().describe("Plan description"),
    price: z.number().int().min(0).optional().describe("Price in cents"),
    currency: z.string().length(3).optional().describe("Currency code"),
    billingInterval: BillingIntervalSchema.optional(),
    limits: PlanLimitsSchema.partial().optional().describe("Plan limits to update"),
    features: PlanFeaturesSchema.partial().optional().describe("Plan features to update"),
    isActive: z.boolean().optional().describe("Whether the plan is active"),
    isDefault: z.boolean().optional().describe("Whether this is the default plan"),
    isVisible: z.boolean().optional().describe("Whether the plan is visible"),
    alertsEnabled: z.boolean().optional().describe("Whether usage alerts are enabled"),
    alertThreshold: z.number().int().min(50).max(100).optional().describe("Alert threshold"),
    position: z.number().int().min(0).optional().describe("Display order position"),
    stripeProductId: z.string().optional().nullable().describe("Stripe product ID"),
    stripePriceId: z.string().optional().nullable().describe("Stripe price ID"),
    metadata: z.record(z.string(), z.unknown()).optional().describe("Additional metadata"),
  })
  .openapi("UpdatePlanRequest");

/**
 * List plans query parameters
 */
const ListPlansQuerySchema = z
  .object({
    includeInactive: z.string().optional().describe("Include inactive plans (true/false)"),
    includeHidden: z.string().optional().describe("Include hidden plans (true/false)"),
  })
  .openapi("ListPlansQuery");

/**
 * Plan seed response schema
 */
const PlanSeedResponseSchema = z
  .object({
    seeded: z.boolean().describe("Whether default plans were created"),
    plans: z.array(PlanSchema).describe("List of seeded/existing plans"),
  })
  .openapi("PlanSeedResponse");

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES (No authentication required)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/plans/public
registry.registerPath({
  method: "get",
  path: "/api/plans/public",
  tags: ["Plans"],
  summary: "List public plans",
  description: `
Retrieve all visible and active plans for the pricing page.

**Access Control:**
- Public endpoint - no authentication required

**Response:**
Returns a list of plans with limited fields suitable for public display.
Internal fields like Stripe IDs and metadata are excluded.
`,
  responses: {
    200: {
      description: "List of public plans",
      content: {
        "application/json": {
          schema: createDataResponseSchema(z.array(PublicPlanSchema), "PublicPlanListResponse"),
        },
      },
    },
    500: commonErrorResponses[500],
  },
});

// GET /api/plans/public/:slug
registry.registerPath({
  method: "get",
  path: "/api/plans/public/{slug}",
  tags: ["Plans"],
  summary: "Get public plan by slug",
  description: `
Retrieve a single plan by its URL-friendly slug.

**Access Control:**
- Public endpoint - no authentication required

**Response:**
Returns plan details suitable for public display.
Returns 404 if the plan is not found, inactive, or hidden.
`,
  request: {
    params: z.object({
      slug: z.string().describe("Plan slug"),
    }),
  },
  responses: {
    200: {
      description: "Public plan details",
      content: {
        "application/json": {
          schema: createDataResponseSchema(PublicPlanSchema, "PublicPlanResponse"),
        },
      },
    },
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// PROTECTED ROUTES (Requires authentication + owner role)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/plans
registry.registerPath({
  method: "get",
  path: "/api/plans",
  tags: ["Plans"],
  summary: "List all plans (admin view)",
  description: `
Retrieve all plans with full details for administrative management.

**Access Control:**
- Requires owner role

**Query Parameters:**
- \`includeInactive\`: Include inactive plans in the response
- \`includeHidden\`: Include hidden plans in the response

**Response:**
Returns complete plan information including internal fields.
`,
  security: [{ cookieAuth: [] }],
  request: {
    query: ListPlansQuerySchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "List of all plans",
      content: {
        "application/json": {
          schema: createDataResponseSchema(z.array(PlanSchema), "PlanListResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/plans/:id
registry.registerPath({
  method: "get",
  path: "/api/plans/{id}",
  tags: ["Plans"],
  summary: "Get plan by ID (admin view)",
  description: `
Retrieve a single plan by its ID with full details.

**Access Control:**
- Requires owner role

**Response:**
Returns complete plan information including internal fields.
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Plan ID"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Plan details",
      content: {
        "application/json": {
          schema: createDataResponseSchema(PlanSchema, "PlanResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// POST /api/plans
registry.registerPath({
  method: "post",
  path: "/api/plans",
  tags: ["Plans"],
  summary: "Create a new plan",
  description: `
Create a new subscription plan.

**Access Control:**
- Requires owner role

**Validation:**
- Name is required (1-100 characters)
- Slug must be lowercase alphanumeric with dashes
- Price must be non-negative (in cents)
- Currency must be 3 characters (e.g., USD)

**Default Plan:**
If \`isDefault\` is set to true, any existing default plan will be unmarked.
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
    body: {
      content: {
        "application/json": {
          schema: CreatePlanRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Plan created successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(PlanSchema, "PlanCreatedResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    409: commonErrorResponses[409],
    500: commonErrorResponses[500],
  },
});

// PATCH /api/plans/:id
registry.registerPath({
  method: "patch",
  path: "/api/plans/{id}",
  tags: ["Plans"],
  summary: "Update a plan",
  description: `
Update an existing subscription plan.

**Access Control:**
- Requires owner role

**Partial Updates:**
Only the fields provided will be updated. Omitted fields remain unchanged.

**Notes:**
- Changing limits/features affects new subscriptions immediately
- Existing subscriptions may need to be refreshed to apply changes
- Setting \`isDefault\` to true will unmark any other default plan
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Plan ID"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdatePlanRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Plan updated successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(PlanSchema, "PlanUpdatedResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    409: commonErrorResponses[409],
    500: commonErrorResponses[500],
  },
});

// DELETE /api/plans/:id
registry.registerPath({
  method: "delete",
  path: "/api/plans/{id}",
  tags: ["Plans"],
  summary: "Delete a plan",
  description: `
Delete a subscription plan.

**Access Control:**
- Requires owner role

**Restrictions:**
- Cannot delete a plan that has active subscriptions
- Consider deactivating the plan instead of deleting

**Note:**
This action is irreversible. Make sure no organizations are using this plan before deletion.
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Plan ID"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Plan deleted successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(
            z.object({ message: z.string() }),
            "PlanDeletedResponse",
          ),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    409: commonErrorResponses[409],
    500: commonErrorResponses[500],
  },
});

// POST /api/plans/seed
registry.registerPath({
  method: "post",
  path: "/api/plans/seed",
  tags: ["Plans"],
  summary: "Seed default plans",
  description: `
Initialize the system with default subscription plans.

**Access Control:**
- Requires owner role

**Behavior:**
- Creates default Free, Starter, Professional, and Enterprise plans if none exist
- Returns 200 with existing plans if plans already exist
- Returns 201 if new plans were created

**Use Cases:**
- Initial system setup
- Development environment initialization
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Plans already exist",
      content: {
        "application/json": {
          schema: createDataResponseSchema(PlanSeedResponseSchema, "PlanSeedExistingResponse"),
        },
      },
    },
    201: {
      description: "Default plans created successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(PlanSeedResponseSchema, "PlanSeedCreatedResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});
