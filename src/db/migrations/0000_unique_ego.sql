CREATE TYPE "public"."activity_action" AS ENUM('created', 'status_changed', 'priority_changed', 'assigned', 'unassigned', 'tagged', 'message_added', 'resolved', 'closed', 'reopened', 'sla_breached', 'merged', 'split', 'category_changed', 'channel_changed');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('user_login', 'user_logout', 'user_password_changed', 'user_email_changed', 'two_factor_enabled', 'two_factor_disabled', 'organization_created', 'organization_updated', 'organization_deleted', 'subscription_created', 'subscription_upgraded', 'subscription_downgraded', 'subscription_canceled', 'subscription_renewed', 'user_invited', 'user_removed', 'user_role_changed', 'settings_updated', 'sla_policy_created', 'sla_policy_updated', 'sla_policy_deleted', 'data_exported', 'data_imported', 'bulk_update', 'api_key_created', 'api_key_revoked');--> statement-breakpoint
CREATE TYPE "public"."billing_interval" AS ENUM('monthly', 'yearly', 'lifetime');--> statement-breakpoint
CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('reply', 'internal_note', 'system');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'trialing', 'past_due', 'canceled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."ticket_channel" AS ENUM('web', 'email', 'chat', 'api', 'phone', 'sms');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'pending', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('customer', 'agent', 'admin', 'owner');--> statement-breakpoint
CREATE ROLE "app_user";--> statement-breakpoint
CREATE ROLE "service_role";--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] DEFAULT ARRAY['read']::text[],
	"last_used_at" timestamp with time zone,
	"last_used_ip" text,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"ticket_id" uuid,
	"message_id" uuid,
	"uploaded_by_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"path" text NOT NULL,
	"folder" text DEFAULT 'general' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
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
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "canned_responses" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"shortcut" text,
	"category" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canned_responses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#6B7280',
	"parent_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "csat_surveys" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
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
ALTER TABLE "csat_surveys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organization_invitations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'agent' NOT NULL,
	"token" text NOT NULL,
	"status" "invite_status" DEFAULT 'pending' NOT NULL,
	"invited_by_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "organization_invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organization_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
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
ALTER TABLE "organization_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"plan" text DEFAULT 'free' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "saved_filters" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
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
ALTER TABLE "saved_filters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sla_policies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"priority" "ticket_priority" NOT NULL,
	"first_response_time" integer NOT NULL,
	"resolution_time" integer NOT NULL,
	"business_hours_only" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sla_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
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
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
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
ALTER TABLE "subscription_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#3B82F6',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ticket_activities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"user_id" uuid,
	"action" "activity_action" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"sender_id" uuid,
	"content" text NOT NULL,
	"type" "message_type" DEFAULT 'reply' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"email_message_id" text,
	"is_edited" boolean DEFAULT false NOT NULL,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"ticket_number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'medium' NOT NULL,
	"channel" "ticket_channel" DEFAULT 'web' NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[],
	"category_id" uuid,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"assignee_id" uuid,
	"sla_deadline" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"sla_breached" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_organizations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" "user_role" DEFAULT 'customer' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"email_verified_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_revoked_by_id_users_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_ticket_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ticket_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canned_responses" ADD CONSTRAINT "canned_responses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canned_responses" ADD CONSTRAINT "canned_responses_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csat_surveys" ADD CONSTRAINT "csat_surveys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csat_surveys" ADD CONSTRAINT "csat_surveys_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csat_surveys" ADD CONSTRAINT "csat_surveys_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csat_surveys" ADD CONSTRAINT "csat_surveys_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_accepted_by_id_users_id_fk" FOREIGN KEY ("accepted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_previous_plan_id_subscription_plans_id_fk" FOREIGN KEY ("previous_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_usage" ADD CONSTRAINT "subscription_usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_activities" ADD CONSTRAINT "ticket_activities_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_activities" ADD CONSTRAINT "ticket_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_organizations" ADD CONSTRAINT "user_organizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_organizations" ADD CONSTRAINT "user_organizations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "accounts_provider_idx" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "api_keys_org_idx" ON "api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "api_keys_prefix_idx" ON "api_keys" USING btree ("prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_active_idx" ON "api_keys" USING btree ("organization_id","is_active");--> statement-breakpoint
CREATE INDEX "attachments_org_idx" ON "attachments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "attachments_ticket_idx" ON "attachments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "attachments_message_idx" ON "attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "attachments_uploaded_by_idx" ON "attachments" USING btree ("uploaded_by_id");--> statement-breakpoint
CREATE INDEX "attachments_folder_idx" ON "attachments" USING btree ("org_id","folder");--> statement-breakpoint
CREATE INDEX "audit_org_idx" ON "audit_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_resource_idx" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "audit_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_org_action_idx" ON "audit_logs" USING btree ("organization_id","action");--> statement-breakpoint
CREATE INDEX "canned_org_idx" ON "canned_responses" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "canned_shortcut_idx" ON "canned_responses" USING btree ("organization_id","shortcut");--> statement-breakpoint
CREATE INDEX "categories_org_idx" ON "categories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_org_name_unique" ON "categories" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "csat_org_idx" ON "csat_surveys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "csat_ticket_idx" ON "csat_surveys" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "csat_customer_idx" ON "csat_surveys" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "csat_agent_idx" ON "csat_surveys" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "csat_token_idx" ON "csat_surveys" USING btree ("token");--> statement-breakpoint
CREATE INDEX "csat_rating_idx" ON "csat_surveys" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "csat_responded_idx" ON "csat_surveys" USING btree ("responded_at");--> statement-breakpoint
CREATE INDEX "invitations_org_idx" ON "organization_invitations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "organization_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "invitations_token_idx" ON "organization_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "invitations_status_idx" ON "organization_invitations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invitations_pending_idx" ON "organization_invitations" USING btree ("org_id","email") WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_org_idx" ON "organization_subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "subscription_plan_idx" ON "organization_subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "subscription_status_idx" ON "organization_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscription_period_end_idx" ON "organization_subscriptions" USING btree ("current_period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "org_slug_idx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "saved_filters_org_idx" ON "saved_filters" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "saved_filters_user_idx" ON "saved_filters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_filters_shared_idx" ON "saved_filters" USING btree ("is_shared");--> statement-breakpoint
CREATE INDEX "saved_filters_default_idx" ON "saved_filters" USING btree ("organization_id","user_id") WHERE is_default = true;--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_token_idx" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sla_org_priority_idx" ON "sla_policies" USING btree ("organization_id","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_slug_idx" ON "subscription_plans" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "plan_is_active_idx" ON "subscription_plans" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "plan_is_default_idx" ON "subscription_plans" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "plan_is_visible_idx" ON "subscription_plans" USING btree ("is_visible");--> statement-breakpoint
CREATE INDEX "plan_position_idx" ON "subscription_plans" USING btree ("position");--> statement-breakpoint
CREATE INDEX "usage_org_idx" ON "subscription_usage" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "usage_period_idx" ON "subscription_usage" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_org_period_idx" ON "subscription_usage" USING btree ("organization_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "tags_org_idx" ON "tags" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_org_name_unique" ON "tags" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "activities_ticket_idx" ON "ticket_activities" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_ticket_created_idx" ON "ticket_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_email_id_idx" ON "ticket_messages" USING btree ("email_message_id");--> statement-breakpoint
CREATE INDEX "tickets_org_status_idx" ON "tickets" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "tickets_customer_idx" ON "tickets" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "tickets_assignee_idx" ON "tickets" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "tickets_sla_deadline_idx" ON "tickets" USING btree ("sla_deadline");--> statement-breakpoint
CREATE INDEX "tickets_org_number_idx" ON "tickets" USING btree ("organization_id","ticket_number");--> statement-breakpoint
CREATE INDEX "tickets_search_idx" ON "tickets" USING gin (to_tsvector('english', "title" || ' ' || "description"));--> statement-breakpoint
CREATE INDEX "tickets_org_priority_idx" ON "tickets" USING btree ("organization_id","priority");--> statement-breakpoint
CREATE INDEX "tickets_org_created_idx" ON "tickets" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "tickets_sla_active_idx" ON "tickets" USING btree ("sla_deadline","sla_breached") WHERE status IN ('open', 'pending') AND sla_breached = false;--> statement-breakpoint
CREATE UNIQUE INDEX "user_org_unique" ON "user_organizations" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "user_orgs_user_idx" ON "user_organizations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_orgs_org_idx" ON "user_organizations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE POLICY "api_keys_tenant_select" ON "api_keys" AS PERMISSIVE FOR SELECT TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "api_keys_tenant_insert" ON "api_keys" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "api_keys_tenant_update" ON "api_keys" AS PERMISSIVE FOR UPDATE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "api_keys_tenant_delete" ON "api_keys" AS PERMISSIVE FOR DELETE TO "app_user" USING (organization_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
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