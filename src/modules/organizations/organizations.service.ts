import { and, asc, count, desc, eq, gt, ilike, type SQL } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import {
  type Organization,
  organizationInvitations,
  type OrganizationSettings,
  organizations,
  type UserRole,
  userOrganizations,
  users,
} from "@/db/schema";
import type {
  CreateOrganizationInput,
  InviteMemberInput,
  ListInvitationsInput,
  OrganizationQuery,
  UpdateMemberRoleInput,
  UpdateOrganizationInput,
} from "./organizations.schema";

// Organization with member count
export interface OrganizationWithStats extends Organization {
  memberCount: number;
  ticketCount?: number;
}

// Organization member
export interface OrganizationMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  joinedAt: Date;
  isActive: boolean;
}

export const organizationsService = {
  /**
   * Create a new organization
   */
  async create(input: CreateOrganizationInput, ownerId: string): Promise<Organization> {
    // Check if slug is already taken
    const existing = await db.query.organizations.findFirst({
      where: eq(organizations.slug, input.slug),
    });

    if (existing) {
      throw new Error("Organization slug is already taken");
    }

    // Create organization and add owner in a transaction
    const result = await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({
          name: input.name,
          slug: input.slug,
        })
        .returning();

      // Add creator as owner
      await tx.insert(userOrganizations).values({
        userId: ownerId,
        organizationId: org.id,
        role: "owner",
      });

      return org;
    });

    return result;
  },

  /**
   * Get organization by ID
   */
  async getById(organizationId: string): Promise<OrganizationWithStats | null> {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org) return null;

    // Get member count
    const [{ memberCount }] = await db
      .select({ memberCount: count() })
      .from(userOrganizations)
      .where(eq(userOrganizations.organizationId, organizationId));

    return {
      ...org,
      memberCount,
    };
  },

  /**
   * Get organization by slug
   */
  async getBySlug(slug: string): Promise<OrganizationWithStats | null> {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    if (!org) return null;

    // Get member count
    const [{ memberCount }] = await db
      .select({ memberCount: count() })
      .from(userOrganizations)
      .where(eq(userOrganizations.organizationId, org.id));

    return {
      ...org,
      memberCount,
    };
  },

  /**
   * List organizations for a user
   */
  async listForUser(
    userId: string,
    query: Partial<OrganizationQuery> = {},
  ): Promise<{
    data: (Organization & { role: UserRole; memberCount: number })[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { page = 1, limit = 20, search } = query;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [eq(userOrganizations.userId, userId)];

    if (search) {
      conditions.push(ilike(organizations.name, `%${search}%`));
    }

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(organizations)
      .innerJoin(userOrganizations, eq(organizations.id, userOrganizations.organizationId))
      .where(and(...conditions));

    // Get organizations with user's role
    const orgs = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        settings: organizations.settings,
        plan: organizations.plan,
        isActive: organizations.isActive,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt,
        role: userOrganizations.role,
      })
      .from(organizations)
      .innerJoin(userOrganizations, eq(organizations.id, userOrganizations.organizationId))
      .where(and(...conditions))
      .orderBy(desc(organizations.createdAt))
      .limit(limit)
      .offset(offset);

    // Get member counts for each organization
    const data = await Promise.all(
      orgs.map(async (org) => {
        const [{ memberCount }] = await db
          .select({ memberCount: count() })
          .from(userOrganizations)
          .where(eq(userOrganizations.organizationId, org.id));

        return { ...org, memberCount };
      }),
    );

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Update organization
   */
  async update(organizationId: string, input: UpdateOrganizationInput): Promise<Organization> {
    // Merge settings if provided
    const updateData: Partial<Organization> = {};

    if (input.name) {
      updateData.name = input.name;
    }

    if (input.settings) {
      // Get current settings to merge
      const [current] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      const currentSettings = (current?.settings || {}) as OrganizationSettings;
      updateData.settings = {
        ...currentSettings,
        ...input.settings,
        branding: { ...currentSettings.branding, ...input.settings.branding },
        notifications: {
          ...currentSettings.notifications,
          ...input.settings.notifications,
        },
        features: { ...currentSettings.features, ...input.settings.features },
      };
    }

    updateData.updatedAt = new Date();

    const [org] = await db
      .update(organizations)
      .set(updateData)
      .where(eq(organizations.id, organizationId))
      .returning();

    if (!org) {
      throw new Error("Organization not found");
    }

    return org;
  },

  /**
   * List organization members
   */
  async listMembers(
    organizationId: string,
    query: Partial<OrganizationQuery> = {},
  ): Promise<{
    data: OrganizationMember[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { page = 1, limit = 20, search } = query;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [eq(userOrganizations.organizationId, organizationId)];

    if (search) {
      conditions.push(ilike(users.name, `%${search}%`));
    }

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(userOrganizations)
      .innerJoin(users, eq(userOrganizations.userId, users.id))
      .where(and(...conditions));

    // Get members
    const members = await db
      .select({
        id: userOrganizations.id,
        userId: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        role: userOrganizations.role,
        joinedAt: userOrganizations.joinedAt,
        isActive: users.isActive,
      })
      .from(userOrganizations)
      .innerJoin(users, eq(userOrganizations.userId, users.id))
      .where(and(...conditions))
      .orderBy(asc(users.name))
      .limit(limit)
      .offset(offset);

    return {
      data: members,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Invite a member to the organization
   * If user exists, adds them directly. Otherwise, creates a pending invitation.
   */
  async inviteMember(
    organizationId: string,
    input: InviteMemberInput,
    inviterId: string,
  ): Promise<{ userId?: string; invitationId?: string; invited: boolean; message: string }> {
    // Check if user exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, input.email.toLowerCase()),
    });

    if (existingUser) {
      // Check if already a member
      const existingMembership = await db.query.userOrganizations.findFirst({
        where: and(
          eq(userOrganizations.userId, existingUser.id),
          eq(userOrganizations.organizationId, organizationId),
        ),
      });

      if (existingMembership) {
        throw new Error("User is already a member of this organization");
      }

      // Add user to organization
      await db.insert(userOrganizations).values({
        userId: existingUser.id,
        organizationId,
        role: input.role,
      });

      return {
        userId: existingUser.id,
        invited: false,
        message: "User added to organization",
      };
    }

    // Check if there's already a pending invitation for this email
    const existingInvitation = await db.query.organizationInvitations.findFirst({
      where: and(
        eq(organizationInvitations.orgId, organizationId),
        eq(organizationInvitations.email, input.email.toLowerCase()),
        eq(organizationInvitations.status, "pending"),
      ),
    });

    if (existingInvitation) {
      // Return existing invitation
      return {
        invitationId: existingInvitation.id,
        invited: true,
        message: `Invitation already sent to ${input.email}`,
      };
    }

    // Create invitation record
    const token = nanoid(32);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

    const [invitation] = await db
      .insert(organizationInvitations)
      .values({
        orgId: organizationId,
        email: input.email.toLowerCase(),
        role: input.role,
        token,
        invitedById: inviterId,
        expiresAt,
      })
      .returning();

    // TODO: Send invitation email with token
    // This would integrate with an email service like SendGrid, Resend, etc.

    return {
      invitationId: invitation.id,
      invited: true,
      message: `Invitation sent to ${input.email}. They will be added when they accept.`,
    };
  },

  /**
   * Accept an invitation by token
   */
  async acceptInvitation(
    token: string,
    userId: string,
  ): Promise<{ organizationId: string; role: string }> {
    // Find the invitation
    const invitation = await db.query.organizationInvitations.findFirst({
      where: and(
        eq(organizationInvitations.token, token),
        eq(organizationInvitations.status, "pending"),
        gt(organizationInvitations.expiresAt, new Date()),
      ),
    });

    if (!invitation) {
      throw new Error("Invalid or expired invitation");
    }

    // Get the user's email to verify it matches
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Check if email matches (case insensitive)
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new Error("This invitation was sent to a different email address");
    }

    // Check if already a member
    const existingMembership = await db.query.userOrganizations.findFirst({
      where: and(
        eq(userOrganizations.userId, userId),
        eq(userOrganizations.organizationId, invitation.orgId),
      ),
    });

    if (existingMembership) {
      // Mark invitation as accepted
      await db
        .update(organizationInvitations)
        .set({
          status: "accepted",
          acceptedAt: new Date(),
          acceptedById: userId,
        })
        .where(eq(organizationInvitations.id, invitation.id));

      return {
        organizationId: invitation.orgId,
        role: existingMembership.role,
      };
    }

    // Add user to organization
    await db.insert(userOrganizations).values({
      userId,
      organizationId: invitation.orgId,
      role: invitation.role,
    });

    // Mark invitation as accepted
    await db
      .update(organizationInvitations)
      .set({
        status: "accepted",
        acceptedAt: new Date(),
        acceptedById: userId,
      })
      .where(eq(organizationInvitations.id, invitation.id));

    return {
      organizationId: invitation.orgId,
      role: invitation.role,
    };
  },

  /**
   * Get invitation by token (for preview before accepting)
   */
  async getInvitationByToken(token: string): Promise<{
    id: string;
    organization: { id: string; name: string };
    role: string;
    email: string;
    expiresAt: Date;
    isExpired: boolean;
  } | null> {
    const invitation = await db.query.organizationInvitations.findFirst({
      where: eq(organizationInvitations.token, token),
      with: {
        organization: true,
      },
    });

    if (!invitation || invitation.status !== "pending") {
      return null;
    }

    return {
      id: invitation.id,
      organization: {
        id: invitation.organization.id,
        name: invitation.organization.name,
      },
      role: invitation.role,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      isExpired: new Date() > invitation.expiresAt,
    };
  },

  /**
   * List invitations for an organization
   */
  async listInvitations(
    organizationId: string,
    input: ListInvitationsInput,
  ): Promise<{
    invitations: Array<{
      id: string;
      email: string;
      role: string;
      status: string;
      invitedBy: { id: string; name: string | null; email: string };
      createdAt: Date;
      expiresAt: Date;
    }>;
    pagination: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { status, page = 1, limit = 20 } = input;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions: SQL[] = [eq(organizationInvitations.orgId, organizationId)];
    if (status) {
      conditions.push(eq(organizationInvitations.status, status));
    }

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(organizationInvitations)
      .where(and(...conditions));

    // Get invitations
    const invitations = await db.query.organizationInvitations.findMany({
      where: and(...conditions),
      with: {
        invitedBy: true,
      },
      orderBy: [desc(organizationInvitations.createdAt)],
      limit,
      offset,
    });

    return {
      invitations: invitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        invitedBy: {
          id: inv.invitedBy.id,
          name: inv.invitedBy.name,
          email: inv.invitedBy.email,
        },
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Cancel a pending invitation
   */
  async cancelInvitation(organizationId: string, invitationId: string): Promise<boolean> {
    const [updated] = await db
      .update(organizationInvitations)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(organizationInvitations.id, invitationId),
          eq(organizationInvitations.orgId, organizationId),
          eq(organizationInvitations.status, "pending"),
        ),
      )
      .returning();

    return !!updated;
  },

  /**
   * Resend an invitation (update expiration and potentially send email again)
   */
  async resendInvitation(
    organizationId: string,
    invitationId: string,
  ): Promise<{ success: boolean; expiresAt?: Date }> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    const [updated] = await db
      .update(organizationInvitations)
      .set({ expiresAt })
      .where(
        and(
          eq(organizationInvitations.id, invitationId),
          eq(organizationInvitations.orgId, organizationId),
          eq(organizationInvitations.status, "pending"),
        ),
      )
      .returning();

    if (!updated) {
      return { success: false };
    }

    // TODO: Resend invitation email

    return { success: true, expiresAt };
  },

  /**
   * Update member role
   */
  async updateMemberRole(
    organizationId: string,
    userId: string,
    input: UpdateMemberRoleInput,
    requesterId: string,
  ): Promise<OrganizationMember> {
    // Can't change own role
    if (userId === requesterId) {
      throw new Error("Cannot change your own role");
    }

    // Get target membership
    const membership = await db.query.userOrganizations.findFirst({
      where: and(
        eq(userOrganizations.userId, userId),
        eq(userOrganizations.organizationId, organizationId),
      ),
    });

    if (!membership) {
      throw new Error("User is not a member of this organization");
    }

    // Can't change owner role
    if (membership.role === "owner") {
      throw new Error("Cannot change owner role");
    }

    // Update role
    await db
      .update(userOrganizations)
      .set({ role: input.role })
      .where(
        and(
          eq(userOrganizations.userId, userId),
          eq(userOrganizations.organizationId, organizationId),
        ),
      );

    // Return updated member info
    const [member] = await db
      .select({
        id: userOrganizations.id,
        userId: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        role: userOrganizations.role,
        joinedAt: userOrganizations.joinedAt,
        isActive: users.isActive,
      })
      .from(userOrganizations)
      .innerJoin(users, eq(userOrganizations.userId, users.id))
      .where(
        and(
          eq(userOrganizations.userId, userId),
          eq(userOrganizations.organizationId, organizationId),
        ),
      )
      .limit(1);

    return member;
  },

  /**
   * Remove member from organization
   */
  async removeMember(organizationId: string, userId: string, requesterId: string): Promise<void> {
    // Can't remove self
    if (userId === requesterId) {
      throw new Error("Cannot remove yourself from the organization");
    }

    // Get target membership
    const membership = await db.query.userOrganizations.findFirst({
      where: and(
        eq(userOrganizations.userId, userId),
        eq(userOrganizations.organizationId, organizationId),
      ),
    });

    if (!membership) {
      throw new Error("User is not a member of this organization");
    }

    // Can't remove owner
    if (membership.role === "owner") {
      throw new Error("Cannot remove the organization owner");
    }

    // Remove membership
    await db
      .delete(userOrganizations)
      .where(
        and(
          eq(userOrganizations.userId, userId),
          eq(userOrganizations.organizationId, organizationId),
        ),
      );
  },

  /**
   * Check if user has specific role in organization
   */
  async checkUserRole(
    userId: string,
    organizationId: string,
    allowedRoles: UserRole[],
  ): Promise<boolean> {
    const membership = await db.query.userOrganizations.findFirst({
      where: and(
        eq(userOrganizations.userId, userId),
        eq(userOrganizations.organizationId, organizationId),
      ),
    });

    return membership ? allowedRoles.includes(membership.role) : false;
  },

  /**
   * Get user's role in an organization
   */
  async getUserRole(userId: string, organizationId: string): Promise<UserRole | null> {
    const membership = await db.query.userOrganizations.findFirst({
      where: and(
        eq(userOrganizations.userId, userId),
        eq(userOrganizations.organizationId, organizationId),
      ),
    });

    return membership?.role || null;
  },

  /**
   * Deactivate organization (soft delete)
   */
  async deactivate(organizationId: string): Promise<Organization> {
    const [org] = await db
      .update(organizations)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId))
      .returning();

    if (!org) {
      throw new Error("Organization not found");
    }

    return org;
  },

  /**
   * Reactivate organization
   */
  async reactivate(organizationId: string): Promise<Organization> {
    const [org] = await db
      .update(organizations)
      .set({
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId))
      .returning();

    if (!org) {
      throw new Error("Organization not found");
    }

    return org;
  },
};
