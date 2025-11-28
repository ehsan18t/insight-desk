/**
 * Canned Responses Routes
 * API endpoints for canned response management
 */

import { type NextFunction, type Request, type Response, Router } from "express";
import { validateRequest } from "@/middleware/validate";
import { authenticate, requireRole } from "@/modules/auth";
import {
  cannedResponseIdParam,
  createCannedResponseBody,
  listCannedResponsesQuery,
  updateCannedResponseBody,
} from "./canned-responses.schema";
import { cannedResponsesService } from "./canned-responses.service";

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// GET /api/canned-responses - List canned responses
// ─────────────────────────────────────────────────────────────
router.get(
  "/",
  requireRole("agent", "admin", "owner"),
  validateRequest({ query: listCannedResponsesQuery }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await cannedResponsesService.list(req.organizationId!, {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 50,
        category: req.query.category as string | undefined,
        search: req.query.search as string | undefined,
      });

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/canned-responses/categories - List categories
// ─────────────────────────────────────────────────────────────
router.get(
  "/categories",
  requireRole("agent", "admin", "owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const categories = await cannedResponsesService.getCategories(req.organizationId!);

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
// GET /api/canned-responses/:id - Get single canned response
// ─────────────────────────────────────────────────────────────
router.get(
  "/:id",
  requireRole("agent", "admin", "owner"),
  validateRequest({ params: cannedResponseIdParam }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const response = await cannedResponsesService.getById(req.params.id, req.organizationId!);

      if (!response) {
        res.status(404).json({
          success: false,
          error: "NotFound",
          message: "Canned response not found",
        });
        return;
      }

      res.json({
        success: true,
        data: response,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/canned-responses - Create canned response
// ─────────────────────────────────────────────────────────────
router.post(
  "/",
  requireRole("agent", "admin", "owner"),
  validateRequest({ body: createCannedResponseBody }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const response = await cannedResponsesService.create(
        req.organizationId!,
        req.user!.id,
        req.body,
      );

      res.status(201).json({
        success: true,
        data: response,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// PATCH /api/canned-responses/:id - Update canned response
// ─────────────────────────────────────────────────────────────
router.patch(
  "/:id",
  requireRole("agent", "admin", "owner"),
  validateRequest({ params: cannedResponseIdParam, body: updateCannedResponseBody }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const response = await cannedResponsesService.update(
        req.params.id,
        req.organizationId!,
        req.body,
      );

      res.json({
        success: true,
        data: response,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// DELETE /api/canned-responses/:id - Delete canned response
// ─────────────────────────────────────────────────────────────
router.delete(
  "/:id",
  requireRole("agent", "admin", "owner"),
  validateRequest({ params: cannedResponseIdParam }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await cannedResponsesService.remove(req.params.id, req.organizationId!);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

export const cannedResponsesRouter = router;
