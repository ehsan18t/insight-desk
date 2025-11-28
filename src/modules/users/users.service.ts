import { and, asc, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { User } from "@/db/schema";
import { type UserRole, userOrganizations, users } from "@/db/schema";
import type { UpdateProfileInput, UpdateUserRoleInput, UserQuery } from "./users.schema";

// Build user list query conditions for users within an organization
function buildUserQuery(query: UserQuery): {
  userConditions: SQL | undefined;
  roleFilter: UserRole | undefined;
} {
  const conditions: SQL[] = [];
  let roleFilter: UserRole | undefined;

  if (query.search) {
    conditions.push(
      or(ilike(users.name, `%${query.search}%`), ilike(users.email, `%${query.search}%`))!,
    );
  }

  if (query.role) {
    roleFilter = query.role;
  }

  if (query.isActive !== undefined) {
    conditions.push(eq(users.isActive, query.isActive));
  }

  return {
    userConditions: conditions.length > 0 ? and(...conditions) : undefined,
    roleFilter,
  };
}

// Get order by clause
function getOrderBy(sortBy: string, sortOrder: "asc" | "desc") {
  const orderFn = sortOrder === "asc" ? asc : desc;

  switch (sortBy) {
    case "name":
      return orderFn(users.name);
    case "email":
      return orderFn(users.email);
    case "lastLoginAt":
      return orderFn(users.lastLoginAt);
    default:
      return orderFn(users.createdAt);
  }
}

// User with organization role
export interface UserWithRole {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  role: UserRole;
  joinedAt: Date;
}

export const usersService = {
  /**
   * List all users in an organization with filtering and pagination
   * Only accessible by agents, admins, and owners
   */
  async listByOrganization(
    organizationId: string,
    query: Partial<UserQuery> = {},
  ): Promise<{
    data: UserWithRole[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { page = 1, limit = 20, sortBy = "createdAt", sortOrder = "desc" } = query;
    const offset = (page - 1) * limit;
    const { userConditions, roleFilter } = buildUserQuery(query as UserQuery);

    // Build membership conditions
    const membershipConditions: SQL[] = [eq(userOrganizations.organizationId, organizationId)];

    if (roleFilter) {
      membershipConditions.push(eq(userOrganizations.role, roleFilter));
    }

    // Base query for users in this organization
    const baseQuery = db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        role: userOrganizations.role,
        joinedAt: userOrganizations.joinedAt,
      })
      .from(users)
      .innerJoin(userOrganizations, eq(users.id, userOrganizations.userId))
      .where(and(...membershipConditions, userConditions));

    // Get total count
    const countResult = await db
      .select({ total: count() })
      .from(users)
      .innerJoin(userOrganizations, eq(users.id, userOrganizations.userId))
      .where(and(...membershipConditions, userConditions));

    const total = countResult[0]?.total ?? 0;

    // Get users with pagination
    const data = await baseQuery.orderBy(getOrderBy(sortBy, sortOrder)).limit(limit).offset(offset);

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
   * Get user by ID with their role in an organization
   */
  async getByIdInOrganization(
    userId: string,
    organizationId: string,
  ): Promise<UserWithRole | null> {
    const [result] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        role: userOrganizations.role,
        joinedAt: userOrganizations.joinedAt,
      })
      .from(users)
      .innerJoin(userOrganizations, eq(users.id, userOrganizations.userId))
      .where(and(eq(users.id, userId), eq(userOrganizations.organizationId, organizationId)))
      .limit(1);

    return result || null;
  },

  /**
   * Get full user profile (for own profile)
   */
  async getProfile(userId: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    return user || null;
  },

  /**
   * Update user profile
   */
  async updateProfile(userId: string, input: UpdateProfileInput): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  },

  /**
   * Update user role in an organization (admin only)
   */
  async updateRoleInOrganization(
    userId: string,
    organizationId: string,
    input: UpdateUserRoleInput,
    requesterId: string,
  ): Promise<UserWithRole> {
    // Can't change own role
    if (userId === requesterId) {
      throw new Error("Cannot change your own role");
    }

    // Get target user's membership
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

    // Update the role
    await db
      .update(userOrganizations)
      .set({ role: input.role })
      .where(
        and(
          eq(userOrganizations.userId, userId),
          eq(userOrganizations.organizationId, organizationId),
        ),
      );

    // Return updated user
    const updated = await this.getByIdInOrganization(userId, organizationId);
    if (!updated) {
      throw new Error("Failed to update user role");
    }

    return updated;
  },

  /**
   * Deactivate user (admin only)
   */
  async deactivate(userId: string, requesterId: string): Promise<User> {
    // Can't deactivate self
    if (userId === requesterId) {
      throw new Error("Cannot deactivate your own account");
    }

    const [targetUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!targetUser) {
      throw new Error("User not found");
    }

    const [user] = await db
      .update(users)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    return user;
  },

  /**
   * Reactivate user (admin only)
   */
  async reactivate(userId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  },

  /**
   * Update last login timestamp
   */
  async updateLastLogin(userId: string): Promise<void> {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  },

  /**
   * Get agents for ticket assignment within an organization
   */
  async getAvailableAgents(organizationId: string): Promise<
    {
      id: string;
      name: string;
      email: string;
      avatarUrl: string | null;
      role: UserRole;
    }[]
  > {
    return await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        role: userOrganizations.role,
      })
      .from(users)
      .innerJoin(userOrganizations, eq(users.id, userOrganizations.userId))
      .where(
        and(
          eq(userOrganizations.organizationId, organizationId),
          eq(users.isActive, true),
          or(
            eq(userOrganizations.role, "agent"),
            eq(userOrganizations.role, "admin"),
            eq(userOrganizations.role, "owner"),
          ),
        ),
      )
      .orderBy(asc(users.name));
  },

  /**
   * Remove user from organization (admin only)
   */
  async removeFromOrganization(
    userId: string,
    organizationId: string,
    requesterId: string,
  ): Promise<void> {
    // Can't remove self
    if (userId === requesterId) {
      throw new Error("Cannot remove yourself from the organization");
    }

    // Get target user's membership
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
};
