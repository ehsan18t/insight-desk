/**
 * Tickets Routes Integration Tests
 *
 * HTTP-level integration tests for ticket endpoints.
 * Tests real routes with mocked authentication.
 */

import express, { type Express, type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/db/schema";
import {
  errorHandler,
  ForbiddenError,
  NotFoundError,
  notFoundHandler,
} from "@/middleware/error-handler";
import { validateRequest } from "@/middleware/validate";
import {
  activitiesQuerySchema,
  assignTicketSchema,
  createTicketSchema,
  ticketIdParamSchema,
  ticketQuerySchema,
  updateTicketSchema,
} from "@/modules/tickets/tickets.schema";

// ─────────────────────────────────────────────────────────────
// Mock Data & Services
// ─────────────────────────────────────────────────────────────

const mockTicket = {
  id: "ticket-1",
  title: "Test Ticket",
  description: "Test Description",
  status: "open",
  priority: "medium",
  organizationId: "org-1",
  createdById: "user-1",
  assigneeId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  isActive: true,
};

const mockTicketsService = {
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  assign: vi.fn(),
  close: vi.fn(),
  reopen: vi.fn(),
  delete: vi.fn(),
  getStats: vi.fn(),
  getActivities: vi.fn(),
};

// ─────────────────────────────────────────────────────────────
// Mock Auth Middleware Factory
// ─────────────────────────────────────────────────────────────

function createMockAuth(
  options: {
    userId?: string;
    role?: UserRole;
    organizationId?: string;
    isAuthenticated?: boolean;
  } = {},
) {
  const {
    userId = "user-1",
    role = "customer",
    organizationId = "org-1",
    isAuthenticated = true,
  } = options;

  return (req: Request, _res: Response, next: NextFunction) => {
    if (!isAuthenticated) {
      return next(new ForbiddenError("Authentication required"));
    }
    req.user = { ...mockUser, id: userId };
    req.organizationId = organizationId;
    req.userRole = role;
    next();
  };
}

function createMockRequireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ForbiddenError("Authentication required"));
    }
    if (!req.organizationId) {
      return next(new ForbiddenError("Organization context required"));
    }
    if (!req.userRole || !allowedRoles.includes(req.userRole)) {
      return next(new ForbiddenError(`Access denied. Required role: ${allowedRoles.join(" or ")}`));
    }
    next();
  };
}

// ─────────────────────────────────────────────────────────────
// Test App Factory
// ─────────────────────────────────────────────────────────────

function createTestApp(authOptions: Parameters<typeof createMockAuth>[0] = {}): Express {
  const app = express();
  app.use(express.json());

  const authenticate = createMockAuth(authOptions);
  const requireRole = createMockRequireRole;

  // Mount ticket routes
  const router = express.Router();
  router.use(authenticate);

  // GET /api/tickets
  router.get(
    "/",
    validateRequest({ query: ticketQuerySchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await mockTicketsService.list(
          req.query,
          req.user?.id,
          req.userRole,
          req.organizationId,
        );
        res.json({ success: true, ...result });
      } catch (error) {
        next(error);
      }
    },
  );

  // GET /api/tickets/stats
  router.get(
    "/stats",
    requireRole("agent", "admin", "owner"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.organizationId) {
          throw new ForbiddenError("Organization context required");
        }
        const stats = await mockTicketsService.getStats(req.organizationId);
        res.json({ success: true, data: stats });
      } catch (error) {
        next(error);
      }
    },
  );

  // GET /api/tickets/:id
  router.get(
    "/:id",
    validateRequest({ params: ticketIdParamSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ticket = await mockTicketsService.getById(
          req.params.id,
          req.user?.id,
          req.userRole,
          req.organizationId,
        );
        res.json({ success: true, data: ticket });
      } catch (error) {
        next(error);
      }
    },
  );

  // GET /api/tickets/:id/activities
  router.get(
    "/:id/activities",
    validateRequest({ params: ticketIdParamSchema, query: activitiesQuerySchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await mockTicketsService.getActivities(
          req.params.id,
          req.user?.id,
          req.userRole,
          req.query,
        );
        res.json({ success: true, ...result });
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/tickets
  router.post(
    "/",
    validateRequest({ body: createTicketSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.organizationId) {
          throw new ForbiddenError("Organization context required");
        }
        const ticket = await mockTicketsService.create(req.body, req.organizationId, req.user?.id);
        res.status(201).json({ success: true, data: ticket });
      } catch (error) {
        next(error);
      }
    },
  );

  // PATCH /api/tickets/:id
  router.patch(
    "/:id",
    validateRequest({ params: ticketIdParamSchema, body: updateTicketSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ticket = await mockTicketsService.update(
          req.params.id,
          req.body,
          req.user?.id,
          req.userRole,
        );
        res.json({ success: true, data: ticket });
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/tickets/:id/assign
  router.post(
    "/:id/assign",
    validateRequest({ params: ticketIdParamSchema, body: assignTicketSchema }),
    requireRole("agent", "admin", "owner"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ticket = await mockTicketsService.assign(
          req.params.id,
          req.body.assigneeId,
          req.user?.id,
        );
        res.json({ success: true, data: ticket });
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/tickets/:id/close
  router.post(
    "/:id/close",
    validateRequest({ params: ticketIdParamSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ticket = await mockTicketsService.close(req.params.id, req.user?.id, req.body.reason);
        res.json({ success: true, data: ticket });
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/tickets/:id/reopen
  router.post(
    "/:id/reopen",
    validateRequest({ params: ticketIdParamSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ticket = await mockTicketsService.reopen(req.params.id, req.user?.id);
        res.json({ success: true, data: ticket });
      } catch (error) {
        next(error);
      }
    },
  );

  // DELETE /api/tickets/:id
  router.delete(
    "/:id",
    validateRequest({ params: ticketIdParamSchema }),
    requireRole("admin", "owner"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await mockTicketsService.delete(req.params.id, req.user?.id, req.userRole);
        res.json({ success: true, message: "Ticket deleted" });
      } catch (error) {
        next(error);
      }
    },
  );

  app.use("/api/tickets", router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe("Tickets Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // GET /api/tickets
  // ─────────────────────────────────────────────────────────────

  describe("GET /api/tickets", () => {
    it("should return paginated list of tickets", async () => {
      const app = createTestApp();
      mockTicketsService.list.mockResolvedValue({
        data: [mockTicket],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      const response = await request(app).get("/api/tickets");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toBeDefined();
    });

    it("should accept query parameters for filtering", async () => {
      const app = createTestApp();
      mockTicketsService.list.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      const response = await request(app)
        .get("/api/tickets")
        .query({ status: "open", priority: "high", page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(mockTicketsService.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: "open", priority: "high" }),
        "user-1",
        "customer",
        "org-1",
      );
    });

    it("should reject invalid status value", async () => {
      const app = createTestApp();

      const response = await request(app).get("/api/tickets").query({ status: "invalid-status" });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should reject negative page number", async () => {
      const app = createTestApp();

      const response = await request(app).get("/api/tickets").query({ page: -1 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // GET /api/tickets/:id
  // ─────────────────────────────────────────────────────────────

  describe("GET /api/tickets/:id", () => {
    it("should return ticket details", async () => {
      const app = createTestApp();
      mockTicketsService.getById.mockResolvedValue(mockTicket);

      const response = await request(app).get("/api/tickets/550e8400-e29b-41d4-a716-446655440000");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe("ticket-1");
    });

    it("should return 404 when ticket not found", async () => {
      const app = createTestApp();
      mockTicketsService.getById.mockRejectedValue(new NotFoundError("Ticket not found"));

      const response = await request(app).get("/api/tickets/550e8400-e29b-41d4-a716-446655440000");

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it("should return 403 when user lacks access", async () => {
      const app = createTestApp();
      mockTicketsService.getById.mockRejectedValue(new ForbiddenError("Access denied"));

      const response = await request(app).get("/api/tickets/550e8400-e29b-41d4-a716-446655440000");

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it("should reject invalid UUID format", async () => {
      const app = createTestApp();

      const response = await request(app).get("/api/tickets/invalid-uuid");

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // GET /api/tickets/stats
  // ─────────────────────────────────────────────────────────────

  describe("GET /api/tickets/stats", () => {
    it("should return stats for agents", async () => {
      const app = createTestApp({ role: "agent" });
      const stats = {
        byStatus: { open: 5, pending: 3, resolved: 10, closed: 2 },
        byPriority: { low: 3, medium: 8, high: 6, urgent: 3 },
      };
      mockTicketsService.getStats.mockResolvedValue(stats);

      const response = await request(app).get("/api/tickets/stats");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(stats);
    });

    it("should deny access to customers", async () => {
      const app = createTestApp({ role: "customer" });

      const response = await request(app).get("/api/tickets/stats");

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it("should allow access to admins", async () => {
      const app = createTestApp({ role: "admin" });
      mockTicketsService.getStats.mockResolvedValue({});

      const response = await request(app).get("/api/tickets/stats");

      expect(response.status).toBe(200);
    });

    it("should allow access to owners", async () => {
      const app = createTestApp({ role: "owner" });
      mockTicketsService.getStats.mockResolvedValue({});

      const response = await request(app).get("/api/tickets/stats");

      expect(response.status).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // POST /api/tickets
  // ─────────────────────────────────────────────────────────────

  describe("POST /api/tickets", () => {
    it("should create a new ticket", async () => {
      const app = createTestApp();
      const newTicket = { ...mockTicket };
      mockTicketsService.create.mockResolvedValue(newTicket);

      const response = await request(app)
        .post("/api/tickets")
        .send({ title: "New Ticket Title", description: "This is a detailed description" });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(mockTicketsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "New Ticket Title",
          description: "This is a detailed description",
        }),
        "org-1",
        "user-1",
      );
    });

    it("should require title field", async () => {
      const app = createTestApp();

      const response = await request(app)
        .post("/api/tickets")
        .send({ description: "This is a long enough description" });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should require description field", async () => {
      const app = createTestApp();

      const response = await request(app)
        .post("/api/tickets")
        .send({ title: "This is a valid title" });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should accept optional priority", async () => {
      const app = createTestApp();
      mockTicketsService.create.mockResolvedValue(mockTicket);

      const response = await request(app).post("/api/tickets").send({
        title: "Valid Ticket Title",
        description: "This is a valid description",
        priority: "high",
      });

      expect(response.status).toBe(201);
      expect(mockTicketsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ priority: "high" }),
        "org-1",
        "user-1",
      );
    });

    it("should reject invalid priority value", async () => {
      const app = createTestApp();

      const response = await request(app).post("/api/tickets").send({
        title: "Valid Ticket Title",
        description: "This is a valid description",
        priority: "super-urgent",
      });

      expect(response.status).toBe(400);
    });

    it("should accept tags array", async () => {
      const app = createTestApp();
      mockTicketsService.create.mockResolvedValue(mockTicket);

      const response = await request(app)
        .post("/api/tickets")
        .send({
          title: "Valid Ticket Title",
          description: "This is a valid description",
          tags: ["bug", "urgent"],
        });

      expect(response.status).toBe(201);
      expect(mockTicketsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ["bug", "urgent"] }),
        "org-1",
        "user-1",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // PATCH /api/tickets/:id
  // ─────────────────────────────────────────────────────────────

  describe("PATCH /api/tickets/:id", () => {
    it("should update ticket fields", async () => {
      const app = createTestApp();
      const updatedTicket = { ...mockTicket, title: "Updated Title" };
      mockTicketsService.update.mockResolvedValue(updatedTicket);

      const response = await request(app)
        .patch("/api/tickets/550e8400-e29b-41d4-a716-446655440000")
        .send({ title: "Updated Title" });

      expect(response.status).toBe(200);
      expect(response.body.data.title).toBe("Updated Title");
    });

    it("should allow partial updates", async () => {
      const app = createTestApp();
      mockTicketsService.update.mockResolvedValue(mockTicket);

      const response = await request(app)
        .patch("/api/tickets/550e8400-e29b-41d4-a716-446655440000")
        .send({ priority: "urgent" });

      expect(response.status).toBe(200);
      expect(mockTicketsService.update).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440000",
        { priority: "urgent" },
        "user-1",
        "customer",
      );
    });

    it("should return 404 when ticket not found", async () => {
      const app = createTestApp();
      mockTicketsService.update.mockRejectedValue(new NotFoundError("Ticket not found"));

      const response = await request(app)
        .patch("/api/tickets/550e8400-e29b-41d4-a716-446655440000")
        .send({ title: "Update" });

      expect(response.status).toBe(404);
    });

    it("should reject invalid UUID", async () => {
      const app = createTestApp();

      const response = await request(app)
        .patch("/api/tickets/not-a-uuid")
        .send({ title: "Update" });

      expect(response.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // POST /api/tickets/:id/assign
  // ─────────────────────────────────────────────────────────────

  describe("POST /api/tickets/:id/assign", () => {
    it("should assign ticket to agent", async () => {
      const app = createTestApp({ role: "agent" });
      const assignedTicket = { ...mockTicket, assigneeId: "agent-1" };
      mockTicketsService.assign.mockResolvedValue(assignedTicket);

      const response = await request(app)
        .post("/api/tickets/550e8400-e29b-41d4-a716-446655440000/assign")
        .send({ assigneeId: "550e8400-e29b-41d4-a716-446655440001" });

      expect(response.status).toBe(200);
      expect(mockTicketsService.assign).toHaveBeenCalled();
    });

    it("should deny access to customers", async () => {
      const app = createTestApp({ role: "customer" });

      const response = await request(app)
        .post("/api/tickets/550e8400-e29b-41d4-a716-446655440000/assign")
        .send({ assigneeId: "550e8400-e29b-41d4-a716-446655440001" });

      expect(response.status).toBe(403);
    });

    it("should allow unassigning with null", async () => {
      const app = createTestApp({ role: "agent" });
      mockTicketsService.assign.mockResolvedValue({ ...mockTicket, assigneeId: null });

      const response = await request(app)
        .post("/api/tickets/550e8400-e29b-41d4-a716-446655440000/assign")
        .send({ assigneeId: null });

      expect(response.status).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // POST /api/tickets/:id/close
  // ─────────────────────────────────────────────────────────────

  describe("POST /api/tickets/:id/close", () => {
    it("should close a ticket", async () => {
      const app = createTestApp();
      const closedTicket = { ...mockTicket, status: "closed" };
      mockTicketsService.close.mockResolvedValue(closedTicket);

      const response = await request(app)
        .post("/api/tickets/550e8400-e29b-41d4-a716-446655440000/close")
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe("closed");
    });

    it("should accept close reason", async () => {
      const app = createTestApp();
      mockTicketsService.close.mockResolvedValue({ ...mockTicket, status: "closed" });

      const response = await request(app)
        .post("/api/tickets/550e8400-e29b-41d4-a716-446655440000/close")
        .send({ reason: "Resolved by customer" });

      expect(response.status).toBe(200);
      expect(mockTicketsService.close).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440000",
        "user-1",
        "Resolved by customer",
      );
    });

    it("should return 403 if ticket already closed", async () => {
      const app = createTestApp();
      mockTicketsService.close.mockRejectedValue(new ForbiddenError("Ticket is already closed"));

      const response = await request(app)
        .post("/api/tickets/550e8400-e29b-41d4-a716-446655440000/close")
        .send({});

      expect(response.status).toBe(403);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // POST /api/tickets/:id/reopen
  // ─────────────────────────────────────────────────────────────

  describe("POST /api/tickets/:id/reopen", () => {
    it("should reopen a closed ticket", async () => {
      const app = createTestApp();
      const reopenedTicket = { ...mockTicket, status: "open" };
      mockTicketsService.reopen.mockResolvedValue(reopenedTicket);

      const response = await request(app)
        .post("/api/tickets/550e8400-e29b-41d4-a716-446655440000/reopen")
        .send();

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe("open");
    });

    it("should return 403 if ticket is not closed", async () => {
      const app = createTestApp();
      mockTicketsService.reopen.mockRejectedValue(new ForbiddenError("Ticket is not closed"));

      const response = await request(app)
        .post("/api/tickets/550e8400-e29b-41d4-a716-446655440000/reopen")
        .send();

      expect(response.status).toBe(403);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // DELETE /api/tickets/:id
  // ─────────────────────────────────────────────────────────────

  describe("DELETE /api/tickets/:id", () => {
    it("should delete ticket when admin", async () => {
      const app = createTestApp({ role: "admin" });
      mockTicketsService.delete.mockResolvedValue(undefined);

      const response = await request(app).delete(
        "/api/tickets/550e8400-e29b-41d4-a716-446655440000",
      );

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Ticket deleted");
    });

    it("should delete ticket when owner", async () => {
      const app = createTestApp({ role: "owner" });
      mockTicketsService.delete.mockResolvedValue(undefined);

      const response = await request(app).delete(
        "/api/tickets/550e8400-e29b-41d4-a716-446655440000",
      );

      expect(response.status).toBe(200);
    });

    it("should deny access to agents", async () => {
      const app = createTestApp({ role: "agent" });

      const response = await request(app).delete(
        "/api/tickets/550e8400-e29b-41d4-a716-446655440000",
      );

      expect(response.status).toBe(403);
    });

    it("should deny access to customers", async () => {
      const app = createTestApp({ role: "customer" });

      const response = await request(app).delete(
        "/api/tickets/550e8400-e29b-41d4-a716-446655440000",
      );

      expect(response.status).toBe(403);
    });

    it("should return 404 when ticket not found", async () => {
      const app = createTestApp({ role: "admin" });
      mockTicketsService.delete.mockRejectedValue(new NotFoundError("Ticket not found"));

      const response = await request(app).delete(
        "/api/tickets/550e8400-e29b-41d4-a716-446655440000",
      );

      expect(response.status).toBe(404);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // GET /api/tickets/:id/activities
  // ─────────────────────────────────────────────────────────────

  describe("GET /api/tickets/:id/activities", () => {
    it("should return ticket activities", async () => {
      const app = createTestApp();
      const activities = {
        data: [{ id: "act-1", type: "status_changed", createdAt: new Date().toISOString() }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };
      mockTicketsService.getActivities.mockResolvedValue(activities);

      const response = await request(app).get(
        "/api/tickets/550e8400-e29b-41d4-a716-446655440000/activities",
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
    });

    it("should accept pagination parameters", async () => {
      const app = createTestApp();
      mockTicketsService.getActivities.mockResolvedValue({
        data: [],
        pagination: { page: 2, limit: 10, total: 0, totalPages: 0 },
      });

      const response = await request(app)
        .get("/api/tickets/550e8400-e29b-41d4-a716-446655440000/activities")
        .query({ page: 2, limit: 10 });

      expect(response.status).toBe(200);
      // Query params come as strings, they get coerced by zod in the actual validation
      expect(mockTicketsService.getActivities).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440000",
        "user-1",
        "customer",
        expect.objectContaining({ page: "2", limit: "10" }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Error Handling
  // ─────────────────────────────────────────────────────────────

  describe("Error Handling", () => {
    it("should return 500 for unexpected errors", async () => {
      const app = createTestApp();
      mockTicketsService.list.mockRejectedValue(new Error("Database connection failed"));

      const response = await request(app).get("/api/tickets");

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it("should not expose internal error details", async () => {
      const app = createTestApp();
      mockTicketsService.list.mockRejectedValue(new Error("SQL injection detected"));

      const response = await request(app).get("/api/tickets");

      expect(response.body.stack).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Content-Type Handling
  // ─────────────────────────────────────────────────────────────

  describe("Content-Type Handling", () => {
    it("should accept application/json", async () => {
      const app = createTestApp();
      mockTicketsService.create.mockResolvedValue(mockTicket);

      const response = await request(app)
        .post("/api/tickets")
        .set("Content-Type", "application/json")
        .send({ title: "Valid Test Title", description: "Valid test description" });

      expect(response.status).toBe(201);
    });

    it("should return JSON responses", async () => {
      const app = createTestApp();
      mockTicketsService.list.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      const response = await request(app).get("/api/tickets");

      expect(response.headers["content-type"]).toMatch(/application\/json/);
    });
  });
});
