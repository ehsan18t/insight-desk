// Database Schema Index
// Re-export all tables, relations, enums, and types

// Tables and Enums
export * from "./tables";

// Relations
export * from "./relations";

// Re-export types from tables
export type {
  ActivityMetadata,
  Attachment,
  OrganizationSettings,
} from "./tables";

// Inferred Types (using $inferSelect and $inferInsert)
import {
  accounts,
  activityActionEnum,
  cannedResponses,
  messageTypeEnum,
  organizations,
  sessions,
  slaPolicies,
  ticketActivities,
  ticketChannelEnum,
  ticketMessages,
  ticketPriorityEnum,
  tickets,
  ticketStatusEnum,
  userOrganizations,
  userRoleEnum,
  users,
  verifications,
} from "./tables";

// User types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = (typeof userRoleEnum.enumValues)[number];

// Organization types
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

// User Organization types
export type UserOrganization = typeof userOrganizations.$inferSelect;
export type NewUserOrganization = typeof userOrganizations.$inferInsert;

// Ticket types
export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type TicketStatus = (typeof ticketStatusEnum.enumValues)[number];
export type TicketPriority = (typeof ticketPriorityEnum.enumValues)[number];
export type TicketChannel = (typeof ticketChannelEnum.enumValues)[number];

// Message types
export type TicketMessage = typeof ticketMessages.$inferSelect;
export type NewTicketMessage = typeof ticketMessages.$inferInsert;
export type MessageType = (typeof messageTypeEnum.enumValues)[number];

// Activity types
export type TicketActivity = typeof ticketActivities.$inferSelect;
export type NewTicketActivity = typeof ticketActivities.$inferInsert;
export type ActivityAction = (typeof activityActionEnum.enumValues)[number];

// SLA types
export type SlaPolicy = typeof slaPolicies.$inferSelect;
export type NewSlaPolicy = typeof slaPolicies.$inferInsert;

// Canned Response types
export type CannedResponse = typeof cannedResponses.$inferSelect;
export type NewCannedResponse = typeof cannedResponses.$inferInsert;

// Auth types
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Verification = typeof verifications.$inferSelect;
export type NewVerification = typeof verifications.$inferInsert;
