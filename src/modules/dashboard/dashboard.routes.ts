/**
 * Dashboard Routes
 * API endpoints for dashboard metrics
 */

import { type NextFunction, type Request, type Response, Router } from "express";
import { validateRequest } from "@/middleware/validate";
import { authenticate, requireRole } from "@/modules/auth";
import { dashboardStatsQuery, dashboardTrendsQuery } from "./dashboard.schema";
import { dashboardService } from "./dashboard.service";

const router = Router();

// All routes require authentication and agent+ role
router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// GET /api/dashboard/stats - Get dashboard statistics
// ─────────────────────────────────────────────────────────────
router.get(
  "/stats",
  requireRole("agent", "admin", "owner"),
  validateRequest({ query: dashboardStatsQuery }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await dashboardService.getStats(req.organizationId!, {
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      });

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
// GET /api/dashboard/trends - Get ticket trends
// ─────────────────────────────────────────────────────────────
router.get(
  "/trends",
  requireRole("agent", "admin", "owner"),
  validateRequest({ query: dashboardTrendsQuery }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const trends = await dashboardService.getTrends(req.organizationId!, {
        period: req.query.period as "day" | "week" | "month" | undefined,
        periods: Number(req.query.periods) || 7,
      });

      res.json({
        success: true,
        data: trends,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/dashboard/priority-distribution - Get priority breakdown
// ─────────────────────────────────────────────────────────────
router.get(
  "/priority-distribution",
  requireRole("agent", "admin", "owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const distribution = await dashboardService.getPriorityDistribution(req.organizationId!);

      res.json({
        success: true,
        data: distribution,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/dashboard/agent-performance - Get agent performance metrics
// ─────────────────────────────────────────────────────────────
router.get(
  "/agent-performance",
  requireRole("admin", "owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const performance = await dashboardService.getAgentPerformance(req.organizationId!);

      res.json({
        success: true,
        data: performance,
      });
    } catch (error) {
      next(error);
    }
  },
);

export const dashboardRouter = router;
