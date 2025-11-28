import { type NextFunction, type Request, type Response, Router } from "express";
import { ForbiddenError } from "@/middleware/error-handler";
import { validateRequest } from "@/middleware/validate";
import { authenticate, requireRole } from "@/modules/auth/auth.middleware";
import { messagesRouter } from "@/modules/messages";
import {
  assignTicketSchema,
  createTicketSchema,
  type TicketQuery,
  ticketIdParamSchema,
  ticketQuerySchema,
  updateTicketSchema,
} from "./tickets.schema";
import { ticketsService } from "./tickets.service";

const router = Router();

// All ticket routes require authentication
router.use(authenticate);

// Mount messages router as nested routes
router.use("/:id/messages", messagesRouter);

// ─────────────────────────────────────────────────────────────
// GET /api/tickets - List tickets
// ─────────────────────────────────────────────────────────────
router.get(
  "/",
  validateRequest({ query: ticketQuerySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await ticketsService.list(
        req.query as unknown as TicketQuery,
        req.user!.id,
        req.userRole,
        req.organizationId,
      );

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/tickets/stats - Get ticket statistics
// ─────────────────────────────────────────────────────────────
router.get(
  "/stats",
  requireRole("agent", "admin", "owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const stats = await ticketsService.getStats(req.organizationId);

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
// GET /api/tickets/:id - Get ticket details
// ─────────────────────────────────────────────────────────────
router.get(
  "/:id",
  validateRequest({ params: ticketIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticket = await ticketsService.getById(
        req.params.id,
        req.user!.id,
        req.userRole,
        req.organizationId,
      );

      res.json({
        success: true,
        data: ticket,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/tickets - Create ticket
// ─────────────────────────────────────────────────────────────
router.post(
  "/",
  validateRequest({ body: createTicketSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const ticket = await ticketsService.create(req.body, req.organizationId, req.user!.id);

      res.status(201).json({
        success: true,
        data: ticket,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// PATCH /api/tickets/:id - Update ticket
// ─────────────────────────────────────────────────────────────
router.patch(
  "/:id",
  validateRequest({ params: ticketIdParamSchema, body: updateTicketSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticket = await ticketsService.update(
        req.params.id,
        req.body,
        req.user!.id,
        req.userRole,
      );

      res.json({
        success: true,
        data: ticket,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/tickets/:id/assign - Assign ticket
// ─────────────────────────────────────────────────────────────
router.post(
  "/:id/assign",
  validateRequest({ params: ticketIdParamSchema, body: assignTicketSchema }),
  requireRole("agent", "admin", "owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticket = await ticketsService.assign(req.params.id, req.body.assigneeId, req.user!.id);

      res.json({
        success: true,
        data: ticket,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/tickets/:id/close - Close ticket
// ─────────────────────────────────────────────────────────────
router.post(
  "/:id/close",
  validateRequest({ params: ticketIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticket = await ticketsService.close(req.params.id, req.user!.id, req.body.reason);

      res.json({
        success: true,
        data: ticket,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/tickets/:id/reopen - Reopen ticket
// ─────────────────────────────────────────────────────────────
router.post(
  "/:id/reopen",
  validateRequest({ params: ticketIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticket = await ticketsService.reopen(req.params.id, req.user!.id);

      res.json({
        success: true,
        data: ticket,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// DELETE /api/tickets/:id - Delete ticket (admin/owner only)
// ─────────────────────────────────────────────────────────────
router.delete(
  "/:id",
  requireRole("admin", "owner"),
  validateRequest({ params: ticketIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await ticketsService.delete(req.params.id, req.user!.id, req.userRole!);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

export const ticketsRouter = router;
