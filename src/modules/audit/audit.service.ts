/**
 * Audit Service
 * Business logic for audit log management
 */

import { and, asc, count, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import type { AuditAction, CreateAuditLogInput, ListAuditLogsQuery } from "./audit.schema";

export interface AuditLogContext {
  organizationId: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export const auditService = {
  /**
   * Create a new audit log entry
   */
  async create(context: AuditLogContext, data: CreateAuditLogInput) {
    const [log] = await db
      .insert(auditLogs)
      .values({
        organizationId: context.organizationId,
        userId: context.userId,
        action: data.action,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        previousValue: data.previousValue,
        newValue: data.newValue,
        metadata: data.metadata ?? {},
      })
      .returning();

    return log;
  },

  /**
   * List audit logs with pagination and filters
   */
  async list(organizationId: string, query: ListAuditLogsQuery) {
    const { page, limit, action, userId, resourceType, resourceId, from, to, sortBy, sortOrder } =
      query;

    const conditions: SQL[] = [eq(auditLogs.organizationId, organizationId)];

    if (action) {
      conditions.push(eq(auditLogs.action, action));
    }

    if (userId) {
      conditions.push(eq(auditLogs.userId, userId));
    }

    if (resourceType) {
      conditions.push(eq(auditLogs.resourceType, resourceType));
    }

    if (resourceId) {
      conditions.push(eq(auditLogs.resourceId, resourceId));
    }

    if (from) {
      conditions.push(gte(auditLogs.createdAt, new Date(from)));
    }

    if (to) {
      conditions.push(lte(auditLogs.createdAt, new Date(to)));
    }

    // Get order column
    const orderColumn =
      sortBy === "action"
        ? auditLogs.action
        : sortBy === "userId"
          ? auditLogs.userId
          : auditLogs.createdAt;

    const orderFn = sortOrder === "asc" ? asc : desc;

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(auditLogs)
      .where(and(...conditions));

    // Get paginated logs with user info
    const logs = await db
      .select({
        id: auditLogs.id,
        organizationId: auditLogs.organizationId,
        userId: auditLogs.userId,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        ipAddress: auditLogs.ipAddress,
        userAgent: auditLogs.userAgent,
        previousValue: auditLogs.previousValue,
        newValue: auditLogs.newValue,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(and(...conditions))
      .orderBy(orderFn(orderColumn))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get a single audit log by ID
   */
  async getById(id: string, organizationId: string) {
    const [log] = await db
      .select({
        id: auditLogs.id,
        organizationId: auditLogs.organizationId,
        userId: auditLogs.userId,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        ipAddress: auditLogs.ipAddress,
        userAgent: auditLogs.userAgent,
        previousValue: auditLogs.previousValue,
        newValue: auditLogs.newValue,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(and(eq(auditLogs.id, id), eq(auditLogs.organizationId, organizationId)))
      .limit(1);

    return log || null;
  },

  /**
   * Export audit logs (returns all matching logs)
   */
  async export(
    organizationId: string,
    options: {
      action?: AuditAction;
      userId?: string;
      from?: string;
      to?: string;
    },
  ) {
    const conditions: SQL[] = [eq(auditLogs.organizationId, organizationId)];

    if (options.action) {
      conditions.push(eq(auditLogs.action, options.action));
    }

    if (options.userId) {
      conditions.push(eq(auditLogs.userId, options.userId));
    }

    if (options.from) {
      conditions.push(gte(auditLogs.createdAt, new Date(options.from)));
    }

    if (options.to) {
      conditions.push(lte(auditLogs.createdAt, new Date(options.to)));
    }

    const logs = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        ipAddress: auditLogs.ipAddress,
        userAgent: auditLogs.userAgent,
        previousValue: auditLogs.previousValue,
        newValue: auditLogs.newValue,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(10000); // Max 10k records for export

    return logs;
  },

  /**
   * Log a user action (helper method for common actions)
   */
  async logAction(
    context: AuditLogContext,
    action: AuditAction,
    options: {
      resourceType?: string;
      resourceId?: string;
      previousValue?: Record<string, unknown>;
      newValue?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    } = {},
  ) {
    return this.create(context, {
      action,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      previousValue: options.previousValue,
      newValue: options.newValue,
      metadata: options.metadata,
    });
  },

  /**
   * Get audit context from request
   */
  getContextFromRequest(req: {
    organizationId?: string;
    user?: { id: string };
    ip?: string;
    headers?: { "user-agent"?: string };
  }): AuditLogContext | null {
    if (!req.organizationId) return null;

    return {
      organizationId: req.organizationId,
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.headers?.["user-agent"],
    };
  },
};
