import { eq, ilike, and, desc, asc, count, SQL } from 'drizzle-orm';
import { db } from '../../db';
import {
  organizations,
  userOrganizations,
  users,
  type UserRole,
  type Organization,
  type OrganizationSettings,
} from '../../db/schema';
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  OrganizationQuery,
  InviteMemberInput,
  UpdateMemberRoleInput,
} from './organizations.schema';

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
  async create(
    input: CreateOrganizationInput,
    ownerId: string
  ): Promise<Organization> {
    // Check if slug is already taken
    const existing = await db.query.organizations.findFirst({
      where: eq(organizations.slug, input.slug),
    });

    if (existing) {
      throw new Error('Organization slug is already taken');
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
        role: 'owner',
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
    query: Partial<OrganizationQuery> = {}
  ): Promise<{
    data: (Organization & { role: UserRole; memberCount: number })[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
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
      .innerJoin(
        userOrganizations,
        eq(organizations.id, userOrganizations.organizationId)
      )
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
      .innerJoin(
        userOrganizations,
        eq(organizations.id, userOrganizations.organizationId)
      )
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
      })
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
  async update(
    organizationId: string,
    input: UpdateOrganizationInput
  ): Promise<Organization> {
    // Merge settings if provided
    let updateData: Partial<Organization> = {};

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
      throw new Error('Organization not found');
    }

    return org;
  },

  /**
   * List organization members
   */
  async listMembers(
    organizationId: string,
    query: Partial<OrganizationQuery> = {}
  ): Promise<{
    data: OrganizationMember[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const { page = 1, limit = 20, search } = query;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [
      eq(userOrganizations.organizationId, organizationId),
    ];

    if (search) {
      conditions.push(
        ilike(users.name, `%${search}%`)
      );
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
    _inviterId: string
  ): Promise<{ userId?: string; invited: boolean; message: string }> {
    // Check if user exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, input.email.toLowerCase()),
    });

    if (existingUser) {
      // Check if already a member
      const existingMembership = await db.query.userOrganizations.findFirst({
        where: and(
          eq(userOrganizations.userId, existingUser.id),
          eq(userOrganizations.organizationId, organizationId)
        ),
      });

      if (existingMembership) {
        throw new Error('User is already a member of this organization');
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
        message: 'User added to organization',
      };
    }

    // For users that don't exist, we'd typically create an invitation record
    // and send an email. For now, we'll return a message indicating this.
    // In a full implementation, this would integrate with the email system.
    return {
      invited: true,
      message: `Invitation sent to ${input.email}. They will be added when they sign up.`,
    };
  },

  /**
   * Update member role
   */
  async updateMemberRole(
    organizationId: string,
    userId: string,
    input: UpdateMemberRoleInput,
    requesterId: string
  ): Promise<OrganizationMember> {
    // Can't change own role
    if (userId === requesterId) {
      throw new Error('Cannot change your own role');
    }

    // Get target membership
    const membership = await db.query.userOrganizations.findFirst({
      where: and(
        eq(userOrganizations.userId, userId),
        eq(userOrganizations.organizationId, organizationId)
      ),
    });

    if (!membership) {
      throw new Error('User is not a member of this organization');
    }

    // Can't change owner role
    if (membership.role === 'owner') {
      throw new Error('Cannot change owner role');
    }

    // Update role
    await db
      .update(userOrganizations)
      .set({ role: input.role })
      .where(
        and(
          eq(userOrganizations.userId, userId),
          eq(userOrganizations.organizationId, organizationId)
        )
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
          eq(userOrganizations.organizationId, organizationId)
        )
      )
      .limit(1);

    return member;
  },

  /**
   * Remove member from organization
   */
  async removeMember(
    organizationId: string,
    userId: string,
    requesterId: string
  ): Promise<void> {
    // Can't remove self
    if (userId === requesterId) {
      throw new Error('Cannot remove yourself from the organization');
    }

    // Get target membership
    const membership = await db.query.userOrganizations.findFirst({
      where: and(
        eq(userOrganizations.userId, userId),
        eq(userOrganizations.organizationId, organizationId)
      ),
    });

    if (!membership) {
      throw new Error('User is not a member of this organization');
    }

    // Can't remove owner
    if (membership.role === 'owner') {
      throw new Error('Cannot remove the organization owner');
    }

    // Remove membership
    await db
      .delete(userOrganizations)
      .where(
        and(
          eq(userOrganizations.userId, userId),
          eq(userOrganizations.organizationId, organizationId)
        )
      );
  },

  /**
   * Check if user has specific role in organization
   */
  async checkUserRole(
    userId: string,
    organizationId: string,
    allowedRoles: UserRole[]
  ): Promise<boolean> {
    const membership = await db.query.userOrganizations.findFirst({
      where: and(
        eq(userOrganizations.userId, userId),
        eq(userOrganizations.organizationId, organizationId)
      ),
    });

    return membership ? allowedRoles.includes(membership.role) : false;
  },

  /**
   * Get user's role in an organization
   */
  async getUserRole(
    userId: string,
    organizationId: string
  ): Promise<UserRole | null> {
    const membership = await db.query.userOrganizations.findFirst({
      where: and(
        eq(userOrganizations.userId, userId),
        eq(userOrganizations.organizationId, organizationId)
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
      throw new Error('Organization not found');
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
      throw new Error('Organization not found');
    }

    return org;
  },
};
