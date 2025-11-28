import { eq } from "drizzle-orm";
import { Router } from "express";
import { db } from "@/db";
import { tickets } from "@/db/schema";
import { authenticate } from "@/middleware/authenticate";
import { organizationAccess } from "@/middleware/organization-access";
import { validateBody, validateQuery } from "@/middleware/validate";
import { statsQuerySchema, submitSurveySchema, surveyQuerySchema } from "./csat.schema";
import { csatService } from "./csat.service";

const router = Router();

// ─────────────────────────────────────────────────────────────
// Public routes (token-based access for customers)
// ─────────────────────────────────────────────────────────────

// Get survey by token (public)
router.get("/respond/:token", async (req, res, next) => {
  try {
    const { token } = req.params;
    const survey = await csatService.getByToken(token);
    res.json(survey);
  } catch (error) {
    next(error);
  }
});

// Submit survey response (public)
router.post("/respond/:token", validateBody(submitSurveySchema), async (req, res, next) => {
  try {
    const { token } = req.params;
    const survey = await csatService.submitResponse(token, req.body);
    res.json(survey);
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────
// Protected routes (require authentication)
// ─────────────────────────────────────────────────────────────

router.use(authenticate);

// Organization-scoped routes
router.use("/:organizationId", organizationAccess);

// List all surveys for organization
router.get("/:organizationId", validateQuery(surveyQuerySchema), async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const result = await csatService.list(organizationId, {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
      agentId: req.query.agentId as string | undefined,
      rating: req.query.rating ? Number(req.query.rating) : undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      responded: req.query.responded !== undefined ? req.query.responded === "true" : undefined,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get CSAT statistics
router.get("/:organizationId/stats", validateQuery(statsQuerySchema), async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const stats = await csatService.getStats(organizationId, {
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      agentId: req.query.agentId as string | undefined,
    });
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// Get agent performance stats
router.get("/:organizationId/agents", validateQuery(statsQuerySchema), async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const stats = await csatService.getAgentStats(organizationId, {
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
    });
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// Get single survey
router.get("/:organizationId/:surveyId", async (req, res, next) => {
  try {
    const { organizationId, surveyId } = req.params;
    const survey = await csatService.getById(surveyId, organizationId);
    if (!survey) {
      res.status(404).json({ error: "Survey not found" });
      return;
    }
    res.json(survey);
  } catch (error) {
    next(error);
  }
});

// Send survey for a ticket (manual trigger)
router.post("/:organizationId/send/:ticketId", async (req, res, next) => {
  try {
    const { organizationId, ticketId } = req.params;
    const survey = await csatService.sendSurvey(ticketId, organizationId);
    res.status(201).json(survey);
  } catch (error) {
    next(error);
  }
});

// Bulk send surveys for all resolved/closed tickets without surveys
router.post("/:organizationId/send-bulk", async (req, res, next) => {
  try {
    const { organizationId } = req.params;

    // Find tickets without surveys
    const ticketsWithoutSurveys = await db.query.tickets.findMany({
      where: eq(tickets.organizationId, organizationId),
      columns: { id: true, status: true },
    });

    const eligibleTickets = ticketsWithoutSurveys.filter(
      (t) => t.status === "resolved" || t.status === "closed",
    );

    const results = {
      sent: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const ticket of eligibleTickets) {
      try {
        await csatService.sendSurvey(ticket.id, organizationId);
        results.sent++;
      } catch {
        results.skipped++;
      }
    }

    res.json(results);
  } catch (error) {
    next(error);
  }
});

export default router;
