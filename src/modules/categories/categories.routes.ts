/**
 * Categories Routes
 * API endpoints for category management
 */

import { type NextFunction, type Request, type Response, Router } from "express";
import { ForbiddenError } from "@/middleware/error-handler";
import { validateRequest } from "@/middleware/validate";
import { authenticate, requireRole } from "@/modules/auth";
import {
  categoryIdParam,
  createCategoryBody,
  listCategoriesQuery,
  updateCategoryBody,
} from "./categories.schema";
import { categoriesService } from "./categories.service";

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// GET /api/categories - List categories for organization
// ─────────────────────────────────────────────────────────────
router.get(
  "/",
  validateRequest({ query: listCategoriesQuery }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const categories = await categoriesService.list(req.organizationId, {
        includeInactive: req.query.includeInactive === "true",
        parentId: req.query.parentId as string | null | undefined,
      });

      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/categories/tree - Get category tree structure
// ─────────────────────────────────────────────────────────────
router.get("/tree", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.organizationId) {
      throw new ForbiddenError("Organization context required");
    }

    const tree = await categoriesService.getTree(req.organizationId);

    res.json({
      success: true,
      data: tree,
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/categories/stats - Get ticket counts per category
// ─────────────────────────────────────────────────────────────
router.get(
  "/stats",
  requireRole("agent", "admin", "owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const stats = await categoriesService.getTicketCounts(req.organizationId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/categories/:id - Get single category
// ─────────────────────────────────────────────────────────────
router.get(
  "/:id",
  validateRequest({ params: categoryIdParam }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const category = await categoriesService.getById(req.params.id, req.organizationId);

      if (!category) {
        res.status(404).json({
          success: false,
          error: "NotFound",
          message: "Category not found",
        });
        return;
      }

      res.json({
        success: true,
        data: category,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/categories - Create category (admin/owner only)
// ─────────────────────────────────────────────────────────────
router.post(
  "/",
  requireRole("admin", "owner"),
  validateRequest({ body: createCategoryBody }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const category = await categoriesService.create(req.organizationId, req.body);

      res.status(201).json({
        success: true,
        data: category,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// PATCH /api/categories/:id - Update category (admin/owner only)
// ─────────────────────────────────────────────────────────────
router.patch(
  "/:id",
  requireRole("admin", "owner"),
  validateRequest({ params: categoryIdParam, body: updateCategoryBody }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const category = await categoriesService.update(
        req.params.id,
        req.organizationId,
        req.body,
      );

      res.json({
        success: true,
        data: category,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// DELETE /api/categories/:id - Delete category (admin/owner only)
// ─────────────────────────────────────────────────────────────
router.delete(
  "/:id",
  requireRole("admin", "owner"),
  validateRequest({ params: categoryIdParam }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const result = await categoriesService.remove(req.params.id, req.organizationId);

      res.json({
        success: true,
        ...result,
        message: result.deleted
          ? "Category deleted permanently"
          : "Category deactivated (has associated tickets)",
      });
    } catch (error) {
      next(error);
    }
  },
);

export const categoriesRouter = router;
