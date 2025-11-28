/**
 * Tickets Service Unit Tests
 *
 * Tests for the tickets service business logic.
 * Uses mocked database for isolation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ticket, TicketPriority, TicketStatus } from "@/db/schema/index";
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
        findMany: vi.fn(),
      },
      slaPolicies: {
        findFirst: vi.fn(),
      },
      users: {
        findFirst: vi.fn(),
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
import { ticketsService } from "./tickets.service";

// ─────────────────────────────────────────────────────────────
// Test Data
// ─────────────────────────────────────────────────────────────

const mockOrganizationId = "org-123";
const mockCustomerId = "user-456";
const mockAgentId = "agent-789";

function createMockTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "ticket-001",
    ticketNumber: 1,
    title: "Test Ticket",
    description: "Test description",
    status: "open" as TicketStatus,
    priority: "medium" as TicketPriority,
    channel: "web",
    tags: [],
    categoryId: null,
    organizationId: mockOrganizationId,
    customerId: mockCustomerId,
    assigneeId: null,
    slaDeadline: new Date(Date.now() + 3600000),
    slaBreached: false,
    resolvedAt: null,
    closedAt: null,
    firstResponseAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// ticketsService.create Tests
// ─────────────────────────────────────────────────────────────

describe("ticketsService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should create a ticket with default values", async () => {
    const mockTicket = createMockTicket();

    // Mock getNextTicketNumber
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ maxNumber: 5 }]),
      }),
    } as unknown as ReturnType<typeof db.select>);

    // Mock SLA policy lookup
    vi.mocked(db.query.slaPolicies.findFirst).mockResolvedValue(undefined);

    // Mock ticket insert
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ ...mockTicket, ticketNumber: 6 }]),
      }),
    } as unknown as ReturnType<typeof db.insert>);

    const result = await ticketsService.create(
      { title: "Test Ticket", description: "Test description", priority: "medium", channel: "web" },
      mockOrganizationId,
      mockCustomerId,
    );

    expect(result).toBeDefined();
    expect(result.ticketNumber).toBe(6);
    expect(db.insert).toHaveBeenCalled();
  });

  it("should use organization SLA policy when available", async () => {
    const mockTicket = createMockTicket();

    // Mock getNextTicketNumber
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ maxNumber: 0 }]),
      }),
    } as unknown as ReturnType<typeof db.select>);

    // Mock SLA policy lookup - return custom policy
    vi.mocked(db.query.slaPolicies.findFirst).mockResolvedValue({
      id: "sla-1",
      name: "High Priority SLA",
      organizationId: mockOrganizationId,
      priority: "high" as TicketPriority,
      firstResponseTime: 30, // 30 minutes
      resolutionTime: 240,
      businessHoursOnly: false,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Mock ticket insert
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockTicket]),
      }),
    } as unknown as ReturnType<typeof db.insert>);

    const result = await ticketsService.create(
      {
        title: "Urgent Issue",
        description: "Needs immediate attention",
        priority: "high",
        channel: "web",
      },
      mockOrganizationId,
      mockCustomerId,
    );

    expect(result).toBeDefined();
    expect(db.query.slaPolicies.findFirst).toHaveBeenCalled();
  });

  it("should accept custom priority and channel", async () => {
    const mockTicket = createMockTicket({ priority: "urgent", channel: "email" });

    // Mock getNextTicketNumber
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ maxNumber: 10 }]),
      }),
    } as unknown as ReturnType<typeof db.select>);

    // Mock SLA policy lookup
    vi.mocked(db.query.slaPolicies.findFirst).mockResolvedValue(undefined);

    // Mock ticket insert
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockTicket]),
      }),
    } as unknown as ReturnType<typeof db.insert>);

    const result = await ticketsService.create(
      {
        title: "Urgent Email Issue",
        description: "System down",
        priority: "urgent",
        channel: "email",
      },
      mockOrganizationId,
      mockCustomerId,
    );

    expect(result.priority).toBe("urgent");
    expect(result.channel).toBe("email");
  });

  it("should accept tags", async () => {
    const mockTicket = createMockTicket({ tags: ["billing", "urgent"] });

    // Mock getNextTicketNumber
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ maxNumber: 0 }]),
      }),
    } as unknown as ReturnType<typeof db.select>);

    // Mock SLA policy lookup
    vi.mocked(db.query.slaPolicies.findFirst).mockResolvedValue(undefined);

    // Mock ticket insert
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockTicket]),
      }),
    } as unknown as ReturnType<typeof db.insert>);

    const result = await ticketsService.create(
      {
        title: "Billing Issue",
        description: "Problem with invoice",
        priority: "medium",
        channel: "web",
        tags: ["billing", "urgent"],
      },
      mockOrganizationId,
      mockCustomerId,
    );

    expect(result.tags).toEqual(["billing", "urgent"]);
  });
});

// ─────────────────────────────────────────────────────────────
// ticketsService.getById Tests
// ─────────────────────────────────────────────────────────────

describe("ticketsService.getById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return ticket when customer owns it", async () => {
    const mockTicket = createMockTicket();

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);

    const result = await ticketsService.getById("ticket-001", mockCustomerId);

    expect(result).toBeDefined();
    expect(result.id).toBe("ticket-001");
  });

  it("should return ticket when agent is in same organization", async () => {
    const mockTicket = createMockTicket();

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);

    const result = await ticketsService.getById(
      "ticket-001",
      mockAgentId,
      "agent",
      mockOrganizationId,
    );

    expect(result).toBeDefined();
    expect(result.id).toBe("ticket-001");
  });

  it("should throw NotFoundError when ticket does not exist", async () => {
    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(undefined);

    await expect(ticketsService.getById("nonexistent", mockCustomerId)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("should throw ForbiddenError when user has no access", async () => {
    const mockTicket = createMockTicket();

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);

    // Different user who is not the customer and not an agent
    await expect(ticketsService.getById("ticket-001", "other-user-id")).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("should throw ForbiddenError when agent is in different organization", async () => {
    const mockTicket = createMockTicket();

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);

    // Agent in different organization
    await expect(
      ticketsService.getById("ticket-001", mockAgentId, "agent", "different-org"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("should allow admin access to organization tickets", async () => {
    const mockTicket = createMockTicket();

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);

    const result = await ticketsService.getById(
      "ticket-001",
      "admin-user",
      "admin",
      mockOrganizationId,
    );

    expect(result).toBeDefined();
  });

  it("should allow owner access to organization tickets", async () => {
    const mockTicket = createMockTicket();

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);

    const result = await ticketsService.getById(
      "ticket-001",
      "owner-user",
      "owner",
      mockOrganizationId,
    );

    expect(result).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────
// ticketsService.list Tests
// ─────────────────────────────────────────────────────────────

describe("ticketsService.list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return paginated list of tickets", async () => {
    const mockTickets = [
      createMockTicket({ id: "ticket-1" }),
      createMockTicket({ id: "ticket-2" }),
    ];

    vi.mocked(db.query.tickets.findMany).mockResolvedValue(mockTickets);

    // Mock count query - return a simple object, mock the structure
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 2 }]),
      }),
    } as unknown as ReturnType<typeof db.select>);

    const result = await ticketsService.list(
      { page: 1, limit: 10, sortBy: "createdAt", sortOrder: "desc" },
      mockCustomerId,
      "agent",
      mockOrganizationId,
    );

    expect(result).toBeDefined();
    expect(result.data).toHaveLength(2);
  });

  it("should filter by status", async () => {
    vi.mocked(db.query.tickets.findMany).mockResolvedValue([createMockTicket({ status: "open" })]);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      }),
    } as unknown as ReturnType<typeof db.select>);

    const result = await ticketsService.list(
      { page: 1, limit: 10, sortBy: "createdAt", sortOrder: "desc", status: "open" },
      mockAgentId,
      "agent",
      mockOrganizationId,
    );

    expect(result.data[0].status).toBe("open");
  });

  it("should filter by priority", async () => {
    vi.mocked(db.query.tickets.findMany).mockResolvedValue([
      createMockTicket({ priority: "urgent" }),
    ]);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      }),
    } as unknown as ReturnType<typeof db.select>);

    const result = await ticketsService.list(
      { page: 1, limit: 10, sortBy: "createdAt", sortOrder: "desc", priority: "urgent" },
      mockAgentId,
      "agent",
      mockOrganizationId,
    );

    expect(result.data[0].priority).toBe("urgent");
  });

  it("should filter unassigned tickets", async () => {
    vi.mocked(db.query.tickets.findMany).mockResolvedValue([
      createMockTicket({ assigneeId: null }),
    ]);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      }),
    } as unknown as ReturnType<typeof db.select>);

    const result = await ticketsService.list(
      { page: 1, limit: 10, sortBy: "createdAt", sortOrder: "desc", assigneeId: "unassigned" },
      mockAgentId,
      "agent",
      mockOrganizationId,
    );

    expect(result.data[0].assigneeId).toBeNull();
  });

  it("should limit customers to their own tickets", async () => {
    vi.mocked(db.query.tickets.findMany).mockResolvedValue([
      createMockTicket({ customerId: mockCustomerId }),
    ]);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      }),
    } as unknown as ReturnType<typeof db.select>);

    const result = await ticketsService.list(
      { page: 1, limit: 10, sortBy: "createdAt", sortOrder: "desc" },
      mockCustomerId,
      "customer",
      mockOrganizationId,
    );

    // All returned tickets should belong to the customer
    expect(result.data.every((t) => t.customerId === mockCustomerId)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Access Control Tests
// ─────────────────────────────────────────────────────────────

describe("ticketsService access control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should deny customer access to other customers tickets", async () => {
    const otherCustomerTicket = createMockTicket({ customerId: "other-customer" });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(otherCustomerTicket);

    await expect(ticketsService.getById("ticket-001", mockCustomerId)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("should allow ticket creator access regardless of role assignment", async () => {
    const mockTicket = createMockTicket();

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);

    // Customer accessing their own ticket without role
    const result = await ticketsService.getById("ticket-001", mockCustomerId);

    expect(result).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────
// ticketsService.update Tests
// ─────────────────────────────────────────────────────────────

describe("ticketsService.update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should update ticket title and description", async () => {
    const mockTicket = createMockTicket();
    const updatedTicket = createMockTicket({
      title: "Updated Title",
      description: "Updated Description",
    });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedTicket]),
        }),
      }),
    } as unknown as ReturnType<typeof db.update>);

    const result = await ticketsService.update(
      "ticket-001",
      { title: "Updated Title", description: "Updated Description" },
      mockAgentId,
      "agent",
    );

    expect(result.title).toBe("Updated Title");
    expect(result.description).toBe("Updated Description");
  });

  it("should update priority and log activity", async () => {
    const mockTicket = createMockTicket({ priority: "low" });
    const updatedTicket = createMockTicket({ priority: "high" });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedTicket]),
        }),
      }),
    } as unknown as ReturnType<typeof db.update>);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{}]),
      }),
    } as unknown as ReturnType<typeof db.insert>);

    const result = await ticketsService.update(
      "ticket-001",
      { priority: "high" },
      mockAgentId,
      "agent",
    );

    expect(result.priority).toBe("high");
    expect(db.insert).toHaveBeenCalled(); // Activity logged
  });

  it("should update status and set resolvedAt timestamp when resolving", async () => {
    const mockTicket = createMockTicket({ status: "pending", resolvedAt: null });
    const updatedTicket = createMockTicket({
      status: "resolved",
      resolvedAt: new Date(),
    });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedTicket]),
        }),
      }),
    } as unknown as ReturnType<typeof db.update>);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{}]),
      }),
    } as unknown as ReturnType<typeof db.insert>);

    const result = await ticketsService.update(
      "ticket-001",
      { status: "resolved" },
      mockAgentId,
      "agent",
    );

    expect(result.status).toBe("resolved");
    expect(result.resolvedAt).toBeDefined();
  });

  it("should set closedAt timestamp when closing", async () => {
    const mockTicket = createMockTicket({ status: "resolved", closedAt: null });
    const updatedTicket = createMockTicket({
      status: "closed",
      closedAt: new Date(),
    });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedTicket]),
        }),
      }),
    } as unknown as ReturnType<typeof db.update>);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{}]),
      }),
    } as unknown as ReturnType<typeof db.insert>);

    const result = await ticketsService.update(
      "ticket-001",
      { status: "closed" },
      mockAgentId,
      "agent",
    );

    expect(result.status).toBe("closed");
    expect(result.closedAt).toBeDefined();
  });

  it("should update tags", async () => {
    const mockTicket = createMockTicket({ tags: ["old-tag"] });
    const updatedTicket = createMockTicket({ tags: ["new-tag", "billing"] });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedTicket]),
        }),
      }),
    } as unknown as ReturnType<typeof db.update>);

    const result = await ticketsService.update(
      "ticket-001",
      { tags: ["new-tag", "billing"] },
      mockAgentId,
      "agent",
    );

    expect(result.tags).toEqual(["new-tag", "billing"]);
  });

  it("should throw NotFoundError when ticket does not exist", async () => {
    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(undefined);

    await expect(
      ticketsService.update("nonexistent", { title: "New Title" }, mockAgentId, "agent"),
    ).rejects.toThrow(NotFoundError);
  });
});

// ─────────────────────────────────────────────────────────────
// ticketsService.assign Tests
// ─────────────────────────────────────────────────────────────

describe("ticketsService.assign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should assign ticket to agent", async () => {
    const mockTicket = createMockTicket({ assigneeId: null });
    const assignedTicket = createMockTicket({
      assigneeId: mockAgentId,
      status: "pending",
    });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      id: mockAgentId,
      name: "Test Agent",
      email: "agent@test.com",
      avatarUrl: null,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      isActive: true,
      lastLoginAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([assignedTicket]),
        }),
      }),
    } as unknown as ReturnType<typeof db.update>);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{}]),
      }),
    } as unknown as ReturnType<typeof db.insert>);

    const result = await ticketsService.assign("ticket-001", mockAgentId, "admin-user");

    expect(result.assigneeId).toBe(mockAgentId);
    expect(result.status).toBe("pending");
    expect(db.insert).toHaveBeenCalled(); // Activity logged
  });

  it("should unassign ticket when assigneeId is null", async () => {
    const mockTicket = createMockTicket({ assigneeId: mockAgentId });
    const unassignedTicket = createMockTicket({
      assigneeId: null,
      status: "open",
    });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([unassignedTicket]),
        }),
      }),
    } as unknown as ReturnType<typeof db.update>);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{}]),
      }),
    } as unknown as ReturnType<typeof db.insert>);

    const result = await ticketsService.assign("ticket-001", null, "admin-user");

    expect(result.assigneeId).toBeNull();
    expect(result.status).toBe("open");
  });

  it("should throw NotFoundError when ticket does not exist", async () => {
    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(undefined);

    await expect(ticketsService.assign("nonexistent", mockAgentId, "admin-user")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("should throw NotFoundError when assignee does not exist", async () => {
    const mockTicket = createMockTicket();

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.query.users.findFirst).mockResolvedValue(undefined);

    await expect(
      ticketsService.assign("ticket-001", "nonexistent-user", "admin-user"),
    ).rejects.toThrow(NotFoundError);
  });
});

// ─────────────────────────────────────────────────────────────
// ticketsService.close Tests
// ─────────────────────────────────────────────────────────────

describe("ticketsService.close", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should close an open ticket", async () => {
    const mockTicket = createMockTicket({ status: "open" });
    const closedTicket = createMockTicket({
      status: "closed",
      closedAt: new Date(),
    });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([closedTicket]),
        }),
      }),
    } as unknown as ReturnType<typeof db.update>);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{}]),
      }),
    } as unknown as ReturnType<typeof db.insert>);

    const result = await ticketsService.close("ticket-001", mockAgentId);

    expect(result.status).toBe("closed");
    expect(result.closedAt).toBeDefined();
    expect(db.insert).toHaveBeenCalled(); // Activity logged
  });

  it("should close ticket with reason", async () => {
    const mockTicket = createMockTicket({ status: "resolved" });
    const closedTicket = createMockTicket({
      status: "closed",
      closedAt: new Date(),
    });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([closedTicket]),
        }),
      }),
    } as unknown as ReturnType<typeof db.update>);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{}]),
      }),
    } as unknown as ReturnType<typeof db.insert>);

    const result = await ticketsService.close("ticket-001", mockAgentId, "Issue resolved");

    expect(result.status).toBe("closed");
    expect(db.insert).toHaveBeenCalled();
  });

  it("should throw NotFoundError when ticket does not exist", async () => {
    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(undefined);

    await expect(ticketsService.close("nonexistent", mockAgentId)).rejects.toThrow(NotFoundError);
  });

  it("should throw ForbiddenError when ticket is already closed", async () => {
    const closedTicket = createMockTicket({ status: "closed" });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(closedTicket);

    await expect(ticketsService.close("ticket-001", mockAgentId)).rejects.toThrow(ForbiddenError);
  });
});

// ─────────────────────────────────────────────────────────────
// ticketsService.reopen Tests
// ─────────────────────────────────────────────────────────────

describe("ticketsService.reopen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should reopen a closed ticket", async () => {
    const closedTicket = createMockTicket({
      status: "closed",
      closedAt: new Date(),
    });
    const reopenedTicket = createMockTicket({
      status: "open",
      closedAt: null,
    });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(closedTicket);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([reopenedTicket]),
        }),
      }),
    } as unknown as ReturnType<typeof db.update>);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{}]),
      }),
    } as unknown as ReturnType<typeof db.insert>);

    const result = await ticketsService.reopen("ticket-001", mockAgentId);

    expect(result.status).toBe("open");
    expect(result.closedAt).toBeNull();
    expect(db.insert).toHaveBeenCalled(); // Activity logged
  });

  it("should throw NotFoundError when ticket does not exist", async () => {
    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(undefined);

    await expect(ticketsService.reopen("nonexistent", mockAgentId)).rejects.toThrow(NotFoundError);
  });

  it("should throw ForbiddenError when ticket is not closed", async () => {
    const openTicket = createMockTicket({ status: "open" });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(openTicket);

    await expect(ticketsService.reopen("ticket-001", mockAgentId)).rejects.toThrow(ForbiddenError);
  });

  it("should throw ForbiddenError when ticket is pending", async () => {
    const pendingTicket = createMockTicket({ status: "pending" });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(pendingTicket);

    await expect(ticketsService.reopen("ticket-001", mockAgentId)).rejects.toThrow(ForbiddenError);
  });
});

// ─────────────────────────────────────────────────────────────
// ticketsService.getStats Tests
// ─────────────────────────────────────────────────────────────

describe("ticketsService.getStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should return ticket statistics by status and priority", async () => {
    // Mock status stats
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockResolvedValue([
            { status: "open", count: 5 },
            { status: "pending", count: 3 },
            { status: "closed", count: 10 },
          ]),
        }),
      }),
    } as unknown as ReturnType<typeof db.select>);

    // Mock priority stats
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockResolvedValue([
            { priority: "high", count: 4 },
            { priority: "medium", count: 3 },
            { priority: "low", count: 1 },
          ]),
        }),
      }),
    } as unknown as ReturnType<typeof db.select>);

    const result = await ticketsService.getStats(mockOrganizationId);

    expect(result.byStatus).toBeDefined();
    expect(result.byPriority).toBeDefined();
    expect(result.total).toBe(18); // 5 + 3 + 10
  });

  it("should return empty stats for organization with no tickets", async () => {
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as unknown as ReturnType<typeof db.select>);

    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as unknown as ReturnType<typeof db.select>);

    const result = await ticketsService.getStats(mockOrganizationId);

    expect(result.byStatus).toEqual({});
    expect(result.byPriority).toEqual({});
    expect(result.total).toBe(0);
  });
});
