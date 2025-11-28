import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  jsonb,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tickets } from './tickets';
import { users } from './users';

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────
export const messageTypeEnum = pgEnum('message_type', [
  'reply', // Customer or agent reply
  'internal_note', // Agent-only note
  'system', // Automated system message
]);

// ─────────────────────────────────────────────────────────────
// Attachment Type
// ─────────────────────────────────────────────────────────────
export interface Attachment {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
}

// ─────────────────────────────────────────────────────────────
// Ticket Messages Table
// ─────────────────────────────────────────────────────────────
export const ticketMessages = pgTable(
  'ticket_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Relationship
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id').references(() => users.id),

    // Content
    content: text('content').notNull(),
    type: messageTypeEnum('type').notNull().default('reply'),

    // Attachments
    attachments: jsonb('attachments').$type<Attachment[]>().default([]),

    // Email integration
    emailMessageId: text('email_message_id'),

    // Edit tracking
    isEdited: boolean('is_edited').notNull().default(false),
    editedAt: timestamp('edited_at', { withTimezone: true }),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Messages for a ticket, ordered by time
    index('messages_ticket_created_idx').on(table.ticketId, table.createdAt),

    // Find message by email ID (for threading)
    index('messages_email_id_idx').on(table.emailMessageId),
  ]
);

// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────
export const ticketMessagesRelations = relations(ticketMessages, ({ one }) => ({
  ticket: one(tickets, {
    fields: [ticketMessages.ticketId],
    references: [tickets.id],
  }),
  sender: one(users, {
    fields: [ticketMessages.senderId],
    references: [users.id],
  }),
}));

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export type TicketMessage = typeof ticketMessages.$inferSelect;
export type NewTicketMessage = typeof ticketMessages.$inferInsert;
export type MessageType = (typeof messageTypeEnum.enumValues)[number];
