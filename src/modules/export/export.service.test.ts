import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportService } from "./export.service";
import type { ExportQuery } from "./export.schema";

// Mock database
vi.mock("@/db", () => ({
  db: {
    query: {
      tickets: {
        findMany: vi.fn(() => Promise.resolve([])),
      },
    },
  },
  closeDatabaseConnection: vi.fn(),
}));

import { db } from "@/db";

describe("exportService", () => {
  const mockOrgId = "org-123";

  const defaultQuery: ExportQuery = {
    format: "csv",
    fields: undefined,
  };

  const mockTicket = {
    ticketNumber: 1001,
    title: "Test Ticket",
    description: "Test Description",
    status: "open",
    priority: "medium",
    channel: "web",
    createdAt: new Date("2024-01-15T10:00:00Z"),
    updatedAt: new Date("2024-01-15T12:00:00Z"),
    resolvedAt: null,
    closedAt: null,
    firstResponseAt: null,
    slaResponseDue: null,
    slaResolutionDue: null,
    customer: { name: "John Doe", email: "john@example.com" },
    assignee: { name: "Agent Smith", email: "agent@example.com" },
    category: { name: "Technical Support" },
    tags: [{ tag: { name: "bug" } }, { tag: { name: "urgent" } }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("exportTicketsCSV", () => {
    it("should export tickets to CSV format", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: Mock return type flexibility
      vi.mocked(db.query.tickets.findMany).mockResolvedValue([mockTicket] as any);

      const result = await exportService.exportTicketsCSV(mockOrgId, defaultQuery);

      expect(result.filename).toMatch(/^tickets-export-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(result.content).toContain("ticketNumber");
      expect(result.content).toContain("1001");
    });

    it("should use specified fields only", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: Mock return type flexibility
      vi.mocked(db.query.tickets.findMany).mockResolvedValue([mockTicket] as any);

      const result = await exportService.exportTicketsCSV(mockOrgId, {
        ...defaultQuery,
        fields: ["ticketNumber", "title", "status"],
      });

      expect(result.content).toContain("ticketNumber,title,status");
      expect(result.content).not.toContain("description");
    });

    it("should handle empty results", async () => {
      vi.mocked(db.query.tickets.findMany).mockResolvedValue([]);

      const result = await exportService.exportTicketsCSV(mockOrgId, defaultQuery);

      // Should still have header row
      expect(result.content).toContain("ticketNumber");
      expect(result.filename).toMatch(/\.csv$/);
    });

    it("should escape CSV special characters", async () => {
      const ticketWithSpecialChars = {
        ...mockTicket,
        title: 'Title with, comma and "quotes"',
        description: "Description\nwith newline",
      };
      // biome-ignore lint/suspicious/noExplicitAny: Mock return type flexibility
      vi.mocked(db.query.tickets.findMany).mockResolvedValue([ticketWithSpecialChars] as any);

      const result = await exportService.exportTicketsCSV(mockOrgId, {
        ...defaultQuery,
        fields: ["title", "description"],
      });

      // CSV escaping wraps in quotes and doubles internal quotes
      expect(result.content).toContain('"Title with, comma and ""quotes"""');
    });
  });

  describe("exportTicketsXLSX", () => {
    it("should export tickets to XLSX format", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: Mock return type flexibility
      vi.mocked(db.query.tickets.findMany).mockResolvedValue([mockTicket] as any);

      const result = await exportService.exportTicketsXLSX(mockOrgId, {
        ...defaultQuery,
        format: "xlsx",
      });

      expect(result.filename).toMatch(/^tickets-export-\d{4}-\d{2}-\d{2}\.xlsx$/);
      expect(result.content).toBeInstanceOf(Buffer);
    });

    it("should handle empty results", async () => {
      vi.mocked(db.query.tickets.findMany).mockResolvedValue([]);

      const result = await exportService.exportTicketsXLSX(mockOrgId, {
        ...defaultQuery,
        format: "xlsx",
      });

      expect(result.content).toBeInstanceOf(Buffer);
      expect(result.filename).toMatch(/\.xlsx$/);
    });
  });

  describe("fetchTickets", () => {
    it("should apply status filter", async () => {
      vi.mocked(db.query.tickets.findMany).mockResolvedValue([]);

      await exportService.fetchTickets(mockOrgId, { ...defaultQuery, status: "open" });

      expect(db.query.tickets.findMany).toHaveBeenCalled();
    });

    it("should apply priority filter", async () => {
      vi.mocked(db.query.tickets.findMany).mockResolvedValue([]);

      await exportService.fetchTickets(mockOrgId, { ...defaultQuery, priority: "high" });

      expect(db.query.tickets.findMany).toHaveBeenCalled();
    });

    it("should apply date range filters", async () => {
      vi.mocked(db.query.tickets.findMany).mockResolvedValue([]);

      await exportService.fetchTickets(mockOrgId, {
        ...defaultQuery,
        dateFrom: "2024-01-01",
        dateTo: "2024-01-31",
      });

      expect(db.query.tickets.findMany).toHaveBeenCalled();
    });

    it("should apply assignee filter", async () => {
      vi.mocked(db.query.tickets.findMany).mockResolvedValue([]);

      await exportService.fetchTickets(mockOrgId, { ...defaultQuery, assigneeId: "agent-123" });

      expect(db.query.tickets.findMany).toHaveBeenCalled();
    });

    it("should apply category filter", async () => {
      vi.mocked(db.query.tickets.findMany).mockResolvedValue([]);

      await exportService.fetchTickets(mockOrgId, { ...defaultQuery, categoryId: "cat-123" });

      expect(db.query.tickets.findMany).toHaveBeenCalled();
    });
  });
});
