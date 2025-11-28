/**
 * Categories Service
 * Business logic for category management
 */

import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { type Category, categories, tickets } from "@/db/schema";
import { NotFoundError } from "@/middleware/error-handler";
import type { CreateCategoryBody, UpdateCategoryBody } from "./categories.schema";

interface CategoryWithChildren extends Category {
  children: CategoryWithChildren[];
}

export const categoriesService = {
  /**
   * List all categories for an organization
   */
  async list(
    organizationId: string,
    options: { includeInactive?: boolean; parentId?: string | null } = {},
  ) {
    const conditions = [eq(categories.organizationId, organizationId)];

    if (!options.includeInactive) {
      conditions.push(eq(categories.isActive, true));
    }

    if (options.parentId === null) {
      conditions.push(isNull(categories.parentId));
    } else if (options.parentId) {
      conditions.push(eq(categories.parentId, options.parentId));
    }

    const result = await db
      .select()
      .from(categories)
      .where(and(...conditions))
      .orderBy(categories.name);

    return result;
  },

  /**
   * Get a category by ID
   */
  async getById(id: string, organizationId: string) {
    const [category] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.organizationId, organizationId)))
      .limit(1);

    return category || null;
  },

  /**
   * Create a new category
   */
  async create(organizationId: string, data: CreateCategoryBody) {
    // Validate parent category if provided
    if (data.parentId) {
      const parent = await this.getById(data.parentId, organizationId);
      if (!parent) {
        throw new NotFoundError("Parent category not found");
      }
    }

    const [category] = await db
      .insert(categories)
      .values({
        organizationId,
        name: data.name,
        description: data.description,
        color: data.color,
        parentId: data.parentId,
      })
      .returning();

    return category;
  },

  /**
   * Update a category
   */
  async update(id: string, organizationId: string, data: UpdateCategoryBody) {
    // Validate parent category if provided
    if (data.parentId) {
      if (data.parentId === id) {
        throw new Error("Category cannot be its own parent");
      }
      const parent = await this.getById(data.parentId, organizationId);
      if (!parent) {
        throw new NotFoundError("Parent category not found");
      }
    }

    const [category] = await db
      .update(categories)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(categories.id, id), eq(categories.organizationId, organizationId)))
      .returning();

    if (!category) {
      throw new NotFoundError("Category not found");
    }

    return category;
  },

  /**
   * Delete a category (soft delete by setting isActive = false)
   */
  async remove(id: string, organizationId: string) {
    // Check if category has tickets
    const [ticketCount] = await db
      .select({ count: tickets.id })
      .from(tickets)
      .where(eq(tickets.categoryId, id))
      .limit(1);

    if (ticketCount) {
      // Soft delete - just deactivate
      const [category] = await db
        .update(categories)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(categories.id, id), eq(categories.organizationId, organizationId)))
        .returning();

      if (!category) {
        throw new NotFoundError("Category not found");
      }

      return { deleted: false, deactivated: true };
    }

    // Hard delete if no tickets
    const [deleted] = await db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.organizationId, organizationId)))
      .returning();

    if (!deleted) {
      throw new NotFoundError("Category not found");
    }

    return { deleted: true, deactivated: false };
  },

  /**
   * Get category tree (categories with their children)
   */
  async getTree(organizationId: string): Promise<CategoryWithChildren[]> {
    const allCategories = await this.list(organizationId, { parentId: null });

    // Build tree structure
    const buildTree = async (parentCategories: Category[]): Promise<CategoryWithChildren[]> => {
      const result: CategoryWithChildren[] = [];
      for (const category of parentCategories) {
        const children = await this.list(organizationId, { parentId: category.id });
        result.push({
          ...category,
          children: children.length > 0 ? await buildTree(children) : [],
        });
      }
      return result;
    };

    return buildTree(allCategories);
  },

  /**
   * Get ticket count per category
   */
  async getTicketCounts(organizationId: string) {
    const result = await db
      .select({
        categoryId: tickets.categoryId,
        count: count(tickets.id),
      })
      .from(tickets)
      .where(eq(tickets.organizationId, organizationId))
      .groupBy(tickets.categoryId);

    return result;
  },
};
