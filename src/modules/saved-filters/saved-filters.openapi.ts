/**
 * Saved Filters Module - OpenAPI Route Definitions
 *
 * Registers all saved filter management endpoints with the OpenAPI registry.
 * Covers CRUD operations, reordering, duplicating, and default filter management.
 */

import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "@/lib/openapi";
import {
  createDataResponseSchema,
  commonErrorResponses,
  UuidSchema,
  TimestampSchema,
  TicketStatusSchema,
  TicketPrioritySchema,
} from "@/lib/openapi/responses";

extendZodWithOpenApi(z);

// ═══════════════════════════════════════════════════════════════════════════
// SAVED FILTER SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Date range for filter criteria
 */
const DateRangeSchema = z
  .object({
    field: z
      .enum(["createdAt", "updatedAt", "resolvedAt", "closedAt"])
      .describe("Date field to filter by"),
    from: z.iso.datetime().optional().describe("Start date (ISO 8601)"),
    to: z.iso.datetime().optional().describe("End date (ISO 8601)"),
  })
  .openapi("DateRange");

/**
 * Filter criteria schema defining what tickets to match
 */
const FilterCriteriaSchema = z
  .object({
    status: z.array(TicketStatusSchema).optional().describe("Filter by ticket statuses"),
    priority: z.array(TicketPrioritySchema).optional().describe("Filter by priority levels"),
    assigneeId: UuidSchema.nullable()
      .optional()
      .describe("Filter by assignee (null for unassigned)"),
    customerId: UuidSchema.optional().describe("Filter by customer ID"),
    tags: z.array(z.string()).optional().describe("Filter by tag names"),
    categoryId: UuidSchema.optional().describe("Filter by category ID"),
    search: z.string().optional().describe("Text search in title/description"),
    dateRange: DateRangeSchema.optional().describe("Date range filter"),
  })
  .openapi("FilterCriteria");

/**
 * Sort field options
 */
const SortBySchema = z.enum(["createdAt", "updatedAt", "priority", "status"]).openapi("SortBy");

/**
 * Sort order options
 */
const SortOrderSchema = z.enum(["asc", "desc"]).openapi("SortOrder");

/**
 * Saved filter base schema
 */
const SavedFilterSchema = z
  .object({
    id: UuidSchema.describe("Filter ID"),
    name: z.string().describe("Filter name"),
    description: z.string().nullable().describe("Filter description"),
    criteria: FilterCriteriaSchema.describe("Filter criteria"),
    isDefault: z.boolean().describe("Whether this is the user's default filter"),
    isShared: z.boolean().describe("Whether this filter is shared with organization"),
    sortBy: SortBySchema.describe("Field to sort results by"),
    sortOrder: SortOrderSchema.describe("Sort order (ascending or descending)"),
    color: z.string().nullable().describe("Filter color (hex format #RRGGBB)"),
    icon: z.string().nullable().describe("Filter icon identifier"),
    position: z.int().describe("Display order position"),
    organizationId: UuidSchema.describe("Organization ID"),
    userId: UuidSchema.describe("Owner user ID"),
    createdAt: TimestampSchema.describe("Creation timestamp"),
    updatedAt: TimestampSchema.describe("Last update timestamp"),
  })
  .openapi("SavedFilter");

/**
 * Create saved filter request
 */
const CreateSavedFilterRequestSchema = z
  .object({
    name: z.string().min(1).max(100).describe("Filter name (1-100 characters)"),
    description: z
      .string()
      .max(500)
      .optional()
      .describe("Filter description (up to 500 characters)"),
    criteria: FilterCriteriaSchema.describe("Filter criteria"),
    isDefault: z.boolean().default(false).describe("Set as default filter"),
    isShared: z.boolean().default(false).describe("Share with organization"),
    sortBy: SortBySchema.default("createdAt").describe("Sort field"),
    sortOrder: SortOrderSchema.default("desc").describe("Sort order"),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional()
      .describe("Filter color in hex format"),
    icon: z.string().max(50).optional().describe("Icon identifier"),
  })
  .openapi("CreateSavedFilterRequest");

/**
 * Update saved filter request
 */
const UpdateSavedFilterRequestSchema = z
  .object({
    name: z.string().min(1).max(100).optional().describe("New filter name"),
    description: z.string().max(500).optional().nullable().describe("New description"),
    criteria: FilterCriteriaSchema.optional().describe("New filter criteria"),
    isDefault: z.boolean().optional().describe("Set as default filter"),
    isShared: z.boolean().optional().describe("Share with organization"),
    sortBy: SortBySchema.optional().describe("New sort field"),
    sortOrder: SortOrderSchema.optional().describe("New sort order"),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional()
      .nullable()
      .describe("New color or null to remove"),
    icon: z.string().max(50).optional().nullable().describe("New icon or null to remove"),
    position: z.int().min(0).optional().describe("New position"),
  })
  .openapi("UpdateSavedFilterRequest");

/**
 * List saved filters query parameters
 */
const ListSavedFiltersQuerySchema = z
  .object({
    includeShared: z.boolean().default(true).describe("Include filters shared by other users"),
  })
  .openapi("ListSavedFiltersQuery");

/**
 * Saved filter ID path parameter
 */
const SavedFilterIdParamSchema = z
  .object({
    id: UuidSchema.describe("Saved filter ID"),
  })
  .openapi("SavedFilterIdParam");

/**
 * Reorder filters request
 */
const ReorderFiltersRequestSchema = z
  .object({
    filterIds: z
      .array(UuidSchema)
      .min(1)
      .describe("Ordered list of filter IDs defining new positions"),
  })
  .openapi("ReorderFiltersRequest");

// ═══════════════════════════════════════════════════════════════════════════
// SAVED FILTER ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/saved-filters
registry.registerPath({
  method: "get",
  path: "/api/saved-filters",
  tags: ["Saved Filters"],
  summary: "List saved filters",
  description: `
Retrieve all saved filters for the current user.

**Access Control:**
- Requires authentication
- Returns user's own filters and optionally shared filters

**Filtering:**
- Use \`includeShared\` to include/exclude filters shared by other organization members
- Results are ordered by position
`,
  security: [{ cookieAuth: [] }],
  request: {
    query: ListSavedFiltersQuerySchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "List of saved filters",
      content: {
        "application/json": {
          schema: createDataResponseSchema(z.array(SavedFilterSchema), "SavedFilterListResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/saved-filters/default
registry.registerPath({
  method: "get",
  path: "/api/saved-filters/default",
  tags: ["Saved Filters"],
  summary: "Get default filter",
  description: `
Retrieve the user's default saved filter.

**Access Control:**
- Requires authentication
- Returns the filter marked as default for the current user

**Response:**
Returns null if no default filter is set.
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Default saved filter or null",
      content: {
        "application/json": {
          schema: createDataResponseSchema(
            SavedFilterSchema.nullable(),
            "DefaultSavedFilterResponse",
          ),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/saved-filters/:id
registry.registerPath({
  method: "get",
  path: "/api/saved-filters/{id}",
  tags: ["Saved Filters"],
  summary: "Get filter by ID",
  description: `
Retrieve a specific saved filter by its ID.

**Access Control:**
- Requires authentication
- User can view their own filters
- User can view shared filters from their organization
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: SavedFilterIdParamSchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Saved filter details",
      content: {
        "application/json": {
          schema: createDataResponseSchema(SavedFilterSchema, "SavedFilterResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// POST /api/saved-filters
registry.registerPath({
  method: "post",
  path: "/api/saved-filters",
  tags: ["Saved Filters"],
  summary: "Create saved filter",
  description: `
Create a new saved filter for quick access to filtered ticket views.

**Access Control:**
- Requires authentication
- All authenticated users can create filters

**Features:**
- Set as default filter for the user
- Share with organization members
- Customize with color and icon
- Define complex filter criteria

**Validation:**
- Name is required (1-100 characters)
- Color must be in hex format (#RRGGBB)
- Setting isDefault will unset any existing default filter
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
    body: {
      content: {
        "application/json": {
          schema: CreateSavedFilterRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Filter created successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(SavedFilterSchema, "SavedFilterCreatedResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// POST /api/saved-filters/reorder
registry.registerPath({
  method: "post",
  path: "/api/saved-filters/reorder",
  tags: ["Saved Filters"],
  summary: "Reorder filters",
  description: `
Update the display order of saved filters.

**Access Control:**
- Requires authentication
- User can only reorder their own filters

**Behavior:**
- Provide an ordered list of filter IDs
- Position is assigned based on order in the array
- All filter IDs must belong to the current user
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
    body: {
      content: {
        "application/json": {
          schema: ReorderFiltersRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Filters reordered successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(z.array(SavedFilterSchema), "ReorderedFiltersResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// POST /api/saved-filters/:id/duplicate
registry.registerPath({
  method: "post",
  path: "/api/saved-filters/{id}/duplicate",
  tags: ["Saved Filters"],
  summary: "Duplicate filter",
  description: `
Create a copy of an existing saved filter.

**Access Control:**
- Requires authentication
- User can duplicate their own filters
- User can duplicate shared filters from their organization

**Behavior:**
- Creates a new filter with the same criteria
- Name is appended with " (Copy)"
- New filter is not set as default
- New filter is not shared (private to user)
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: SavedFilterIdParamSchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    201: {
      description: "Filter duplicated successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(SavedFilterSchema, "DuplicatedFilterResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// PATCH /api/saved-filters/:id
registry.registerPath({
  method: "patch",
  path: "/api/saved-filters/{id}",
  tags: ["Saved Filters"],
  summary: "Update filter",
  description: `
Update an existing saved filter.

**Access Control:**
- Requires authentication
- User can only update their own filters

**Partial Updates:**
- Only provided fields are updated
- Omitted fields remain unchanged

**Notes:**
- Setting isDefault=true will unset any existing default filter
- Color can be set to null to remove it
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: SavedFilterIdParamSchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateSavedFilterRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Filter updated successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(SavedFilterSchema, "UpdatedFilterResponse"),
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

// DELETE /api/saved-filters/:id
registry.registerPath({
  method: "delete",
  path: "/api/saved-filters/{id}",
  tags: ["Saved Filters"],
  summary: "Delete filter",
  description: `
Delete a saved filter.

**Access Control:**
- Requires authentication
- User can only delete their own filters

**Behavior:**
- Filter is permanently removed
- This action cannot be undone
- If deleting the default filter, no new default is set automatically
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: SavedFilterIdParamSchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    204: {
      description: "Filter deleted successfully (no content)",
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});
