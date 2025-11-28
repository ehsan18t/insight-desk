/**
 * Canned Responses Service
 * Business logic for canned response management
 */

import { and, count, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { cannedResponses } from "@/db/schema";
import { ForbiddenError, NotFoundError } from "@/middleware/error-handler";
import type { CreateCannedResponseBody, UpdateCannedResponseBody } from "./canned-responses.schema";

// Type for Canned Response
export type CannedResponse = typeof cannedResponses.$inferSelect;

// Return type for list with pagination
export interface PaginatedCannedResponses {
  data: CannedResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Get all canned responses for an organization with pagination
 */
async function list(
  organizationId: string,
  options: {
    page?: number;
    limit?: number;
    category?: string;
    search?: string;
  } = {},
): Promise<PaginatedCannedResponses> {
  const page = options.page || 1;
  const limit = options.limit || 50;
  const offset = (page - 1) * limit;

  const conditions = [eq(cannedResponses.organizationId, organizationId)];

  if (options.category) {
    conditions.push(eq(cannedResponses.category, options.category));
  }

  if (options.search) {
    conditions.push(
      or(
        ilike(cannedResponses.title, `%${options.search}%`),
        ilike(cannedResponses.content, `%${options.search}%`),
      )!,
    );
  }

  const whereClause = and(...conditions);

  const [responses, [{ total }]] = await Promise.all([
    db
      .select()
      .from(cannedResponses)
      .where(whereClause)
      .orderBy(cannedResponses.title)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(cannedResponses).where(whereClause),
  ]);

  return {
    data: responses,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get a single canned response by ID
 */
async function getById(id: string, organizationId: string): Promise<CannedResponse | null> {
  const [response] = await db
    .select()
    .from(cannedResponses)
    .where(and(eq(cannedResponses.id, id), eq(cannedResponses.organizationId, organizationId)))
    .limit(1);

  return response || null;
}

/**
 * Get canned response by shortcut
 */
async function getByShortcut(
  organizationId: string,
  shortcut: string,
): Promise<CannedResponse | null> {
  const [response] = await db
    .select()
    .from(cannedResponses)
    .where(
      and(
        eq(cannedResponses.organizationId, organizationId),
        eq(cannedResponses.shortcut, shortcut),
      ),
    )
    .limit(1);

  return response || null;
}

/**
 * Get all unique categories for an organization
 */
async function getCategories(organizationId: string): Promise<string[]> {
  const results = await db
    .selectDistinct({ category: cannedResponses.category })
    .from(cannedResponses)
    .where(eq(cannedResponses.organizationId, organizationId));

  return results
    .map((r) => r.category)
    .filter((c): c is string => c !== null)
    .sort();
}

/**
 * Create a new canned response
 */
async function create(
  organizationId: string,
  userId: string,
  data: CreateCannedResponseBody,
): Promise<CannedResponse> {
  // Check for duplicate shortcut
  if (data.shortcut) {
    const existing = await getByShortcut(organizationId, data.shortcut);
    if (existing) {
      throw new ForbiddenError(`Shortcut "${data.shortcut}" is already in use`);
    }
  }

  const [response] = await db
    .insert(cannedResponses)
    .values({
      organizationId,
      createdById: userId,
      title: data.title,
      content: data.content,
      shortcut: data.shortcut || null,
      category: data.category || null,
    })
    .returning();

  return response;
}

/**
 * Update an existing canned response
 */
async function update(
  id: string,
  organizationId: string,
  data: UpdateCannedResponseBody,
): Promise<CannedResponse> {
  const existing = await getById(id, organizationId);
  if (!existing) {
    throw new NotFoundError("Canned response not found");
  }

  // Check for duplicate shortcut if changing
  if (data.shortcut && data.shortcut !== existing.shortcut) {
    const duplicate = await getByShortcut(organizationId, data.shortcut);
    if (duplicate) {
      throw new ForbiddenError(`Shortcut "${data.shortcut}" is already in use`);
    }
  }

  const [updated] = await db
    .update(cannedResponses)
    .set({
      ...(data.title !== undefined && { title: data.title }),
      ...(data.content !== undefined && { content: data.content }),
      ...(data.shortcut !== undefined && { shortcut: data.shortcut }),
      ...(data.category !== undefined && { category: data.category }),
      updatedAt: new Date(),
    })
    .where(eq(cannedResponses.id, id))
    .returning();

  return updated;
}

/**
 * Delete a canned response
 */
async function remove(id: string, organizationId: string): Promise<void> {
  const existing = await getById(id, organizationId);
  if (!existing) {
    throw new NotFoundError("Canned response not found");
  }

  await db.delete(cannedResponses).where(eq(cannedResponses.id, id));
}

export const cannedResponsesService = {
  list,
  getById,
  getByShortcut,
  getCategories,
  create,
  update,
  remove,
};
