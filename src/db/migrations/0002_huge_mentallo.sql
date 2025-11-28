CREATE TYPE "public"."audit_action" AS ENUM('user_login', 'user_logout', 'user_password_changed', 'user_email_changed', 'organization_created', 'organization_updated', 'organization_deleted', 'subscription_created', 'subscription_upgraded', 'subscription_downgraded', 'subscription_canceled', 'subscription_renewed', 'user_invited', 'user_removed', 'user_role_changed', 'settings_updated', 'sla_policy_created', 'sla_policy_updated', 'sla_policy_deleted', 'data_exported', 'api_key_created', 'api_key_revoked');--> statement-breakpoint
CREATE TYPE "public"."billing_interval" AS ENUM('monthly', 'yearly', 'lifetime');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'trialing', 'past_due', 'canceled', 'expired');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"action" "audit_action" NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"ip_address" text,
	"user_agent" text,
	"previous_value" jsonb,
	"new_value" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "csat_surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"agent_id" uuid,
	"token" text NOT NULL,
	"rating" integer,
	"feedback" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "csat_surveys_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "organization_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"external_subscription_id" text,
	"external_customer_id" text,
	"previous_plan_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_subscriptions_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "saved_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"criteria" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"sort_by" text DEFAULT 'createdAt' NOT NULL,
	"sort_order" text DEFAULT 'desc' NOT NULL,
	"color" text,
	"icon" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"price" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"billing_interval" "billing_interval" DEFAULT 'monthly' NOT NULL,
	"limits" jsonb NOT NULL,
	"features" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"alerts_enabled" boolean DEFAULT true NOT NULL,
	"alert_threshold" integer DEFAULT 90 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"stripe_product_id" text,
	"stripe_price_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscription_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"tickets_created" integer DEFAULT 0 NOT NULL,
	"messages_created" integer DEFAULT 0 NOT NULL,
	"storage_used_mb" integer DEFAULT 0 NOT NULL,
	"api_requests_count" integer DEFAULT 0 NOT NULL,
	"tickets_remaining" integer DEFAULT 0 NOT NULL,
	"messages_remaining" integer DEFAULT 0 NOT NULL,
	"storage_remaining_mb" integer DEFAULT 0 NOT NULL,
	"ticket_alert_sent_at" timestamp with time zone,
	"message_alert_sent_at" timestamp with time zone,
	"storage_alert_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_invitations" ALTER COLUMN "role" SET DEFAULT 'agent';--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csat_surveys" ADD CONSTRAINT "csat_surveys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csat_surveys" ADD CONSTRAINT "csat_surveys_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csat_surveys" ADD CONSTRAINT "csat_surveys_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csat_surveys" ADD CONSTRAINT "csat_surveys_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_previous_plan_id_subscription_plans_id_fk" FOREIGN KEY ("previous_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_usage" ADD CONSTRAINT "subscription_usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_org_idx" ON "audit_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_resource_idx" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "audit_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "csat_org_idx" ON "csat_surveys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "csat_ticket_idx" ON "csat_surveys" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "csat_customer_idx" ON "csat_surveys" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "csat_agent_idx" ON "csat_surveys" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "csat_token_idx" ON "csat_surveys" USING btree ("token");--> statement-breakpoint
CREATE INDEX "csat_rating_idx" ON "csat_surveys" USING btree ("rating");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_org_idx" ON "organization_subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "subscription_plan_idx" ON "organization_subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "subscription_status_idx" ON "organization_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscription_period_end_idx" ON "organization_subscriptions" USING btree ("current_period_end");--> statement-breakpoint
CREATE INDEX "saved_filters_org_idx" ON "saved_filters" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "saved_filters_user_idx" ON "saved_filters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_filters_shared_idx" ON "saved_filters" USING btree ("is_shared");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_slug_idx" ON "subscription_plans" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "plan_is_active_idx" ON "subscription_plans" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "plan_is_default_idx" ON "subscription_plans" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "plan_is_visible_idx" ON "subscription_plans" USING btree ("is_visible");--> statement-breakpoint
CREATE INDEX "plan_position_idx" ON "subscription_plans" USING btree ("position");--> statement-breakpoint
CREATE INDEX "usage_org_idx" ON "subscription_usage" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "usage_period_idx" ON "subscription_usage" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_org_period_idx" ON "subscription_usage" USING btree ("organization_id","period_start","period_end");