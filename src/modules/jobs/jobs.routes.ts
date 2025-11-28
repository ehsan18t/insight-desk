/**
 * Jobs Routes
 * Admin endpoints for managing background jobs
 */

import { Router } from "express";
import { createLogger } from "@/lib/logger";
import { requireAuth } from "@/middleware/auth";
import { requireOrg, requireOrgRole } from "@/middleware/organization";
import {
  getJobStatus,
  triggerJob,
  getSlaStats,
  getAutoClosePreview,
} from "@/jobs";

const router = Router();
const logger = createLogger("jobs:routes");

// All routes require authentication and admin role
router.use(requireAuth);
router.use(requireOrg);
router.use(requireOrgRole(["admin", "owner"]));

// ─────────────────────────────────────────────────────────────
// GET /api/jobs/status - Get status of all scheduled jobs
// ─────────────────────────────────────────────────────────────
router.get("/status", async (_req, res) => {
  try {
    const status = getJobStatus();
    return res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error({ error }, "Failed to get job status");
    return res.status(500).json({
      success: false,
      error: "Failed to get job status",
    });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/jobs/:name/trigger - Manually trigger a job
// ─────────────────────────────────────────────────────────────
router.post("/:name/trigger", async (req, res) => {
  try {
    const { name } = req.params;
    const triggered = await triggerJob(name);

    if (!triggered) {
      return res.status(404).json({
        success: false,
        error: `Job '${name}' not found`,
      });
    }

    logger.info({ name, userId: req.user!.id }, "Job manually triggered");

    return res.json({
      success: true,
      message: `Job '${name}' triggered successfully`,
    });
  } catch (error) {
    logger.error({ error, name: req.params.name }, "Failed to trigger job");
    return res.status(500).json({
      success: false,
      error: "Failed to trigger job",
    });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/jobs/sla/stats - Get SLA statistics
// ─────────────────────────────────────────────────────────────
router.get("/sla/stats", async (req, res) => {
  try {
    const stats = await getSlaStats(req.organization!.id);

    return res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error({ error }, "Failed to get SLA stats");
    return res.status(500).json({
      success: false,
      error: "Failed to get SLA statistics",
    });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/jobs/auto-close/preview - Preview auto-close candidates
// ─────────────────────────────────────────────────────────────
router.get("/auto-close/preview", async (req, res) => {
  try {
    const preview = await getAutoClosePreview(req.organization!.id);

    return res.json({
      success: true,
      data: preview,
    });
  } catch (error) {
    logger.error({ error }, "Failed to get auto-close preview");
    return res.status(500).json({
      success: false,
      error: "Failed to get auto-close preview",
    });
  }
});

export { router as jobsRouter };
