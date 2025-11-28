/**
 * Messages Module - OpenAPI Route Definitions
 *
 * Registers all ticket message endpoints with the OpenAPI registry.
 * Messages are nested under tickets: /api/tickets/{ticketId}/messages
 */

import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "@/lib/openapi";
import {
  createDataResponseSchema,
  createMessageResponseSchema,
  commonErrorResponses,
  MessageTypeSchema,
  UuidSchema,
  TimestampSchema,
  PaginationSchema,
} from "@/lib/openapi/responses";

extendZodWithOpenApi(z);

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Author reference for messages
 */
const MessageAuthorSchema = z
  .object({
    id: UuidSchema.describe("Author's user ID"),
    name: z.string().describe("Author's display name"),
    email: z.string().email().describe("Author's email"),
    avatarUrl: z.string().url().nullable().describe("Author's avatar URL"),
    role: z.enum(["customer", "agent", "admin", "owner"]).describe("Author's role"),
  })
  .openapi("MessageAuthor");

/**
 * Attachment in a message
 */
const AttachmentSchema = z
  .object({
    id: UuidSchema.describe("Attachment ID"),
    filename: z.string().describe("Original filename"),
    url: z.string().url().describe("Download URL"),
    mimeType: z.string().describe("MIME type"),
    size: z.number().positive().describe("File size in bytes"),
  })
  .openapi("Attachment");

/**
 * Message data
 */
const MessageSchema = z
  .object({
    id: UuidSchema.describe("Message ID"),
    ticketId: UuidSchema.describe("Parent ticket ID"),
    content: z.string().describe("Message content (HTML or plain text)"),
    type: MessageTypeSchema.describe("Message type"),
    author: MessageAuthorSchema.describe("Message author"),
    attachments: z.array(AttachmentSchema).describe("Attached files"),
    isEdited: z.boolean().describe("Whether message was edited"),
    createdAt: TimestampSchema.describe("Creation timestamp"),
    updatedAt: TimestampSchema.describe("Last update timestamp"),
  })
  .openapi("Message");

/**
 * Create message request
 */
const CreateMessageRequestSchema = z
  .object({
    content: z.string().min(1).max(50000).describe("Message content (1-50000 characters)"),
    type: MessageTypeSchema.default("reply").describe(
      "Message type: reply (visible to customer), internal_note (staff only)",
    ),
    attachments: z
      .array(
        z.object({
          id: z.string().describe("Attachment ID from upload"),
          filename: z.string().describe("Original filename"),
          url: z.string().url().describe("File URL"),
          mimeType: z.string().describe("MIME type"),
          size: z.number().positive().describe("File size in bytes"),
        }),
      )
      .max(10)
      .optional()
      .describe("Attachments to include (max 10)"),
  })
  .openapi("CreateMessageRequest");

/**
 * Update message request
 */
const UpdateMessageRequestSchema = z
  .object({
    content: z.string().min(1).max(50000).describe("Updated message content"),
  })
  .openapi("UpdateMessageRequest");

/**
 * Message query parameters
 */
const MessageQuerySchema = z
  .object({
    type: MessageTypeSchema.optional().describe("Filter by message type"),
    page: z.coerce.number().min(1).default(1).describe("Page number"),
    limit: z.coerce.number().min(1).max(100).default(50).describe("Items per page"),
  })
  .openapi("MessageQuery");

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/tickets/:id/messages
registry.registerPath({
  method: "get",
  path: "/api/tickets/{id}/messages",
  tags: ["Messages"],
  summary: "List messages for a ticket",
  description: `
Retrieve all messages in a ticket thread.

**Access Control:**
- Customers see only public replies (not internal notes)
- Agents/Admins see all messages including internal notes
- Must have access to the parent ticket

**Message Types:**
- \`reply\`: Public message visible to customer
- \`internal_note\`: Staff-only note, hidden from customers
- \`system\`: Automated system messages

**Ordering:**
- Messages are returned in chronological order (oldest first)
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Ticket ID"),
    }),
    query: MessageQuerySchema,
  },
  responses: {
    200: {
      description: "Paginated list of messages",
      content: {
        "application/json": {
          schema: z
            .object({
              success: z.literal(true),
              data: z.array(MessageSchema),
              pagination: PaginationSchema,
            })
            .openapi("MessageListResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: {
      description: "Ticket not found",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(false),
            error: z.string().default("Ticket not found"),
          }),
        },
      },
    },
    500: commonErrorResponses[500],
  },
});

// GET /api/tickets/:id/messages/:messageId
registry.registerPath({
  method: "get",
  path: "/api/tickets/{id}/messages/{messageId}",
  tags: ["Messages"],
  summary: "Get a specific message",
  description: `
Retrieve a single message by ID.

**Access Control:**
- Same as listing messages
- Customers cannot access internal notes
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Ticket ID"),
      messageId: UuidSchema.describe("Message ID"),
    }),
  },
  responses: {
    200: {
      description: "Message details",
      content: {
        "application/json": {
          schema: createDataResponseSchema(MessageSchema, "MessageDetailResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// POST /api/tickets/:id/messages
registry.registerPath({
  method: "post",
  path: "/api/tickets/{id}/messages",
  tags: ["Messages"],
  summary: "Create a new message",
  description: `
Add a new message to a ticket thread.

**Access Control:**
- Customers can create replies on their own tickets
- Agents can create replies and internal notes
- Internal notes are only visible to staff

**Effects:**
- Updates ticket's updatedAt timestamp
- First agent reply sets firstResponseAt (for SLA)
- May trigger email notifications

**Attachments:**
- Upload files first via /api/attachments
- Include attachment metadata in the request
- Maximum 10 attachments per message
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Ticket ID"),
    }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: CreateMessageRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Message created successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(MessageSchema, "CreateMessageResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// PATCH /api/tickets/:id/messages/:messageId
registry.registerPath({
  method: "patch",
  path: "/api/tickets/{id}/messages/{messageId}",
  tags: ["Messages"],
  summary: "Update a message",
  description: `
Edit the content of an existing message.

**Access Control:**
- Users can only edit their own messages
- Agents/Admins can edit any non-system message

**Notes:**
- isEdited flag is set to true
- Original content is not preserved
- Attachments cannot be modified (delete and recreate instead)
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Ticket ID"),
      messageId: UuidSchema.describe("Message ID"),
    }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: UpdateMessageRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Message updated successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(MessageSchema, "UpdateMessageResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});

// DELETE /api/tickets/:id/messages/:messageId
registry.registerPath({
  method: "delete",
  path: "/api/tickets/{id}/messages/{messageId}",
  tags: ["Messages"],
  summary: "Delete a message",
  description: `
Delete a message from a ticket thread.

**Access Control:**
- Users can delete their own messages (within time limit)
- Admins/Owners can delete any message

**Notes:**
- Associated attachments are also deleted
- System messages cannot be deleted
- Action is logged in ticket activity
`,
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: UuidSchema.describe("Ticket ID"),
      messageId: UuidSchema.describe("Message ID"),
    }),
  },
  responses: {
    200: {
      description: "Message deleted successfully",
      content: {
        "application/json": {
          schema: createMessageResponseSchema("DeleteMessageResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    404: commonErrorResponses[404],
    500: commonErrorResponses[500],
  },
});
