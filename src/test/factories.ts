/**
 * Test Factories
 *
 * Creates test data in the database for integration tests.
 * Each factory returns the created entity with all fields.
 */

import { nanoid } from "nanoid";
import { db } from "@/db";
import {
  type NewOrganization,
  type NewTicket,
  type NewTicketMessage,
  type NewUser,
  type NewUserOrganization,
  organizations,
  type TicketPriority,
  type TicketStatus,
  ticketMessages,
  tickets,
  type UserRole,
  userOrganizations,
  users,
} from "@/db/schema";

// ─────────────────────────────────────────────────────────────
// ID Generators
// ─────────────────────────────────────────────────────────────

export function generateId(): string {
  return nanoid();
}

export function generateEmail(prefix = "user"): string {
  return `${prefix}-${nanoid(8)}@test.local`;
}

export function generateSlug(prefix = "org"): string {
  return `${prefix}-${nanoid(8)}`.toLowerCase();
}

// ─────────────────────────────────────────────────────────────
// Organization Factory
// ─────────────────────────────────────────────────────────────

export interface CreateOrganizationOptions {
  id?: string;
  name?: string;
  slug?: string;
}

export async function createTestOrganization(
  options: CreateOrganizationOptions = {},
): Promise<NewOrganization & { id: string }> {
  const data: NewOrganization = {
    id: options.id ?? generateId(),
    name: options.name ?? `Test Org ${nanoid(4)}`,
    slug: options.slug ?? generateSlug(),
  };

  const [org] = await db.insert(organizations).values(data).returning();
  return org;
}

// ─────────────────────────────────────────────────────────────
// User Factory
// ─────────────────────────────────────────────────────────────

export interface CreateUserOptions {
  id?: string;
  email?: string;
  name?: string;
  emailVerified?: boolean;
  avatarUrl?: string;
}

export async function createTestUser(
  options: CreateUserOptions = {},
): Promise<NewUser & { id: string }> {
  const data: NewUser = {
    id: options.id ?? generateId(),
    email: options.email ?? generateEmail(),
    name: options.name ?? `Test User ${nanoid(4)}`,
    emailVerified: options.emailVerified ?? true,
    avatarUrl: options.avatarUrl,
  };

  const [user] = await db.insert(users).values(data).returning();
  return user;
}

// ─────────────────────────────────────────────────────────────
// User Organization Membership Factory
// ─────────────────────────────────────────────────────────────

export interface CreateMembershipOptions {
  userId: string;
  organizationId: string;
  role?: UserRole;
}

export async function createTestMembership(
  options: CreateMembershipOptions,
): Promise<NewUserOrganization> {
  const data: NewUserOrganization = {
    userId: options.userId,
    organizationId: options.organizationId,
    role: options.role ?? "customer",
  };

  const [membership] = await db.insert(userOrganizations).values(data).returning();
  return membership;
}

// ─────────────────────────────────────────────────────────────
// Combined User + Organization Factory
// ─────────────────────────────────────────────────────────────

export interface CreateUserWithOrgOptions extends CreateUserOptions {
  organizationId?: string;
  role?: UserRole;
}

export async function createTestUserWithOrg(options: CreateUserWithOrgOptions = {}) {
  // Create or use existing organization
  let orgId = options.organizationId;
  let org: Awaited<ReturnType<typeof createTestOrganization>> | null = null;

  if (!orgId) {
    org = await createTestOrganization();
    orgId = org.id;
  }

  // Create user
  const user = await createTestUser(options);

  // Create membership
  const membership = await createTestMembership({
    userId: user.id,
    organizationId: orgId,
    role: options.role ?? "customer",
  });

  return { user, organization: org, membership, organizationId: orgId };
}

// ─────────────────────────────────────────────────────────────
// Ticket Factory
// ─────────────────────────────────────────────────────────────

let ticketCounter = 0;

export interface CreateTicketOptions {
  id?: string;
  organizationId: string;
  customerId: string;
  assigneeId?: string;
  subject?: string;
  description?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
}

export async function createTestTicket(
  options: CreateTicketOptions,
): Promise<NewTicket & { id: string }> {
  ticketCounter++;

  const data: NewTicket = {
    id: options.id ?? generateId(),
    ticketNumber: ticketCounter,
    organizationId: options.organizationId,
    customerId: options.customerId,
    assigneeId: options.assigneeId,
    title: options.subject ?? `Test Ticket ${nanoid(4)}`,
    description: options.description ?? "This is a test ticket description.",
    status: options.status ?? "open",
    priority: options.priority ?? "medium",
  };

  const [ticket] = await db.insert(tickets).values(data).returning();
  return ticket;
}

// ─────────────────────────────────────────────────────────────
// Message Factory
// ─────────────────────────────────────────────────────────────

export interface CreateMessageOptions {
  id?: string;
  ticketId: string;
  senderId: string;
  content?: string;
  isInternal?: boolean;
}

export async function createTestMessage(
  options: CreateMessageOptions,
): Promise<NewTicketMessage & { id: string }> {
  const data: NewTicketMessage = {
    id: options.id ?? generateId(),
    ticketId: options.ticketId,
    senderId: options.senderId,
    content: options.content ?? `Test message content ${nanoid(4)}`,
    type: options.isInternal ? "internal_note" : "reply",
  };

  const [message] = await db.insert(ticketMessages).values(data).returning();
  return message;
}

// ─────────────────────────────────────────────────────────────
// Complete Test Scenario Factory
// ─────────────────────────────────────────────────────────────

export interface TestScenario {
  organization: Awaited<ReturnType<typeof createTestOrganization>>;
  admin: Awaited<ReturnType<typeof createTestUser>>;
  agent: Awaited<ReturnType<typeof createTestUser>>;
  customer: Awaited<ReturnType<typeof createTestUser>>;
}

export async function createTestScenario(): Promise<TestScenario> {
  const organization = await createTestOrganization();

  const admin = await createTestUser({ name: "Admin User" });
  const agent = await createTestUser({ name: "Agent User" });
  const customer = await createTestUser({ name: "Customer User" });

  await createTestMembership({
    userId: admin.id,
    organizationId: organization.id,
    role: "admin",
  });

  await createTestMembership({
    userId: agent.id,
    organizationId: organization.id,
    role: "agent",
  });

  await createTestMembership({
    userId: customer.id,
    organizationId: organization.id,
    role: "customer",
  });

  return { organization, admin, agent, customer };
}
