/**
 * Organizations Module - OpenAPI Route Definitions
 *
 * Registers all organization management endpoints with the OpenAPI registry.
 * Covers organization CRUD, member management, and invitations.
 */

import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "@/lib/openapi";
import {
  createDataResponseSchema,
  createMessageResponseSchema,
  commonErrorResponses,
  UserRoleSchema,
  UuidSchema,
  TimestampSchema,
  EmailSchema,
  PaginationSchema,
} from "@/lib/openapi/responses";

extendZodWithOpenApi(z);

// ═══════════════════════════════════════════════════════════════════════════
// ORGANIZATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Organization branding settings
 */
const BrandingSettingsSchema = z
  .object({
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional()
      .describe("Primary brand color (hex)"),
    logoUrl: z.url().optional().describe("Organization logo URL"),
  })
  .openapi("BrandingSettings");

/**
 * Organization notification settings
 */
const NotificationSettingsSchema = z
  .object({
    emailOnNewTicket: z.boolean().optional().describe("Send email on new ticket"),
    emailOnTicketUpdate: z.boolean().optional().describe("Send email on ticket update"),
    slackWebhookUrl: z.url().optional().describe("Slack webhook for notifications"),
  })
  .openapi("NotificationSettings");

/**
 * Organization feature flags
 */
const FeatureSettingsSchema = z
  .object({
    liveChatEnabled: z.boolean().optional().describe("Enable live chat widget"),
    customerPortalEnabled: z.boolean().optional().describe("Enable customer self-service portal"),
  })
  .openapi("FeatureSettings");

/**
 * Organization settings
 */
const OrganizationSettingsSchema = z
  .object({
    branding: BrandingSettingsSchema.optional(),
    notifications: NotificationSettingsSchema.optional(),
    features: FeatureSettingsSchema.optional(),
  })
  .openapi("OrganizationSettings");

/**
 * Organization summary
 */
const OrganizationSummarySchema = z
  .object({
    id: UuidSchema.describe("Organization ID"),
    name: z.string().describe("Organization name"),
    slug: z.string().describe("URL-friendly slug"),
    isActive: z.boolean().describe("Whether organization is active"),
    createdAt: TimestampSchema.describe("Creation timestamp"),
    updatedAt: TimestampSchema.describe("Last update timestamp"),
  })
  .openapi("OrganizationSummary");

/**
 * Full organization details
 */
const OrganizationDetailSchema = OrganizationSummarySchema.extend({
  settings: OrganizationSettingsSchema.optional().describe("Organization settings"),
  userRole: UserRoleSchema.describe("Current user's role in this organization"),
  memberCount: z.int().optional().describe("Number of members"),
}).openapi("OrganizationDetail");

/**
 * Organization member
 */
const MemberSchema = z
  .object({
    id: UuidSchema.describe("User ID"),
    email: EmailSchema,
    name: z.string().describe("User's display name"),
    avatarUrl: z.url().nullable().describe("Avatar URL"),
    role: UserRoleSchema.describe("Role in organization"),
    joinedAt: TimestampSchema.describe("When they joined"),
    isActive: z.boolean().describe("Whether account is active"),
  })
  .openapi("Member");

/**
 * Invitation details
 */
const InvitationSchema = z
  .object({
    id: UuidSchema.describe("Invitation ID"),
    email: EmailSchema.describe("Invited email address"),
    role: UserRoleSchema.describe("Role to be assigned"),
    status: z.enum(["pending", "accepted", "expired", "cancelled"]).describe("Invitation status"),
    invitedBy: z
      .object({
        id: UuidSchema,
        name: z.string(),
        email: EmailSchema,
      })
      .describe("Who sent the invitation"),
    createdAt: TimestampSchema.describe("When invitation was sent"),
    expiresAt: TimestampSchema.describe("When invitation expires"),
    acceptedAt: TimestampSchema.nullable().describe("When invitation was accepted"),
  })
  .openapi("Invitation");

/**
 * Create organization request
 */
const CreateOrganizationRequestSchema = z
  .object({
    name: z.string().min(2).max(100).describe("Organization name (2-100 characters)"),
    slug: z
      .string()
      .min(2)
      .max(50)
      .regex(/^[a-z0-9-]+$/)
      .describe("URL-friendly slug (lowercase alphanumeric with hyphens)"),
  })
  .openapi("CreateOrganizationRequest");

/**
 * Update organization request
 */
const UpdateOrganizationRequestSchema = z
  .object({
    name: z.string().min(2).max(100).optional().describe("New organization name"),
    settings: OrganizationSettingsSchema.optional().describe("Updated settings"),
  })
  .openapi("UpdateOrganizationRequest");

/**
 * Invite member request
 */
const InviteMemberRequestSchema = z
  .object({
    email: EmailSchema.describe("Email address to invite"),
    role: z.enum(["customer", "agent", "admin"]).prefault("customer").describe("Role to assign"),
  })
  .openapi("InviteMemberRequest");

/**
 * Update member role request
 */
const UpdateMemberRoleRequestSchema = z
  .object({
    role: z.enum(["customer", "agent", "admin"]).describe("New role to assign"),
  })
  .openapi("UpdateMemberRoleRequest");

// ═══════════════════════════════════════════════════════════════════════════
// ORGANIZATION CRUD ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/organizations
registry.registerPath({
  method: "get",
  path: "/api/organizations",
  tags: ["Organizations"],
  summary: "List user's organizations",
  description: `
Retrieve all organizations the current user is a member of.

**Notes:**
- Returns organizations in order of most recently accessed
- Includes user's role in each organization
`,
  security: [{ cookieAuth: [] }],
  request: {
    query: z.object({
      search: z.string().max(100).optional().describe("Search by name"),
      page: z.coerce.number().min(1).prefault(1),
      limit: z.coerce.number().min(1).max(100).prefault(20),
    }),
  },
  responses: {
    200: {
      description: "List of organizations",
      content: {
        "application/json": {
          schema: z
            .object({
              success: z.literal(true),
              data: z.array(OrganizationSummarySchema.extend({ role: UserRoleSchema })),
              pagination: PaginationSchema,
            })
            .openapi("OrganizationListResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    500: commonErrorResponses[500],
  },
});

// POST /api/organizations
registry.registerPath({
  method: "post",
  path: "/api/organizations",
  tags: ["Organizations"],
  summary: "Create a new organization",
  description: `
Create a new organization with the current user as owner.

**Notes:**
- User becomes the organization owner automatically
- Slug must be unique across all organizations
- Slug is used in URLs and cannot be changed easily
`,
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: CreateOrganizationRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Organization created successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(OrganizationDetailSchema, "CreateOrganizationResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    409: {
      description: "Slug already taken",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(false),
            error: z.string().prefault("Slug is already taken"),
          }),
        },
      },
    },
    500: commonErrorResponses[500],
  },
});

// GET /api/organizations/:organizationId
registry.registerPath({
  method: "get",
  path: "/api/organizations/{organizationId}",
  tags: ["Organizations"],
  summary: "Get organization details",
  description: `
Retrieve detailed information about an organization.

**Access Control:**
- Must be a member of the organization
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Organization details",
      content: {
        "application/json": {
          schema: createDataResponseSchema(OrganizationDetailSchema, "OrganizationDetailResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// PATCH /api/organizations/:organizationId
registry.registerPath({
  method: "patch",
  path: "/api/organizations/{organizationId}",
  tags: ["Organizations"],
  summary: "Update organization",
  description: `
Update organization name or settings.

**Access Control:**
- Requires admin or owner role
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
    }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: UpdateOrganizationRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Organization updated successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(OrganizationDetailSchema, "UpdateOrganizationResponse"),
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

// ═══════════════════════════════════════════════════════════════════════════
// MEMBER MANAGEMENT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/organizations/:organizationId/members
registry.registerPath({
  method: "get",
  path: "/api/organizations/{organizationId}/members",
  tags: ["Organizations"],
  summary: "List organization members",
  description: `
Retrieve all members of an organization.

**Access Control:**
- Must be a member of the organization
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
    }),
    query: z.object({
      search: z.string().max(100).optional().describe("Search by name or email"),
      page: z.coerce.number().min(1).prefault(1),
      limit: z.coerce.number().min(1).max(100).prefault(20),
    }),
  },
  responses: {
    200: {
      description: "List of members",
      content: {
        "application/json": {
          schema: z
            .object({
              success: z.literal(true),
              data: z.array(MemberSchema),
              pagination: PaginationSchema,
            })
            .openapi("MemberListResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// POST /api/organizations/:organizationId/members
registry.registerPath({
  method: "post",
  path: "/api/organizations/{organizationId}/members",
  tags: ["Organizations"],
  summary: "Invite a new member",
  description: `
Send an invitation to join the organization.

**Access Control:**
- Requires admin or owner role

**Notes:**
- Invitation email is sent automatically
- Invitation expires after 7 days
- Existing members cannot be invited again
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
    }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: InviteMemberRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Invitation sent successfully",
      content: {
        "application/json": {
          schema: z
            .object({
              success: z.literal(true),
              data: InvitationSchema,
              message: z.string().prefault("Invitation sent"),
            })
            .openapi("InviteMemberResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    409: {
      description: "User is already a member",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(false),
            error: z.string().prefault("User is already a member of this organization"),
          }),
        },
      },
    },
    500: commonErrorResponses[500],
  },
});

// PATCH /api/organizations/:organizationId/members/:userId
registry.registerPath({
  method: "patch",
  path: "/api/organizations/{organizationId}/members/{userId}",
  tags: ["Organizations"],
  summary: "Update member role",
  description: `
Change a member's role in the organization.

**Access Control:**
- Requires admin or owner role
- Cannot change owner's role
- Cannot change your own role
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
      userId: UuidSchema.describe("User ID to update"),
    }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: UpdateMemberRoleRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Role updated successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(MemberSchema, "UpdateMemberRoleResponse"),
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

// DELETE /api/organizations/:organizationId/members/:userId
registry.registerPath({
  method: "delete",
  path: "/api/organizations/{organizationId}/members/{userId}",
  tags: ["Organizations"],
  summary: "Remove member from organization",
  description: `
Remove a member from the organization.

**Access Control:**
- Requires admin or owner role
- Cannot remove the organization owner
- Cannot remove yourself
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
      userId: UuidSchema.describe("User ID to remove"),
    }),
  },
  responses: {
    200: {
      description: "Member removed successfully",
      content: {
        "application/json": {
          schema: createMessageResponseSchema("RemoveMemberResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// INVITATION ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/organizations/:organizationId/invitations
registry.registerPath({
  method: "get",
  path: "/api/organizations/{organizationId}/invitations",
  tags: ["Organizations"],
  summary: "List organization invitations",
  description: `
Retrieve all invitations for an organization.

**Access Control:**
- Requires admin or owner role
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
    }),
    query: z.object({
      status: z
        .enum(["pending", "accepted", "expired", "cancelled"])
        .optional()
        .describe("Filter by status"),
      page: z.coerce.number().min(1).prefault(1),
      limit: z.coerce.number().min(1).max(100).prefault(20),
    }),
  },
  responses: {
    200: {
      description: "List of invitations",
      content: {
        "application/json": {
          schema: z
            .object({
              success: z.literal(true),
              data: z.array(InvitationSchema),
              pagination: PaginationSchema,
            })
            .openapi("InvitationListResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// DELETE /api/organizations/:organizationId/invitations/:invitationId
registry.registerPath({
  method: "delete",
  path: "/api/organizations/{organizationId}/invitations/{invitationId}",
  tags: ["Organizations"],
  summary: "Cancel an invitation",
  description: `
Cancel a pending invitation.

**Access Control:**
- Requires admin or owner role

**Notes:**
- Only pending invitations can be cancelled
- Cancelled invitations cannot be restored
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
      invitationId: UuidSchema.describe("Invitation ID"),
    }),
  },
  responses: {
    200: {
      description: "Invitation cancelled",
      content: {
        "application/json": {
          schema: createMessageResponseSchema("CancelInvitationResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// POST /api/organizations/:organizationId/invitations/:invitationId/resend
registry.registerPath({
  method: "post",
  path: "/api/organizations/{organizationId}/invitations/{invitationId}/resend",
  tags: ["Organizations"],
  summary: "Resend an invitation",
  description: `
Resend a pending invitation with a new expiration date.

**Access Control:**
- Requires admin or owner role

**Notes:**
- Only pending invitations can be resent
- New expiration date is set (7 days from now)
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
      invitationId: UuidSchema.describe("Invitation ID"),
    }),
  },
  responses: {
    200: {
      description: "Invitation resent",
      content: {
        "application/json": {
          schema: z
            .object({
              success: z.literal(true),
              message: z.string().prefault("Invitation resent"),
              expiresAt: TimestampSchema.describe("New expiration date"),
            })
            .openapi("ResendInvitationResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// GET /api/organizations/invitations/preview/:token
registry.registerPath({
  method: "get",
  path: "/api/organizations/invitations/preview/{token}",
  tags: ["Organizations"],
  summary: "Preview invitation details",
  description: `
Get details about an invitation using its token.

**Notes:**
- This endpoint does not require authentication
- Used for showing invitation details before accepting
- Returns organization and role information
`,
  request: {
    params: z.object({
      token: z.string().describe("Invitation token from email"),
    }),
  },
  responses: {
    200: {
      description: "Invitation details",
      content: {
        "application/json": {
          schema: createDataResponseSchema(
            z.object({
              organization: OrganizationSummarySchema,
              email: EmailSchema,
              role: UserRoleSchema,
              expiresAt: TimestampSchema,
            }),
            "InvitationPreviewResponse",
          ),
        },
      },
    },
    404: {
      description: "Invitation not found or expired",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(false),
            error: z.string().prefault("Invitation not found or expired"),
          }),
        },
      },
    },
    500: commonErrorResponses[500],
  },
});

// POST /api/organizations/invitations/accept
registry.registerPath({
  method: "post",
  path: "/api/organizations/invitations/accept",
  tags: ["Organizations"],
  summary: "Accept an invitation",
  description: `
Accept an invitation to join an organization.

**Notes:**
- Requires authentication
- Email must match the invitation email
- User is added as member with the invited role
`,
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({
              token: z.string().describe("Invitation token from email"),
            })
            .openapi("AcceptInvitationRequest"),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Invitation accepted",
      content: {
        "application/json": {
          schema: z
            .object({
              success: z.literal(true),
              message: z.string().prefault("Invitation accepted"),
              organizationId: UuidSchema,
              role: UserRoleSchema,
            })
            .openapi("AcceptInvitationResponse"),
        },
      },
    },
    400: {
      description: "Invalid or expired invitation",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(false),
            error: z.string().prefault("Invalid or expired invitation token"),
          }),
        },
      },
    },
    401: commonErrorResponses[401],
    403: {
      description: "Email mismatch",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(false),
            error: z.string().prefault("Invitation was sent to a different email"),
          }),
        },
      },
    },
    500: commonErrorResponses[500],
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// ORGANIZATION STATUS ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/organizations/:organizationId/deactivate
registry.registerPath({
  method: "post",
  path: "/api/organizations/{organizationId}/deactivate",
  tags: ["Organizations"],
  summary: "Deactivate organization",
  description: `
Deactivate an organization, preventing access.

**Access Control:**
- Requires owner role

**Effects:**
- Organization becomes inaccessible
- Members can no longer sign in with org context
- Data is preserved
- Can be reactivated later
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Organization deactivated",
      content: {
        "application/json": {
          schema: z
            .object({
              success: z.literal(true),
              data: OrganizationSummarySchema,
              message: z.string().prefault("Organization deactivated"),
            })
            .openapi("DeactivateOrganizationResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// POST /api/organizations/:organizationId/reactivate
registry.registerPath({
  method: "post",
  path: "/api/organizations/{organizationId}/reactivate",
  tags: ["Organizations"],
  summary: "Reactivate organization",
  description: `
Reactivate a previously deactivated organization.

**Access Control:**
- Requires owner role

**Effects:**
- Organization becomes accessible again
- All data and members are restored
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      organizationId: UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Organization reactivated",
      content: {
        "application/json": {
          schema: z
            .object({
              success: z.literal(true),
              data: OrganizationSummarySchema,
              message: z.string().prefault("Organization reactivated"),
            })
            .openapi("ReactivateOrganizationResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});
