CREATE INDEX "csat_responded_idx" ON "csat_surveys" USING btree ("responded_at");--> statement-breakpoint
CREATE INDEX "invitations_pending_idx" ON "organization_invitations" USING btree ("org_id","email") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "tickets_org_priority_idx" ON "tickets" USING btree ("organization_id","priority");--> statement-breakpoint
CREATE INDEX "tickets_org_created_idx" ON "tickets" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "tickets_sla_active_idx" ON "tickets" USING btree ("sla_deadline","sla_breached") WHERE status IN ('open', 'pending') AND sla_breached = false;