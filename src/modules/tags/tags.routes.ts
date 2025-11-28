/**
 * Tags Routes
 * API endpoints for tag management
 */

import { type NextFunction, type Request, type Response, Router } from "express";
import { ForbiddenError } from "@/middleware/error-handler";
import { validateRequest } from "@/middleware/validate";
import { authenticate, requireRole } from "@/modules/auth";
import {
  createTagBody,
  listTagsQuery,
  popularTagsQuery,
  tagNameParam,
  updateTagBody,
} from "./tags.schema";
import { tagsService } from "./tags.service";

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// GET /api/tags - List all tags for organization
// ─────────────────────────────────────────────────────────────
router.get(
  "/",
  validateRequest({ query: listTagsQuery }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const tags = await tagsService.list(req.organizationId, {
        search: req.query.search as string | undefined,
        limit: Number(req.query.limit) || 50,
      });

      res.json({
        success: true,
        data: tags,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/tags/popular - Get popular tags by usage
// ─────────────────────────────────────────────────────────────
router.get(
  "/popular",
  validateRequest({ query: popularTagsQuery }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const tags = await tagsService.getPopular(
        req.organizationId,
        Number(req.query.limit) || 10,
      );

      res.json({
        success: true,
        data: tags,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/tags/autocomplete - Get tags for autocomplete
// ─────────────────────────────────────────────────────────────
router.get(
  "/autocomplete",
  validateRequest({ query: listTagsQuery }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const tags = await tagsService.getTicketTags(
        req.organizationId,
        req.query.search as string | undefined,
      );

      res.json({
        success: true,
        data: tags,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/tags/stats - Get tag usage statistics
// ─────────────────────────────────────────────────────────────
router.get(
  "/stats",
  requireRole("agent", "admin", "owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const stats = await tagsService.getStats(req.organizationId);

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
// GET /api/tags/:name - Get tag by name
// ─────────────────────────────────────────────────────────────
router.get(
  "/:name",
  validateRequest({ params: tagNameParam }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const tag = await tagsService.getByName(req.params.name, req.organizationId);

      if (!tag) {
        res.status(404).json({
          success: false,
          error: "NotFound",
          message: "Tag not found",
        });
        return;
      }

      res.json({
        success: true,
        data: tag,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/tags - Create tag
// ─────────────────────────────────────────────────────────────
router.post(
  "/",
  requireRole("agent", "admin", "owner"),
  validateRequest({ body: createTagBody }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const tag = await tagsService.create(req.organizationId, req.body);

      res.status(201).json({
        success: true,
        data: tag,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// PATCH /api/tags/:name - Update tag
// ─────────────────────────────────────────────────────────────
router.patch(
  "/:name",
  requireRole("admin", "owner"),
  validateRequest({ params: tagNameParam, body: updateTagBody }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const tag = await tagsService.update(req.params.name, req.organizationId, req.body);

      res.json({
        success: true,
        data: tag,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// DELETE /api/tags/:name - Delete tag
// ─────────────────────────────────────────────────────────────
router.delete(
  "/:name",
  requireRole("admin", "owner"),
  validateRequest({ params: tagNameParam }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      await tagsService.remove(req.params.name, req.organizationId);

      res.json({
        success: true,
        message: "Tag deleted and removed from all tickets",
      });
    } catch (error) {
      next(error);
    }
  },
);

export const tagsRouter = router;
