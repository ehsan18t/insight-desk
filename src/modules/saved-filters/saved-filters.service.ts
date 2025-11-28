import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { type SavedFilter, type SavedFilterCriteria, savedFilters } from "@/db/schema";
import { createLogger } from "@/lib/logger";
import { ForbiddenError, NotFoundError } from "@/middleware/error-handler";
import type {
  CreateSavedFilterInput,
  ReorderFiltersInput,
  UpdateSavedFilterInput,
} from "./saved-filters.schema";

const logger = createLogger("saved-filters");

// ─────────────────────────────────────────────────────────────
// Saved Filters Service
// ─────────────────────────────────────────────────────────────
export const savedFiltersService = {
  // List saved filters for user
  async list(
    organizationId: string,
    userId: string,
    includeShared = true,
  ): Promise<SavedFilter[]> {
    const conditions = [eq(savedFilters.organizationId, organizationId)];

    if (includeShared) {
      // Get user's filters + shared filters
      conditions.push(
        or(
          eq(savedFilters.userId, userId),
          eq(savedFilters.isShared, true),
        )!,
      );
    } else {
      // Get only user's filters
      conditions.push(eq(savedFilters.userId, userId));
    }

    const filters = await db.query.savedFilters.findMany({
      where: and(...conditions),
      orderBy: [asc(savedFilters.position), asc(savedFilters.createdAt)],
      with: {
        user: {
          columns: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    return filters;
  },

  // Get filter by ID
  async getById(
    filterId: string,
    organizationId: string,
    userId: string,
  ): Promise<SavedFilter | null> {
    const filter = await db.query.savedFilters.findFirst({
      where: and(
        eq(savedFilters.id, filterId),
        eq(savedFilters.organizationId, organizationId),
        or(
          eq(savedFilters.userId, userId),
          eq(savedFilters.isShared, true),
        ),
      ),
      with: {
        user: {
          columns: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    return filter || null;
  },

  // Create new saved filter
  async create(
    input: CreateSavedFilterInput,
    organizationId: string,
    userId: string,
  ): Promise<SavedFilter> {
    // Get the next position
    const existingFilters = await db.query.savedFilters.findMany({
      where: and(
        eq(savedFilters.organizationId, organizationId),
        eq(savedFilters.userId, userId),
      ),
      columns: { position: true },
    });

    const maxPosition = existingFilters.reduce(
      (max, f) => Math.max(max, f.position),
      -1,
    );

    // If this is set as default, unset other defaults
    if (input.isDefault) {
      await db
        .update(savedFilters)
        .set({ isDefault: false })
        .where(
          and(
            eq(savedFilters.organizationId, organizationId),
            eq(savedFilters.userId, userId),
            eq(savedFilters.isDefault, true),
          ),
        );
    }

    const [filter] = await db
      .insert(savedFilters)
      .values({
        organizationId,
        userId,
        name: input.name,
        description: input.description,
        criteria: input.criteria as SavedFilterCriteria,
        isDefault: input.isDefault,
        isShared: input.isShared,
        sortBy: input.sortBy,
        sortOrder: input.sortOrder,
        color: input.color,
        icon: input.icon,
        position: maxPosition + 1,
      })
      .returning();

    logger.info({ filterId: filter.id, name: input.name }, "Saved filter created");

    return filter;
  },

  // Update saved filter
  async update(
    filterId: string,
    input: UpdateSavedFilterInput,
    organizationId: string,
    userId: string,
  ): Promise<SavedFilter> {
    const filter = await db.query.savedFilters.findFirst({
      where: and(
        eq(savedFilters.id, filterId),
        eq(savedFilters.organizationId, organizationId),
      ),
    });

    if (!filter) {
      throw new NotFoundError("Saved filter not found");
    }

    // Only owner can update
    if (filter.userId !== userId) {
      throw new ForbiddenError("You can only update your own filters");
    }

    // If setting as default, unset other defaults
    if (input.isDefault === true) {
      await db
        .update(savedFilters)
        .set({ isDefault: false })
        .where(
          and(
            eq(savedFilters.organizationId, organizationId),
            eq(savedFilters.userId, userId),
            eq(savedFilters.isDefault, true),
          ),
        );
    }

    const [updated] = await db
      .update(savedFilters)
      .set({
        name: input.name ?? filter.name,
        description: input.description ?? filter.description,
        criteria: input.criteria ? (input.criteria as SavedFilterCriteria) : filter.criteria,
        isDefault: input.isDefault ?? filter.isDefault,
        isShared: input.isShared ?? filter.isShared,
        sortBy: input.sortBy ?? filter.sortBy,
        sortOrder: input.sortOrder ?? filter.sortOrder,
        color: input.color ?? filter.color,
        icon: input.icon ?? filter.icon,
        position: input.position ?? filter.position,
        updatedAt: new Date(),
      })
      .where(eq(savedFilters.id, filterId))
      .returning();

    logger.info({ filterId, updates: Object.keys(input) }, "Saved filter updated");

    return updated;
  },

  // Delete saved filter
  async delete(
    filterId: string,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const filter = await db.query.savedFilters.findFirst({
      where: and(
        eq(savedFilters.id, filterId),
        eq(savedFilters.organizationId, organizationId),
      ),
    });

    if (!filter) {
      throw new NotFoundError("Saved filter not found");
    }

    // Only owner can delete
    if (filter.userId !== userId) {
      throw new ForbiddenError("You can only delete your own filters");
    }

    await db.delete(savedFilters).where(eq(savedFilters.id, filterId));

    logger.info({ filterId }, "Saved filter deleted");
  },

  // Reorder filters
  async reorder(
    input: ReorderFiltersInput,
    organizationId: string,
    userId: string,
  ): Promise<SavedFilter[]> {
    // Verify all filters belong to user and organization
    const filters = await db.query.savedFilters.findMany({
      where: and(
        eq(savedFilters.organizationId, organizationId),
        eq(savedFilters.userId, userId),
        inArray(savedFilters.id, input.filterIds),
      ),
    });

    if (filters.length !== input.filterIds.length) {
      throw new ForbiddenError("Some filters do not belong to you");
    }

    // Update positions
    for (let i = 0; i < input.filterIds.length; i++) {
      await db
        .update(savedFilters)
        .set({ position: i, updatedAt: new Date() })
        .where(eq(savedFilters.id, input.filterIds[i]));
    }

    // Return updated filters
    const updated = await db.query.savedFilters.findMany({
      where: and(
        eq(savedFilters.organizationId, organizationId),
        eq(savedFilters.userId, userId),
      ),
      orderBy: [asc(savedFilters.position)],
    });

    logger.info({ userId, filterCount: input.filterIds.length }, "Filters reordered");

    return updated;
  },

  // Get default filter for user
  async getDefault(
    organizationId: string,
    userId: string,
  ): Promise<SavedFilter | null> {
    const filter = await db.query.savedFilters.findFirst({
      where: and(
        eq(savedFilters.organizationId, organizationId),
        eq(savedFilters.userId, userId),
        eq(savedFilters.isDefault, true),
      ),
    });

    return filter || null;
  },

  // Duplicate a filter
  async duplicate(
    filterId: string,
    organizationId: string,
    userId: string,
  ): Promise<SavedFilter> {
    const filter = await db.query.savedFilters.findFirst({
      where: and(
        eq(savedFilters.id, filterId),
        eq(savedFilters.organizationId, organizationId),
        or(
          eq(savedFilters.userId, userId),
          eq(savedFilters.isShared, true),
        ),
      ),
    });

    if (!filter) {
      throw new NotFoundError("Saved filter not found");
    }

    // Get the next position
    const existingFilters = await db.query.savedFilters.findMany({
      where: and(
        eq(savedFilters.organizationId, organizationId),
        eq(savedFilters.userId, userId),
      ),
      columns: { position: true },
    });

    const maxPosition = existingFilters.reduce(
      (max, f) => Math.max(max, f.position),
      -1,
    );

    const [newFilter] = await db
      .insert(savedFilters)
      .values({
        organizationId,
        userId,
        name: `${filter.name} (Copy)`,
        description: filter.description,
        criteria: filter.criteria,
        isDefault: false, // Duplicates are never default
        isShared: false, // Duplicates are never shared
        sortBy: filter.sortBy,
        sortOrder: filter.sortOrder,
        color: filter.color,
        icon: filter.icon,
        position: maxPosition + 1,
      })
      .returning();

    logger.info({ originalId: filterId, newId: newFilter.id }, "Saved filter duplicated");

    return newFilter;
  },
};
