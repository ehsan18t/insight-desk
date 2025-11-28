/**
 * OpenAPI Response Schemas
 *
 * Reusable response schemas for consistent API responses across all endpoints.
 * These schemas define the standard response structure used throughout the API.
 */

import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

// ═══════════════════════════════════════════════════════════════════════════
// BASE RESPONSE SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pagination metadata included in list responses
 */
export const PaginationSchema = z
  .object({
    page: z.int().positive().describe("Current page number"),
    limit: z.int().positive().describe("Items per page"),
    total: z.int().nonnegative().describe("Total number of items"),
    totalPages: z.int().nonnegative().describe("Total number of pages"),
  })
  .openapi("Pagination");

/**
 * Base success response structure
 */
export const SuccessResponseSchema = z
  .object({
    success: z.literal(true).describe("Indicates the request was successful"),
  })
  .openapi("SuccessResponse");

/**
 * Error response structure for all API errors
 */
export const ErrorResponseSchema = z
  .object({
    success: z.literal(false).describe("Indicates the request failed"),
    error: z.string().describe("Human-readable error message"),
    code: z.string().optional().describe("Machine-readable error code"),
    details: z
      .array(
        z.object({
          field: z.string().describe("Field that caused the error"),
          message: z.string().describe("Error message for this field"),
        }),
      )
      .optional()
      .describe("Validation error details"),
  })
  .openapi("ErrorResponse");

/**
 * Validation error response (400 Bad Request)
 */
export const ValidationErrorSchema = z
  .object({
    success: z.literal(false),
    error: z.string().default("Validation failed"),
    code: z.literal("VALIDATION_ERROR"),
    details: z.array(
      z.object({
        field: z.string(),
        message: z.string(),
      }),
    ),
  })
  .openapi("ValidationError");

// ═══════════════════════════════════════════════════════════════════════════
// COMMON DATA SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * UUID identifier schema
 */
export const UuidSchema = z.uuid().openapi({
  description: "Unique identifier (UUID v4)",
  example: "550e8400-e29b-41d4-a716-446655440000",
});

/**
 * Timestamp schema for created/updated dates
 */
export const TimestampSchema = z.iso.datetime().openapi({
  description: "ISO 8601 timestamp",
  example: "2024-01-15T10:30:00.000Z",
});

/**
 * Email schema
 */
export const EmailSchema = z.email().openapi({
  description: "Valid email address",
  example: "user@example.com",
});

// ═══════════════════════════════════════════════════════════════════════════
// ROLE AND STATUS ENUMS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * User roles within an organization
 */
export const UserRoleSchema = z.enum(["customer", "agent", "admin", "owner"]).openapi({
  description: "User role determining access level",
  example: "agent",
});

/**
 * Ticket status values
 */
export const TicketStatusSchema = z.enum(["open", "pending", "resolved", "closed"]).openapi({
  description: "Current status of the ticket",
  example: "open",
});

/**
 * Ticket priority levels
 */
export const TicketPrioritySchema = z.enum(["low", "medium", "high", "urgent"]).openapi({
  description: "Priority level affecting SLA targets",
  example: "medium",
});

/**
 * Ticket communication channel
 */
export const TicketChannelSchema = z.enum(["web", "email", "api", "chat"]).openapi({
  description: "Channel through which the ticket was created",
  example: "web",
});

/**
 * Message type in tickets
 */
export const MessageTypeSchema = z.enum(["reply", "internal_note", "system"]).openapi({
  description:
    "Type of message - reply (public), internal_note (staff only), or system (automated)",
  example: "reply",
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS FOR CREATING RESPONSE SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a success response schema with data
 */
export function createDataResponseSchema<T extends z.ZodTypeAny>(dataSchema: T, name: string) {
  return z
    .object({
      success: z.literal(true),
      data: dataSchema,
    })
    .openapi(name);
}

/**
 * Create a paginated list response schema
 */
export function createPaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T, name: string) {
  return z
    .object({
      success: z.literal(true),
      data: z.array(itemSchema),
      pagination: PaginationSchema,
    })
    .openapi(name);
}

/**
 * Create a simple message response schema
 */
export function createMessageResponseSchema(name: string) {
  return z
    .object({
      success: z.literal(true),
      message: z.string(),
    })
    .openapi(name);
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMON ERROR RESPONSES FOR OPENAPI REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Standard error responses used across all endpoints
 */
export const commonErrorResponses = {
  400: {
    description: "Bad Request - Invalid input data or validation failed",
    content: {
      "application/json": {
        schema: ValidationErrorSchema,
      },
    },
  },
  401: {
    description: "Unauthorized - Authentication required or session expired",
    content: {
      "application/json": {
        schema: ErrorResponseSchema,
      },
    },
  },
  403: {
    description: "Forbidden - Insufficient permissions for this action",
    content: {
      "application/json": {
        schema: ErrorResponseSchema,
      },
    },
  },
  404: {
    description: "Not Found - The requested resource does not exist",
    content: {
      "application/json": {
        schema: ErrorResponseSchema,
      },
    },
  },
  409: {
    description: "Conflict - Resource already exists or operation conflicts",
    content: {
      "application/json": {
        schema: ErrorResponseSchema,
      },
    },
  },
  429: {
    description: "Too Many Requests - Rate limit exceeded",
    content: {
      "application/json": {
        schema: ErrorResponseSchema,
      },
    },
  },
  500: {
    description: "Internal Server Error - Unexpected error occurred",
    content: {
      "application/json": {
        schema: ErrorResponseSchema,
      },
    },
  },
} as const;

/**
 * Security scheme for authenticated endpoints
 */
export const cookieAuth = [{ cookieAuth: [] }];

// Re-export extended zod for use in other modules
export { z };
