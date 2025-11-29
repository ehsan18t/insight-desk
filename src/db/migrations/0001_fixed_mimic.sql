CREATE ROLE "app_user";--> statement-breakpoint
CREATE ROLE "service_role";--> statement-breakpoint
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "canned_responses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "csat_surveys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "saved_filters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sla_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscription_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ticket_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ticket_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "attachments_tenant_select" ON "attachments" AS PERMISSIVE FOR SELECT TO "app_user" USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "attachments_tenant_insert" ON "attachments" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "attachments_tenant_update" ON "attachments" AS PERMISSIVE FOR UPDATE TO "app_user" USING (org_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "attachments_tenant_delete" ON "attachments" AS PERMISSIVE FOR DELETE TO "app_user" USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "audit_logs_tenant_select" ON "audit_logs" AS PERMISSIVE FOR SELECT TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "audit_logs_tenant_insert" ON "audit_logs" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "audit_logs_tenant_update" ON "audit_logs" AS PERMISSIVE FOR UPDATE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "audit_logs_tenant_delete" ON "audit_logs" AS PERMISSIVE FOR DELETE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "canned_responses_tenant_select" ON "canned_responses" AS PERMISSIVE FOR SELECT TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "canned_responses_tenant_insert" ON "canned_responses" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "canned_responses_tenant_update" ON "canned_responses" AS PERMISSIVE FOR UPDATE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "canned_responses_tenant_delete" ON "canned_responses" AS PERMISSIVE FOR DELETE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "categories_tenant_select" ON "categories" AS PERMISSIVE FOR SELECT TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "categories_tenant_insert" ON "categories" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "categories_tenant_update" ON "categories" AS PERMISSIVE FOR UPDATE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "categories_tenant_delete" ON "categories" AS PERMISSIVE FOR DELETE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "csat_surveys_tenant_select" ON "csat_surveys" AS PERMISSIVE FOR SELECT TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "csat_surveys_tenant_insert" ON "csat_surveys" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "csat_surveys_tenant_update" ON "csat_surveys" AS PERMISSIVE FOR UPDATE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "csat_surveys_tenant_delete" ON "csat_surveys" AS PERMISSIVE FOR DELETE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "invitations_tenant_select" ON "organization_invitations" AS PERMISSIVE FOR SELECT TO "app_user" USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "invitations_tenant_insert" ON "organization_invitations" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "invitations_tenant_update" ON "organization_invitations" AS PERMISSIVE FOR UPDATE TO "app_user" USING (org_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "invitations_tenant_delete" ON "organization_invitations" AS PERMISSIVE FOR DELETE TO "app_user" USING (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "organization_subscriptions_tenant_select" ON "organization_subscriptions" AS PERMISSIVE FOR SELECT TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "organization_subscriptions_tenant_insert" ON "organization_subscriptions" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "organization_subscriptions_tenant_update" ON "organization_subscriptions" AS PERMISSIVE FOR UPDATE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "organization_subscriptions_tenant_delete" ON "organization_subscriptions" AS PERMISSIVE FOR DELETE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "organizations_self_select" ON "organizations" AS PERMISSIVE FOR SELECT TO "app_user" USING (id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "organizations_self_update" ON "organizations" AS PERMISSIVE FOR UPDATE TO "app_user" USING (id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "saved_filters_tenant_select" ON "saved_filters" AS PERMISSIVE FOR SELECT TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "saved_filters_tenant_insert" ON "saved_filters" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "saved_filters_tenant_update" ON "saved_filters" AS PERMISSIVE FOR UPDATE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "saved_filters_tenant_delete" ON "saved_filters" AS PERMISSIVE FOR DELETE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "sla_policies_tenant_select" ON "sla_policies" AS PERMISSIVE FOR SELECT TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "sla_policies_tenant_insert" ON "sla_policies" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "sla_policies_tenant_update" ON "sla_policies" AS PERMISSIVE FOR UPDATE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "sla_policies_tenant_delete" ON "sla_policies" AS PERMISSIVE FOR DELETE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "subscription_usage_tenant_select" ON "subscription_usage" AS PERMISSIVE FOR SELECT TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "subscription_usage_tenant_insert" ON "subscription_usage" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "subscription_usage_tenant_update" ON "subscription_usage" AS PERMISSIVE FOR UPDATE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "subscription_usage_tenant_delete" ON "subscription_usage" AS PERMISSIVE FOR DELETE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tags_tenant_select" ON "tags" AS PERMISSIVE FOR SELECT TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tags_tenant_insert" ON "tags" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tags_tenant_update" ON "tags" AS PERMISSIVE FOR UPDATE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tags_tenant_delete" ON "tags" AS PERMISSIVE FOR DELETE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "activities_tenant_select" ON "ticket_activities" AS PERMISSIVE FOR SELECT TO "app_user" USING (EXISTS (
    SELECT 1 FROM tickets 
    WHERE tickets.id = ticket_activities.ticket_id 
    AND tickets.organization_id = current_setting('app.current_org_id', true)::uuid
  ));--> statement-breakpoint
CREATE POLICY "activities_tenant_insert" ON "ticket_activities" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (EXISTS (
    SELECT 1 FROM tickets 
    WHERE tickets.id = ticket_activities.ticket_id 
    AND tickets.organization_id = current_setting('app.current_org_id', true)::uuid
  ));--> statement-breakpoint
CREATE POLICY "activities_tenant_update" ON "ticket_activities" AS PERMISSIVE FOR UPDATE TO "app_user" USING (EXISTS (
    SELECT 1 FROM tickets 
    WHERE tickets.id = ticket_activities.ticket_id 
    AND tickets.organization_id = current_setting('app.current_org_id', true)::uuid
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM tickets 
    WHERE tickets.id = ticket_activities.ticket_id 
    AND tickets.organization_id = current_setting('app.current_org_id', true)::uuid
  ));--> statement-breakpoint
CREATE POLICY "activities_tenant_delete" ON "ticket_activities" AS PERMISSIVE FOR DELETE TO "app_user" USING (EXISTS (
    SELECT 1 FROM tickets 
    WHERE tickets.id = ticket_activities.ticket_id 
    AND tickets.organization_id = current_setting('app.current_org_id', true)::uuid
  ));--> statement-breakpoint
CREATE POLICY "messages_tenant_select" ON "ticket_messages" AS PERMISSIVE FOR SELECT TO "app_user" USING (EXISTS (
    SELECT 1 FROM tickets 
    WHERE tickets.id = ticket_messages.ticket_id 
    AND tickets.organization_id = current_setting('app.current_org_id', true)::uuid
  ));--> statement-breakpoint
CREATE POLICY "messages_tenant_insert" ON "ticket_messages" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (EXISTS (
    SELECT 1 FROM tickets 
    WHERE tickets.id = ticket_messages.ticket_id 
    AND tickets.organization_id = current_setting('app.current_org_id', true)::uuid
  ));--> statement-breakpoint
CREATE POLICY "messages_tenant_update" ON "ticket_messages" AS PERMISSIVE FOR UPDATE TO "app_user" USING (EXISTS (
    SELECT 1 FROM tickets 
    WHERE tickets.id = ticket_messages.ticket_id 
    AND tickets.organization_id = current_setting('app.current_org_id', true)::uuid
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM tickets 
    WHERE tickets.id = ticket_messages.ticket_id 
    AND tickets.organization_id = current_setting('app.current_org_id', true)::uuid
  ));--> statement-breakpoint
CREATE POLICY "messages_tenant_delete" ON "ticket_messages" AS PERMISSIVE FOR DELETE TO "app_user" USING (EXISTS (
    SELECT 1 FROM tickets 
    WHERE tickets.id = ticket_messages.ticket_id 
    AND tickets.organization_id = current_setting('app.current_org_id', true)::uuid
  ));--> statement-breakpoint
CREATE POLICY "tickets_tenant_select" ON "tickets" AS PERMISSIVE FOR SELECT TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tickets_tenant_insert" ON "tickets" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tickets_tenant_update" ON "tickets" AS PERMISSIVE FOR UPDATE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tickets_tenant_delete" ON "tickets" AS PERMISSIVE FOR DELETE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "user_orgs_tenant_select" ON "user_organizations" AS PERMISSIVE FOR SELECT TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "user_orgs_user_self" ON "user_organizations" AS PERMISSIVE FOR SELECT TO "app_user" USING (user_id = current_setting('app.current_user_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "user_orgs_tenant_insert" ON "user_organizations" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "user_orgs_tenant_update" ON "user_organizations" AS PERMISSIVE FOR UPDATE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "user_orgs_tenant_delete" ON "user_organizations" AS PERMISSIVE FOR DELETE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);