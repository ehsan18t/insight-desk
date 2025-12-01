// Database Schema - Row-Level Security (RLS) Configuration
// Defines roles and helper functions for multi-tenant data isolation

import { sql } from "drizzle-orm";
import { pgPolicy, pgRole } from "drizzle-orm/pg-core";

// ═══════════════════════════════════════════════════════════════════════════
// ROLES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Application user role - used by the main application connection
 * This role respects RLS policies and cannot see data across tenants
 * Using .existing() tells drizzle-kit this role is pre-created externally
 */
export const appUser = pgRole("app_user").existing();

/**
 * Service role - used by background jobs and admin operations
 * This role bypasses RLS for cross-tenant operations like SLA checks
 * Using .existing() tells drizzle-kit this role is pre-created externally
 * Note: BYPASSRLS attribute must be granted manually via SQL:
 * ALTER ROLE service_role BYPASSRLS;
 */
export const serviceRole = pgRole("service_role").existing();

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS (SQL expressions for policies)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get current organization ID from session context
 * Returns NULL if not set, which causes RLS to deny access (safe default)
 */
export const currentOrgId = sql`current_setting('app.current_org_id', true)::uuid`;

/**
 * Get current user ID from session context
 * Used for userOrganizations table to allow users to see their own memberships
 */
export const currentUserId = sql`current_setting('app.current_user_id', true)::uuid`;

// ═══════════════════════════════════════════════════════════════════════════
// POLICY FACTORIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a standard tenant isolation policy for tables with organization_id column
 * Allows SELECT, UPDATE, DELETE only when organization_id matches current tenant
 */
export function createTenantSelectPolicy(tableName: string) {
  return pgPolicy(`${tableName}_tenant_select`, {
    as: "permissive",
    for: "select",
    to: appUser,
    using: sql`organization_id = ${currentOrgId}`,
  });
}

export function createTenantInsertPolicy(tableName: string) {
  return pgPolicy(`${tableName}_tenant_insert`, {
    as: "permissive",
    for: "insert",
    to: appUser,
    withCheck: sql`organization_id = ${currentOrgId}`,
  });
}

export function createTenantUpdatePolicy(tableName: string) {
  return pgPolicy(`${tableName}_tenant_update`, {
    as: "permissive",
    for: "update",
    to: appUser,
    using: sql`organization_id = ${currentOrgId}`,
    withCheck: sql`organization_id = ${currentOrgId}`,
  });
}

export function createTenantDeletePolicy(tableName: string) {
  return pgPolicy(`${tableName}_tenant_delete`, {
    as: "permissive",
    for: "delete",
    to: appUser,
    using: sql`organization_id = ${currentOrgId}`,
  });
}

/**
 * Create all CRUD policies for a tenant-scoped table
 */
export function createTenantPolicies(tableName: string) {
  return [
    createTenantSelectPolicy(tableName),
    createTenantInsertPolicy(tableName),
    createTenantUpdatePolicy(tableName),
    createTenantDeletePolicy(tableName),
  ];
}

/**
 * Create policies for tables where the ID itself is the organization_id
 * (e.g., organizations table where id = current_org_id)
 */
export function createOrgSelfPolicy(tableName: string) {
  return [
    pgPolicy(`${tableName}_self_select`, {
      as: "permissive",
      for: "select",
      to: appUser,
      using: sql`id = ${currentOrgId}`,
    }),
    pgPolicy(`${tableName}_self_update`, {
      as: "permissive",
      for: "update",
      to: appUser,
      using: sql`id = ${currentOrgId}`,
      withCheck: sql`id = ${currentOrgId}`,
    }),
    // Note: No insert/delete - organizations are created via admin flows
  ];
}

/**
 * Create policies for userOrganizations table
 * - Tenant policy: Access memberships within current org context
 * - User self policy: Users can see their own memberships across all orgs (for org listing)
 */
export function createUserOrgPolicies() {
  return [
    // When tenant context is set, allow access to that org's memberships
    pgPolicy("user_orgs_tenant_select", {
      as: "permissive",
      for: "select",
      to: appUser,
      using: sql`organization_id = ${currentOrgId}`,
    }),
    // Users can always see their own memberships (for /api/organizations endpoint)
    pgPolicy("user_orgs_user_self", {
      as: "permissive",
      for: "select",
      to: appUser,
      using: sql`user_id = ${currentUserId}`,
    }),
    // Insert/Update/Delete only within current tenant context
    pgPolicy("user_orgs_tenant_insert", {
      as: "permissive",
      for: "insert",
      to: appUser,
      withCheck: sql`organization_id = ${currentOrgId}`,
    }),
    pgPolicy("user_orgs_tenant_update", {
      as: "permissive",
      for: "update",
      to: appUser,
      using: sql`organization_id = ${currentOrgId}`,
      withCheck: sql`organization_id = ${currentOrgId}`,
    }),
    pgPolicy("user_orgs_tenant_delete", {
      as: "permissive",
      for: "delete",
      to: appUser,
      using: sql`organization_id = ${currentOrgId}`,
    }),
  ];
}

/**
 * Create policies for attachments table (uses org_id instead of organization_id)
 */
export function createAttachmentPolicies() {
  return [
    pgPolicy("attachments_tenant_select", {
      as: "permissive",
      for: "select",
      to: appUser,
      using: sql`org_id = ${currentOrgId}`,
    }),
    pgPolicy("attachments_tenant_insert", {
      as: "permissive",
      for: "insert",
      to: appUser,
      withCheck: sql`org_id = ${currentOrgId}`,
    }),
    pgPolicy("attachments_tenant_update", {
      as: "permissive",
      for: "update",
      to: appUser,
      using: sql`org_id = ${currentOrgId}`,
      withCheck: sql`org_id = ${currentOrgId}`,
    }),
    pgPolicy("attachments_tenant_delete", {
      as: "permissive",
      for: "delete",
      to: appUser,
      using: sql`org_id = ${currentOrgId}`,
    }),
  ];
}

/**
 * Create policies for organizationInvitations table (uses org_id instead of organization_id)
 */
export function createInvitationPolicies() {
  return [
    pgPolicy("invitations_tenant_select", {
      as: "permissive",
      for: "select",
      to: appUser,
      using: sql`org_id = ${currentOrgId}`,
    }),
    pgPolicy("invitations_tenant_insert", {
      as: "permissive",
      for: "insert",
      to: appUser,
      withCheck: sql`org_id = ${currentOrgId}`,
    }),
    pgPolicy("invitations_tenant_update", {
      as: "permissive",
      for: "update",
      to: appUser,
      using: sql`org_id = ${currentOrgId}`,
      withCheck: sql`org_id = ${currentOrgId}`,
    }),
    pgPolicy("invitations_tenant_delete", {
      as: "permissive",
      for: "delete",
      to: appUser,
      using: sql`org_id = ${currentOrgId}`,
    }),
  ];
}

/**
 * Create policies for ticket_messages table (uses subquery through tickets)
 * Messages belong to tickets, which belong to organizations
 */
export function createMessagePolicies() {
  const ticketOrgCheck = sql`EXISTS (
    SELECT 1 FROM tickets 
    WHERE tickets.id = ticket_messages.ticket_id 
    AND tickets.organization_id = ${currentOrgId}
  )`;

  return [
    pgPolicy("messages_tenant_select", {
      as: "permissive",
      for: "select",
      to: appUser,
      using: ticketOrgCheck,
    }),
    pgPolicy("messages_tenant_insert", {
      as: "permissive",
      for: "insert",
      to: appUser,
      withCheck: ticketOrgCheck,
    }),
    pgPolicy("messages_tenant_update", {
      as: "permissive",
      for: "update",
      to: appUser,
      using: ticketOrgCheck,
      withCheck: ticketOrgCheck,
    }),
    pgPolicy("messages_tenant_delete", {
      as: "permissive",
      for: "delete",
      to: appUser,
      using: ticketOrgCheck,
    }),
  ];
}

/**
 * Create policies for ticket_activities table (uses subquery through tickets)
 * Activities belong to tickets, which belong to organizations
 */
export function createActivityPolicies() {
  const ticketOrgCheck = sql`EXISTS (
    SELECT 1 FROM tickets 
    WHERE tickets.id = ticket_activities.ticket_id 
    AND tickets.organization_id = ${currentOrgId}
  )`;

  return [
    pgPolicy("activities_tenant_select", {
      as: "permissive",
      for: "select",
      to: appUser,
      using: ticketOrgCheck,
    }),
    pgPolicy("activities_tenant_insert", {
      as: "permissive",
      for: "insert",
      to: appUser,
      withCheck: ticketOrgCheck,
    }),
    pgPolicy("activities_tenant_update", {
      as: "permissive",
      for: "update",
      to: appUser,
      using: ticketOrgCheck,
      withCheck: ticketOrgCheck,
    }),
    pgPolicy("activities_tenant_delete", {
      as: "permissive",
      for: "delete",
      to: appUser,
      using: ticketOrgCheck,
    }),
  ];
}
