import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { checkDatabaseConnection, closeDatabaseConnection, db } from "./db";
import type { OrganizationSettings, PlanFeatures, PlanLimits } from "./db/schema";
import {
  cannedResponses,
  categories,
  csatSurveys,
  organizationSubscriptions,
  organizations,
  savedFilters,
  slaPolicies,
  subscriptionPlans,
  subscriptionUsage,
  tags,
  ticketMessages,
  tickets,
  userOrganizations,
  users,
} from "./db/schema";
import { logger } from "./lib/logger";
import { auth } from "./modules/auth";

/**
 * Seed script for development environment
 * Creates sample organizations, users, tickets, and messages
 */
async function seed() {
  logger.info("Starting database seed...");

  // Check database connection
  const connected = await checkDatabaseConnection();
  if (!connected) {
    logger.error("Failed to connect to database");
    process.exit(1);
  }

  try {
    // Create organizations
    logger.info("Creating organizations...");

    const acmeSettings: OrganizationSettings = {
      notifications: {
        emailOnNewTicket: true,
        emailOnTicketUpdate: true,
      },
      features: {
        liveChatEnabled: true,
        customerPortalEnabled: true,
      },
    };

    const techSettings: OrganizationSettings = {
      notifications: {
        emailOnNewTicket: false,
        emailOnTicketUpdate: false,
      },
      features: {
        liveChatEnabled: false,
        customerPortalEnabled: true,
      },
    };

    const [acmeOrg] = await db
      .insert(organizations)
      .values({
        id: nanoid(),
        name: "Acme Corporation",
        slug: "acme-corp",
        settings: acmeSettings,
      })
      .returning();

    const [techOrg] = await db
      .insert(organizations)
      .values({
        id: nanoid(),
        name: "TechStart Inc",
        slug: "techstart",
        settings: techSettings,
      })
      .returning();

    logger.info({ acmeOrgId: acmeOrg.id, techOrgId: techOrg.id }, "Organizations created");

    // Create users using Better Auth
    logger.info("Creating users...");

    // Admin user
    const adminEmail = "admin@acme.com";
    await auth.api.signUpEmail({
      body: {
        email: adminEmail,
        password: "Admin123!",
        name: "Alice Admin",
      },
    });

    const [adminUser] = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);

    // Agent user
    const agentEmail = "agent@acme.com";
    await auth.api.signUpEmail({
      body: {
        email: agentEmail,
        password: "Agent123!",
        name: "Bob Agent",
      },
    });

    const [agentUser] = await db.select().from(users).where(eq(users.email, agentEmail)).limit(1);

    // Customer user
    const customerEmail = "customer@example.com";
    await auth.api.signUpEmail({
      body: {
        email: customerEmail,
        password: "Customer123!",
        name: "Charlie Customer",
      },
    });

    const [customerUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, customerEmail))
      .limit(1);

    // Second admin for TechStart
    const techAdminEmail = "admin@techstart.com";
    await auth.api.signUpEmail({
      body: {
        email: techAdminEmail,
        password: "TechAdmin123!",
        name: "Diana Tech",
      },
    });

    const [techAdminUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, techAdminEmail))
      .limit(1);

    logger.info(
      {
        adminId: adminUser.id,
        agentId: agentUser.id,
        customerId: customerUser.id,
        techAdminId: techAdminUser.id,
      },
      "Users created",
    );

    // Create user-organization relationships
    logger.info("Creating user-organization relationships...");

    // Acme Corp users
    await db.insert(userOrganizations).values({
      id: nanoid(),
      userId: adminUser.id,
      organizationId: acmeOrg.id,
      role: "admin",
    });

    await db.insert(userOrganizations).values({
      id: nanoid(),
      userId: agentUser.id,
      organizationId: acmeOrg.id,
      role: "agent",
    });

    await db.insert(userOrganizations).values({
      id: nanoid(),
      userId: customerUser.id,
      organizationId: acmeOrg.id,
      role: "customer",
    });

    // TechStart users
    await db.insert(userOrganizations).values({
      id: nanoid(),
      userId: techAdminUser.id,
      organizationId: techOrg.id,
      role: "admin",
    });

    await db.insert(userOrganizations).values({
      id: nanoid(),
      userId: customerUser.id,
      organizationId: techOrg.id,
      role: "customer",
    });

    logger.info("User-organization relationships created");

    // Create sample tickets
    logger.info("Creating tickets...");

    const [ticket1] = await db
      .insert(tickets)
      .values({
        id: nanoid(),
        organizationId: acmeOrg.id,
        ticketNumber: 1001,
        title: "Cannot login to dashboard",
        description:
          'I am getting an error when trying to login to the admin dashboard. The error says "Invalid credentials" even though I am using the correct password.',
        status: "open",
        priority: "high",
        customerId: customerUser.id,
        assigneeId: agentUser.id,
        tags: ["login", "urgent"],
      })
      .returning();

    await db
      .insert(tickets)
      .values({
        id: nanoid(),
        organizationId: acmeOrg.id,
        ticketNumber: 1002,
        title: "Feature request: Dark mode",
        description:
          "It would be great if the application supported a dark mode option. Many of our users work late at night and a darker theme would reduce eye strain.",
        status: "open",
        priority: "low",
        customerId: customerUser.id,
        tags: ["feature", "ui"],
      })
      .returning();

    const [ticket3] = await db
      .insert(tickets)
      .values({
        id: nanoid(),
        organizationId: acmeOrg.id,
        ticketNumber: 1003,
        title: "Billing question about subscription",
        description:
          "I was charged twice for my monthly subscription. Can you please look into this and refund the extra charge?",
        status: "pending",
        priority: "medium",
        customerId: customerUser.id,
        assigneeId: adminUser.id,
        tags: ["billing", "refund"],
      })
      .returning();

    const [ticket4] = await db
      .insert(tickets)
      .values({
        id: nanoid(),
        organizationId: acmeOrg.id,
        ticketNumber: 1004,
        title: "API rate limiting too strict",
        description:
          "We are hitting rate limits with our integration. Can the limit be increased for our account?",
        status: "resolved",
        priority: "medium",
        customerId: customerUser.id,
        assigneeId: agentUser.id,
        resolvedAt: new Date(),
        tags: ["api", "rate-limit"],
      })
      .returning();

    await db
      .insert(tickets)
      .values({
        id: nanoid(),
        organizationId: techOrg.id,
        ticketNumber: 2001,
        title: "Need help with onboarding",
        description:
          "We just signed up and need help setting up our first project. Can someone guide us through the process?",
        status: "open",
        priority: "high",
        customerId: customerUser.id,
        tags: ["onboarding", "new-customer"],
      })
      .returning();

    logger.info({ ticketCount: 5 }, "Tickets created");

    // Create sample messages
    logger.info("Creating messages...");

    // Messages for ticket 1 (login issue)
    await db.insert(ticketMessages).values({
      id: nanoid(),
      ticketId: ticket1.id,
      senderId: customerUser.id,
      content:
        "This is really urgent, I need to access the dashboard for an important presentation tomorrow!",
    });

    await db.insert(ticketMessages).values({
      id: nanoid(),
      ticketId: ticket1.id,
      senderId: agentUser.id,
      content:
        "Hi Charlie, I understand the urgency. Let me check your account settings. Can you please confirm the email address you're using to login?",
    });

    await db.insert(ticketMessages).values({
      id: nanoid(),
      ticketId: ticket1.id,
      senderId: agentUser.id,
      content:
        "Internal note: Checked the logs, looks like there might be a session issue. Escalating to dev team.",
      type: "internal_note",
    });

    // Messages for ticket 3 (billing)
    await db.insert(ticketMessages).values({
      id: nanoid(),
      ticketId: ticket3.id,
      senderId: adminUser.id,
      content:
        "Hi Charlie, I've reviewed your account and I can see the duplicate charge. I've initiated a refund which should appear in 3-5 business days.",
    });

    await db.insert(ticketMessages).values({
      id: nanoid(),
      ticketId: ticket3.id,
      senderId: customerUser.id,
      content: "Thank you so much for the quick response! I appreciate it.",
    });

    // Messages for ticket 4 (resolved)
    await db.insert(ticketMessages).values({
      id: nanoid(),
      ticketId: ticket4.id,
      senderId: agentUser.id,
      content:
        "Hi Charlie, I've increased the API rate limit for your account from 100 to 500 requests per minute. Let me know if you need further adjustments.",
    });

    await db.insert(ticketMessages).values({
      id: nanoid(),
      ticketId: ticket4.id,
      senderId: customerUser.id,
      content: "Perfect, that should be enough. Thank you!",
    });

    logger.info({ messageCount: 7 }, "Messages created");

    // Create categories
    logger.info("Creating categories...");

    await db.insert(categories).values({
      id: nanoid(),
      organizationId: acmeOrg.id,
      name: "General",
      description: "General inquiries and questions",
      color: "#6B7280",
    });

    const [technicalCategory] = await db
      .insert(categories)
      .values({
        id: nanoid(),
        organizationId: acmeOrg.id,
        name: "Technical Support",
        description: "Technical issues and troubleshooting",
        color: "#3B82F6",
      })
      .returning();

    const [billingCategory] = await db
      .insert(categories)
      .values({
        id: nanoid(),
        organizationId: acmeOrg.id,
        name: "Billing",
        description: "Payment and subscription issues",
        color: "#10B981",
      })
      .returning();

    await db.insert(categories).values({
      id: nanoid(),
      organizationId: acmeOrg.id,
      name: "Feature Request",
      description: "New feature suggestions",
      color: "#8B5CF6",
    });

    // Child category
    await db.insert(categories).values({
      id: nanoid(),
      organizationId: acmeOrg.id,
      name: "Login Issues",
      description: "Authentication and login problems",
      color: "#EF4444",
      parentId: technicalCategory.id,
    });

    await db.insert(categories).values({
      id: nanoid(),
      organizationId: acmeOrg.id,
      name: "API Issues",
      description: "API integration problems",
      color: "#F59E0B",
      parentId: technicalCategory.id,
    });

    logger.info({ categoryCount: 6 }, "Categories created");

    // Create tags
    logger.info("Creating tags...");

    const tagData = [
      { name: "urgent", color: "#EF4444" },
      { name: "billing", color: "#10B981" },
      { name: "feature", color: "#8B5CF6" },
      { name: "bug", color: "#F59E0B" },
      { name: "documentation", color: "#6B7280" },
      { name: "api", color: "#3B82F6" },
      { name: "login", color: "#EC4899" },
      { name: "performance", color: "#14B8A6" },
      { name: "security", color: "#DC2626" },
      { name: "new-customer", color: "#22C55E" },
    ];

    for (const tag of tagData) {
      await db.insert(tags).values({
        id: nanoid(),
        organizationId: acmeOrg.id,
        name: tag.name,
        color: tag.color,
      });
    }

    logger.info({ tagCount: tagData.length }, "Tags created");

    // Create SLA policies
    logger.info("Creating SLA policies...");

    await db.insert(slaPolicies).values([
      {
        id: nanoid(),
        organizationId: acmeOrg.id,
        name: "Urgent SLA",
        priority: "urgent",
        firstResponseTime: 60, // 1 hour
        resolutionTime: 240, // 4 hours
        businessHoursOnly: false,
        isDefault: true,
      },
      {
        id: nanoid(),
        organizationId: acmeOrg.id,
        name: "High Priority SLA",
        priority: "high",
        firstResponseTime: 240, // 4 hours
        resolutionTime: 480, // 8 hours
        businessHoursOnly: true,
        isDefault: true,
      },
      {
        id: nanoid(),
        organizationId: acmeOrg.id,
        name: "Medium Priority SLA",
        priority: "medium",
        firstResponseTime: 480, // 8 hours
        resolutionTime: 1440, // 24 hours
        businessHoursOnly: true,
        isDefault: true,
      },
      {
        id: nanoid(),
        organizationId: acmeOrg.id,
        name: "Low Priority SLA",
        priority: "low",
        firstResponseTime: 1440, // 24 hours
        resolutionTime: 4320, // 72 hours
        businessHoursOnly: true,
        isDefault: true,
      },
    ]);

    logger.info({ slaCount: 4 }, "SLA policies created");

    // Create canned responses
    logger.info("Creating canned responses...");

    await db.insert(cannedResponses).values([
      {
        id: nanoid(),
        organizationId: acmeOrg.id,
        title: "Greeting",
        content:
          "Hi {{customer_name}},\n\nThank you for reaching out to us. I'd be happy to help you with your inquiry.\n\nBest regards,\n{{agent_name}}",
        shortcut: "/greet",
        category: "General",
        createdById: agentUser.id,
      },
      {
        id: nanoid(),
        organizationId: acmeOrg.id,
        title: "Password Reset",
        content:
          "Hi {{customer_name}},\n\nTo reset your password, please follow these steps:\n1. Go to the login page\n2. Click 'Forgot Password'\n3. Enter your email address\n4. Check your inbox for the reset link\n\nThe link will expire in 24 hours. Let me know if you need any further assistance!\n\nBest regards,\n{{agent_name}}",
        shortcut: "/pwreset",
        category: "Technical",
        createdById: agentUser.id,
      },
      {
        id: nanoid(),
        organizationId: acmeOrg.id,
        title: "Refund Processing",
        content:
          "Hi {{customer_name}},\n\nI've processed your refund request. The amount will be credited back to your original payment method within 5-10 business days.\n\nRefund details:\n- Amount: {{refund_amount}}\n- Reference: {{reference_number}}\n\nPlease let me know if you have any questions.\n\nBest regards,\n{{agent_name}}",
        shortcut: "/refund",
        category: "Billing",
        createdById: adminUser.id,
      },
      {
        id: nanoid(),
        organizationId: acmeOrg.id,
        title: "Feature Logged",
        content:
          "Hi {{customer_name}},\n\nThank you for your feature suggestion! I've logged it in our product backlog for review by our development team.\n\nWe evaluate all feature requests based on customer demand and strategic fit. While I can't provide a timeline, we'll notify you if this feature gets prioritized.\n\nBest regards,\n{{agent_name}}",
        shortcut: "/feature",
        category: "Product",
        createdById: agentUser.id,
      },
      {
        id: nanoid(),
        organizationId: acmeOrg.id,
        title: "Closing - Resolved",
        content:
          "Hi {{customer_name}},\n\nI'm glad we could resolve your issue! I'll be closing this ticket now.\n\nIf you have any other questions or if this issue comes up again, please don't hesitate to reach out.\n\nThank you for your patience!\n\nBest regards,\n{{agent_name}}",
        shortcut: "/close",
        category: "General",
        createdById: agentUser.id,
      },
    ]);

    logger.info({ cannedResponseCount: 5 }, "Canned responses created");

    // Create saved filters
    logger.info("Creating saved filters...");

    await db.insert(savedFilters).values([
      {
        id: nanoid(),
        organizationId: acmeOrg.id,
        userId: agentUser.id,
        name: "My Open Tickets",
        description: "Open tickets assigned to me",
        criteria: {
          status: ["open"],
          assigneeId: agentUser.id,
        },
        isDefault: true,
        isShared: false,
        color: "#3B82F6",
        position: 1,
      },
      {
        id: nanoid(),
        organizationId: acmeOrg.id,
        userId: agentUser.id,
        name: "Urgent & High Priority",
        description: "All urgent and high priority tickets",
        criteria: {
          priority: ["urgent", "high"],
        },
        isDefault: false,
        isShared: true,
        color: "#EF4444",
        position: 2,
      },
      {
        id: nanoid(),
        organizationId: acmeOrg.id,
        userId: adminUser.id,
        name: "Unassigned Tickets",
        description: "Tickets waiting for assignment",
        criteria: {
          assigneeId: null,
          status: ["open", "pending"],
        },
        isDefault: false,
        isShared: true,
        color: "#F59E0B",
        position: 3,
      },
      {
        id: nanoid(),
        organizationId: acmeOrg.id,
        userId: adminUser.id,
        name: "This Week's Tickets",
        description: "Tickets created this week",
        criteria: {
          dateRange: {
            field: "createdAt",
            from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
        },
        isDefault: false,
        isShared: true,
        color: "#10B981",
        position: 4,
      },
    ]);

    logger.info({ savedFilterCount: 4 }, "Saved filters created");

    // Create subscription plans
    logger.info("Creating subscription plans...");

    const freeLimits: PlanLimits = {
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

    const freeFeatures: PlanFeatures = {
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

    const [freePlan] = await db
      .insert(subscriptionPlans)
      .values({
        id: nanoid(),
        name: "Free",
        slug: "free",
        description: "Perfect for small teams getting started",
        price: 0,
        billingInterval: "monthly",
        limits: freeLimits,
        features: freeFeatures,
        isDefault: true,
        isVisible: true,
        position: 1,
      })
      .returning();

    const proLimits: PlanLimits = {
      ticketsPerMonth: 500,
      messagesPerMonth: 2000,
      storagePerOrgMB: 1024, // 1 GB
      apiRequestsPerMinute: 100,
      agentsPerOrg: 10,
      customersPerOrg: 1000,
      slaEnabled: true,
      customFieldsEnabled: true,
      reportingEnabled: true,
      apiAccessEnabled: true,
      prioritySupport: false,
    };

    const proFeatures: PlanFeatures = {
      ticketManagement: true,
      emailChannel: true,
      chatWidget: true,
      apiChannel: true,
      cannedResponses: true,
      tags: true,
      categories: true,
      fileAttachments: true,
      csatSurveys: true,
      slaManagement: true,
      customFields: true,
      analytics: true,
      advancedReporting: false,
      dataExport: true,
      customBranding: false,
      singleSignOn: false,
      auditLog: true,
      multipleWorkspaces: false,
    };

    await db.insert(subscriptionPlans).values({
      id: nanoid(),
      name: "Pro",
      slug: "pro",
      description: "For growing teams that need more power",
      price: 2900, // $29.00
      billingInterval: "monthly",
      limits: proLimits,
      features: proFeatures,
      isDefault: false,
      isVisible: true,
      position: 2,
    });

    const businessLimits: PlanLimits = {
      ticketsPerMonth: -1, // Unlimited
      messagesPerMonth: -1,
      storagePerOrgMB: 10240, // 10 GB
      apiRequestsPerMinute: 500,
      agentsPerOrg: -1,
      customersPerOrg: -1,
      slaEnabled: true,
      customFieldsEnabled: true,
      reportingEnabled: true,
      apiAccessEnabled: true,
      prioritySupport: true,
    };

    const businessFeatures: PlanFeatures = {
      ticketManagement: true,
      emailChannel: true,
      chatWidget: true,
      apiChannel: true,
      cannedResponses: true,
      tags: true,
      categories: true,
      fileAttachments: true,
      csatSurveys: true,
      slaManagement: true,
      customFields: true,
      analytics: true,
      advancedReporting: true,
      dataExport: true,
      customBranding: true,
      singleSignOn: true,
      auditLog: true,
      multipleWorkspaces: true,
    };

    await db.insert(subscriptionPlans).values({
      id: nanoid(),
      name: "Business",
      slug: "business",
      description: "For large teams with advanced needs",
      price: 9900, // $99.00
      billingInterval: "monthly",
      limits: businessLimits,
      features: businessFeatures,
      isDefault: false,
      isVisible: true,
      position: 3,
    });

    logger.info({ planCount: 3 }, "Subscription plans created");

    // Create organization subscriptions
    logger.info("Creating organization subscriptions...");

    const periodStart = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await db.insert(organizationSubscriptions).values({
      id: nanoid(),
      organizationId: acmeOrg.id,
      planId: freePlan.id,
      status: "active",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    });

    await db.insert(organizationSubscriptions).values({
      id: nanoid(),
      organizationId: techOrg.id,
      planId: freePlan.id,
      status: "active",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    });

    logger.info({ subscriptionCount: 2 }, "Organization subscriptions created");

    // Create subscription usage
    logger.info("Creating subscription usage records...");

    await db.insert(subscriptionUsage).values({
      id: nanoid(),
      organizationId: acmeOrg.id,
      periodStart,
      periodEnd,
      ticketsCreated: 4,
      messagesCreated: 7,
      storageUsedMB: 5,
      apiRequestsCount: 0,
      ticketsRemaining: 46,
      messagesRemaining: 193,
      storageRemainingMB: 95,
    });

    await db.insert(subscriptionUsage).values({
      id: nanoid(),
      organizationId: techOrg.id,
      periodStart,
      periodEnd,
      ticketsCreated: 1,
      messagesCreated: 0,
      storageUsedMB: 0,
      apiRequestsCount: 0,
      ticketsRemaining: 49,
      messagesRemaining: 200,
      storageRemainingMB: 100,
    });

    logger.info({ usageCount: 2 }, "Subscription usage records created");

    // Create CSAT surveys
    logger.info("Creating CSAT surveys...");

    const surveyExpiry = new Date();
    surveyExpiry.setDate(surveyExpiry.getDate() + 7);

    await db.insert(csatSurveys).values([
      {
        id: nanoid(),
        organizationId: acmeOrg.id,
        ticketId: ticket4.id,
        customerId: customerUser.id,
        agentId: agentUser.id,
        token: nanoid(32),
        rating: 5,
        feedback: "Excellent support! Bob was very helpful and resolved my issue quickly.",
        respondedAt: new Date(),
        expiresAt: surveyExpiry,
      },
      {
        id: nanoid(),
        organizationId: acmeOrg.id,
        ticketId: ticket3.id,
        customerId: customerUser.id,
        agentId: adminUser.id,
        token: nanoid(32),
        rating: 4,
        feedback: "Good response time, issue resolved.",
        respondedAt: new Date(),
        expiresAt: surveyExpiry,
      },
      {
        id: nanoid(),
        organizationId: acmeOrg.id,
        ticketId: ticket1.id,
        customerId: customerUser.id,
        agentId: agentUser.id,
        token: nanoid(32),
        expiresAt: surveyExpiry,
        // Not responded yet
      },
    ]);

    logger.info({ csatCount: 3 }, "CSAT surveys created");

    // Update tickets with categories
    logger.info("Updating tickets with categories...");

    await db
      .update(tickets)
      .set({ categoryId: technicalCategory.id })
      .where(eq(tickets.id, ticket1.id));
    await db
      .update(tickets)
      .set({ categoryId: billingCategory.id })
      .where(eq(tickets.id, ticket3.id));
    await db
      .update(tickets)
      .set({ categoryId: technicalCategory.id })
      .where(eq(tickets.id, ticket4.id));

    logger.info("Tickets updated with categories");

    logger.info("Database seeding completed successfully!");
    logger.info("---");
    logger.info("Test accounts:");
    logger.info("  Admin: admin@acme.com / Admin123!");
    logger.info("  Agent: agent@acme.com / Agent123!");
    logger.info("  Customer: customer@example.com / Customer123!");
    logger.info("  TechStart Admin: admin@techstart.com / TechAdmin123!");
    logger.info("---");
    logger.info("Seeded data summary:");
    logger.info("  Organizations: 2");
    logger.info("  Users: 4");
    logger.info("  Tickets: 5");
    logger.info("  Messages: 7");
    logger.info("  Categories: 6");
    logger.info("  Tags: 10");
    logger.info("  SLA Policies: 4");
    logger.info("  Canned Responses: 5");
    logger.info("  Saved Filters: 4");
    logger.info("  Subscription Plans: 3");
    logger.info("  Subscriptions: 2");
    logger.info("  CSAT Surveys: 3");
  } catch (error) {
    logger.error({ err: error }, "Seed failed");
    throw error;
  } finally {
    await closeDatabaseConnection();
  }
}

// Run seed
seed()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed error:", error);
    process.exit(1);
  });
