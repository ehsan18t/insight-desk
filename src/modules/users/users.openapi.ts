/**
 * Users Module - OpenAPI Route Definitions
 *
 * Registers all user management endpoints with the OpenAPI registry.
 * Covers user listing, profiles, role management, and account actions.
 */

import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "@/lib/openapi";
import {
  createDataResponseSchema,
  createMessageResponseSchema,
  commonErrorResponses,
  UserRoleSchema,
  EmailSchema,
  UuidSchema,
  TimestampSchema,
  PaginationSchema,
} from "@/lib/openapi/responses";

extendZodWithOpenApi(z);

// ═══════════════════════════════════════════════════════════════════════════
// USER SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * User summary for lists
 */
const UserSummarySchema = z
  .object({
    id: UuidSchema.describe("User's unique identifier"),
    email: EmailSchema,
    name: z.string().describe("User's display name"),
    avatarUrl: z.url().nullable().describe("URL to user's avatar image"),
    role: UserRoleSchema.describe("User's role in the organization"),
    isActive: z.boolean().describe("Whether the account is active"),
    emailVerified: z.boolean().describe("Whether email has been verified"),
    lastLoginAt: TimestampSchema.nullable().describe("Last successful login timestamp"),
    createdAt: TimestampSchema.describe("Account creation timestamp"),
  })
  .openapi("UserSummary");

/**
 * Full user profile
 */
const UserProfileSchema = z
  .object({
    id: UuidSchema.describe("User's unique identifier"),
    email: EmailSchema,
    name: z.string().describe("User's display name"),
    avatarUrl: z.url().nullable().describe("URL to user's avatar image"),
    emailVerified: z.boolean().describe("Whether email has been verified"),
    isActive: z.boolean().describe("Whether the account is active"),
    createdAt: TimestampSchema.describe("Account creation timestamp"),
    updatedAt: TimestampSchema.describe("Last update timestamp"),
  })
  .openapi("UserProfile");

/**
 * User with organization role
 */
const UserWithRoleSchema = UserSummarySchema.extend({
  joinedAt: TimestampSchema.describe("When the user joined the organization"),
}).openapi("UserWithRole");

/**
 * Agent for ticket assignment
 */
const AgentSchema = z
  .object({
    id: UuidSchema.describe("Agent's unique identifier"),
    name: z.string().describe("Agent's display name"),
    email: EmailSchema,
    avatarUrl: z.url().nullable().describe("URL to agent's avatar image"),
    role: z.enum(["agent", "admin", "owner"]).describe("Agent's role"),
  })
  .openapi("Agent");

/**
 * Update profile request
 */
const UpdateProfileRequestSchema = z
  .object({
    name: z.string().min(2).max(100).optional().describe("New display name (2-100 characters)"),
    avatarUrl: z.url().nullable().optional().describe("New avatar URL or null to remove"),
  })
  .openapi("UpdateProfileRequest");

/**
 * Update user role request
 */
const UpdateUserRoleRequestSchema = z
  .object({
    role: z.enum(["customer", "agent", "admin"]).describe("New role to assign"),
  })
  .openapi("UpdateUserRoleRequest");

/**
 * User query parameters
 */
const UserQuerySchema = z
  .object({
    search: z.string().max(100).optional().describe("Search by name or email"),
    role: UserRoleSchema.optional().describe("Filter by role"),
    isActive: z.string().optional().describe("Filter by active status ('true' or 'false')"),
    page: z.coerce.number().min(1).default(1).describe("Page number"),
    limit: z.coerce.number().min(1).max(100).default(20).describe("Items per page"),
    sortBy: z
      .enum(["name", "email", "createdAt", "lastLoginAt"])
      .default("createdAt")
      .describe("Field to sort by"),
    sortOrder: z.enum(["asc", "desc"]).default("desc").describe("Sort direction"),
  })
  .openapi("UserQuery");

// ═══════════════════════════════════════════════════════════════════════════
// USER LIST ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/users
registry.registerPath({
  method: "get",
  path: "/api/users",
  tags: ["Users"],
  summary: "List users in organization",
  description: `
Retrieve a paginated list of users in the current organization.

**Access Control:**
- Requires agent, admin, or owner role
- Organization context required via X-Organization-ID header

**Filtering Options:**
- \`search\`: Search by name or email (partial match)
- \`role\`: Filter by specific role
- \`isActive\`: Filter by account status

**Sorting Options:**
- \`sortBy\`: name, email, createdAt, or lastLoginAt
- \`sortOrder\`: asc or desc
`,
  security: [{ cookieAuth: [] }],
  request: {
    query: UserQuerySchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID for context"),
    }),
  },
  responses: {
    200: {
      description: "Paginated list of users",
      content: {
        "application/json": {
          schema: z
            .object({
              success: z.literal(true),
              data: z.array(UserWithRoleSchema),
              pagination: PaginationSchema,
            })
            .openapi("UserListResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/users/agents
registry.registerPath({
  method: "get",
  path: "/api/users/agents",
  tags: ["Users"],
  summary: "Get available agents for assignment",
  description: `
Retrieve a list of users who can be assigned to tickets (agents, admins, owners).

**Access Control:**
- Requires agent, admin, or owner role
- Organization context required

**Use Cases:**
- Populating assignee dropdown in ticket forms
- Displaying available agents for workload distribution
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID for context"),
    }),
  },
  responses: {
    200: {
      description: "List of available agents",
      content: {
        "application/json": {
          schema: createDataResponseSchema(z.array(AgentSchema), "AgentListResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// CURRENT USER ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/users/me
registry.registerPath({
  method: "get",
  path: "/api/users/me",
  tags: ["Users"],
  summary: "Get current user profile",
  description: `
Retrieve the authenticated user's profile information.

**Notes:**
- Returns profile regardless of organization context
- Does not include organization-specific role information
- Use GET /api/auth/me for organization memberships
`,
  security: [{ cookieAuth: [] }],
  responses: {
    200: {
      description: "Current user's profile",
      content: {
        "application/json": {
          schema: createDataResponseSchema(UserProfileSchema, "CurrentProfileResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// PATCH /api/users/me
registry.registerPath({
  method: "patch",
  path: "/api/users/me",
  tags: ["Users"],
  summary: "Update current user profile",
  description: `
Update the authenticated user's profile information.

**Updatable Fields:**
- \`name\`: Display name (2-100 characters)
- \`avatarUrl\`: Profile image URL or null to remove

**Notes:**
- Email cannot be changed through this endpoint
- Changes take effect immediately
`,
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: UpdateProfileRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Profile updated successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(UserProfileSchema, "UpdateProfileResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    500: commonErrorResponses[500],
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// USER DETAIL ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/users/:userId
registry.registerPath({
  method: "get",
  path: "/api/users/{userId}",
  tags: ["Users"],
  summary: "Get user by ID",
  description: `
Retrieve detailed information about a specific user in the organization.

**Access Control:**
- Requires agent, admin, or owner role
- User must be a member of the current organization
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      userId: UuidSchema.describe("User ID to retrieve"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID for context"),
    }),
  },
  responses: {
    200: {
      description: "User details",
      content: {
        "application/json": {
          schema: createDataResponseSchema(UserWithRoleSchema, "UserDetailResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: {
      description: "User not found in this organization",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(false),
            error: z.string().default("User not found in this organization"),
          }),
        },
      },
    },
    500: commonErrorResponses[500],
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT ROUTES (Admin only)
// ═══════════════════════════════════════════════════════════════════════════

// PATCH /api/users/:userId/role
registry.registerPath({
  method: "patch",
  path: "/api/users/{userId}/role",
  tags: ["Users"],
  summary: "Update user role",
  description: `
Change a user's role within the organization.

**Access Control:**
- Requires admin or owner role
- Cannot change your own role
- Cannot modify owner role (owners must transfer ownership)

**Role Hierarchy:**
- customer: Can only manage own tickets
- agent: Can manage assigned tickets
- admin: Full access except organization settings
- owner: Full access (cannot be assigned via this endpoint)
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      userId: UuidSchema.describe("User ID to update"),
    }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: UpdateUserRoleRequestSchema,
        },
      },
    },
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID for context"),
    }),
  },
  responses: {
    200: {
      description: "Role updated successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(UserWithRoleSchema, "UpdateRoleResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: {
      description: "Cannot modify this user's role",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(false),
            error: z.string().default("Cannot change owner role or your own role"),
          }),
        },
      },
    },
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// POST /api/users/:userId/deactivate
registry.registerPath({
  method: "post",
  path: "/api/users/{userId}/deactivate",
  tags: ["Users"],
  summary: "Deactivate user account",
  description: `
Deactivate a user's account, preventing them from signing in.

**Access Control:**
- Requires admin or owner role
- Cannot deactivate yourself
- Cannot deactivate the organization owner

**Effects:**
- User cannot sign in
- Active sessions are invalidated
- User's tickets and data are preserved
- Can be reversed via reactivate endpoint
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      userId: UuidSchema.describe("User ID to deactivate"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID for context"),
    }),
  },
  responses: {
    200: {
      description: "User deactivated successfully",
      content: {
        "application/json": {
          schema: z
            .object({
              success: z.literal(true),
              data: UserWithRoleSchema,
              message: z.string().default("User deactivated successfully"),
            })
            .openapi("DeactivateUserResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: {
      description: "Cannot deactivate this user",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(false),
            error: z.string().default("Cannot deactivate yourself or organization owner"),
          }),
        },
      },
    },
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// POST /api/users/:userId/reactivate
registry.registerPath({
  method: "post",
  path: "/api/users/{userId}/reactivate",
  tags: ["Users"],
  summary: "Reactivate user account",
  description: `
Reactivate a previously deactivated user account.

**Access Control:**
- Requires admin or owner role

**Effects:**
- User can sign in again
- No data is modified or restored
- User retains their previous role
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      userId: UuidSchema.describe("User ID to reactivate"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID for context"),
    }),
  },
  responses: {
    200: {
      description: "User reactivated successfully",
      content: {
        "application/json": {
          schema: z
            .object({
              success: z.literal(true),
              data: UserWithRoleSchema,
              message: z.string().default("User reactivated successfully"),
            })
            .openapi("ReactivateUserResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// DELETE /api/users/:userId
registry.registerPath({
  method: "delete",
  path: "/api/users/{userId}",
  tags: ["Users"],
  summary: "Remove user from organization",
  description: `
Remove a user from the current organization.

**Access Control:**
- Requires admin or owner role
- Cannot remove yourself
- Cannot remove the organization owner

**Effects:**
- User loses access to this organization
- User's tickets are preserved (for audit purposes)
- User account is not deleted (they may belong to other organizations)
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      userId: UuidSchema.describe("User ID to remove"),
    }),
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID for context"),
    }),
  },
  responses: {
    200: {
      description: "User removed from organization",
      content: {
        "application/json": {
          schema: createMessageResponseSchema("RemoveUserResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: {
      description: "Cannot remove this user",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(false),
            error: z.string().default("Cannot remove yourself or organization owner"),
          }),
        },
      },
    },
    404: {
      description: "User is not a member of this organization",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(false),
            error: z.string().default("User is not a member of this organization"),
          }),
        },
      },
    },
    500: commonErrorResponses[500],
  },
});
