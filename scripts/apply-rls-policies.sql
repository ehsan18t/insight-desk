-- RLS Policy Expressions for InsightDesk
-- Run this script AFTER drizzle-kit push to add USING and WITH CHECK clauses
-- drizzle-kit push does not support USING/WITH CHECK clauses, so we apply them manually

-- NOTE: We must use "TO app_user" in ALTER POLICY for the clauses to apply correctly

-- Helper function to get current organization ID from session context
-- current_setting('app.current_org_id', true)::uuid

-- ═══════════════════════════════════════════════════════════════════════════
-- STANDARD TENANT POLICIES (organization_id column)
-- These tables use organization_id directly
-- ═══════════════════════════════════════════════════════════════════════════

-- tickets
ALTER POLICY "tickets_tenant_select" ON "tickets" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "tickets_tenant_insert" ON "tickets" TO app_user WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "tickets_tenant_update" ON "tickets" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "tickets_tenant_delete" ON "tickets" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- categories
ALTER POLICY "categories_tenant_select" ON "categories" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "categories_tenant_insert" ON "categories" TO app_user WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "categories_tenant_update" ON "categories" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "categories_tenant_delete" ON "categories" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- tags
ALTER POLICY "tags_tenant_select" ON "tags" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "tags_tenant_insert" ON "tags" TO app_user WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "tags_tenant_update" ON "tags" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "tags_tenant_delete" ON "tags" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- sla_policies
ALTER POLICY "sla_policies_tenant_select" ON "sla_policies" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "sla_policies_tenant_insert" ON "sla_policies" TO app_user WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "sla_policies_tenant_update" ON "sla_policies" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "sla_policies_tenant_delete" ON "sla_policies" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- canned_responses
ALTER POLICY "canned_responses_tenant_select" ON "canned_responses" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "canned_responses_tenant_insert" ON "canned_responses" TO app_user WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "canned_responses_tenant_update" ON "canned_responses" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "canned_responses_tenant_delete" ON "canned_responses" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- saved_filters
ALTER POLICY "saved_filters_tenant_select" ON "saved_filters" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "saved_filters_tenant_insert" ON "saved_filters" TO app_user WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "saved_filters_tenant_update" ON "saved_filters" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "saved_filters_tenant_delete" ON "saved_filters" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- csat_surveys
ALTER POLICY "csat_surveys_tenant_select" ON "csat_surveys" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "csat_surveys_tenant_insert" ON "csat_surveys" TO app_user WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "csat_surveys_tenant_update" ON "csat_surveys" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "csat_surveys_tenant_delete" ON "csat_surveys" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- organization_subscriptions
ALTER POLICY "organization_subscriptions_tenant_select" ON "organization_subscriptions" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "organization_subscriptions_tenant_insert" ON "organization_subscriptions" TO app_user WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "organization_subscriptions_tenant_update" ON "organization_subscriptions" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "organization_subscriptions_tenant_delete" ON "organization_subscriptions" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- subscription_usage
ALTER POLICY "subscription_usage_tenant_select" ON "subscription_usage" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "subscription_usage_tenant_insert" ON "subscription_usage" TO app_user WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "subscription_usage_tenant_update" ON "subscription_usage" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "subscription_usage_tenant_delete" ON "subscription_usage" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- audit_logs
ALTER POLICY "audit_logs_tenant_select" ON "audit_logs" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "audit_logs_tenant_insert" ON "audit_logs" TO app_user WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "audit_logs_tenant_update" ON "audit_logs" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "audit_logs_tenant_delete" ON "audit_logs" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- api_keys
ALTER POLICY "api_keys_tenant_select" ON "api_keys" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "api_keys_tenant_insert" ON "api_keys" TO app_user WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "api_keys_tenant_update" ON "api_keys" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "api_keys_tenant_delete" ON "api_keys" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- ═══════════════════════════════════════════════════════════════════════════
-- ORGANIZATIONS TABLE (self-referential - id = current_org_id)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER POLICY "organizations_self_select" ON "organizations" TO app_user USING (id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "organizations_self_update" ON "organizations" TO app_user USING (id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (id = current_setting('app.current_org_id', true)::uuid);

-- ═══════════════════════════════════════════════════════════════════════════
-- USER_ORGANIZATIONS TABLE (dual policy: tenant + user self)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER POLICY "user_orgs_tenant_select" ON "user_organizations" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "user_orgs_user_self" ON "user_organizations" TO app_user USING (user_id = current_setting('app.current_user_id', true)::uuid);
ALTER POLICY "user_orgs_tenant_insert" ON "user_organizations" TO app_user WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "user_orgs_tenant_update" ON "user_organizations" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "user_orgs_tenant_delete" ON "user_organizations" TO app_user USING (organization_id = current_setting('app.current_org_id', true)::uuid);

-- ═══════════════════════════════════════════════════════════════════════════
-- ATTACHMENTS TABLE (uses org_id instead of organization_id)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER POLICY "attachments_tenant_select" ON "attachments" TO app_user USING (org_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "attachments_tenant_insert" ON "attachments" TO app_user WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "attachments_tenant_update" ON "attachments" TO app_user USING (org_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "attachments_tenant_delete" ON "attachments" TO app_user USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- ═══════════════════════════════════════════════════════════════════════════
-- ORGANIZATION_INVITATIONS TABLE (uses org_id instead of organization_id)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER POLICY "invitations_tenant_select" ON "organization_invitations" TO app_user USING (org_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "invitations_tenant_insert" ON "organization_invitations" TO app_user WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "invitations_tenant_update" ON "organization_invitations" TO app_user USING (org_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);
ALTER POLICY "invitations_tenant_delete" ON "organization_invitations" TO app_user USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- ═══════════════════════════════════════════════════════════════════════════
-- TICKET_MESSAGES TABLE (via subquery through tickets)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER POLICY "messages_tenant_select" ON "ticket_messages" TO app_user USING (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = ticket_messages.ticket_id AND tickets.organization_id = current_setting('app.current_org_id', true)::uuid));
ALTER POLICY "messages_tenant_insert" ON "ticket_messages" TO app_user WITH CHECK (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = ticket_messages.ticket_id AND tickets.organization_id = current_setting('app.current_org_id', true)::uuid));
ALTER POLICY "messages_tenant_update" ON "ticket_messages" TO app_user USING (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = ticket_messages.ticket_id AND tickets.organization_id = current_setting('app.current_org_id', true)::uuid)) WITH CHECK (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = ticket_messages.ticket_id AND tickets.organization_id = current_setting('app.current_org_id', true)::uuid));
ALTER POLICY "messages_tenant_delete" ON "ticket_messages" TO app_user USING (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = ticket_messages.ticket_id AND tickets.organization_id = current_setting('app.current_org_id', true)::uuid));

-- ═══════════════════════════════════════════════════════════════════════════
-- TICKET_ACTIVITIES TABLE (via subquery through tickets)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER POLICY "activities_tenant_select" ON "ticket_activities" TO app_user USING (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = ticket_activities.ticket_id AND tickets.organization_id = current_setting('app.current_org_id', true)::uuid));
ALTER POLICY "activities_tenant_insert" ON "ticket_activities" TO app_user WITH CHECK (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = ticket_activities.ticket_id AND tickets.organization_id = current_setting('app.current_org_id', true)::uuid));
ALTER POLICY "activities_tenant_update" ON "ticket_activities" TO app_user USING (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = ticket_activities.ticket_id AND tickets.organization_id = current_setting('app.current_org_id', true)::uuid)) WITH CHECK (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = ticket_activities.ticket_id AND tickets.organization_id = current_setting('app.current_org_id', true)::uuid));
ALTER POLICY "activities_tenant_delete" ON "ticket_activities" TO app_user USING (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = ticket_activities.ticket_id AND tickets.organization_id = current_setting('app.current_org_id', true)::uuid));
