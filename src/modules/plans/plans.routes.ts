/**
 * Plans Routes
 * API endpoints for subscription plan management
 * Super admin only endpoints for managing plans
 */

import { type NextFunction, type Request, type Response, Router } from "express";
import { ForbiddenError, NotFoundError } from "@/middleware/error-handler";
import { validateRequest } from "@/middleware/validate";
import { authenticate, requireRole } from "@/modules/auth";
import {
  createPlanBody,
  listPlansQuery,
  planIdParam,
  planSlugParam,
  updatePlanBody,
} from "./plans.schema";
import { plansService } from "./plans.service";

const router = Router();

// ─────────────────────────────────────────────────────────────
// Public Routes (no auth required)
// ─────────────────────────────────────────────────────────────

// GET /api/plans/public - List visible plans for pricing page
router.get("/public", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const plans = await plansService.list({
      includeInactive: false,
      includeHidden: false,
    });

    // Strip internal fields for public display
    const publicPlans = plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      price: plan.price,
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      limits: plan.limits,
      features: plan.features,
      position: plan.position,
    }));

    res.json({
      success: true,
      data: publicPlans,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/plans/public/:slug - Get public plan by slug
router.get(
  "/public/:slug",
  validateRequest({ params: planSlugParam }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plan = await plansService.getBySlug(req.params.slug);

      if (!plan || !plan.isActive || !plan.isVisible) {
        throw new NotFoundError("Plan not found");
      }

      res.json({
        success: true,
        data: {
          id: plan.id,
          name: plan.name,
          slug: plan.slug,
          description: plan.description,
          price: plan.price,
          currency: plan.currency,
          billingInterval: plan.billingInterval,
          limits: plan.limits,
          features: plan.features,
          position: plan.position,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// Protected Routes (requires auth + owner role)
// ─────────────────────────────────────────────────────────────

// All following routes require authentication and owner role
router.use(authenticate);

// GET /api/plans - List all plans (admin view with all details)
router.get(
  "/",
  requireRole("owner"),
  validateRequest({ query: listPlansQuery }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const plans = await plansService.list({
        includeInactive: req.query.includeInactive === "true",
        includeHidden: req.query.includeHidden === "true",
      });

      res.json({
        success: true,
        data: plans,
      });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/plans/:id - Get plan by ID (admin view)
router.get(
  "/:id",
  requireRole("owner"),
  validateRequest({ params: planIdParam }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const plan = await plansService.getById(req.params.id);

      if (!plan) {
        throw new NotFoundError("Plan not found");
      }

      res.json({
        success: true,
        data: plan,
      });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/plans - Create a new plan
router.post(
  "/",
  requireRole("owner"),
  validateRequest({ body: createPlanBody }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const plan = await plansService.create(req.body);

      res.status(201).json({
        success: true,
        data: plan,
      });
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/plans/:id - Update a plan
router.patch(
  "/:id",
  requireRole("owner"),
  validateRequest({ params: planIdParam, body: updatePlanBody }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const plan = await plansService.update(req.params.id, req.body);

      res.json({
        success: true,
        data: plan,
      });
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /api/plans/:id - Delete a plan
router.delete(
  "/:id",
  requireRole("owner"),
  validateRequest({ params: planIdParam }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      await plansService.remove(req.params.id);

      res.json({
        success: true,
        data: { message: "Plan deleted successfully" },
      });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/plans/seed - Seed default plans (for initial setup)
router.post(
  "/seed",
  requireRole("owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const result = await plansService.seedDefaults();

      res.status(result.seeded ? 201 : 200).json({
        success: true,
        data: {
          seeded: result.seeded,
          plans: result.plans,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export { router as plansRouter };
