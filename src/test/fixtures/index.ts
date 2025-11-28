/**
 * Test Fixtures
 *
 * Provides mock data and factory functions for testing.
 * These fixtures are used across unit and integration tests.
 */

import type {
  Category,
  CsatSurvey,
  Organization,
  OrganizationSettings,
  PlanFeatures,
  PlanLimits,
  SavedFilter,
  SavedFilterCriteria,
  SlaPolicy,
  SubscriptionPlan,
  Ticket,
  TicketMessage,
  TicketPriority,
  TicketStatus,
  User,
  UserOrganization,
  UserRole,
} from "@/db/schema";

// ═══════════════════════════════════════════════════════════════════════════
// IDs - Consistent IDs for referencing in tests
// ═══════════════════════════════════════════════════════════════════════════

export const TEST_IDS = {
  // Organizations
  ORG_ACME: "org-acme-001",
  ORG_TECHSTART: "org-techstart-002",

  // Users
  USER_ADMIN: "user-admin-001",
  USER_AGENT: "user-agent-002",
  USER_CUSTOMER: "user-customer-003",
  USER_OWNER: "user-owner-004",

  // Tickets
  TICKET_OPEN: "ticket-open-001",
  TICKET_PENDING: "ticket-pending-002",
  TICKET_RESOLVED: "ticket-resolved-003",
  TICKET_CLOSED: "ticket-closed-004",

  // Messages
  MESSAGE_REPLY: "message-reply-001",
  MESSAGE_INTERNAL: "message-internal-002",
  MESSAGE_SYSTEM: "message-system-003",

  // Categories
  CATEGORY_GENERAL: "category-general-001",
  CATEGORY_TECHNICAL: "category-technical-002",
  CATEGORY_BILLING: "category-billing-003",

  // Tags
  TAG_URGENT: "tag-urgent-001",
  TAG_BUG: "tag-bug-002",

  // SLA
  SLA_URGENT: "sla-urgent-001",
  SLA_HIGH: "sla-high-002",
  SLA_MEDIUM: "sla-medium-003",
  SLA_LOW: "sla-low-004",

  // Plans
  PLAN_FREE: "plan-free-001",
  PLAN_PRO: "plan-pro-002",
  PLAN_BUSINESS: "plan-business-003",
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Factory Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a mock user
 */
export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: TEST_IDS.USER_CUSTOMER,
    email: "user@example.com",
    name: "Test User",
    avatarUrl: null,
    emailVerified: true,
    emailVerifiedAt: new Date(),
    isActive: true,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock organization
 */
export function createMockOrganization(overrides: Partial<Organization> = {}): Organization {
  const defaultSettings: OrganizationSettings = {
    notifications: {
      emailOnNewTicket: true,
      emailOnTicketUpdate: true,
    },
    features: {
      liveChatEnabled: true,
      customerPortalEnabled: true,
    },
  };

  return {
    id: TEST_IDS.ORG_ACME,
    name: "Acme Corporation",
    slug: "acme-corp",
    settings: defaultSettings,
    plan: "free",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock user-organization relationship
 */
export function createMockUserOrganization(
  overrides: Partial<UserOrganization> = {},
): UserOrganization {
  return {
    id: "user-org-001",
    userId: TEST_IDS.USER_CUSTOMER,
    organizationId: TEST_IDS.ORG_ACME,
    role: "customer" as UserRole,
    joinedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock ticket
 */
export function createMockTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: TEST_IDS.TICKET_OPEN,
    ticketNumber: 1001,
    title: "Test Ticket",
    description: "This is a test ticket description",
    status: "open" as TicketStatus,
    priority: "medium" as TicketPriority,
    channel: "web",
    tags: [],
    categoryId: null,
    organizationId: TEST_IDS.ORG_ACME,
    customerId: TEST_IDS.USER_CUSTOMER,
    assigneeId: null,
    slaDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    slaBreached: false,
    firstResponseAt: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock ticket message
 */
export function createMockMessage(overrides: Partial<TicketMessage> = {}): TicketMessage {
  return {
    id: TEST_IDS.MESSAGE_REPLY,
    ticketId: TEST_IDS.TICKET_OPEN,
    senderId: TEST_IDS.USER_CUSTOMER,
    content: "This is a test message",
    type: "reply",
    attachments: [],
    emailMessageId: null,
    isEdited: false,
    editedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock category
 */
export function createMockCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: TEST_IDS.CATEGORY_GENERAL,
    organizationId: TEST_IDS.ORG_ACME,
    name: "General",
    description: "General inquiries",
    color: "#6B7280",
    parentId: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock SLA policy
 */
export function createMockSlaPolicy(overrides: Partial<SlaPolicy> = {}): SlaPolicy {
  return {
    id: TEST_IDS.SLA_MEDIUM,
    organizationId: TEST_IDS.ORG_ACME,
    name: "Medium Priority SLA",
    priority: "medium" as TicketPriority,
    firstResponseTime: 480, // 8 hours
    resolutionTime: 1440, // 24 hours
    businessHoursOnly: true,
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock saved filter
 */
export function createMockSavedFilter(overrides: Partial<SavedFilter> = {}): SavedFilter {
  const defaultCriteria: SavedFilterCriteria = {
    status: ["open"],
  };

  return {
    id: "filter-001",
    organizationId: TEST_IDS.ORG_ACME,
    userId: TEST_IDS.USER_AGENT,
    name: "My Open Tickets",
    description: "Open tickets assigned to me",
    criteria: defaultCriteria,
    isDefault: false,
    isShared: false,
    sortBy: "createdAt",
    sortOrder: "desc",
    color: "#3B82F6",
    icon: null,
    position: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock subscription plan
 */
export function createMockPlan(overrides: Partial<SubscriptionPlan> = {}): SubscriptionPlan {
  const defaultLimits: PlanLimits = {
    ticketsPerMonth: 50,
    messagesPerMonth: 200,
    storagePerOrgMB: 100,
    apiRequestsPerMinute: 10,
    agentsPerOrg: 2,
    customersPerOrg: 100,
    slaEnabled: false,
    customFieldsEnabled: false,
    reportingEnabled: false,
    apiAccessEnabled: false,
    prioritySupport: false,
  };

  const defaultFeatures: PlanFeatures = {
    ticketManagement: true,
    emailChannel: true,
    chatWidget: false,
    apiChannel: false,
    cannedResponses: true,
    tags: true,
    categories: true,
    fileAttachments: true,
    csatSurveys: false,
    slaManagement: false,
    customFields: false,
    analytics: false,
    advancedReporting: false,
    dataExport: false,
    customBranding: false,
    singleSignOn: false,
    auditLog: false,
    multipleWorkspaces: false,
  };

  return {
    id: TEST_IDS.PLAN_FREE,
    name: "Free",
    slug: "free",
    description: "Perfect for small teams",
    price: 0,
    currency: "USD",
    billingInterval: "monthly",
    limits: defaultLimits,
    features: defaultFeatures,
    isActive: true,
    isDefault: true,
    isVisible: true,
    alertsEnabled: true,
    alertThreshold: 90,
    position: 1,
    stripeProductId: null,
    stripePriceId: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock CSAT survey
 */
export function createMockCsatSurvey(overrides: Partial<CsatSurvey> = {}): CsatSurvey {
  return {
    id: "csat-001",
    organizationId: TEST_IDS.ORG_ACME,
    ticketId: TEST_IDS.TICKET_RESOLVED,
    customerId: TEST_IDS.USER_CUSTOMER,
    agentId: TEST_IDS.USER_AGENT,
    token: "csat-token-12345",
    rating: null,
    feedback: null,
    sentAt: new Date(),
    respondedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    createdAt: new Date(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Pre-built Test Data Sets
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Complete set of users for testing role-based access
 */
export const testUsers = {
  admin: createMockUser({
    id: TEST_IDS.USER_ADMIN,
    email: "admin@acme.com",
    name: "Alice Admin",
  }),
  agent: createMockUser({
    id: TEST_IDS.USER_AGENT,
    email: "agent@acme.com",
    name: "Bob Agent",
  }),
  customer: createMockUser({
    id: TEST_IDS.USER_CUSTOMER,
    email: "customer@example.com",
    name: "Charlie Customer",
  }),
  owner: createMockUser({
    id: TEST_IDS.USER_OWNER,
    email: "owner@acme.com",
    name: "David Owner",
  }),
};

/**
 * Complete set of organizations for testing multi-tenancy
 */
export const testOrganizations = {
  acme: createMockOrganization({
    id: TEST_IDS.ORG_ACME,
    name: "Acme Corporation",
    slug: "acme-corp",
  }),
  techstart: createMockOrganization({
    id: TEST_IDS.ORG_TECHSTART,
    name: "TechStart Inc",
    slug: "techstart",
  }),
};

/**
 * User-organization relationships for role testing
 */
export const testUserOrganizations = {
  adminAcme: createMockUserOrganization({
    id: "uo-admin-acme",
    userId: TEST_IDS.USER_ADMIN,
    organizationId: TEST_IDS.ORG_ACME,
    role: "admin",
  }),
  agentAcme: createMockUserOrganization({
    id: "uo-agent-acme",
    userId: TEST_IDS.USER_AGENT,
    organizationId: TEST_IDS.ORG_ACME,
    role: "agent",
  }),
  customerAcme: createMockUserOrganization({
    id: "uo-customer-acme",
    userId: TEST_IDS.USER_CUSTOMER,
    organizationId: TEST_IDS.ORG_ACME,
    role: "customer",
  }),
  ownerAcme: createMockUserOrganization({
    id: "uo-owner-acme",
    userId: TEST_IDS.USER_OWNER,
    organizationId: TEST_IDS.ORG_ACME,
    role: "owner",
  }),
};

/**
 * Tickets in various states for testing
 */
export const testTickets = {
  open: createMockTicket({
    id: TEST_IDS.TICKET_OPEN,
    ticketNumber: 1001,
    title: "Cannot login to dashboard",
    status: "open",
    priority: "high",
    assigneeId: TEST_IDS.USER_AGENT,
    tags: ["login", "urgent"],
  }),
  pending: createMockTicket({
    id: TEST_IDS.TICKET_PENDING,
    ticketNumber: 1002,
    title: "Billing question",
    status: "pending",
    priority: "medium",
    assigneeId: TEST_IDS.USER_ADMIN,
    tags: ["billing"],
  }),
  resolved: createMockTicket({
    id: TEST_IDS.TICKET_RESOLVED,
    ticketNumber: 1003,
    title: "API rate limit request",
    status: "resolved",
    priority: "medium",
    assigneeId: TEST_IDS.USER_AGENT,
    resolvedAt: new Date(),
    tags: ["api"],
  }),
  closed: createMockTicket({
    id: TEST_IDS.TICKET_CLOSED,
    ticketNumber: 1004,
    title: "Feature request: Dark mode",
    status: "closed",
    priority: "low",
    closedAt: new Date(),
    tags: ["feature"],
  }),
};

/**
 * SLA policies for each priority
 */
export const testSlaPolicies = {
  urgent: createMockSlaPolicy({
    id: TEST_IDS.SLA_URGENT,
    name: "Urgent SLA",
    priority: "urgent",
    firstResponseTime: 60,
    resolutionTime: 240,
    businessHoursOnly: false,
  }),
  high: createMockSlaPolicy({
    id: TEST_IDS.SLA_HIGH,
    name: "High Priority SLA",
    priority: "high",
    firstResponseTime: 240,
    resolutionTime: 480,
  }),
  medium: createMockSlaPolicy({
    id: TEST_IDS.SLA_MEDIUM,
    name: "Medium Priority SLA",
    priority: "medium",
    firstResponseTime: 480,
    resolutionTime: 1440,
  }),
  low: createMockSlaPolicy({
    id: TEST_IDS.SLA_LOW,
    name: "Low Priority SLA",
    priority: "low",
    firstResponseTime: 1440,
    resolutionTime: 4320,
  }),
};

/**
 * Categories for testing
 */
export const testCategories = {
  general: createMockCategory({
    id: TEST_IDS.CATEGORY_GENERAL,
    name: "General",
    color: "#6B7280",
  }),
  technical: createMockCategory({
    id: TEST_IDS.CATEGORY_TECHNICAL,
    name: "Technical Support",
    color: "#3B82F6",
  }),
  billing: createMockCategory({
    id: TEST_IDS.CATEGORY_BILLING,
    name: "Billing",
    color: "#10B981",
  }),
};

/**
 * Subscription plans for testing
 */
export const testPlans = {
  free: createMockPlan({
    id: TEST_IDS.PLAN_FREE,
    name: "Free",
    slug: "free",
    price: 0,
    isDefault: true,
  }),
  pro: createMockPlan({
    id: TEST_IDS.PLAN_PRO,
    name: "Pro",
    slug: "pro",
    price: 2900,
    isDefault: false,
    limits: {
      ticketsPerMonth: 500,
      messagesPerMonth: 2000,
      storagePerOrgMB: 1024,
      apiRequestsPerMinute: 100,
      agentsPerOrg: 10,
      customersPerOrg: 1000,
      slaEnabled: true,
      customFieldsEnabled: true,
      reportingEnabled: true,
      apiAccessEnabled: true,
      prioritySupport: false,
    },
  }),
  business: createMockPlan({
    id: TEST_IDS.PLAN_BUSINESS,
    name: "Business",
    slug: "business",
    price: 9900,
    isDefault: false,
    limits: {
      ticketsPerMonth: -1,
      messagesPerMonth: -1,
      storagePerOrgMB: 10240,
      apiRequestsPerMinute: 500,
      agentsPerOrg: -1,
      customersPerOrg: -1,
      slaEnabled: true,
      customFieldsEnabled: true,
      reportingEnabled: true,
      apiAccessEnabled: true,
      prioritySupport: true,
    },
  }),
};
