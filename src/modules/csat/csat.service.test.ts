import { beforeEach, describe, expect, it, vi } from "vitest";
import { csatService } from "./csat.service";

// Mock database
vi.mock("@/db", () => ({
  db: {
    query: {
      tickets: {
        findFirst: vi.fn(() => Promise.resolve(null)),
      },
      csatSurveys: {
        findFirst: vi.fn(() => Promise.resolve(null)),
        findMany: vi.fn(() => Promise.resolve([])),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ count: 0 }])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
  },
  closeDatabaseConnection: vi.fn(),
}));

import { db } from "@/db";

describe("csatService", () => {
  const mockOrgId = "org-123";
  const mockTicketId = "ticket-123";
  const mockCustomerId = "customer-123";
  const mockAgentId = "agent-123";
  const mockToken = "survey-token-123";

  const mockTicket = {
    id: mockTicketId,
    organizationId: mockOrgId,
    customerId: mockCustomerId,
    assigneeId: mockAgentId,
    status: "resolved" as const,
    ticketNumber: 1001,
    title: "Test Ticket",
    description: "Test description",
    priority: "medium" as const,
    channel: "email" as const,
    tags: [] as string[],
    categoryId: null,
    firstResponseAt: null,
    resolvedAt: null,
    closedAt: null,
    slaResponseDue: null,
    slaResolveDue: null,
    slaDeadline: null,
    slaBreached: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSurvey = {
    id: "survey-123",
    organizationId: mockOrgId,
    ticketId: mockTicketId,
    customerId: mockCustomerId,
    agentId: mockAgentId,
    token: mockToken,
    rating: null,
    feedback: null,
    sentAt: new Date(),
    respondedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sendSurvey", () => {
    it("should create survey for resolved ticket", async () => {
      vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
      vi.mocked(db.query.csatSurveys.findFirst).mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockSurvey]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const result = await csatService.sendSurvey(mockTicketId, mockOrgId);

      expect(result).toEqual(mockSurvey);
      expect(db.insert).toHaveBeenCalled();
    });

    it("should create survey for closed ticket", async () => {
      const closedTicket = { ...mockTicket, status: "closed" as const };
      vi.mocked(db.query.tickets.findFirst).mockResolvedValue(closedTicket);
      vi.mocked(db.query.csatSurveys.findFirst).mockResolvedValue(undefined);
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockSurvey]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const result = await csatService.sendSurvey(mockTicketId, mockOrgId);

      expect(result).toEqual(mockSurvey);
    });

    it("should throw NotFoundError when ticket not found", async () => {
      vi.mocked(db.query.tickets.findFirst).mockResolvedValue(undefined);

      await expect(csatService.sendSurvey("non-existent", mockOrgId)).rejects.toThrow(
        "Ticket not found",
      );
    });

    it("should throw ForbiddenError when ticket is not resolved/closed", async () => {
      const openTicket = { ...mockTicket, status: "open" as const };
      vi.mocked(db.query.tickets.findFirst).mockResolvedValue(openTicket);

      await expect(csatService.sendSurvey(mockTicketId, mockOrgId)).rejects.toThrow(
        "Survey can only be sent for resolved or closed tickets",
      );
    });

    it("should throw ForbiddenError when survey already exists", async () => {
      vi.mocked(db.query.tickets.findFirst).mockResolvedValue(mockTicket);
      vi.mocked(db.query.csatSurveys.findFirst).mockResolvedValue(mockSurvey);

      await expect(csatService.sendSurvey(mockTicketId, mockOrgId)).rejects.toThrow(
        "Survey already sent for this ticket",
      );
    });
  });

  describe("getByToken", () => {
    it("should return survey with ticket info", async () => {
      const surveyWithTicket = {
        ...mockSurvey,
        ticket: { ticketNumber: 1001, title: "Test Ticket" },
      };
      vi.mocked(db.query.csatSurveys.findFirst).mockResolvedValue(surveyWithTicket);

      const result = await csatService.getByToken(mockToken);

      expect(result).toEqual(surveyWithTicket);
    });

    it("should throw NotFoundError when survey not found", async () => {
      vi.mocked(db.query.csatSurveys.findFirst).mockResolvedValue(undefined);

      await expect(csatService.getByToken("invalid-token")).rejects.toThrow("Survey not found");
    });

    it("should throw ForbiddenError when survey expired", async () => {
      const expiredSurvey = {
        ...mockSurvey,
        expiresAt: new Date(Date.now() - 1000), // Expired
        ticket: { ticketNumber: 1001, title: "Test" },
      };
      vi.mocked(db.query.csatSurveys.findFirst).mockResolvedValue(expiredSurvey);

      await expect(csatService.getByToken(mockToken)).rejects.toThrow("Survey has expired");
    });

    it("should throw ForbiddenError when survey already submitted", async () => {
      const submittedSurvey = {
        ...mockSurvey,
        respondedAt: new Date(),
        rating: 5,
        ticket: { ticketNumber: 1001, title: "Test" },
      };
      vi.mocked(db.query.csatSurveys.findFirst).mockResolvedValue(submittedSurvey);

      await expect(csatService.getByToken(mockToken)).rejects.toThrow(
        "Survey has already been submitted",
      );
    });
  });

  describe("submitResponse", () => {
    it("should submit survey response successfully", async () => {
      vi.mocked(db.query.csatSurveys.findFirst).mockResolvedValue(mockSurvey);
      const submittedSurvey = {
        ...mockSurvey,
        rating: 5,
        feedback: "Great service!",
        respondedAt: new Date(),
      };
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([submittedSurvey]),
          }),
        }),
      } as unknown as ReturnType<typeof db.update>);

      const result = await csatService.submitResponse(mockToken, {
        rating: 5,
        feedback: "Great service!",
      });

      expect(result.rating).toBe(5);
      expect(result.feedback).toBe("Great service!");
    });

    it("should throw NotFoundError when survey not found", async () => {
      vi.mocked(db.query.csatSurveys.findFirst).mockResolvedValue(undefined);

      await expect(csatService.submitResponse("invalid", { rating: 5 })).rejects.toThrow(
        "Survey not found",
      );
    });

    it("should throw ForbiddenError when survey expired", async () => {
      const expiredSurvey = {
        ...mockSurvey,
        expiresAt: new Date(Date.now() - 1000),
      };
      vi.mocked(db.query.csatSurveys.findFirst).mockResolvedValue(expiredSurvey);

      await expect(csatService.submitResponse(mockToken, { rating: 5 })).rejects.toThrow(
        "Survey has expired",
      );
    });

    it("should throw ForbiddenError when survey already submitted", async () => {
      const submittedSurvey = {
        ...mockSurvey,
        respondedAt: new Date(),
      };
      vi.mocked(db.query.csatSurveys.findFirst).mockResolvedValue(submittedSurvey);

      await expect(csatService.submitResponse(mockToken, { rating: 4 })).rejects.toThrow(
        "Survey has already been submitted",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getStats
  // ─────────────────────────────────────────────────────────────
  describe("getStats", () => {
    it("should calculate correct statistics from survey data", async () => {
      // Mock basic stats query
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              totalSurveys: 100,
              respondedCount: 80,
              averageRating: 4.2,
            },
          ]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      // Mock rating distribution query
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                { rating: 1, count: 5 },
                { rating: 2, count: 5 },
                { rating: 3, count: 10 },
                { rating: 4, count: 30 },
                { rating: 5, count: 30 },
              ]),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await csatService.getStats(mockOrgId, {});

      // Verify basic stats
      expect(result.totalSurveys).toBe(100);
      expect(result.respondedCount).toBe(80);
      expect(result.responseRate).toBe(80); // 80/100 * 100
      expect(result.averageRating).toBe(4.2);

      // Verify rating distribution
      expect(result.ratingDistribution).toHaveLength(5);
      expect(result.ratingDistribution[0]).toEqual({ rating: 1, count: 5 });

      // Verify NPS calculation: promoters (4,5) = 60, detractors (1,2) = 10
      // NPS = (60 - 10) / 80 * 100 = 62.5 rounded = 63
      expect(result.npsScore).toBe(63);
    });

    it("should return zero values when no surveys exist", async () => {
      // Mock empty stats
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              totalSurveys: 0,
              respondedCount: 0,
              averageRating: 0,
            },
          ]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      // Mock empty rating distribution
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await csatService.getStats(mockOrgId, {});

      expect(result.totalSurveys).toBe(0);
      expect(result.respondedCount).toBe(0);
      expect(result.responseRate).toBe(0);
      expect(result.averageRating).toBe(0);
      expect(result.ratingDistribution).toHaveLength(0);
      expect(result.npsScore).toBe(0);
    });

    it("should calculate NPS correctly with only detractors", async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              totalSurveys: 10,
              respondedCount: 10,
              averageRating: 1.5,
            },
          ]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                { rating: 1, count: 5 },
                { rating: 2, count: 5 },
              ]),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await csatService.getStats(mockOrgId, {});

      // All detractors: NPS = (0 - 10) / 10 * 100 = -100
      expect(result.npsScore).toBe(-100);
    });

    it("should calculate NPS correctly with only promoters", async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              totalSurveys: 10,
              respondedCount: 10,
              averageRating: 4.8,
            },
          ]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                { rating: 4, count: 2 },
                { rating: 5, count: 8 },
              ]),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await csatService.getStats(mockOrgId, {});

      // All promoters: NPS = (10 - 0) / 10 * 100 = 100
      expect(result.npsScore).toBe(100);
    });
  });
});
