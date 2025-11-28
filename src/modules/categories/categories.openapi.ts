/**
 * Categories Module - OpenAPI Route Definitions
 *
 * Registers all category management endpoints with the OpenAPI registry.
 * Covers CRUD operations, tree structure, and statistics.
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
// CATEGORY SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Category base schema
 */
const CategorySchema = z
  .object({
    id: UuidSchema.describe("Category ID"),
    name: z.string().describe("Category name"),
    description: z.string().nullable().describe("Category description"),
    color: z.string().nullable().describe("Category color (hex format #RRGGBB)"),
    parentId: UuidSchema.nullable().describe("Parent category ID for nested categories"),
    isActive: z.boolean().describe("Whether the category is active"),
    createdAt: TimestampSchema.describe("Creation timestamp"),
    updatedAt: TimestampSchema.describe("Last update timestamp"),
  })
  .openapi("Category");

/**
 * Category with children for tree structure
 */
const CategoryTreeNodeSchema: z.ZodType<{
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  parentId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  children: unknown[];
}> = CategorySchema.extend({
  children: z
    .lazy(() => z.array(CategoryTreeNodeSchema))
    .openapi({
      type: "array",
      items: { $ref: "#/components/schemas/CategoryTreeNode" },
      description: "Child categories",
    }),
}).openapi("CategoryTreeNode");

/**
 * Category statistics
 */
const CategoryStatsSchema = z
  .object({
    categoryId: UuidSchema.describe("Category ID"),
    categoryName: z.string().describe("Category name"),
    ticketCount: z.int().nonnegative().describe("Number of tickets in this category"),
  })
  .openapi("CategoryStats");

/**
 * Create category request
 */
const CreateCategoryRequestSchema = z
  .object({
    name: z.string().min(1).max(100).describe("Category name (1-100 characters)"),
    description: z
      .string()
      .max(500)
      .optional()
      .describe("Category description (max 500 characters)"),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional()
      .describe("Color in hex format (#RRGGBB)"),
    parentId: UuidSchema.optional().nullable().describe("Parent category ID for nesting"),
  })
  .openapi("CreateCategoryRequest");

/**
 * Update category request
 */
const UpdateCategoryRequestSchema = z
  .object({
    name: z.string().min(1).max(100).optional().describe("New category name"),
    description: z
      .string()
      .max(500)
      .optional()
      .nullable()
      .describe("New description or null to remove"),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional()
      .nullable()
      .describe("New color or null to remove"),
    parentId: UuidSchema.optional()
      .nullable()
      .describe("New parent category ID or null to make root"),
    isActive: z.boolean().optional().describe("Activate or deactivate the category"),
  })
  .openapi("UpdateCategoryRequest");

/**
 * List categories query parameters
 */
const ListCategoriesQuerySchema = z
  .object({
    includeInactive: z.string().optional().describe("Set to 'true' to include inactive categories"),
    parentId: UuidSchema.optional().nullable().describe("Filter by parent category ID"),
  })
  .openapi("ListCategoriesQuery");

/**
 * Delete category response
 */
const DeleteCategoryResponseSchema = z
  .object({
    success: z.literal(true),
    deleted: z.boolean().describe("true if permanently deleted, false if deactivated"),
    message: z.string().describe("Human-readable result message"),
  })
  .openapi("DeleteCategoryResponse");

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/categories
registry.registerPath({
  method: "get",
  path: "/api/categories",
  tags: ["Categories"],
  summary: "List categories",
  description: `
Retrieve all categories for the current organization.

**Access Control:**
- Requires authentication
- All authenticated users can view categories

**Filtering:**
- Use \`includeInactive=true\` to include deactivated categories
- Use \`parentId\` to filter by parent category (or null for root categories)
`,
  security: [{ cookieAuth: [] }],
  request: {
    query: ListCategoriesQuerySchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "List of categories",
      content: {
        "application/json": {
          schema: createDataResponseSchema(z.array(CategorySchema), "CategoryListResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/categories/tree
registry.registerPath({
  method: "get",
  path: "/api/categories/tree",
  tags: ["Categories"],
  summary: "Get category tree",
  description: `
Retrieve categories in a hierarchical tree structure.

**Access Control:**
- Requires authentication
- All authenticated users can view the category tree

**Response:**
Returns root categories with nested children arrays.
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Category tree structure",
      content: {
        "application/json": {
          schema: createDataResponseSchema(z.array(CategoryTreeNodeSchema), "CategoryTreeResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/categories/stats
registry.registerPath({
  method: "get",
  path: "/api/categories/stats",
  tags: ["Categories"],
  summary: "Get category statistics",
  description: `
Retrieve ticket counts per category for the organization.

**Access Control:**
- Requires agent, admin, or owner role

**Response:**
Returns an array of category IDs with their associated ticket counts.
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Category statistics with ticket counts",
      content: {
        "application/json": {
          schema: createDataResponseSchema(z.array(CategoryStatsSchema), "CategoryStatsResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/categories/:id
registry.registerPath({
  method: "get",
  path: "/api/categories/{id}",
  tags: ["Categories"],
  summary: "Get category by ID",
  description: `
Retrieve a single category by its ID.

**Access Control:**
- Requires authentication
- All authenticated users can view category details
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Category ID"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Category details",
      content: {
        "application/json": {
          schema: createDataResponseSchema(CategorySchema, "CategoryResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// POST /api/categories
registry.registerPath({
  method: "post",
  path: "/api/categories",
  tags: ["Categories"],
  summary: "Create category",
  description: `
Create a new category in the organization.

**Access Control:**
- Requires admin or owner role

**Validation:**
- Name is required (1-100 characters)
- Description is optional (max 500 characters)
- Color must be in hex format (#RRGGBB)
- Parent category must exist if specified
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
    body: {
      content: {
        "application/json": {
          schema: CreateCategoryRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Category created successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(CategorySchema, "CategoryCreatedResponse"),
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

// PATCH /api/categories/:id
registry.registerPath({
  method: "patch",
  path: "/api/categories/{id}",
  tags: ["Categories"],
  summary: "Update category",
  description: `
Update an existing category.

**Access Control:**
- Requires admin or owner role

**Validation:**
- All fields are optional
- Name must be 1-100 characters if provided
- Color must be in hex format (#RRGGBB) if provided
- Cannot set a category as its own parent
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Category ID"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateCategoryRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Category updated successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(CategorySchema, "CategoryUpdatedResponse"),
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

// DELETE /api/categories/:id
registry.registerPath({
  method: "delete",
  path: "/api/categories/{id}",
  tags: ["Categories"],
  summary: "Delete category",
  description: `
Delete a category from the organization.

**Access Control:**
- Requires admin or owner role

**Behavior:**
- If the category has no associated tickets, it is permanently deleted
- If the category has tickets, it is deactivated instead (soft delete)

**Response:**
- \`deleted: true\` - Category was permanently deleted
- \`deleted: false\` - Category was deactivated (has associated tickets)
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Category ID"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Category deleted or deactivated",
      content: {
        "application/json": {
          schema: DeleteCategoryResponseSchema,
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});
