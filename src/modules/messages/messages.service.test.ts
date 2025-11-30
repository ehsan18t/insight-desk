/**
 * Messages Service Unit Tests
 *
 * Tests for the messages service business logic.
 * Uses mocked database for isolation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageType, TicketMessage } from "@/db/schema/index";
import { ForbiddenError, NotFoundError } from "@/middleware/error-handler";

// Mock database before importing the service
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: {
      tickets: {
        findFirst: vi.fn(),
      },
      ticketMessages: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
  },
  closeDatabaseConnection: vi.fn(),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { db } from "@/db";
import { messagesService } from "./messages.service";

// ─────────────────────────────────────────────────────────────
// Test Data
// ─────────────────────────────────────────────────────────────

const mockTicketId = "ticket-001";
const mockCustomerId = "user-456";
const mockAgentId = "agent-789";

function createMockTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: mockTicketId,
    ticketNumber: 1,
    title: "Test Ticket",
    description: "Test description",
    status: "open" as const,
    priority: "medium" as const,
    channel: "web" as const,
    tags: [] as string[],
    categoryId: null,
    organizationId: "org-123",
    customerId: mockCustomerId,
    assigneeId: null,
    slaDeadline: null,
    slaBreached: false,
    resolvedAt: null,
    closedAt: null,
    firstResponseAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockMessage(overrides: Partial<TicketMessage> = {}): TicketMessage {
  return {
    id: "message-001",
    ticketId: mockTicketId,
    senderId: mockCustomerId,
    content: "Test message content",
    type: "reply" as MessageType,
    attachments: [],
    emailMessageId: null,
    isEdited: false,
    editedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// messagesService.create Tests
// ─────────────────────────────────────────────────────────────

describe("messagesService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should create a reply message", async () => {
    const mockTicket = createMockTicket();
    const mockMessage = createMockMessage();

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockMessage]),
      }),
    } as unknown as ReturnType<typeof db.insert>);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as unknown as ReturnType<typeof db.update>);

    const result = await messagesService.create(
      mockTicketId,
      { content: "Test message content", type: "reply" },
      mockCustomerId,
      "customer",
    );

    expect(result).toBeDefined();
    expect(result.content).toBe("Test message content");
    expect(result.type).toBe("reply");
  });

  it("should create an internal note for agents", async () => {
    const mockTicket = createMockTicket();
    const mockMessage = createMockMessage({ type: "internal_note", senderId: mockAgentId });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockMessage]),
      }),
    } as unknown as ReturnType<typeof db.insert>);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as unknown as ReturnType<typeof db.update>);

    const result = await messagesService.create(
      mockTicketId,
      { content: "Internal note", type: "internal_note" },
      mockAgentId,
      "agent",
    );

    expect(result.type).toBe("internal_note");
  });

  it("should throw ForbiddenError when customer tries to create internal note", async () => {
    const mockTicket = createMockTicket();

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);

    await expect(
      messagesService.create(
        mockTicketId,
        { content: "Secret note", type: "internal_note" },
        mockCustomerId,
        "customer",
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("should throw NotFoundError when ticket does not exist", async () => {
    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(undefined);

    await expect(
      messagesService.create(
        mockTicketId,
        { content: "Test", type: "reply" },
        mockCustomerId,
        "customer",
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("should record first response time for agent replies", async () => {
    const mockTicket = createMockTicket({ firstResponseAt: null });
    const mockMessage = createMockMessage({ senderId: mockAgentId });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockMessage]),
      }),
    } as unknown as ReturnType<typeof db.insert>);

    // Track what values are set in updates
    const mockSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    });
    vi.mocked(db.update).mockReturnValue({
      set: mockSet,
    } as unknown as ReturnType<typeof db.update>);

    await messagesService.create(
      mockTicketId,
      { content: "Agent response", type: "reply" },
      mockAgentId,
      "agent",
    );

    // Should have called update to set firstResponseAt
    expect(db.update).toHaveBeenCalledTimes(2); // Once for updatedAt, once for firstResponseAt

    // Verify firstResponseAt was set with a date
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        firstResponseAt: expect.any(Date),
      }),
    );
  });

  it("should not update first response time if already set", async () => {
    const mockTicket = createMockTicket({ firstResponseAt: new Date() });
    const mockMessage = createMockMessage({ senderId: mockAgentId });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockMessage]),
      }),
    } as unknown as ReturnType<typeof db.insert>);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as unknown as ReturnType<typeof db.update>);

    await messagesService.create(
      mockTicketId,
      { content: "Agent response", type: "reply" },
      mockAgentId,
      "agent",
    );

    // Should only update updatedAt, not firstResponseAt
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("should accept attachments", async () => {
    const mockAttachment = {
      id: "att-1",
      filename: "file.pdf",
      url: "https://example.com/file.pdf",
      mimeType: "application/pdf",
      size: 1024,
    };
    const mockTicket = createMockTicket();
    const mockMessage = createMockMessage({
      attachments: [mockAttachment],
    });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockMessage]),
      }),
    } as unknown as ReturnType<typeof db.insert>);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as unknown as ReturnType<typeof db.update>);

    const result = await messagesService.create(
      mockTicketId,
      { content: "See attached", type: "reply", attachments: [mockAttachment] },
      mockCustomerId,
      "customer",
    );

    expect(result.attachments).toEqual([mockAttachment]);
  });
});

// ─────────────────────────────────────────────────────────────
// messagesService.list Tests
// ─────────────────────────────────────────────────────────────

describe("messagesService.list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should list messages for a ticket", async () => {
    const mockTicket = createMockTicket();
    const mockMessages = [createMockMessage({ id: "msg-1" }), createMockMessage({ id: "msg-2" })];

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.query.ticketMessages.findMany).mockResolvedValue(mockMessages);
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 2 }]),
      }),
    } as unknown as ReturnType<typeof db.select>);

    const result = await messagesService.list(
      mockTicketId,
      { page: 1, limit: 20 },
      mockCustomerId,
      "customer",
    );

    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
  });

  it("should throw NotFoundError when ticket does not exist", async () => {
    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(undefined);

    await expect(
      messagesService.list(mockTicketId, { page: 1, limit: 20 }, mockCustomerId, "customer"),
    ).rejects.toThrow(NotFoundError);
  });

  it("should throw ForbiddenError when customer accesses another users ticket", async () => {
    const mockTicket = createMockTicket({ customerId: "other-user" });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);

    await expect(
      messagesService.list(mockTicketId, { page: 1, limit: 20 }, mockCustomerId, "customer"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("should allow agents to list messages on any ticket", async () => {
    const mockTicket = createMockTicket({ customerId: "other-user" });
    const mockMessages = [createMockMessage()];

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.query.ticketMessages.findMany).mockResolvedValue(mockMessages);
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      }),
    } as unknown as ReturnType<typeof db.select>);

    const result = await messagesService.list(
      mockTicketId,
      { page: 1, limit: 20 },
      mockAgentId,
      "agent",
    );

    expect(result.data).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────
// messagesService.getById Tests
// ─────────────────────────────────────────────────────────────

describe("messagesService.getById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should return message by ID", async () => {
    const mockTicket = createMockTicket();
    const mockMessage = createMockMessage();

    vi.mocked(db.query.ticketMessages.findFirst).mockResolvedValue(mockMessage);
    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);

    const result = await messagesService.getById(
      mockTicketId,
      "message-001",
      mockCustomerId,
      "customer",
    );

    expect(result).toBeDefined();
    expect(result.id).toBe("message-001");
  });

  it("should throw NotFoundError when message does not exist", async () => {
    vi.mocked(db.query.ticketMessages.findFirst).mockResolvedValue(undefined);

    await expect(
      messagesService.getById(mockTicketId, "nonexistent", mockCustomerId, "customer"),
    ).rejects.toThrow(NotFoundError);
  });

  it("should throw NotFoundError when ticket does not exist", async () => {
    const mockMessage = createMockMessage();

    vi.mocked(db.query.ticketMessages.findFirst).mockResolvedValue(mockMessage);
    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(undefined);

    await expect(
      messagesService.getById(mockTicketId, "message-001", mockCustomerId, "customer"),
    ).rejects.toThrow(NotFoundError);
  });

  it("should throw ForbiddenError when customer accesses internal note", async () => {
    const mockTicket = createMockTicket();
    const mockMessage = createMockMessage({ type: "internal_note" });

    vi.mocked(db.query.ticketMessages.findFirst).mockResolvedValue(mockMessage);
    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);

    await expect(
      messagesService.getById(mockTicketId, "message-001", mockCustomerId, "customer"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("should allow agents to access internal notes", async () => {
    const mockTicket = createMockTicket();
    const mockMessage = createMockMessage({ type: "internal_note", senderId: mockAgentId });

    vi.mocked(db.query.ticketMessages.findFirst).mockResolvedValue(mockMessage);
    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);

    const result = await messagesService.getById(mockTicketId, "message-001", mockAgentId, "agent");

    expect(result.type).toBe("internal_note");
  });
});

// ─────────────────────────────────────────────────────────────
// messagesService.update Tests
// ─────────────────────────────────────────────────────────────

describe("messagesService.update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should update message content", async () => {
    const mockMessage = createMockMessage();
    const updatedMessage = createMockMessage({
      content: "Updated content",
      isEdited: true,
      editedAt: new Date(),
    });

    vi.mocked(db.query.ticketMessages.findFirst).mockResolvedValue(mockMessage);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedMessage]),
        }),
      }),
    } as unknown as ReturnType<typeof db.update>);

    const result = await messagesService.update(
      mockTicketId,
      "message-001",
      { content: "Updated content" },
      mockCustomerId,
    );

    expect(result.content).toBe("Updated content");
    expect(result.isEdited).toBe(true);
  });

  it("should throw NotFoundError when message does not exist", async () => {
    vi.mocked(db.query.ticketMessages.findFirst).mockResolvedValue(undefined);

    await expect(
      messagesService.update(mockTicketId, "nonexistent", { content: "Test" }, mockCustomerId),
    ).rejects.toThrow(NotFoundError);
  });

  it("should throw ForbiddenError when user is not the sender", async () => {
    const mockMessage = createMockMessage({ senderId: "other-user" });

    vi.mocked(db.query.ticketMessages.findFirst).mockResolvedValue(mockMessage);

    await expect(
      messagesService.update(mockTicketId, "message-001", { content: "Test" }, mockCustomerId),
    ).rejects.toThrow(ForbiddenError);
  });

  it("should throw ForbiddenError when editing system message", async () => {
    const mockMessage = createMockMessage({ type: "system" });

    vi.mocked(db.query.ticketMessages.findFirst).mockResolvedValue(mockMessage);

    await expect(
      messagesService.update(mockTicketId, "message-001", { content: "Test" }, mockCustomerId),
    ).rejects.toThrow(ForbiddenError);
  });
});

// ─────────────────────────────────────────────────────────────
// messagesService.delete Tests
// ─────────────────────────────────────────────────────────────

describe("messagesService.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should delete message when user is sender", async () => {
    const mockMessage = createMockMessage({ id: "msg-to-delete" });

    vi.mocked(db.query.ticketMessages.findFirst).mockResolvedValue(mockMessage);

    // Track the where clause
    const mockWhere = vi.fn().mockResolvedValue([]);
    vi.mocked(db.delete).mockReturnValue({
      where: mockWhere,
    } as unknown as ReturnType<typeof db.delete>);

    await messagesService.delete(mockTicketId, "msg-to-delete", mockCustomerId, "customer");

    // Verify delete was called and where clause was invoked
    expect(db.delete).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
  });

  it("should allow admin to delete any message", async () => {
    const mockMessage = createMockMessage({ id: "other-msg", senderId: "other-user" });

    vi.mocked(db.query.ticketMessages.findFirst).mockResolvedValue(mockMessage);

    // Track the where clause
    const mockWhere = vi.fn().mockResolvedValue([]);
    vi.mocked(db.delete).mockReturnValue({
      where: mockWhere,
    } as unknown as ReturnType<typeof db.delete>);

    await messagesService.delete(mockTicketId, "other-msg", mockAgentId, "admin");

    // Verify delete was called and where clause was invoked
    expect(db.delete).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
  });

  it("should throw NotFoundError when message does not exist", async () => {
    vi.mocked(db.query.ticketMessages.findFirst).mockResolvedValue(undefined);

    await expect(
      messagesService.delete(mockTicketId, "nonexistent", mockCustomerId, "customer"),
    ).rejects.toThrow(NotFoundError);
  });

  it("should throw ForbiddenError when non-admin tries to delete others message", async () => {
    const mockMessage = createMockMessage({ senderId: "other-user" });

    vi.mocked(db.query.ticketMessages.findFirst).mockResolvedValue(mockMessage);

    await expect(
      messagesService.delete(mockTicketId, "message-001", mockCustomerId, "customer"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("should throw ForbiddenError when deleting system message", async () => {
    const mockMessage = createMockMessage({ type: "system" });

    vi.mocked(db.query.ticketMessages.findFirst).mockResolvedValue(mockMessage);

    await expect(
      messagesService.delete(mockTicketId, "message-001", mockCustomerId, "customer"),
    ).rejects.toThrow(ForbiddenError);
  });
});

// ─────────────────────────────────────────────────────────────
// messagesService.getCount Tests
// ─────────────────────────────────────────────────────────────

describe("messagesService.getCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should return message count for ticket", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 5 }]),
      }),
    } as unknown as ReturnType<typeof db.select>);

    const result = await messagesService.getCount(mockTicketId);

    expect(result).toBe(5);
  });

  it("should return 0 for ticket with no messages", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      }),
    } as unknown as ReturnType<typeof db.select>);

    const result = await messagesService.getCount(mockTicketId);

    expect(result).toBe(0);
  });
});
