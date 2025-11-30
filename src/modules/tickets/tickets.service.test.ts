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

// ─────────────────────────────────────────────────────────────
// ticketsService.delete Tests
// ─────────────────────────────────────────────────────────────

describe("ticketsService.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should delete ticket successfully when user is admin", async () => {
    const mockTicket = createMockTicket();

    // Mock finding the ticket
    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);

    // Mock delete operations (messages, activities, ticket)
    vi.mocked(db.delete).mockReturnValue({
      where: vi.fn().mockResolvedValue({ rowCount: 1 }),
    } as unknown as ReturnType<typeof db.delete>);

    await expect(
      ticketsService.delete("ticket-001", mockAgentId, "admin"),
    ).resolves.toBeUndefined();

    expect(db.query.tickets.findFirst).toHaveBeenCalled();
    expect(db.delete).toHaveBeenCalledTimes(3); // messages, activities, ticket
  });

  it("should delete ticket successfully when user is owner", async () => {
    const mockTicket = createMockTicket();

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.delete).mockReturnValue({
      where: vi.fn().mockResolvedValue({ rowCount: 1 }),
    } as unknown as ReturnType<typeof db.delete>);

    await expect(
      ticketsService.delete("ticket-001", mockAgentId, "owner"),
    ).resolves.toBeUndefined();

    expect(db.delete).toHaveBeenCalledTimes(3);
  });

  it("should throw ForbiddenError when agent tries to delete", async () => {
    await expect(ticketsService.delete("ticket-001", mockAgentId, "agent")).rejects.toThrow(
      ForbiddenError,
    );

    expect(db.query.tickets.findFirst).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("should throw ForbiddenError when customer tries to delete", async () => {
    await expect(ticketsService.delete("ticket-001", mockCustomerId, "customer")).rejects.toThrow(
      ForbiddenError,
    );

    expect(db.query.tickets.findFirst).not.toHaveBeenCalled();
  });

  it("should throw NotFoundError when ticket does not exist", async () => {
    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(undefined);

    await expect(ticketsService.delete("non-existent", mockAgentId, "admin")).rejects.toThrow(
      NotFoundError,
    );

    expect(db.delete).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// ticketsService.getActivities Tests
// ─────────────────────────────────────────────────────────────

describe("ticketsService.getActivities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should return paginated activities for a ticket", async () => {
    const mockTicket = createMockTicket();
    const mockActivities = [
      {
        id: "activity-1",
        action: "created",
        metadata: {},
        createdAt: new Date(),
        user: { id: mockCustomerId, name: "John Doe", email: "john@test.com", avatarUrl: null },
      },
      {
        id: "activity-2",
        action: "assigned",
        metadata: { assigneeId: mockAgentId },
        createdAt: new Date(),
        user: { id: mockAgentId, name: "Agent Smith", email: "agent@test.com", avatarUrl: null },
      },
    ];

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockActivities),
              }),
            }),
          }),
        }),
      }),
    } as never);
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 2 }]),
      }),
    } as never);

    const result = await ticketsService.getActivities("ticket-001", mockCustomerId, "customer");

    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
    expect(result.pagination.page).toBe(1);
    expect(result.data[0].action).toBe("created");
  });

  it("should throw NotFoundError when ticket does not exist", async () => {
    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(undefined);

    await expect(
      ticketsService.getActivities("non-existent", mockCustomerId, "customer"),
    ).rejects.toThrow(NotFoundError);
  });

  it("should throw ForbiddenError when customer tries to access another customer's ticket", async () => {
    const mockTicket = createMockTicket({ customerId: "other-customer" });
    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);

    await expect(
      ticketsService.getActivities("ticket-001", mockCustomerId, "customer"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("should allow agents to access any ticket activities", async () => {
    const mockTicket = createMockTicket({ customerId: "other-customer" });
    const mockActivities = [
      { id: "activity-1", action: "created", metadata: {}, createdAt: new Date(), user: null },
    ];

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockActivities),
              }),
            }),
          }),
        }),
      }),
    } as never);
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      }),
    } as never);

    const result = await ticketsService.getActivities("ticket-001", mockAgentId, "agent");

    expect(result.data).toHaveLength(1);
  });

  it("should respect pagination options", async () => {
    const mockTicket = createMockTicket();
    const mockActivities = [
      {
        id: "activity-3",
        action: "status_changed",
        metadata: {},
        createdAt: new Date(),
        user: null,
      },
    ];

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockActivities),
              }),
            }),
          }),
        }),
      }),
    } as never);
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 25 }]),
      }),
    } as never);

    const result = await ticketsService.getActivities("ticket-001", mockCustomerId, "customer", {
      page: 2,
      limit: 10,
    });

    expect(result.pagination.page).toBe(2);
    expect(result.pagination.limit).toBe(10);
    expect(result.pagination.total).toBe(25);
    expect(result.pagination.totalPages).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────
// ticketsService.bulkUpdate Tests
// ─────────────────────────────────────────────────────────────

describe("ticketsService.bulkUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should update multiple tickets successfully", async () => {
    const mockTickets = [
      createMockTicket({ id: "ticket-1", status: "open", priority: "low" }),
      createMockTicket({ id: "ticket-2", status: "open", priority: "medium" }),
    ];

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockTickets),
      }),
    } as never);

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      }),
    } as never);

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue({ rowCount: 1 }),
    } as never);

    const result = await ticketsService.bulkUpdate(
      mockOrganizationId,
      {
        ticketIds: ["ticket-1", "ticket-2"],
        updates: { status: "pending", priority: "high" },
      },
      mockAgentId,
    );

    expect(result.updated).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(db.update).toHaveBeenCalledTimes(2);
    expect(db.insert).toHaveBeenCalledTimes(2); // activity logs
  });

  it("should handle not found tickets gracefully", async () => {
    const mockTickets = [createMockTicket({ id: "ticket-1" })];

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockTickets),
      }),
    } as never);

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      }),
    } as never);

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue({ rowCount: 1 }),
    } as never);

    const result = await ticketsService.bulkUpdate(
      mockOrganizationId,
      {
        ticketIds: ["ticket-1", "ticket-not-found"],
        updates: { status: "pending" },
      },
      mockAgentId,
    );

    expect(result.updated).toBe(1);
    expect(result.errors).toContain("Ticket ticket-not-found not found");
  });

  it("should add and remove tags correctly", async () => {
    const mockTickets = [createMockTicket({ id: "ticket-1", tags: ["bug", "urgent"] })];

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockTickets),
      }),
    } as never);

    const mockSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({ rowCount: 1 }),
    });
    vi.mocked(db.update).mockReturnValue({
      set: mockSet,
    } as never);

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue({ rowCount: 1 }),
    } as never);

    const result = await ticketsService.bulkUpdate(
      mockOrganizationId,
      {
        ticketIds: ["ticket-1"],
        updates: { addTags: ["feature"], removeTags: ["urgent"] },
      },
      mockAgentId,
    );

    expect(result.updated).toBe(1);
    // Verify tags were properly merged
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: expect.arrayContaining(["bug", "feature"]),
      }),
    );
  });

  it("should handle database errors gracefully", async () => {
    const mockTickets = [createMockTicket({ id: "ticket-1" })];

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockTickets),
      }),
    } as never);

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error("Database error")),
      }),
    } as never);

    const result = await ticketsService.bulkUpdate(
      mockOrganizationId,
      {
        ticketIds: ["ticket-1"],
        updates: { status: "pending" },
      },
      mockAgentId,
    );

    expect(result.updated).toBe(0);
    expect(result.errors).toContain("Ticket ticket-1: Database error");
  });
});

// ─────────────────────────────────────────────────────────────
// ticketsService.bulkDelete Tests
// ─────────────────────────────────────────────────────────────

describe("ticketsService.bulkDelete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should soft delete (close) multiple tickets", async () => {
    const mockTickets = [
      createMockTicket({ id: "ticket-1", status: "open" }),
      createMockTicket({ id: "ticket-2", status: "pending" }),
    ];

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockTickets),
      }),
    } as never);

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 2 }),
      }),
    } as never);

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue({ rowCount: 2 }),
    } as never);

    const result = await ticketsService.bulkDelete(
      mockOrganizationId,
      { ticketIds: ["ticket-1", "ticket-2"], permanent: false },
      mockAgentId,
    );

    expect(result.deleted).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(db.update).toHaveBeenCalled(); // Soft delete uses update
    expect(db.insert).toHaveBeenCalled(); // Activity logs
  });

  it("should permanently delete multiple tickets", async () => {
    const mockTickets = [
      createMockTicket({ id: "ticket-1" }),
      createMockTicket({ id: "ticket-2" }),
    ];

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockTickets),
      }),
    } as never);

    vi.mocked(db.delete).mockReturnValue({
      where: vi.fn().mockResolvedValue({ rowCount: 2 }),
    } as never);

    const result = await ticketsService.bulkDelete(
      mockOrganizationId,
      { ticketIds: ["ticket-1", "ticket-2"], permanent: true },
      mockAgentId,
    );

    expect(result.deleted).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(db.delete).toHaveBeenCalled();
  });

  it("should handle not found tickets gracefully", async () => {
    const mockTickets = [createMockTicket({ id: "ticket-1" })];

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockTickets),
      }),
    } as never);

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      }),
    } as never);

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue({ rowCount: 1 }),
    } as never);

    const result = await ticketsService.bulkDelete(
      mockOrganizationId,
      { ticketIds: ["ticket-1", "ticket-not-found"], permanent: false },
      mockAgentId,
    );

    expect(result.deleted).toBe(1);
    expect(result.errors).toContain("Ticket ticket-not-found not found");
  });

  it("should return early when no tickets found", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as never);

    const result = await ticketsService.bulkDelete(
      mockOrganizationId,
      { ticketIds: ["ticket-not-found"], permanent: false },
      mockAgentId,
    );

    expect(result.deleted).toBe(0);
    expect(result.errors).toContain("Ticket ticket-not-found not found");
    expect(db.update).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("should handle database errors gracefully", async () => {
    const mockTickets = [createMockTicket({ id: "ticket-1" })];

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockTickets),
      }),
    } as never);

    vi.mocked(db.delete).mockReturnValue({
      where: vi.fn().mockRejectedValue(new Error("Database error")),
    } as never);

    const result = await ticketsService.bulkDelete(
      mockOrganizationId,
      { ticketIds: ["ticket-1"], permanent: true },
      mockAgentId,
    );

    expect(result.deleted).toBe(0);
    expect(result.errors).toContain("Bulk operation failed: Database error");
  });
});

// ─────────────────────────────────────────────────────────────
// ticketsService.bulkAssign Tests
// ─────────────────────────────────────────────────────────────

describe("ticketsService.bulkAssign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should assign multiple tickets to an agent", async () => {
    const mockTickets = [
      createMockTicket({ id: "ticket-1", assigneeId: null }),
      createMockTicket({ id: "ticket-2", assigneeId: null }),
    ];
    const mockAssignee = { id: mockAgentId, name: "Agent Smith", email: "agent@test.com" };

    vi.mocked(db.query.users.findFirst).mockResolvedValue(mockAssignee as never);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockTickets),
      }),
    } as never);

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 2 }),
      }),
    } as never);

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue({ rowCount: 2 }),
    } as never);

    const result = await ticketsService.bulkAssign(
      mockOrganizationId,
      { ticketIds: ["ticket-1", "ticket-2"], assigneeId: mockAgentId },
      mockCustomerId,
    );

    expect(result.assigned).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(db.query.users.findFirst).toHaveBeenCalled();
  });

  it("should unassign multiple tickets when assigneeId is null", async () => {
    const mockTickets = [
      createMockTicket({ id: "ticket-1", assigneeId: mockAgentId }),
      createMockTicket({ id: "ticket-2", assigneeId: mockAgentId }),
    ];

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockTickets),
      }),
    } as never);

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 2 }),
      }),
    } as never);

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue({ rowCount: 2 }),
    } as never);

    const result = await ticketsService.bulkAssign(
      mockOrganizationId,
      { ticketIds: ["ticket-1", "ticket-2"], assigneeId: null },
      mockCustomerId,
    );

    expect(result.assigned).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(db.query.users.findFirst).not.toHaveBeenCalled(); // No assignee lookup needed
  });

  it("should return error when assignee not found", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValue(undefined);

    const result = await ticketsService.bulkAssign(
      mockOrganizationId,
      { ticketIds: ["ticket-1"], assigneeId: "non-existent-agent" },
      mockCustomerId,
    );

    expect(result.assigned).toBe(0);
    expect(result.errors).toContain("Assignee not found");
  });

  it("should skip tickets already assigned to the same agent", async () => {
    const mockTickets = [
      createMockTicket({ id: "ticket-1", assigneeId: mockAgentId }),
      createMockTicket({ id: "ticket-2", assigneeId: null }),
    ];
    const mockAssignee = { id: mockAgentId, name: "Agent Smith" };

    vi.mocked(db.query.users.findFirst).mockResolvedValue(mockAssignee as never);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockTickets),
      }),
    } as never);

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      }),
    } as never);

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue({ rowCount: 1 }),
    } as never);

    const result = await ticketsService.bulkAssign(
      mockOrganizationId,
      { ticketIds: ["ticket-1", "ticket-2"], assigneeId: mockAgentId },
      mockCustomerId,
    );

    // Only ticket-2 should be updated since ticket-1 is already assigned to the agent
    expect(result.assigned).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("should handle not found tickets gracefully", async () => {
    const mockTickets = [createMockTicket({ id: "ticket-1", assigneeId: null })];
    const mockAssignee = { id: mockAgentId, name: "Agent Smith" };

    vi.mocked(db.query.users.findFirst).mockResolvedValue(mockAssignee as never);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockTickets),
      }),
    } as never);

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      }),
    } as never);

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue({ rowCount: 1 }),
    } as never);

    const result = await ticketsService.bulkAssign(
      mockOrganizationId,
      { ticketIds: ["ticket-1", "ticket-not-found"], assigneeId: mockAgentId },
      mockCustomerId,
    );

    expect(result.assigned).toBe(1);
    expect(result.errors).toContain("Ticket ticket-not-found not found");
  });
});

// ─────────────────────────────────────────────────────────────
// ticketsService.mergeTickets Tests
// ─────────────────────────────────────────────────────────────

describe("ticketsService.mergeTickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should merge tickets and copy messages", async () => {
    const primaryTicket = createMockTicket({ id: "primary-ticket", ticketNumber: 1 });
    const secondaryTicket = createMockTicket({ id: "secondary-ticket", ticketNumber: 2 });
    const mockMessages = [
      {
        id: "msg-1",
        senderId: mockCustomerId,
        content: "Message 1",
        type: "reply",
        attachments: [],
        createdAt: new Date(),
      },
      {
        id: "msg-2",
        senderId: mockAgentId,
        content: "Message 2",
        type: "reply",
        attachments: [],
        createdAt: new Date(),
      },
    ];

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(primaryTicket);

    // Mock selecting secondary tickets
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([secondaryTicket]),
      }),
    } as never);

    // Mock selecting messages from secondary ticket
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockMessages),
      }),
    } as never);

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue({ rowCount: 1 }),
    } as never);

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      }),
    } as never);

    const result = await ticketsService.mergeTickets(
      mockOrganizationId,
      {
        primaryTicketId: "primary-ticket",
        secondaryTicketIds: ["secondary-ticket"],
        mergeComments: true,
      },
      mockAgentId,
    );

    expect(result.merged).toBe(true);
    expect(result.messagesCopied).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it("should merge tickets without copying messages", async () => {
    const primaryTicket = createMockTicket({ id: "primary-ticket", ticketNumber: 1 });
    const secondaryTicket = createMockTicket({ id: "secondary-ticket", ticketNumber: 2 });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(primaryTicket);

    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([secondaryTicket]),
      }),
    } as never);

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue({ rowCount: 1 }),
    } as never);

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      }),
    } as never);

    const result = await ticketsService.mergeTickets(
      mockOrganizationId,
      {
        primaryTicketId: "primary-ticket",
        secondaryTicketIds: ["secondary-ticket"],
        mergeComments: false,
      },
      mockAgentId,
    );

    expect(result.merged).toBe(true);
    expect(result.messagesCopied).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("should return error when primary ticket not found", async () => {
    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(undefined);

    const result = await ticketsService.mergeTickets(
      mockOrganizationId,
      {
        primaryTicketId: "non-existent",
        secondaryTicketIds: ["secondary-ticket"],
        mergeComments: true,
      },
      mockAgentId,
    );

    expect(result.merged).toBe(false);
    expect(result.messagesCopied).toBe(0);
    expect(result.errors).toContain("Primary ticket not found");
  });

  it("should handle not found secondary tickets gracefully", async () => {
    const primaryTicket = createMockTicket({ id: "primary-ticket", ticketNumber: 1 });
    const secondaryTicket = createMockTicket({ id: "secondary-1", ticketNumber: 2 });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(primaryTicket);

    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([secondaryTicket]), // Only one found
      }),
    } as never);

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue({ rowCount: 1 }),
    } as never);

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      }),
    } as never);

    const result = await ticketsService.mergeTickets(
      mockOrganizationId,
      {
        primaryTicketId: "primary-ticket",
        secondaryTicketIds: ["secondary-1", "secondary-not-found"],
        mergeComments: false,
      },
      mockAgentId,
    );

    expect(result.merged).toBe(true);
    expect(result.errors).toContain("Secondary ticket secondary-not-found not found");
  });

  it("should return early when no secondary tickets found", async () => {
    const primaryTicket = createMockTicket({ id: "primary-ticket", ticketNumber: 1 });

    vi.mocked(db.query.tickets.findFirst).mockResolvedValue(primaryTicket);

    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as never);

    const result = await ticketsService.mergeTickets(
      mockOrganizationId,
      {
        primaryTicketId: "primary-ticket",
        secondaryTicketIds: ["non-existent-1", "non-existent-2"],
        mergeComments: true,
      },
      mockAgentId,
    );

    expect(result.merged).toBe(false);
    expect(result.messagesCopied).toBe(0);
    expect(result.errors).toHaveLength(2);
  });
});
