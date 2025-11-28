/**
 * CSAT Module - OpenAPI Route Definitions
 *
 * Registers all CSAT (Customer Satisfaction) survey endpoints with the OpenAPI registry.
 * Covers survey submission, listing, statistics, and agent performance metrics.
 */

import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "@/lib/openapi";
import {
  createDataResponseSchema,
  createPaginatedResponseSchema,
  commonErrorResponses,
  UuidSchema,
  TimestampSchema,
} from "@/lib/openapi/responses";

extendZodWithOpenApi(z);

// ═══════════════════════════════════════════════════════════════════════════
// CSAT SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CSAT Survey base schema
 */
const CSATSurveySchema = z
  .object({
    id: UuidSchema.describe("Survey ID"),
    ticketId: UuidSchema.describe("Associated ticket ID"),
    token: z.string().describe("Unique access token for survey"),
    rating: z.int().min(1).max(5).nullable().describe("Customer rating (1-5)"),
    feedback: z.string().nullable().describe("Optional customer feedback"),
    respondedAt: TimestampSchema.nullable().describe("Response timestamp"),
    expiresAt: TimestampSchema.describe("Survey expiration timestamp"),
    organizationId: UuidSchema.describe("Organization ID"),
    createdAt: TimestampSchema.describe("Creation timestamp"),
  })
  .openapi("CSATSurvey");

/**
 * CSAT Survey for public token access (minimal data)
 */
const CSATSurveyPublicSchema = z
  .object({
    id: UuidSchema.describe("Survey ID"),
    ticketTitle: z.string().describe("Ticket title"),
    ticketNumber: z.string().describe("Ticket number"),
    rating: z.int().min(1).max(5).nullable().describe("Current rating if submitted"),
    feedback: z.string().nullable().describe("Current feedback if submitted"),
    respondedAt: TimestampSchema.nullable().describe("Response timestamp"),
    expiresAt: TimestampSchema.describe("Survey expiration timestamp"),
    expired: z.boolean().describe("Whether survey has expired"),
  })
  .openapi("CSATSurveyPublic");

/**
 * Submit survey request
 */
const SubmitSurveyRequestSchema = z
  .object({
    rating: z.int().min(1).max(5).describe("Customer satisfaction rating (1-5)"),
    feedback: z.string().max(2000).optional().describe("Optional feedback (max 2000 characters)"),
  })
  .openapi("SubmitSurveyRequest");

/**
 * Survey list query parameters
 */
const SurveyQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1).describe("Page number"),
    limit: z.coerce.number().int().positive().max(100).default(20).describe("Items per page"),
    agentId: UuidSchema.optional().describe("Filter by assigned agent"),
    rating: z.coerce.number().int().min(1).max(5).optional().describe("Filter by rating"),
    dateFrom: z.iso.datetime().optional().describe("Filter from date (ISO 8601)"),
    dateTo: z.iso.datetime().optional().describe("Filter to date (ISO 8601)"),
    responded: z.string().optional().describe("Filter by response status ('true' or 'false')"),
  })
  .openapi("SurveyQuery");

/**
 * Stats query parameters
 */
const StatsQuerySchema = z
  .object({
    agentId: UuidSchema.optional().describe("Filter by agent ID"),
    dateFrom: z.iso.datetime().optional().describe("Filter from date (ISO 8601)"),
    dateTo: z.iso.datetime().optional().describe("Filter to date (ISO 8601)"),
  })
  .openapi("CSATStatsQuery");

/**
 * CSAT Statistics response
 */
const CSATStatsSchema = z
  .object({
    totalSurveys: z.int().nonnegative().describe("Total surveys sent"),
    responsesReceived: z.int().nonnegative().describe("Number of responses"),
    responseRate: z.number().min(0).max(100).describe("Response rate percentage"),
    averageRating: z.number().nullable().describe("Average rating (1-5)"),
    ratingDistribution: z
      .object({
        1: z.int().nonnegative(),
        2: z.int().nonnegative(),
        3: z.int().nonnegative(),
        4: z.int().nonnegative(),
        5: z.int().nonnegative(),
      })
      .describe("Count of each rating"),
    satisfactionScore: z.number().nullable().describe("CSAT score percentage (4-5 ratings)"),
  })
  .openapi("CSATStats");

/**
 * Agent performance stats
 */
const AgentStatsSchema = z
  .object({
    agentId: UuidSchema.describe("Agent ID"),
    agentName: z.string().describe("Agent name"),
    agentEmail: z.email().describe("Agent email"),
    totalSurveys: z.int().nonnegative().describe("Total surveys for agent"),
    responsesReceived: z.int().nonnegative().describe("Responses received"),
    averageRating: z.number().nullable().describe("Average rating"),
    satisfactionScore: z.number().nullable().describe("CSAT score percentage"),
  })
  .openapi("AgentCSATStats");

/**
 * Bulk send results
 */
const BulkSendResultSchema = z
  .object({
    sent: z.int().nonnegative().describe("Number of surveys sent"),
    skipped: z.int().nonnegative().describe("Number skipped (already sent or errors)"),
    errors: z.array(z.string()).describe("Error messages for failed sends"),
  })
  .openapi("BulkSendResult");

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES (Token-based access)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/csat/respond/:token
registry.registerPath({
  method: "get",
  path: "/api/csat/respond/{token}",
  tags: ["CSAT"],
  summary: "Get survey by token",
  description: `
Retrieve a CSAT survey using its unique access token.

**Access Control:**
- Public endpoint - no authentication required
- Token-based access for customers

**Response:**
Returns survey details and ticket information for the customer to respond.
`,
  request: {
    params: z.object({
      token: z.string().describe("Unique survey access token"),
    }),
  },
  responses: {
    200: {
      description: "Survey details",
      content: {
        "application/json": {
          schema: CSATSurveyPublicSchema,
        },
      },
    },
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// POST /api/csat/respond/:token
registry.registerPath({
  method: "post",
  path: "/api/csat/respond/{token}",
  tags: ["CSAT"],
  summary: "Submit survey response",
  description: `
Submit a customer satisfaction response for a survey.

**Access Control:**
- Public endpoint - no authentication required
- Token-based access for customers

**Validation:**
- Rating must be between 1 and 5
- Feedback is optional (max 2000 characters)
- Survey must not be expired
- Survey can only be submitted once
`,
  request: {
    params: z.object({
      token: z.string().describe("Unique survey access token"),
    }),
    body: {
      content: {
        "application/json": {
          schema: SubmitSurveyRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Survey response submitted successfully",
      content: {
        "application/json": {
          schema: CSATSurveyPublicSchema,
        },
      },
    },
    400: commonErrorResponses[400],
    404: commonErrorResponses[404],
    409: commonErrorResponses[409],
    500: commonErrorResponses[500],
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// PROTECTED ROUTES (Require authentication)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/csat/:organizationId
registry.registerPath({
  method: "get",
  path: "/api/csat/{organizationId}",
  tags: ["CSAT"],
  summary: "List surveys",
  description: `
Retrieve all CSAT surveys for an organization with filtering and pagination.

**Access Control:**
- Requires authentication
- Must be a member of the organization

**Filtering:**
- Filter by agent, rating, date range, or response status
- Results are paginated
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
    }),
    query: SurveyQuerySchema,
  },
  responses: {
    200: {
      description: "Paginated list of surveys",
      content: {
        "application/json": {
          schema: createPaginatedResponseSchema(CSATSurveySchema, "CSATSurveyListResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/csat/:organizationId/stats
registry.registerPath({
  method: "get",
  path: "/api/csat/{organizationId}/stats",
  tags: ["CSAT"],
  summary: "Get CSAT statistics",
  description: `
Retrieve aggregated CSAT statistics for an organization.

**Access Control:**
- Requires authentication
- Must be a member of the organization

**Statistics Included:**
- Total surveys and responses
- Response rate
- Average rating
- Rating distribution
- CSAT score (percentage of 4-5 ratings)

**Filtering:**
- Filter by date range and agent
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
    }),
    query: StatsQuerySchema,
  },
  responses: {
    200: {
      description: "CSAT statistics",
      content: {
        "application/json": {
          schema: createDataResponseSchema(CSATStatsSchema, "CSATStatsResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/csat/:organizationId/agents
registry.registerPath({
  method: "get",
  path: "/api/csat/{organizationId}/agents",
  tags: ["CSAT"],
  summary: "Get agent performance stats",
  description: `
Retrieve CSAT performance metrics grouped by agent.

**Access Control:**
- Requires authentication
- Must be a member of the organization

**Metrics Per Agent:**
- Total surveys
- Response count
- Average rating
- CSAT score

**Filtering:**
- Filter by date range
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
    }),
    query: StatsQuerySchema,
  },
  responses: {
    200: {
      description: "Agent performance statistics",
      content: {
        "application/json": {
          schema: createDataResponseSchema(z.array(AgentStatsSchema), "AgentStatsResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/csat/:organizationId/:surveyId
registry.registerPath({
  method: "get",
  path: "/api/csat/{organizationId}/{surveyId}",
  tags: ["CSAT"],
  summary: "Get single survey",
  description: `
Retrieve a single CSAT survey by ID.

**Access Control:**
- Requires authentication
- Must be a member of the organization
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
      surveyId: UuidSchema.describe("Survey ID"),
    }),
  },
  responses: {
    200: {
      description: "Survey details",
      content: {
        "application/json": {
          schema: CSATSurveySchema,
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// POST /api/csat/:organizationId/send/:ticketId
registry.registerPath({
  method: "post",
  path: "/api/csat/{organizationId}/send/{ticketId}",
  tags: ["CSAT"],
  summary: "Send survey for ticket",
  description: `
Manually trigger sending a CSAT survey for a specific ticket.

**Access Control:**
- Requires authentication
- Must be a member of the organization

**Behavior:**
- Creates a new survey for the ticket
- Sends email to customer with survey link
- Ticket should be in resolved or closed status
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
      ticketId: UuidSchema.describe("Ticket ID"),
    }),
  },
  responses: {
    201: {
      description: "Survey created and sent",
      content: {
        "application/json": {
          schema: CSATSurveySchema,
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

// POST /api/csat/:organizationId/send-bulk
registry.registerPath({
  method: "post",
  path: "/api/csat/{organizationId}/send-bulk",
  tags: ["CSAT"],
  summary: "Bulk send surveys",
  description: `
Send CSAT surveys to all eligible tickets that haven't received surveys.

**Access Control:**
- Requires authentication
- Must be a member of the organization

**Behavior:**
- Finds all resolved/closed tickets without surveys
- Creates and sends surveys for each
- Returns count of sent, skipped, and failed surveys
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Bulk send results",
      content: {
        "application/json": {
          schema: BulkSendResultSchema,
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});
