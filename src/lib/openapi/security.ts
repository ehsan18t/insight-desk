/**
 * OpenAPI Security Schemes
 *
 * Register security schemes and common parameters used across the API.
 */

import { registry } from "./registry";
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

// ═══════════════════════════════════════════════════════════════════════════
// SECURITY SCHEMES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Register cookie-based session authentication
 */
registry.registerComponent("securitySchemes", "cookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "better-auth.session_token",
  description:
    "Session cookie automatically set after successful authentication. " +
    "The cookie is HTTP-only and secure in production. " +
    "To authenticate, call POST /api/auth/sign-in with credentials.",
});

// ═══════════════════════════════════════════════════════════════════════════
// COMMON PARAMETERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Organization ID path parameter
 */
export const OrganizationIdParam = registry.registerParameter(
  "OrganizationId",
  z.uuid()
    .openapi({
      param: {
        name: "organizationId",
        in: "path",
        required: true,
        description: "Unique identifier of the organization",
      },
      example: "550e8400-e29b-41d4-a716-446655440000",
    }),
);

/**
 * User ID path parameter
 */
export const UserIdParam = registry.registerParameter(
  "UserId",
  z.uuid()
    .openapi({
      param: {
        name: "userId",
        in: "path",
        required: true,
        description: "Unique identifier of the user",
      },
      example: "550e8400-e29b-41d4-a716-446655440001",
    }),
);

/**
 * Ticket ID path parameter
 */
export const TicketIdParam = registry.registerParameter(
  "TicketId",
  z.uuid()
    .openapi({
      param: {
        name: "ticketId",
        in: "path",
        required: true,
        description: "Unique identifier of the ticket",
      },
      example: "550e8400-e29b-41d4-a716-446655440002",
    }),
);

/**
 * Message ID path parameter
 */
export const MessageIdParam = registry.registerParameter(
  "MessageId",
  z.uuid()
    .openapi({
      param: {
        name: "messageId",
        in: "path",
        required: true,
        description: "Unique identifier of the message",
      },
      example: "550e8400-e29b-41d4-a716-446655440003",
    }),
);

/**
 * Common pagination query parameters
 */
export const PaginationParams = {
  page: z.coerce
    .number()
    .int()
    .positive()
    .prefault(1)
    .openapi({
      param: {
        name: "page",
        in: "query",
        required: false,
        description: "Page number for pagination (starts at 1)",
      },
      example: 1,
    }),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .prefault(20)
    .openapi({
      param: {
        name: "limit",
        in: "query",
        required: false,
        description: "Number of items per page (max 100)",
      },
      example: 20,
    }),
};
