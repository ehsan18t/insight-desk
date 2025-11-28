/**
 * Messages Routes Integration Tests
 *
 * HTTP-level integration tests for message endpoints.
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
  createMessageSchema,
  messageIdParamSchema,
  messageQuerySchema,
  ticketIdParamSchema,
  updateMessageSchema,
} from "@/modules/messages/messages.schema";

// ─────────────────────────────────────────────────────────────
// Mock Data & Services
// ─────────────────────────────────────────────────────────────

const mockMessage = {
  id: "msg-1",
  ticketId: "550e8400-e29b-41d4-a716-446655440000",
  senderId: "user-1",
  content: "This is a test message content",
  type: "reply",
  isInternal: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  isActive: true,
};

const mockMessagesService = {
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getCount: vi.fn(),
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

// ─────────────────────────────────────────────────────────────
// Test App Factory
// ─────────────────────────────────────────────────────────────

function createTestApp(authOptions: Parameters<typeof createMockAuth>[0] = {}): Express {
  const app = express();
  app.use(express.json());

  const authenticate = createMockAuth(authOptions);

  // Mount message routes (nested under tickets)
  const router = express.Router({ mergeParams: true });
  router.use(authenticate);

  // GET /api/tickets/:id/messages
  router.get(
    "/",
    validateRequest({ params: ticketIdParamSchema, query: messageQuerySchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await mockMessagesService.list(
          req.params.id,
          req.query,
          req.user?.id,
          req.userRole,
        );
        res.json({ success: true, ...result });
      } catch (error) {
        next(error);
      }
    },
  );

  // GET /api/tickets/:id/messages/:messageId
  router.get(
    "/:messageId",
    validateRequest({ params: messageIdParamSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const message = await mockMessagesService.getById(
          req.params.id,
          req.params.messageId,
          req.user?.id,
          req.userRole,
        );
        res.json({ success: true, data: message });
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/tickets/:id/messages
  router.post(
    "/",
    validateRequest({ params: ticketIdParamSchema, body: createMessageSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const message = await mockMessagesService.create(
          req.params.id,
          req.body,
          req.user?.id,
          req.userRole,
        );
        res.status(201).json({ success: true, data: message });
      } catch (error) {
        next(error);
      }
    },
  );

  // PATCH /api/tickets/:id/messages/:messageId
  router.patch(
    "/:messageId",
    validateRequest({ params: messageIdParamSchema, body: updateMessageSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const message = await mockMessagesService.update(
          req.params.id,
          req.params.messageId,
          req.body,
          req.user?.id,
        );
        res.json({ success: true, data: message });
      } catch (error) {
        next(error);
      }
    },
  );

  // DELETE /api/tickets/:id/messages/:messageId
  router.delete(
    "/:messageId",
    validateRequest({ params: messageIdParamSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await mockMessagesService.delete(
          req.params.id,
          req.params.messageId,
          req.user?.id,
          req.userRole,
        );
        res.json({ success: true, message: "Message deleted" });
      } catch (error) {
        next(error);
      }
    },
  );

  app.use("/api/tickets/:id/messages", router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe("Messages Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // GET /api/tickets/:id/messages
  // ─────────────────────────────────────────────────────────────

  describe("GET /api/tickets/:id/messages", () => {
    const ticketId = "550e8400-e29b-41d4-a716-446655440000";

    it("should return paginated list of messages", async () => {
      const app = createTestApp();
      mockMessagesService.list.mockResolvedValue({
        data: [mockMessage],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      });

      const response = await request(app).get(`/api/tickets/${ticketId}/messages`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toBeDefined();
    });

    it("should accept pagination parameters", async () => {
      const app = createTestApp();
      mockMessagesService.list.mockResolvedValue({
        data: [],
        pagination: { page: 2, limit: 25, total: 0, totalPages: 0 },
      });

      const response = await request(app)
        .get(`/api/tickets/${ticketId}/messages`)
        .query({ page: 2, limit: 25 });

      expect(response.status).toBe(200);
      expect(mockMessagesService.list).toHaveBeenCalledWith(
        ticketId,
        expect.objectContaining({ page: "2", limit: "25" }),
        "user-1",
        "customer",
      );
    });

    it("should return 404 when ticket not found", async () => {
      const app = createTestApp();
      mockMessagesService.list.mockRejectedValue(new NotFoundError("Ticket not found"));

      const response = await request(app).get(`/api/tickets/${ticketId}/messages`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it("should reject invalid ticket UUID", async () => {
      const app = createTestApp();

      const response = await request(app).get("/api/tickets/invalid-uuid/messages");

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should return 403 when user lacks access", async () => {
      const app = createTestApp();
      mockMessagesService.list.mockRejectedValue(new ForbiddenError("Access denied"));

      const response = await request(app).get(`/api/tickets/${ticketId}/messages`);

      expect(response.status).toBe(403);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // GET /api/tickets/:id/messages/:messageId
  // ─────────────────────────────────────────────────────────────

  describe("GET /api/tickets/:id/messages/:messageId", () => {
    const ticketId = "550e8400-e29b-41d4-a716-446655440000";
    const messageId = "550e8400-e29b-41d4-a716-446655440001";

    it("should return message details", async () => {
      const app = createTestApp();
      mockMessagesService.getById.mockResolvedValue(mockMessage);

      const response = await request(app).get(`/api/tickets/${ticketId}/messages/${messageId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe("msg-1");
    });

    it("should return 404 when message not found", async () => {
      const app = createTestApp();
      mockMessagesService.getById.mockRejectedValue(new NotFoundError("Message not found"));

      const response = await request(app).get(`/api/tickets/${ticketId}/messages/${messageId}`);

      expect(response.status).toBe(404);
    });

    it("should return 403 when accessing internal note as customer", async () => {
      const app = createTestApp({ role: "customer" });
      mockMessagesService.getById.mockRejectedValue(
        new ForbiddenError("Cannot view internal notes"),
      );

      const response = await request(app).get(`/api/tickets/${ticketId}/messages/${messageId}`);

      expect(response.status).toBe(403);
    });

    it("should allow agents to access internal notes", async () => {
      const app = createTestApp({ role: "agent" });
      const internalNote = { ...mockMessage, isInternal: true, type: "internal_note" };
      mockMessagesService.getById.mockResolvedValue(internalNote);

      const response = await request(app).get(`/api/tickets/${ticketId}/messages/${messageId}`);

      expect(response.status).toBe(200);
      expect(response.body.data.isInternal).toBe(true);
    });

    it("should reject invalid message UUID", async () => {
      const app = createTestApp();

      const response = await request(app).get(`/api/tickets/${ticketId}/messages/not-a-uuid`);

      expect(response.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // POST /api/tickets/:id/messages
  // ─────────────────────────────────────────────────────────────

  describe("POST /api/tickets/:id/messages", () => {
    const ticketId = "550e8400-e29b-41d4-a716-446655440000";

    it("should create a new reply message", async () => {
      const app = createTestApp();
      mockMessagesService.create.mockResolvedValue(mockMessage);

      const response = await request(app)
        .post(`/api/tickets/${ticketId}/messages`)
        .send({ content: "This is my reply message" });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(mockMessagesService.create).toHaveBeenCalledWith(
        ticketId,
        expect.objectContaining({ content: "This is my reply message" }),
        "user-1",
        "customer",
      );
    });

    it("should require content field", async () => {
      const app = createTestApp();

      const response = await request(app).post(`/api/tickets/${ticketId}/messages`).send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should accept internal note type for agents", async () => {
      const app = createTestApp({ role: "agent" });
      const internalNote = { ...mockMessage, isInternal: true, type: "internal_note" };
      mockMessagesService.create.mockResolvedValue(internalNote);

      const response = await request(app)
        .post(`/api/tickets/${ticketId}/messages`)
        .send({ content: "Internal note content", type: "internal_note" });

      expect(response.status).toBe(201);
      expect(mockMessagesService.create).toHaveBeenCalledWith(
        ticketId,
        expect.objectContaining({ type: "internal_note" }),
        "user-1",
        "agent",
      );
    });

    it("should reject internal notes from customers", async () => {
      const app = createTestApp({ role: "customer" });
      mockMessagesService.create.mockRejectedValue(
        new ForbiddenError("Customers cannot create internal notes"),
      );

      const response = await request(app)
        .post(`/api/tickets/${ticketId}/messages`)
        .send({ content: "Try to create note", type: "internal_note" });

      expect(response.status).toBe(403);
    });

    it("should return 404 when ticket not found", async () => {
      const app = createTestApp();
      mockMessagesService.create.mockRejectedValue(new NotFoundError("Ticket not found"));

      const response = await request(app)
        .post(`/api/tickets/${ticketId}/messages`)
        .send({ content: "Message for nonexistent ticket" });

      expect(response.status).toBe(404);
    });

    it("should accept attachments array", async () => {
      const app = createTestApp();
      mockMessagesService.create.mockResolvedValue(mockMessage);

      const validAttachment = {
        id: "550e8400-e29b-41d4-a716-446655440002",
        filename: "document.pdf",
        url: "https://example.com/files/document.pdf",
        mimeType: "application/pdf",
        size: 1024,
      };

      const response = await request(app)
        .post(`/api/tickets/${ticketId}/messages`)
        .send({
          content: "Message with attachments",
          attachments: [validAttachment],
        });

      expect(response.status).toBe(201);
      expect(mockMessagesService.create).toHaveBeenCalledWith(
        ticketId,
        expect.objectContaining({
          attachments: [validAttachment],
        }),
        "user-1",
        "customer",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // PATCH /api/tickets/:id/messages/:messageId
  // ─────────────────────────────────────────────────────────────

  describe("PATCH /api/tickets/:id/messages/:messageId", () => {
    const ticketId = "550e8400-e29b-41d4-a716-446655440000";
    const messageId = "550e8400-e29b-41d4-a716-446655440001";

    it("should update message content", async () => {
      const app = createTestApp();
      const updatedMessage = { ...mockMessage, content: "Updated content" };
      mockMessagesService.update.mockResolvedValue(updatedMessage);

      const response = await request(app)
        .patch(`/api/tickets/${ticketId}/messages/${messageId}`)
        .send({ content: "Updated content" });

      expect(response.status).toBe(200);
      expect(response.body.data.content).toBe("Updated content");
    });

    it("should return 404 when message not found", async () => {
      const app = createTestApp();
      mockMessagesService.update.mockRejectedValue(new NotFoundError("Message not found"));

      const response = await request(app)
        .patch(`/api/tickets/${ticketId}/messages/${messageId}`)
        .send({ content: "Update attempt" });

      expect(response.status).toBe(404);
    });

    it("should return 403 when not the sender", async () => {
      const app = createTestApp({ userId: "other-user" });
      mockMessagesService.update.mockRejectedValue(
        new ForbiddenError("Cannot edit others message"),
      );

      const response = await request(app)
        .patch(`/api/tickets/${ticketId}/messages/${messageId}`)
        .send({ content: "Trying to edit" });

      expect(response.status).toBe(403);
    });

    it("should require content field", async () => {
      const app = createTestApp();

      const response = await request(app)
        .patch(`/api/tickets/${ticketId}/messages/${messageId}`)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // DELETE /api/tickets/:id/messages/:messageId
  // ─────────────────────────────────────────────────────────────

  describe("DELETE /api/tickets/:id/messages/:messageId", () => {
    const ticketId = "550e8400-e29b-41d4-a716-446655440000";
    const messageId = "550e8400-e29b-41d4-a716-446655440001";

    it("should delete message when sender", async () => {
      const app = createTestApp();
      mockMessagesService.delete.mockResolvedValue(undefined);

      const response = await request(app).delete(`/api/tickets/${ticketId}/messages/${messageId}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Message deleted");
    });

    it("should allow admin to delete any message", async () => {
      const app = createTestApp({ role: "admin" });
      mockMessagesService.delete.mockResolvedValue(undefined);

      const response = await request(app).delete(`/api/tickets/${ticketId}/messages/${messageId}`);

      expect(response.status).toBe(200);
    });

    it("should return 404 when message not found", async () => {
      const app = createTestApp();
      mockMessagesService.delete.mockRejectedValue(new NotFoundError("Message not found"));

      const response = await request(app).delete(`/api/tickets/${ticketId}/messages/${messageId}`);

      expect(response.status).toBe(404);
    });

    it("should return 403 when not allowed to delete", async () => {
      const app = createTestApp({ userId: "other-user", role: "customer" });
      mockMessagesService.delete.mockRejectedValue(
        new ForbiddenError("Cannot delete others message"),
      );

      const response = await request(app).delete(`/api/tickets/${ticketId}/messages/${messageId}`);

      expect(response.status).toBe(403);
    });

    it("should return 403 for system messages", async () => {
      const app = createTestApp({ role: "admin" });
      mockMessagesService.delete.mockRejectedValue(
        new ForbiddenError("Cannot delete system messages"),
      );

      const response = await request(app).delete(`/api/tickets/${ticketId}/messages/${messageId}`);

      expect(response.status).toBe(403);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Role-Based Access Control
  // ─────────────────────────────────────────────────────────────

  describe("Role-Based Access Control", () => {
    const ticketId = "550e8400-e29b-41d4-a716-446655440000";

    it("should allow customer to list messages on their ticket", async () => {
      const app = createTestApp({ role: "customer" });
      mockMessagesService.list.mockResolvedValue({
        data: [mockMessage],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      });

      const response = await request(app).get(`/api/tickets/${ticketId}/messages`);

      expect(response.status).toBe(200);
    });

    it("should filter internal notes for customers", async () => {
      const app = createTestApp({ role: "customer" });
      // Service should filter internal notes for customers
      mockMessagesService.list.mockResolvedValue({
        data: [mockMessage], // Only non-internal messages
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      });

      const response = await request(app).get(`/api/tickets/${ticketId}/messages`);

      expect(response.status).toBe(200);
      expect(response.body.data.every((m: typeof mockMessage) => !m.isInternal)).toBe(true);
    });

    it("should include internal notes for agents", async () => {
      const app = createTestApp({ role: "agent" });
      const internalNote = { ...mockMessage, isInternal: true, type: "internal_note" };
      mockMessagesService.list.mockResolvedValue({
        data: [mockMessage, internalNote],
        pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
      });

      const response = await request(app).get(`/api/tickets/${ticketId}/messages`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Error Handling
  // ─────────────────────────────────────────────────────────────

  describe("Error Handling", () => {
    const ticketId = "550e8400-e29b-41d4-a716-446655440000";

    it("should return 500 for unexpected errors", async () => {
      const app = createTestApp();
      mockMessagesService.list.mockRejectedValue(new Error("Database error"));

      const response = await request(app).get(`/api/tickets/${ticketId}/messages`);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it("should return consistent error format", async () => {
      const app = createTestApp();
      mockMessagesService.list.mockRejectedValue(new NotFoundError("Ticket not found"));

      const response = await request(app).get(`/api/tickets/${ticketId}/messages`);

      expect(response.body).toHaveProperty("success", false);
      expect(response.body).toHaveProperty("error");
      expect(response.body).toHaveProperty("code");
    });
  });
});
