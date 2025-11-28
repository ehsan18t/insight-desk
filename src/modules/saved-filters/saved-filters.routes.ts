import { type NextFunction, type Request, type Response, Router } from "express";
import { validateRequest } from "@/middleware/validate";
import { authenticate } from "@/modules/auth/auth.middleware";
import {
  createSavedFilterSchema,
  reorderFiltersSchema,
  savedFilterIdParamSchema,
  savedFilterQuerySchema,
  updateSavedFilterSchema,
} from "./saved-filters.schema";
import { savedFiltersService } from "./saved-filters.service";

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// GET /api/saved-filters - List saved filters
// ─────────────────────────────────────────────────────────────
router.get(
  "/",
  validateRequest({ query: savedFilterQuerySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as { includeShared: boolean };
      const filters = await savedFiltersService.list(
        req.organizationId!,
        req.user!.id,
        query.includeShared,
      );

      res.json({
        success: true,
        data: filters,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/saved-filters/default - Get default filter
// ─────────────────────────────────────────────────────────────
router.get(
  "/default",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter = await savedFiltersService.getDefault(
        req.organizationId!,
        req.user!.id,
      );

      res.json({
        success: true,
        data: filter,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/saved-filters/:id - Get filter by ID
// ─────────────────────────────────────────────────────────────
router.get(
  "/:id",
  validateRequest({ params: savedFilterIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter = await savedFiltersService.getById(
        req.params.id,
        req.organizationId!,
        req.user!.id,
      );

      if (!filter) {
        return res.status(404).json({
          success: false,
          error: "Saved filter not found",
        });
      }

      res.json({
        success: true,
        data: filter,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/saved-filters - Create new filter
// ─────────────────────────────────────────────────────────────
router.post(
  "/",
  validateRequest({ body: createSavedFilterSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter = await savedFiltersService.create(
        req.body,
        req.organizationId!,
        req.user!.id,
      );

      res.status(201).json({
        success: true,
        data: filter,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/saved-filters/reorder - Reorder filters
// ─────────────────────────────────────────────────────────────
router.post(
  "/reorder",
  validateRequest({ body: reorderFiltersSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = await savedFiltersService.reorder(
        req.body,
        req.organizationId!,
        req.user!.id,
      );

      res.json({
        success: true,
        data: filters,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/saved-filters/:id/duplicate - Duplicate filter
// ─────────────────────────────────────────────────────────────
router.post(
  "/:id/duplicate",
  validateRequest({ params: savedFilterIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter = await savedFiltersService.duplicate(
        req.params.id,
        req.organizationId!,
        req.user!.id,
      );

      res.status(201).json({
        success: true,
        data: filter,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// PATCH /api/saved-filters/:id - Update filter
// ─────────────────────────────────────────────────────────────
router.patch(
  "/:id",
  validateRequest({ params: savedFilterIdParamSchema, body: updateSavedFilterSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter = await savedFiltersService.update(
        req.params.id,
        req.body,
        req.organizationId!,
        req.user!.id,
      );

      res.json({
        success: true,
        data: filter,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// DELETE /api/saved-filters/:id - Delete filter
// ─────────────────────────────────────────────────────────────
router.delete(
  "/:id",
  validateRequest({ params: savedFilterIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await savedFiltersService.delete(
        req.params.id,
        req.organizationId!,
        req.user!.id,
      );

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

export const savedFiltersRouter = router;
