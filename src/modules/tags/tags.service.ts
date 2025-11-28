/**
 * Tags Service
 * Business logic for tag management
 * 
 * Tags are stored as text arrays on tickets but we also maintain
 * a dedicated tags table for metadata (color, usage stats)
 */

import { and, count, eq, ilike, sql } from "drizzle-orm";
import { db } from "@/db";
import { tags } from "@/db/schema";
import { NotFoundError } from "@/middleware/error-handler";
import type { CreateTagBody, UpdateTagBody } from "./tags.schema";

export const tagsService = {
  /**
   * List all tags for an organization
   */
  async list(organizationId: string, options: { search?: string; limit?: number } = {}) {
    const { search, limit = 50 } = options;

    const conditions = [eq(tags.organizationId, organizationId)];

    if (search) {
      conditions.push(ilike(tags.name, `%${search}%`));
    }

    const result = await db
      .select()
      .from(tags)
      .where(and(...conditions))
      .orderBy(tags.name)
      .limit(limit);

    return result;
  },

  /**
   * Get a tag by name
   */
  async getByName(name: string, organizationId: string) {
    const [tag] = await db
      .select()
      .from(tags)
      .where(and(eq(tags.name, name.toLowerCase()), eq(tags.organizationId, organizationId)))
      .limit(1);

    return tag || null;
  },

  /**
   * Create a new tag
   */
  async create(organizationId: string, data: CreateTagBody) {
    // Check if tag already exists
    const existing = await this.getByName(data.name, organizationId);
    if (existing) {
      return existing; // Return existing tag instead of error
    }

    const [tag] = await db
      .insert(tags)
      .values({
        organizationId,
        name: data.name.toLowerCase(),
        color: data.color,
      })
      .returning();

    return tag;
  },

  /**
   * Update a tag
   */
  async update(name: string, organizationId: string, data: UpdateTagBody) {
    const [tag] = await db
      .update(tags)
      .set({
        ...data,
        name: data.name?.toLowerCase(),
        updatedAt: new Date(),
      })
      .where(and(eq(tags.name, name.toLowerCase()), eq(tags.organizationId, organizationId)))
      .returning();

    if (!tag) {
      throw new NotFoundError("Tag not found");
    }

    // If name changed, update all tickets with this tag
    if (data.name && data.name !== name) {
      await db.execute(sql`
        UPDATE tickets 
        SET tags = array_replace(tags, ${name.toLowerCase()}, ${data.name.toLowerCase()})
        WHERE organization_id = ${organizationId}
        AND ${name.toLowerCase()} = ANY(tags)
      `);
    }

    return tag;
  },

  /**
   * Delete a tag
   */
  async remove(name: string, organizationId: string) {
    const [deleted] = await db
      .delete(tags)
      .where(and(eq(tags.name, name.toLowerCase()), eq(tags.organizationId, organizationId)))
      .returning();

    if (!deleted) {
      throw new NotFoundError("Tag not found");
    }

    // Remove tag from all tickets
    await db.execute(sql`
      UPDATE tickets 
      SET tags = array_remove(tags, ${name.toLowerCase()})
      WHERE organization_id = ${organizationId}
      AND ${name.toLowerCase()} = ANY(tags)
    `);

    return { deleted: true };
  },

  /**
   * Get popular tags by usage count
   */
  async getPopular(organizationId: string, limit = 10) {
    // Get tags with usage counts from tickets
    const result = await db.execute<{ name: string; count: number; color: string | null }>(sql`
      SELECT t.name, t.color, COALESCE(usage.count, 0)::int as count
      FROM tags t
      LEFT JOIN (
        SELECT unnest(tags) as tag_name, COUNT(*) as count
        FROM tickets
        WHERE organization_id = ${organizationId}
        AND status IN ('open', 'pending')
        GROUP BY unnest(tags)
      ) usage ON t.name = usage.tag_name
      WHERE t.organization_id = ${organizationId}
      ORDER BY count DESC, t.name ASC
      LIMIT ${limit}
    `);

    return Array.from(result);
  },

  /**
   * Get all unique tags from tickets (for autocomplete)
   */
  async getTicketTags(organizationId: string, search?: string) {
    const query = sql`
      SELECT DISTINCT unnest(tags) as name
      FROM tickets
      WHERE organization_id = ${organizationId}
    `;

    const result = await db.execute<{ name: string }>(query);
    const resultArray = Array.from(result);

    // Filter by search if provided
    let tagNames = resultArray.map((r) => r.name);
    if (search) {
      tagNames = tagNames.filter((t: string) => t.toLowerCase().includes(search.toLowerCase()));
    }

    return tagNames.sort();
  },

  /**
   * Ensure tags exist in tags table (for consistency)
   */
  async ensureTagsExist(organizationId: string, tagNames: string[]) {
    for (const name of tagNames) {
      await this.create(organizationId, { name: name.toLowerCase() });
    }
  },

  /**
   * Get tag usage statistics
   */
  async getStats(organizationId: string) {
    const [totalTags] = await db
      .select({ count: count() })
      .from(tags)
      .where(eq(tags.organizationId, organizationId));

    const ticketTagStats = await db.execute<{ total_uses: number; unique_tags: number }>(sql`
      SELECT 
        COUNT(*)::int as total_uses,
        COUNT(DISTINCT tag)::int as unique_tags
      FROM (
        SELECT unnest(tags) as tag
        FROM tickets
        WHERE organization_id = ${organizationId}
      ) t
    `);

    const statsArray = Array.from(ticketTagStats);

    return {
      totalTags: totalTags?.count || 0,
      totalUses: statsArray[0]?.total_uses || 0,
      uniqueInUse: statsArray[0]?.unique_tags || 0,
    };
  },
};
