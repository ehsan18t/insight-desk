/**
 * SLA Policies Service
 * Business logic for SLA policy management
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { DEFAULT_SLA_TIMES, slaPolicies, type ticketPriorityEnum } from "@/db/schema";
import { NotFoundError } from "@/middleware/error-handler";
import type { CreateSlaPolicyBody, UpdateSlaPolicyBody } from "./sla.schema";

// Type for SLA Policy
export type SlaPolicy = typeof slaPolicies.$inferSelect;
export type SlaPriority = (typeof ticketPriorityEnum.enumValues)[number];

/**
 * Get all SLA policies for an organization
 */
async function list(
  organizationId: string,
  filters?: { priority?: SlaPriority },
): Promise<SlaPolicy[]> {
  const conditions = [eq(slaPolicies.organizationId, organizationId)];

  if (filters?.priority) {
    conditions.push(eq(slaPolicies.priority, filters.priority));
  }

  const policies = await db
    .select()
    .from(slaPolicies)
    .where(and(...conditions))
    .orderBy(slaPolicies.priority);

  return policies;
}

/**
 * Get a single SLA policy by ID
 */
async function getById(id: string, organizationId: string): Promise<SlaPolicy | null> {
  const [policy] = await db
    .select()
    .from(slaPolicies)
    .where(and(eq(slaPolicies.id, id), eq(slaPolicies.organizationId, organizationId)))
    .limit(1);

  return policy || null;
}

/**
 * Get SLA policy by priority (for calculating deadlines)
 */
async function getByPriority(
  organizationId: string,
  priority: SlaPriority,
): Promise<SlaPolicy | null> {
  const [policy] = await db
    .select()
    .from(slaPolicies)
    .where(and(eq(slaPolicies.organizationId, organizationId), eq(slaPolicies.priority, priority)))
    .limit(1);

  return policy || null;
}

/**
 * Get SLA times for a priority (from policy or defaults)
 */
async function getSlaTimesForPriority(
  organizationId: string,
  priority: SlaPriority,
): Promise<{ firstResponseTime: number; resolutionTime: number }> {
  const policy = await getByPriority(organizationId, priority);

  if (policy) {
    return {
      firstResponseTime: policy.firstResponseTime,
      resolutionTime: policy.resolutionTime,
    };
  }

  // Return default times
  return DEFAULT_SLA_TIMES[priority];
}

/**
 * Create a new SLA policy
 */
async function create(organizationId: string, data: CreateSlaPolicyBody): Promise<SlaPolicy> {
  // Check if policy already exists for this priority
  const existing = await getByPriority(organizationId, data.priority);
  if (existing) {
    // Update existing policy instead
    return update(existing.id, organizationId, data);
  }

  const [policy] = await db
    .insert(slaPolicies)
    .values({
      organizationId,
      name: data.name,
      priority: data.priority,
      firstResponseTime: data.firstResponseTime,
      resolutionTime: data.resolutionTime,
      businessHoursOnly: data.businessHoursOnly,
      isDefault: data.isDefault,
    })
    .returning();

  return policy;
}

/**
 * Update an existing SLA policy
 */
async function update(
  id: string,
  organizationId: string,
  data: UpdateSlaPolicyBody,
): Promise<SlaPolicy> {
  const existing = await getById(id, organizationId);
  if (!existing) {
    throw new NotFoundError("SLA policy not found");
  }

  const [updated] = await db
    .update(slaPolicies)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.firstResponseTime !== undefined && {
        firstResponseTime: data.firstResponseTime,
      }),
      ...(data.resolutionTime !== undefined && {
        resolutionTime: data.resolutionTime,
      }),
      ...(data.businessHoursOnly !== undefined && {
        businessHoursOnly: data.businessHoursOnly,
      }),
      ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
      updatedAt: new Date(),
    })
    .where(eq(slaPolicies.id, id))
    .returning();

  return updated;
}

/**
 * Delete an SLA policy
 */
async function remove(id: string, organizationId: string): Promise<void> {
  const existing = await getById(id, organizationId);
  if (!existing) {
    throw new NotFoundError("SLA policy not found");
  }

  await db.delete(slaPolicies).where(eq(slaPolicies.id, id));
}

/**
 * Initialize default SLA policies for an organization
 */
async function initializeDefaults(organizationId: string): Promise<SlaPolicy[]> {
  const priorities: SlaPriority[] = ["low", "medium", "high", "urgent"];
  const policies: SlaPolicy[] = [];

  for (const priority of priorities) {
    const existing = await getByPriority(organizationId, priority);
    if (!existing) {
      const defaults = DEFAULT_SLA_TIMES[priority];
      const policy = await create(organizationId, {
        name: `${priority.charAt(0).toUpperCase() + priority.slice(1)} Priority SLA`,
        priority,
        firstResponseTime: defaults.firstResponseTime,
        resolutionTime: defaults.resolutionTime,
        businessHoursOnly: true,
        isDefault: true,
      });
      policies.push(policy);
    } else {
      policies.push(existing);
    }
  }

  return policies;
}

export const slaService = {
  list,
  getById,
  getByPriority,
  getSlaTimesForPriority,
  create,
  update,
  remove,
  initializeDefaults,
};
