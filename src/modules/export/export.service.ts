import { and, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { tickets } from "@/db/schema";
import { createLogger } from "@/lib/logger";
import type { ExportQuery, TicketExportField } from "./export.schema";
import { TICKET_EXPORT_FIELDS } from "./export.schema";

const logger = createLogger("export");

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface ExportRow {
  [key: string]: string | number | null;
}

interface TicketWithRelations {
  ticketNumber: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  channel: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  firstResponseAt: Date | null;
  slaResponseDue: Date | null;
  slaResolutionDue: Date | null;
  customer: { name: string; email: string } | null;
  assignee: { name: string; email: string } | null;
  category: { name: string } | null;
  tags: { tag: { name: string } }[];
}

// ─────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────
function formatDate(date: Date | null): string {
  if (!date) return "";
  return date.toISOString();
}

function escapeCSV(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function ticketToRow(ticket: TicketWithRelations, fields: TicketExportField[]): ExportRow {
  const row: ExportRow = {};

  for (const field of fields) {
    switch (field) {
      case "ticketNumber":
        row[field] = ticket.ticketNumber;
        break;
      case "title":
        row[field] = ticket.title;
        break;
      case "description":
        row[field] = ticket.description;
        break;
      case "status":
        row[field] = ticket.status;
        break;
      case "priority":
        row[field] = ticket.priority;
        break;
      case "channel":
        row[field] = ticket.channel;
        break;
      case "customerName":
        row[field] = ticket.customer?.name || "";
        break;
      case "customerEmail":
        row[field] = ticket.customer?.email || "";
        break;
      case "assigneeName":
        row[field] = ticket.assignee?.name || "";
        break;
      case "assigneeEmail":
        row[field] = ticket.assignee?.email || "";
        break;
      case "categoryName":
        row[field] = ticket.category?.name || "";
        break;
      case "tags":
        row[field] = ticket.tags.map((t) => t.tag.name).join(", ");
        break;
      case "createdAt":
        row[field] = formatDate(ticket.createdAt);
        break;
      case "updatedAt":
        row[field] = formatDate(ticket.updatedAt);
        break;
      case "resolvedAt":
        row[field] = formatDate(ticket.resolvedAt);
        break;
      case "closedAt":
        row[field] = formatDate(ticket.closedAt);
        break;
      case "firstResponseAt":
        row[field] = formatDate(ticket.firstResponseAt);
        break;
      case "slaResponseDue":
        row[field] = formatDate(ticket.slaResponseDue);
        break;
      case "slaResolutionDue":
        row[field] = formatDate(ticket.slaResolutionDue);
        break;
    }
  }

  return row;
}

// ─────────────────────────────────────────────────────────────
// Export Service
// ─────────────────────────────────────────────────────────────
export const exportService = {
  // Export tickets to CSV format
  async exportTicketsCSV(
    organizationId: string,
    query: ExportQuery,
  ): Promise<{ content: string; filename: string }> {
    const fields = (query.fields as TicketExportField[]) || [...TICKET_EXPORT_FIELDS];
    const ticketsData = await this.fetchTickets(organizationId, query);

    // Build CSV header
    const header = fields.map(escapeCSV).join(",");

    // Build CSV rows
    const rows = ticketsData.map((ticket) => {
      const row = ticketToRow(ticket, fields);
      return fields.map((f) => escapeCSV(row[f])).join(",");
    });

    const content = [header, ...rows].join("\n");
    const filename = `tickets-export-${new Date().toISOString().slice(0, 10)}.csv`;

    logger.info({ organizationId, count: ticketsData.length }, "Exported tickets to CSV");

    return { content, filename };
  },

  // Export tickets to Excel format (XLSX)
  async exportTicketsXLSX(
    organizationId: string,
    query: ExportQuery,
  ): Promise<{ content: Buffer; filename: string }> {
    const fields = (query.fields as TicketExportField[]) || [...TICKET_EXPORT_FIELDS];
    const ticketsData = await this.fetchTickets(organizationId, query);

    // Build simple XML-based spreadsheet (SpreadsheetML)
    // This is a simple approach that doesn't require external dependencies
    const rows = ticketsData.map((ticket) => ticketToRow(ticket, fields));

    const xmlContent = buildSimpleXLSX(fields, rows);
    const content = Buffer.from(xmlContent, "utf-8");
    const filename = `tickets-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

    logger.info({ organizationId, count: ticketsData.length }, "Exported tickets to XLSX");

    return { content, filename };
  },

  // Fetch tickets with filters
  async fetchTickets(organizationId: string, query: ExportQuery): Promise<TicketWithRelations[]> {
    const conditions = [eq(tickets.organizationId, organizationId)];

    if (query.status) {
      conditions.push(eq(tickets.status, query.status));
    }

    if (query.priority) {
      conditions.push(eq(tickets.priority, query.priority));
    }

    if (query.assigneeId) {
      conditions.push(eq(tickets.assigneeId, query.assigneeId));
    }

    if (query.categoryId) {
      conditions.push(eq(tickets.categoryId, query.categoryId));
    }

    if (query.dateFrom) {
      conditions.push(gte(tickets.createdAt, new Date(query.dateFrom)));
    }

    if (query.dateTo) {
      conditions.push(lte(tickets.createdAt, new Date(query.dateTo)));
    }

    if (query.search) {
      const searchCondition = or(
        ilike(tickets.title, `%${query.search}%`),
        ilike(tickets.description, `%${query.search}%`),
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const result = await db.query.tickets.findMany({
      where: and(...conditions),
      orderBy: desc(tickets.createdAt),
      with: {
        customer: {
          columns: { name: true, email: true },
        },
        assignee: {
          columns: { name: true, email: true },
        },
        category: {
          columns: { name: true },
        },
      },
      // Limit to prevent memory issues
      limit: 10000,
    });

    return result as unknown as TicketWithRelations[];
  },

  // Get available fields for export
  getAvailableFields(): { field: string; label: string }[] {
    return TICKET_EXPORT_FIELDS.map((field) => ({
      field,
      label: fieldToLabel(field),
    }));
  },
};

// ─────────────────────────────────────────────────────────────
// Helper: Field to human-readable label
// ─────────────────────────────────────────────────────────────
function fieldToLabel(field: TicketExportField): string {
  const labels: Record<TicketExportField, string> = {
    ticketNumber: "Ticket #",
    title: "Title",
    description: "Description",
    status: "Status",
    priority: "Priority",
    channel: "Channel",
    customerName: "Customer Name",
    customerEmail: "Customer Email",
    assigneeName: "Assignee Name",
    assigneeEmail: "Assignee Email",
    categoryName: "Category",
    tags: "Tags",
    createdAt: "Created At",
    updatedAt: "Updated At",
    resolvedAt: "Resolved At",
    closedAt: "Closed At",
    firstResponseAt: "First Response At",
    slaResponseDue: "SLA Response Due",
    slaResolutionDue: "SLA Resolution Due",
  };
  return labels[field];
}

// ─────────────────────────────────────────────────────────────
// Helper: Build simple XLSX (SpreadsheetML XML format)
// ─────────────────────────────────────────────────────────────
function buildSimpleXLSX(fields: string[], rows: ExportRow[]): string {
  const escapeXML = (s: string | number | null): string => {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  // Build header row
  const headerCells = fields
    .map(
      (f) =>
        `<Cell><Data ss:Type="String">${escapeXML(fieldToLabel(f as TicketExportField))}</Data></Cell>`,
    )
    .join("");
  const headerRow = `<Row ss:StyleID="Header">${headerCells}</Row>`;

  // Build data rows
  const dataRows = rows
    .map((row) => {
      const cells = fields
        .map((f) => {
          const value = row[f];
          const type = typeof value === "number" ? "Number" : "String";
          return `<Cell><Data ss:Type="${type}">${escapeXML(value)}</Data></Cell>`;
        })
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("\n");

  // Build complete SpreadsheetML document
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#CCCCCC" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Tickets">
    <Table>
      ${headerRow}
      ${dataRows}
    </Table>
  </Worksheet>
</Workbook>`;
}
