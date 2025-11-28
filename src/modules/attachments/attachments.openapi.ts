/**
 * Attachments Module - OpenAPI Route Definitions
 *
 * Registers all attachment management endpoints with the OpenAPI registry.
 * Covers file upload, download, listing, and deletion operations.
 */

import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "@/lib/openapi";
import {
  createDataResponseSchema,
  createMessageResponseSchema,
  commonErrorResponses,
  UuidSchema,
  TimestampSchema,
  PaginationSchema,
} from "@/lib/openapi/responses";

extendZodWithOpenApi(z);

// ═══════════════════════════════════════════════════════════════════════════
// ATTACHMENT SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Attachment folder type
 */
const AttachmentFolderSchema = z
  .enum(["tickets", "comments", "avatars", "general"])
  .openapi("AttachmentFolder");

/**
 * Attachment base schema
 */
const AttachmentSchema = z
  .object({
    id: UuidSchema.describe("Attachment ID"),
    filename: z.string().describe("Stored filename (UUID-based)"),
    originalName: z.string().describe("Original file name"),
    mimeType: z.string().describe("MIME type of the file"),
    size: z.int().positive().describe("File size in bytes"),
    url: z.url().describe("Public URL to access the file"),
    ticketId: UuidSchema.nullable().describe("Associated ticket ID"),
    commentId: UuidSchema.nullable().describe("Associated comment ID"),
    uploadedBy: UuidSchema.describe("User ID who uploaded the file"),
    createdAt: TimestampSchema.describe("Upload timestamp"),
  })
  .openapi("Attachment");

/**
 * Upload attachment request (multipart form data)
 */
const UploadAttachmentRequestSchema = z
  .object({
    file: z.any().describe("File to upload (binary)"),
    ticketId: UuidSchema.optional().describe("Associate with a specific ticket"),
    commentId: UuidSchema.optional().describe("Associate with a specific comment"),
    folder: AttachmentFolderSchema.prefault("general").describe("Storage folder category"),
  })
  .openapi("UploadAttachmentRequest");

/**
 * List attachments query parameters
 */
const ListAttachmentsQuerySchema = z
  .object({
    ticketId: UuidSchema.optional().describe("Filter by ticket ID"),
    page: z.coerce.number().int().positive().prefault(1).describe("Page number for pagination"),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(100)
      .prefault(20)
      .describe("Number of items per page (1-100)"),
  })
  .openapi("ListAttachmentsQuery");

/**
 * Attachment ID path parameter
 */
const AttachmentIdParamSchema = z
  .object({
    id: UuidSchema.describe("Attachment ID"),
  })
  .openapi("AttachmentIdParam");

/**
 * Ticket ID path parameter
 */
const TicketIdParamSchema = z
  .object({
    ticketId: UuidSchema.describe("Ticket ID"),
  })
  .openapi("TicketIdParam");

// ═══════════════════════════════════════════════════════════════════════════
// ATTACHMENT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/attachments/upload
registry.registerPath({
  method: "post",
  path: "/api/attachments/upload",
  tags: ["Attachments"],
  summary: "Upload a file",
  description: `
Upload a file attachment to the system.

**Access Control:**
- Requires authentication
- All authenticated users can upload files

**File Restrictions:**
- Maximum file size: 10MB (configurable)
- Allowed file types: images, documents, archives
- Files are validated for type and size before storage

**Storage:**
Files are stored with UUID-based filenames to prevent conflicts.
Original filenames are preserved in metadata.
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
    body: {
      content: {
        "multipart/form-data": {
          schema: UploadAttachmentRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "File uploaded successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(AttachmentSchema, "AttachmentUploadResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/attachments
registry.registerPath({
  method: "get",
  path: "/api/attachments",
  tags: ["Attachments"],
  summary: "List attachments",
  description: `
Retrieve a paginated list of attachments for the organization.

**Access Control:**
- Requires authentication
- Returns only attachments within the user's organization

**Filtering:**
- Use \`ticketId\` to filter attachments by ticket
- Use pagination parameters to control result size
`,
  security: [{ cookieAuth: [] }],
  request: {
    query: ListAttachmentsQuerySchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Paginated list of attachments",
      content: {
        "application/json": {
          schema: z
            .object({
              success: z.literal(true),
              data: z.array(AttachmentSchema),
              pagination: PaginationSchema,
            })
            .openapi("AttachmentListResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/attachments/:id
registry.registerPath({
  method: "get",
  path: "/api/attachments/{id}",
  tags: ["Attachments"],
  summary: "Get attachment metadata",
  description: `
Retrieve metadata for a specific attachment.

**Access Control:**
- Requires authentication
- Returns only attachments within the user's organization

**Response:**
Returns attachment metadata including file info, URLs, and associations.
Does not return the actual file content (use download endpoint for that).
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: AttachmentIdParamSchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Attachment metadata",
      content: {
        "application/json": {
          schema: createDataResponseSchema(AttachmentSchema, "AttachmentResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// GET /api/attachments/:id/download
registry.registerPath({
  method: "get",
  path: "/api/attachments/{id}/download",
  tags: ["Attachments"],
  summary: "Download attachment file",
  description: `
Download the actual file content of an attachment.

**Access Control:**
- Requires authentication
- Returns only attachments within the user's organization

**Response:**
Returns the raw file with appropriate Content-Type and Content-Disposition headers.
The response is a binary file stream, not JSON.
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: AttachmentIdParamSchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "File content",
      content: {
        "application/octet-stream": {
          schema: z.any().describe("Binary file content"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// DELETE /api/attachments/:id
registry.registerPath({
  method: "delete",
  path: "/api/attachments/{id}",
  tags: ["Attachments"],
  summary: "Delete attachment",
  description: `
Delete an attachment from the system.

**Access Control:**
- Requires admin or agent role
- Customers cannot delete attachments

**Behavior:**
- Removes the file from storage
- Deletes the attachment record from the database
- This action cannot be undone
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: AttachmentIdParamSchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Attachment deleted successfully",
      content: {
        "application/json": {
          schema: createMessageResponseSchema("AttachmentDeletedResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// GET /api/attachments/ticket/:ticketId
registry.registerPath({
  method: "get",
  path: "/api/attachments/ticket/{ticketId}",
  tags: ["Attachments"],
  summary: "Get ticket attachments",
  description: `
Retrieve all attachments associated with a specific ticket.

**Access Control:**
- Requires authentication
- Returns only attachments within the user's organization

**Usage:**
Use this endpoint to get all files attached to a ticket in one request,
including attachments from messages and comments.
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: TicketIdParamSchema,
    headers: z.object({
      "x-organization-id": UuidSchema.describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "List of ticket attachments",
      content: {
        "application/json": {
          schema: createDataResponseSchema(z.array(AttachmentSchema), "TicketAttachmentsResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});
