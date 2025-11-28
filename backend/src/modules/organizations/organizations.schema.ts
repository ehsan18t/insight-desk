import { z } from "zod";

// Create organization schema
export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens only"),
});

// Update organization schema
export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  settings: z
    .object({
      branding: z
        .object({
          primaryColor: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          logoUrl: z.string().url().optional(),
        })
        .optional(),
      notifications: z
        .object({
          emailOnNewTicket: z.boolean().optional(),
          emailOnTicketUpdate: z.boolean().optional(),
          slackWebhookUrl: z.string().url().optional(),
        })
        .optional(),
      features: z
        .object({
          liveChatEnabled: z.boolean().optional(),
          customerPortalEnabled: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

// Organization query params schema
export const organizationQuerySchema = z.object({
  search: z.string().max(100).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// Organization ID param schema
export const organizationIdParamSchema = z.object({
  organizationId: z.string().uuid(),
});

// Invite member schema
export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["customer", "agent", "admin"]).default("customer"),
});

// Update member role schema
export const updateMemberRoleSchema = z.object({
  role: z.enum(["customer", "agent", "admin"]),
});

// Member ID param schema
export const memberIdParamSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
});

// Types
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type OrganizationQuery = z.infer<typeof organizationQuerySchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
