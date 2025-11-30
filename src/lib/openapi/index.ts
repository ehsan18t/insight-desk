/**
 * OpenAPI Documentation Generator
 *
 * This module provides dynamic OpenAPI 3.0.3 specification generation
 * using @asteasolutions/zod-to-openapi. All API routes and schemas
 * are registered here and the spec is generated at runtime.
 *
 * Benefits:
 * - Documentation stays in sync with code automatically
 * - Type-safe schema definitions using Zod
 * - Centralized API documentation management
 */

import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";

// Import and re-export the central registry
export { registry } from "./registry";
import { registry } from "./registry";

// Re-export commonly used types and utilities
export type { RouteConfig } from "@asteasolutions/zod-to-openapi";
export { z } from "zod";

// Re-export response schemas and helpers
export * from "./responses";
export * from "./security";

/**
 * Generate the complete OpenAPI document from all registered definitions
 */
export function generateOpenAPIDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "InsightDesk API",
      version: "1.0.0",
      description: `
# InsightDesk - Multi-tenant Customer Support Ticketing System

A comprehensive customer support platform designed for businesses of all sizes.

## Features

- **Multi-tenant Architecture**: Isolated data per organization with role-based access
- **Ticket Management**: Full lifecycle management from creation to resolution
- **Real-time Updates**: WebSocket support for live ticket updates
- **SLA Management**: Configurable SLA policies with breach notifications
- **CSAT Surveys**: Customer satisfaction tracking and analytics
- **Team Collaboration**: Internal notes, assignments, and activity tracking

## Authentication

This API uses session-based authentication with HTTP-only cookies. To authenticate:

1. Call \`POST /api/auth/sign-in\` with email and password
2. The server sets a session cookie automatically
3. Include cookies in all subsequent requests

## Role Hierarchy

Access control is based on user roles within organizations:

| Role | Level | Description |
|------|-------|-------------|
| **customer** | 1 | Can view/create own tickets only |
| **agent** | 2 | Can manage assigned tickets and view all org tickets |
| **admin** | 3 | Full access except billing/subscription |
| **owner** | 4 | Full access including organization management |

## Rate Limiting

API requests are rate-limited to prevent abuse:
- Default: 100 requests per minute per IP
- Headers: \`X-RateLimit-Limit\`, \`X-RateLimit-Remaining\`, \`X-RateLimit-Reset\`

## Error Handling

All errors follow a consistent format:
\`\`\`json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": [] // Optional validation errors
}
\`\`\`

## Pagination

List endpoints support pagination with these query parameters:
- \`page\`: Page number (default: 1)
- \`limit\`: Items per page (default: 20, max: 100)

Response includes pagination metadata:
\`\`\`json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
\`\`\`
      `.trim(),
      contact: {
        name: "InsightDesk Support",
        email: "support@insightdesk.io",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: "http://localhost:3001",
        description: "Development server",
      },
      {
        url: "https://api.insightdesk.io",
        description: "Production server",
      },
    ],
    tags: [
      {
        name: "Auth",
        description:
          "Authentication endpoints for user sign-in, sign-out, and session management. Uses HTTP-only cookies for secure session handling.",
      },
      {
        name: "Users",
        description:
          "User management including profiles, role assignments, and organization membership. Admins can manage users within their organization.",
      },
      {
        name: "Tickets",
        description:
          "Core ticket management - create, update, assign, and track support tickets. Supports filtering, sorting, and full-text search.",
      },
      {
        name: "Messages",
        description:
          "Ticket messages and communication. Includes customer replies, agent responses, and internal notes visible only to staff.",
      },
      {
        name: "Organizations",
        description:
          "Organization (tenant) management. Each organization has isolated data, members, and settings.",
      },
      {
        name: "Categories",
        description:
          "Ticket categorization with hierarchical category support. Categories help organize and route tickets effectively.",
      },
      {
        name: "Tags",
        description:
          "Flexible ticket tagging system for additional classification and filtering. Tags can be added/removed freely.",
      },
      {
        name: "Attachments",
        description:
          "File attachment management for tickets and messages. Supports various file types with size limits based on subscription tier.",
      },
      {
        name: "Saved Filters",
        description:
          "Save and reuse ticket filter configurations. Users can create personal or shared filters for quick access.",
      },
      {
        name: "SLA Policies",
        description:
          "Service Level Agreement configuration. Define response and resolution time targets by ticket priority.",
      },
      {
        name: "Canned Responses",
        description:
          "Pre-written response templates for common queries. Speeds up agent response time and ensures consistency.",
      },
      {
        name: "CSAT",
        description:
          "Customer Satisfaction surveys and analytics. Automatically sent after ticket resolution to gather feedback.",
      },
      {
        name: "Export",
        description:
          "Data export functionality. Export tickets and reports in CSV or Excel format for external analysis.",
      },
      {
        name: "Dashboard",
        description:
          "Analytics and metrics dashboards. View ticket statistics, trends, and agent performance metrics.",
      },
      {
        name: "Jobs",
        description:
          "Background job management. Monitor and trigger scheduled tasks like SLA checks and auto-close operations.",
      },
      {
        name: "Plans",
        description:
          "Subscription plan management. View available plans and their features. Admin endpoints for plan configuration.",
      },
      {
        name: "Subscriptions",
        description:
          "Organization subscription and usage tracking. Monitor usage limits, change plans, and manage billing.",
      },
      {
        name: "Audit",
        description:
          "Audit log access for compliance and security monitoring. Track all significant actions within the organization.",
      },
    ],
    externalDocs: {
      description: "InsightDesk Documentation",
      url: "https://docs.insightdesk.io",
    },
  });
}
