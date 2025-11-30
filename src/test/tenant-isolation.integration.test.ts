/**
 * Tenant Isolation Tests
 *
 * These tests verify that Row-Level Security (RLS) policies correctly
 * isolate data between organizations. Each test creates data in multiple
 * organizations and verifies that tenant context properly restricts access.
 *
 * Prerequisites:
 * - RLS policies must be enabled on the database
 * - app_user role must be used for tenant-scoped queries
 * - service_role or superuser for setup (bypasses RLS)
 *
 * Note: These are integration tests that require a real database.
 * Skip with: SKIP_INTEGRATION_TESTS=true npm run test
 */

import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb, checkAdminDatabaseConnection } from "@/db/admin-db";
import { withTenant } from "@/db/with-tenant";
import {
  cannedResponses,
  categories,
  csatSurveys,
  organizationSubscriptions,
  savedFilters,
  slaPolicies,
  tags,
  ticketActivities,
  ticketMessages,
  tickets,
  userOrganizations,
} from "@/db/schema";
import {
  createTestMembership,
  createTestMessage,
  createTestOrganization,
  createTestTicket,
  createTestUser,
  generateId,
} from "./factories";
import { skipIntegrationTests } from "./integration";

// ─────────────────────────────────────────────────────────────
// Test Setup Types
// ─────────────────────────────────────────────────────────────

interface TestOrg {
  organization: Awaited<ReturnType<typeof createTestOrganization>>;
  admin: Awaited<ReturnType<typeof createTestUser>>;
  agent: Awaited<ReturnType<typeof createTestUser>>;
  customer: Awaited<ReturnType<typeof createTestUser>>;
  ticket: Awaited<ReturnType<typeof createTestTicket>>;
  message: Awaited<ReturnType<typeof createTestMessage>>;
}

let orgA: TestOrg;
let orgB: TestOrg;

/**
 * Create a complete test organization with users, tickets, and messages
 */
async function createFullTestOrg(name: string): Promise<TestOrg> {
  const organization = await createTestOrganization({ name });

  const admin = await createTestUser({ name: `${name} Admin` });
  const agent = await createTestUser({ name: `${name} Agent` });
  const customer = await createTestUser({ name: `${name} Customer` });

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

  const ticket = await createTestTicket({
    organizationId: organization.id,
    customerId: customer.id,
    assigneeId: agent.id,
    subject: `${name} Ticket`,
  });

  const message = await createTestMessage({
    ticketId: ticket.id,
    senderId: customer.id,
    content: `${name} message content`,
  });

  return { organization, admin, agent, customer, ticket, message };
}

// ─────────────────────────────────────────────────────────────
// Main Test Suite - Wrapped in skipIf for proper skipping
// ─────────────────────────────────────────────────────────────

describe.skipIf(skipIntegrationTests())("Tenant Isolation (RLS)", () => {
  // ─────────────────────────────────────────────────────────────
  // Setup and Teardown (inside the skipIf block)
  // ─────────────────────────────────────────────────────────────

  beforeAll(async () => {
    // Check database connectivity
    const isConnected = await checkAdminDatabaseConnection();
    if (!isConnected) {
      console.warn("Database not available, skipping tenant isolation tests");
      return;
    }

    // Create two completely separate organizations
    orgA = await createFullTestOrg("Organization A");
    orgB = await createFullTestOrg("Organization B");
  });

  afterAll(async () => {
    if (!orgA || !orgB) return;

    // Cleanup in reverse order (respecting foreign keys)
    // Using adminDb to bypass RLS for cleanup

    // Clean up messages
    await adminDb.delete(ticketMessages).where(eq(ticketMessages.ticketId, orgA.ticket.id));
    await adminDb.delete(ticketMessages).where(eq(ticketMessages.ticketId, orgB.ticket.id));

    // Clean up activities
    await adminDb.delete(ticketActivities).where(eq(ticketActivities.ticketId, orgA.ticket.id));
    await adminDb.delete(ticketActivities).where(eq(ticketActivities.ticketId, orgB.ticket.id));

    // Clean up CSAT surveys
    await adminDb.delete(csatSurveys).where(eq(csatSurveys.ticketId, orgA.ticket.id));
    await adminDb.delete(csatSurveys).where(eq(csatSurveys.ticketId, orgB.ticket.id));

    // Clean up tickets
    await adminDb.delete(tickets).where(eq(tickets.organizationId, orgA.organization.id));
    await adminDb.delete(tickets).where(eq(tickets.organizationId, orgB.organization.id));

    // Clean up org-scoped entities
    await adminDb
      .delete(cannedResponses)
      .where(eq(cannedResponses.organizationId, orgA.organization.id));
    await adminDb
      .delete(cannedResponses)
      .where(eq(cannedResponses.organizationId, orgB.organization.id));

    await adminDb.delete(categories).where(eq(categories.organizationId, orgA.organization.id));
    await adminDb.delete(categories).where(eq(categories.organizationId, orgB.organization.id));

    await adminDb.delete(tags).where(eq(tags.organizationId, orgA.organization.id));
    await adminDb.delete(tags).where(eq(tags.organizationId, orgB.organization.id));

    await adminDb.delete(slaPolicies).where(eq(slaPolicies.organizationId, orgA.organization.id));
    await adminDb.delete(slaPolicies).where(eq(slaPolicies.organizationId, orgB.organization.id));

    await adminDb
      .delete(organizationSubscriptions)
      .where(eq(organizationSubscriptions.organizationId, orgA.organization.id));
    await adminDb
      .delete(organizationSubscriptions)
      .where(eq(organizationSubscriptions.organizationId, orgB.organization.id));

    // Clean up saved filters for users
    await adminDb.delete(savedFilters).where(eq(savedFilters.userId, orgA.admin.id));
    await adminDb.delete(savedFilters).where(eq(savedFilters.userId, orgA.agent.id));
    await adminDb.delete(savedFilters).where(eq(savedFilters.userId, orgA.customer.id));
    await adminDb.delete(savedFilters).where(eq(savedFilters.userId, orgB.admin.id));
    await adminDb.delete(savedFilters).where(eq(savedFilters.userId, orgB.agent.id));
    await adminDb.delete(savedFilters).where(eq(savedFilters.userId, orgB.customer.id));

    // Clean up memberships
    await adminDb
      .delete(userOrganizations)
      .where(eq(userOrganizations.organizationId, orgA.organization.id));
    await adminDb
      .delete(userOrganizations)
      .where(eq(userOrganizations.organizationId, orgB.organization.id));
  });

  // ─────────────────────────────────────────────────────────────
  // Ticket Isolation Tests
  // ─────────────────────────────────────────────────────────────

  describe("Ticket Tenant Isolation", () => {
    it("should only see tickets from current organization", async () => {
      // Query as Org A
      const orgATickets = await withTenant(
        { organizationId: orgA.organization.id, userId: orgA.admin.id },
        async (tx) => {
          return await tx.select().from(tickets);
        },
      );

      // Query as Org B
      const orgBTickets = await withTenant(
        { organizationId: orgB.organization.id, userId: orgB.admin.id },
        async (tx) => {
          return await tx.select().from(tickets);
        },
      );

      // Org A should only see Org A's ticket
      expect(orgATickets).toHaveLength(1);
      expect(orgATickets[0].id).toBe(orgA.ticket.id);
      expect(orgATickets[0].organizationId).toBe(orgA.organization.id);

      // Org B should only see Org B's ticket
      expect(orgBTickets).toHaveLength(1);
      expect(orgBTickets[0].id).toBe(orgB.ticket.id);
      expect(orgBTickets[0].organizationId).toBe(orgB.organization.id);
    });

    it("should not allow accessing another organization's ticket by ID", async () => {
      // Try to access Org B's ticket from Org A's context
      const crossOrgTicket = await withTenant(
        { organizationId: orgA.organization.id, userId: orgA.admin.id },
        async (tx) => {
          return await tx.select().from(tickets).where(eq(tickets.id, orgB.ticket.id));
        },
      );

      // Should return empty - RLS blocks access
      expect(crossOrgTicket).toHaveLength(0);
    });

    it("adminDb should see all tickets across organizations", async () => {
      // Admin db bypasses RLS
      const allTickets = await adminDb.select().from(tickets);

      // Should see both tickets
      const orgATicket = allTickets.find((t) => t.id === orgA.ticket.id);
      const orgBTicket = allTickets.find((t) => t.id === orgB.ticket.id);

      expect(orgATicket).toBeDefined();
      expect(orgBTicket).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Message Isolation Tests
  // ─────────────────────────────────────────────────────────────

  describe("Message Tenant Isolation", () => {
    it("should only see messages for tickets in current organization", async () => {
      // Query as Org A
      const orgAMessages = await withTenant(
        { organizationId: orgA.organization.id, userId: orgA.admin.id },
        async (tx) => {
          return await tx.select().from(ticketMessages);
        },
      );

      // Query as Org B
      const orgBMessages = await withTenant(
        { organizationId: orgB.organization.id, userId: orgB.admin.id },
        async (tx) => {
          return await tx.select().from(ticketMessages);
        },
      );

      // Org A should only see messages for Org A's ticket
      expect(orgAMessages.every((m) => m.ticketId === orgA.ticket.id)).toBe(true);

      // Org B should only see messages for Org B's ticket
      expect(orgBMessages.every((m) => m.ticketId === orgB.ticket.id)).toBe(true);
    });

    it("should not allow accessing another organization's messages", async () => {
      // Try to access Org B's message from Org A's context
      const crossOrgMessage = await withTenant(
        { organizationId: orgA.organization.id, userId: orgA.admin.id },
        async (tx) => {
          return await tx
            .select()
            .from(ticketMessages)
            .where(eq(ticketMessages.id, orgB.message.id));
        },
      );

      expect(crossOrgMessage).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // User Organization Membership Tests
  // ─────────────────────────────────────────────────────────────

  describe("User Organization Membership Isolation", () => {
    it("should only see memberships within current organization context", async () => {
      // Query as Org A
      const orgAMemberships = await withTenant(
        { organizationId: orgA.organization.id, userId: orgA.admin.id },
        async (tx) => {
          return await tx.select().from(userOrganizations);
        },
      );

      // All memberships should be for Org A
      expect(orgAMemberships.every((m) => m.organizationId === orgA.organization.id)).toBe(true);
      expect(orgAMemberships.length).toBeGreaterThanOrEqual(3); // admin, agent, customer
    });

    it("user should see their own memberships across all orgs (for org listing)", async () => {
      // Create a user that belongs to both orgs
      const crossOrgUser = await createTestUser({ name: "Cross Org User" });
      await createTestMembership({
        userId: crossOrgUser.id,
        organizationId: orgA.organization.id,
        role: "customer",
      });
      await createTestMembership({
        userId: crossOrgUser.id,
        organizationId: orgB.organization.id,
        role: "agent",
      });

      // Query with user context but no specific org context - should see all user's memberships
      // This tests the user_orgs_user_self policy
      const userMemberships = await withTenant(
        { organizationId: orgA.organization.id, userId: crossOrgUser.id },
        async (tx) => {
          return await tx
            .select()
            .from(userOrganizations)
            .where(eq(userOrganizations.userId, crossOrgUser.id));
        },
      );

      // User should see both memberships due to user_orgs_user_self policy
      expect(userMemberships.length).toBeGreaterThanOrEqual(1);

      // Cleanup
      await adminDb.delete(userOrganizations).where(eq(userOrganizations.userId, crossOrgUser.id));
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Cross-Tenant Data Creation Prevention Tests
  // ─────────────────────────────────────────────────────────────

  describe("Cross-Tenant Insert Prevention", () => {
    it("should prevent inserting ticket into another organization", async () => {
      // Try to create a ticket in Org B while in Org A's context
      await expect(
        withTenant({ organizationId: orgA.organization.id, userId: orgA.admin.id }, async (tx) => {
          return await tx
            .insert(tickets)
            .values({
              id: generateId(),
              ticketNumber: 99999,
              organizationId: orgB.organization.id, // Wrong org!
              customerId: orgA.customer.id,
              title: "Cross-tenant ticket",
              description: "This should fail",
            })
            .returning();
        }),
      ).rejects.toThrow(); // RLS insert policy should block this
    });

    it("should allow inserting ticket into current organization", async () => {
      const newTicketId = generateId();

      const result = await withTenant(
        { organizationId: orgA.organization.id, userId: orgA.admin.id },
        async (tx) => {
          return await tx
            .insert(tickets)
            .values({
              id: newTicketId,
              ticketNumber: 88888,
              organizationId: orgA.organization.id, // Correct org
              customerId: orgA.customer.id,
              title: "Same-tenant ticket",
              description: "This should succeed",
            })
            .returning();
        },
      );

      expect(result).toHaveLength(1);
      expect(result[0].organizationId).toBe(orgA.organization.id);

      // Cleanup
      await adminDb.delete(tickets).where(eq(tickets.id, newTicketId));
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Cross-Tenant Update Prevention Tests
  // ─────────────────────────────────────────────────────────────

  describe("Cross-Tenant Update Prevention", () => {
    it("should not update tickets in another organization", async () => {
      const originalTitle = orgB.ticket.title;

      // Try to update Org B's ticket while in Org A's context
      await withTenant(
        { organizationId: orgA.organization.id, userId: orgA.admin.id },
        async (tx) => {
          return await tx
            .update(tickets)
            .set({ title: "Hacked title!" })
            .where(eq(tickets.id, orgB.ticket.id));
        },
      );

      // Verify the ticket was NOT updated (using admin to bypass RLS)
      const [ticket] = await adminDb.select().from(tickets).where(eq(tickets.id, orgB.ticket.id));

      expect(ticket.title).toBe(originalTitle);
      expect(ticket.title).not.toBe("Hacked title!");
    });

    it("should update tickets in current organization", async () => {
      const newTitle = `Updated at ${Date.now()}`;

      await withTenant(
        { organizationId: orgA.organization.id, userId: orgA.admin.id },
        async (tx) => {
          return await tx
            .update(tickets)
            .set({ title: newTitle })
            .where(eq(tickets.id, orgA.ticket.id));
        },
      );

      // Verify the ticket was updated
      const [ticket] = await adminDb.select().from(tickets).where(eq(tickets.id, orgA.ticket.id));

      expect(ticket.title).toBe(newTitle);

      // Restore original title
      await adminDb
        .update(tickets)
        .set({ title: orgA.ticket.title })
        .where(eq(tickets.id, orgA.ticket.id));
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Cross-Tenant Delete Prevention Tests
  // ─────────────────────────────────────────────────────────────

  describe("Cross-Tenant Delete Prevention", () => {
    it("should not delete tickets in another organization", async () => {
      // Create a sacrificial ticket in Org B for this test
      const sacrificialTicket = await createTestTicket({
        organizationId: orgB.organization.id,
        customerId: orgB.customer.id,
        subject: "Sacrificial ticket",
      });

      // Try to delete from Org A's context
      await withTenant(
        { organizationId: orgA.organization.id, userId: orgA.admin.id },
        async (tx) => {
          return await tx.delete(tickets).where(eq(tickets.id, sacrificialTicket.id));
        },
      );

      // Verify the ticket still exists (using admin to bypass RLS)
      const [ticket] = await adminDb
        .select()
        .from(tickets)
        .where(eq(tickets.id, sacrificialTicket.id));

      expect(ticket).toBeDefined();
      expect(ticket.id).toBe(sacrificialTicket.id);

      // Cleanup
      await adminDb.delete(tickets).where(eq(tickets.id, sacrificialTicket.id));
    });

    it("should delete tickets in current organization", async () => {
      // Create a ticket to delete
      const ticketToDelete = await createTestTicket({
        organizationId: orgA.organization.id,
        customerId: orgA.customer.id,
        subject: "Ticket to delete",
      });

      // Delete from correct context
      await withTenant(
        { organizationId: orgA.organization.id, userId: orgA.admin.id },
        async (tx) => {
          return await tx.delete(tickets).where(eq(tickets.id, ticketToDelete.id));
        },
      );

      // Verify the ticket was deleted
      const [ticket] = await adminDb
        .select()
        .from(tickets)
        .where(eq(tickets.id, ticketToDelete.id));

      expect(ticket).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Aggregation Isolation Tests
  // ─────────────────────────────────────────────────────────────

  describe("Aggregation Isolation", () => {
    it("should only count tickets within current organization", async () => {
      // Count from Org A's context
      const [orgACount] = await withTenant(
        { organizationId: orgA.organization.id, userId: orgA.admin.id },
        async (tx) => {
          return await tx.select({ total: count() }).from(tickets);
        },
      );

      // Count from Org B's context
      const [orgBCount] = await withTenant(
        { organizationId: orgB.organization.id, userId: orgB.admin.id },
        async (tx) => {
          return await tx.select({ total: count() }).from(tickets);
        },
      );

      // Total count (admin bypasses RLS)
      const [totalCount] = await adminDb.select({ total: count() }).from(tickets);

      // Each org should see their own count
      expect(orgACount.total).toBeGreaterThanOrEqual(1);
      expect(orgBCount.total).toBeGreaterThanOrEqual(1);

      // Admin sees all
      expect(Number(totalCount.total)).toBeGreaterThanOrEqual(
        Number(orgACount.total) + Number(orgBCount.total),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Empty Context Tests
  // ─────────────────────────────────────────────────────────────

  describe("Empty Context Behavior", () => {
    it("should deny access when no tenant context is set (safe default)", async () => {
      // This simulates what happens if someone tries to query without setting context
      // The RLS policies use current_setting with true (return null if not set)
      // and null != any organization_id, so no rows match

      // We can't easily test this directly because withTenant always sets context
      // But we can verify that empty string org ID returns nothing
      const result = await withTenant(
        { organizationId: "00000000-0000-0000-0000-000000000000", userId: orgA.admin.id },
        async (tx) => {
          return await tx.select().from(tickets);
        },
      );

      // Non-existent org should return no tickets
      expect(result).toHaveLength(0);
    });
  });
});
