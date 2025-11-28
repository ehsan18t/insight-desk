// Database Schema Index
// Re-export all tables, relations, enums, and types

// Relations
export * from "./relations";
// Re-export types from tables
export type {
  ActivityMetadata,
  Attachment,
  OrganizationSettings,
  PlanFeatures,
  PlanLimits,
  SavedFilterCriteria,
} from "./tables";
// Tables and Enums
export * from "./tables";

// Inferred Types (using $inferSelect and $inferInsert)
import type {
  accounts,
  activityActionEnum,
  attachments,
  auditActionEnum,
  auditLogs,
  billingIntervalEnum,
  cannedResponses,
  categories,
  csatSurveys,
  inviteStatusEnum,
  messageTypeEnum,
  organizationInvitations,
  organizationSubscriptions,
  organizations,
  savedFilters,
  sessions,
  slaPolicies,
  subscriptionPlans,
  subscriptionStatusEnum,
  subscriptionUsage,
  tags,
  ticketActivities,
  ticketChannelEnum,
  ticketMessages,
  ticketPriorityEnum,
  ticketStatusEnum,
  tickets,
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

// Category types
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

// Tag types
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

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

// Attachment types
export type AttachmentRecord = typeof attachments.$inferSelect;
export type NewAttachmentRecord = typeof attachments.$inferInsert;

// Organization Invitation types
export type OrganizationInvitation = typeof organizationInvitations.$inferSelect;
export type NewOrganizationInvitation = typeof organizationInvitations.$inferInsert;
export type InviteStatus = (typeof inviteStatusEnum.enumValues)[number];

// Saved Filter types
export type SavedFilter = typeof savedFilters.$inferSelect;
export type NewSavedFilter = typeof savedFilters.$inferInsert;

// CSAT Survey types
export type CsatSurvey = typeof csatSurveys.$inferSelect;
export type NewCsatSurvey = typeof csatSurveys.$inferInsert;

// Subscription Plan types
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type NewSubscriptionPlan = typeof subscriptionPlans.$inferInsert;
export type SubscriptionStatus = (typeof subscriptionStatusEnum.enumValues)[number];
export type BillingInterval = (typeof billingIntervalEnum.enumValues)[number];

// Organization Subscription types
export type OrganizationSubscription = typeof organizationSubscriptions.$inferSelect;
export type NewOrganizationSubscription = typeof organizationSubscriptions.$inferInsert;

// Subscription Usage types
export type SubscriptionUsageRecord = typeof subscriptionUsage.$inferSelect;
export type NewSubscriptionUsageRecord = typeof subscriptionUsage.$inferInsert;

// Audit Log types
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type AuditAction = (typeof auditActionEnum.enumValues)[number];
