/**
 * SLA Policies Routes
 * API endpoints for SLA policy management
 */

import { type NextFunction, type Request, type Response, Router } from "express";
import { validateRequest } from "@/middleware/validate";
import { authenticate, requireRole } from "@/modules/auth";
import {
  createSlaPolicyBody,
  listSlaPoliciesQuery,
  slaPolicyIdParam,
  updateSlaPolicyBody,
} from "./sla.schema";
import { slaService } from "./sla.service";

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// GET /api/sla-policies - List SLA policies for organization
// ─────────────────────────────────────────────────────────────
router.get(
  "/",
  requireRole("agent", "admin", "owner"),
  validateRequest({ query: listSlaPoliciesQuery }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const policies = await slaService.list(req.organizationId!, {
        priority: req.query.priority as "low" | "medium" | "high" | "urgent" | undefined,
      });

      res.json({
        success: true,
        data: policies,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/sla-policies/:id - Get single SLA policy
// ─────────────────────────────────────────────────────────────
router.get(
  "/:id",
  requireRole("agent", "admin", "owner"),
  validateRequest({ params: slaPolicyIdParam }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const policy = await slaService.getById(req.params.id, req.organizationId!);

      if (!policy) {
        res.status(404).json({
          success: false,
          error: "NotFound",
          message: "SLA policy not found",
        });
        return;
      }

      res.json({
        success: true,
        data: policy,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/sla-policies - Create SLA policy (admin/owner only)
// ─────────────────────────────────────────────────────────────
router.post(
  "/",
  requireRole("admin", "owner"),
  validateRequest({ body: createSlaPolicyBody }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const policy = await slaService.create(req.organizationId!, req.body);

      res.status(201).json({
        success: true,
        data: policy,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// PATCH /api/sla-policies/:id - Update SLA policy (admin/owner only)
// ─────────────────────────────────────────────────────────────
router.patch(
  "/:id",
  requireRole("admin", "owner"),
  validateRequest({ params: slaPolicyIdParam, body: updateSlaPolicyBody }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const policy = await slaService.update(req.params.id, req.organizationId!, req.body);

      res.json({
        success: true,
        data: policy,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// DELETE /api/sla-policies/:id - Delete SLA policy (admin/owner only)
// ─────────────────────────────────────────────────────────────
router.delete(
  "/:id",
  requireRole("admin", "owner"),
  validateRequest({ params: slaPolicyIdParam }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await slaService.remove(req.params.id, req.organizationId!);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/sla-policies/initialize - Initialize default policies
// ─────────────────────────────────────────────────────────────
router.post(
  "/initialize",
  requireRole("admin", "owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const policies = await slaService.initializeDefaults(req.organizationId!);

      res.status(201).json({
        success: true,
        data: policies,
      });
    } catch (error) {
      next(error);
    }
  },
);

export const slaRouter = router;
