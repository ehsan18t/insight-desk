import { db, checkDatabaseConnection, closeDatabaseConnection } from './db';
import type { OrganizationSettings } from './db/schema';
import {
  organizations,
  users,
  userOrganizations,
  tickets,
  ticketMessages,
} from './db/schema';
import { eq } from 'drizzle-orm';
import { auth } from './modules/auth';
import { logger } from './lib/logger';
import { nanoid } from 'nanoid';

/**
 * Seed script for development environment
 * Creates sample organizations, users, tickets, and messages
 */
async function seed() {
  logger.info('Starting database seed...');

  // Check database connection
  const connected = await checkDatabaseConnection();
  if (!connected) {
    logger.error('Failed to connect to database');
    process.exit(1);
  }

  try {
    // Create organizations
    logger.info('Creating organizations...');
    
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

    const [acmeOrg] = await db.insert(organizations).values({
      id: nanoid(),
      name: 'Acme Corporation',
      slug: 'acme-corp',
      settings: acmeSettings,
    }).returning();
    
    const [techOrg] = await db.insert(organizations).values({
      id: nanoid(),
      name: 'TechStart Inc',
      slug: 'techstart',
      settings: techSettings,
    }).returning();

    logger.info({ acmeOrgId: acmeOrg.id, techOrgId: techOrg.id }, 'Organizations created');

    // Create users using Better Auth
    logger.info('Creating users...');

    // Admin user
    const adminEmail = 'admin@acme.com';
    await auth.api.signUpEmail({
      body: {
        email: adminEmail,
        password: 'Admin123!',
        name: 'Alice Admin',
      },
    });

    const [adminUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, adminEmail))
      .limit(1);

    // Agent user
    const agentEmail = 'agent@acme.com';
    await auth.api.signUpEmail({
      body: {
        email: agentEmail,
        password: 'Agent123!',
        name: 'Bob Agent',
      },
    });

    const [agentUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, agentEmail))
      .limit(1);

    // Customer user
    const customerEmail = 'customer@example.com';
    await auth.api.signUpEmail({
      body: {
        email: customerEmail,
        password: 'Customer123!',
        name: 'Charlie Customer',
      },
    });

    const [customerUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, customerEmail))
      .limit(1);

    // Second admin for TechStart
    const techAdminEmail = 'admin@techstart.com';
    await auth.api.signUpEmail({
      body: {
        email: techAdminEmail,
        password: 'TechAdmin123!',
        name: 'Diana Tech',
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
      'Users created'
    );

    // Create user-organization relationships
    logger.info('Creating user-organization relationships...');
    
    // Acme Corp users
    await db.insert(userOrganizations).values({
      id: nanoid(),
      userId: adminUser.id,
      organizationId: acmeOrg.id,
      role: 'admin',
    });
    
    await db.insert(userOrganizations).values({
      id: nanoid(),
      userId: agentUser.id,
      organizationId: acmeOrg.id,
      role: 'agent',
    });
    
    await db.insert(userOrganizations).values({
      id: nanoid(),
      userId: customerUser.id,
      organizationId: acmeOrg.id,
      role: 'customer',
    });
    
    // TechStart users
    await db.insert(userOrganizations).values({
      id: nanoid(),
      userId: techAdminUser.id,
      organizationId: techOrg.id,
      role: 'admin',
    });
    
    await db.insert(userOrganizations).values({
      id: nanoid(),
      userId: customerUser.id,
      organizationId: techOrg.id,
      role: 'customer',
    });

    logger.info('User-organization relationships created');

    // Create sample tickets
    logger.info('Creating tickets...');
    
    const [ticket1] = await db.insert(tickets).values({
      id: nanoid(),
      organizationId: acmeOrg.id,
      ticketNumber: 1001,
      title: 'Cannot login to dashboard',
      description: 'I am getting an error when trying to login to the admin dashboard. The error says "Invalid credentials" even though I am using the correct password.',
      status: 'open',
      priority: 'high',
      customerId: customerUser.id,
      assigneeId: agentUser.id,
      tags: ['login', 'urgent'],
    }).returning();
    
    await db.insert(tickets).values({
      id: nanoid(),
      organizationId: acmeOrg.id,
      ticketNumber: 1002,
      title: 'Feature request: Dark mode',
      description: 'It would be great if the application supported a dark mode option. Many of our users work late at night and a darker theme would reduce eye strain.',
      status: 'open',
      priority: 'low',
      customerId: customerUser.id,
      tags: ['feature', 'ui'],
    }).returning();
    
    const [ticket3] = await db.insert(tickets).values({
      id: nanoid(),
      organizationId: acmeOrg.id,
      ticketNumber: 1003,
      title: 'Billing question about subscription',
      description: 'I was charged twice for my monthly subscription. Can you please look into this and refund the extra charge?',
      status: 'pending',
      priority: 'medium',
      customerId: customerUser.id,
      assigneeId: adminUser.id,
      tags: ['billing', 'refund'],
    }).returning();
    
    const [ticket4] = await db.insert(tickets).values({
      id: nanoid(),
      organizationId: acmeOrg.id,
      ticketNumber: 1004,
      title: 'API rate limiting too strict',
      description: 'We are hitting rate limits with our integration. Can the limit be increased for our account?',
      status: 'resolved',
      priority: 'medium',
      customerId: customerUser.id,
      assigneeId: agentUser.id,
      resolvedAt: new Date(),
      tags: ['api', 'rate-limit'],
    }).returning();
    
    await db.insert(tickets).values({
      id: nanoid(),
      organizationId: techOrg.id,
      ticketNumber: 2001,
      title: 'Need help with onboarding',
      description: 'We just signed up and need help setting up our first project. Can someone guide us through the process?',
      status: 'open',
      priority: 'high',
      customerId: customerUser.id,
      tags: ['onboarding', 'new-customer'],
    }).returning();

    logger.info({ ticketCount: 5 }, 'Tickets created');

    // Create sample messages
    logger.info('Creating messages...');
    
    // Messages for ticket 1 (login issue)
    await db.insert(ticketMessages).values({
      id: nanoid(),
      ticketId: ticket1.id,
      senderId: customerUser.id,
      content: 'This is really urgent, I need to access the dashboard for an important presentation tomorrow!',
    });
    
    await db.insert(ticketMessages).values({
      id: nanoid(),
      ticketId: ticket1.id,
      senderId: agentUser.id,
      content: "Hi Charlie, I understand the urgency. Let me check your account settings. Can you please confirm the email address you're using to login?",
    });
    
    await db.insert(ticketMessages).values({
      id: nanoid(),
      ticketId: ticket1.id,
      senderId: agentUser.id,
      content: 'Internal note: Checked the logs, looks like there might be a session issue. Escalating to dev team.',
      type: 'internal_note',
    });
    
    // Messages for ticket 3 (billing)
    await db.insert(ticketMessages).values({
      id: nanoid(),
      ticketId: ticket3.id,
      senderId: adminUser.id,
      content: "Hi Charlie, I've reviewed your account and I can see the duplicate charge. I've initiated a refund which should appear in 3-5 business days.",
    });
    
    await db.insert(ticketMessages).values({
      id: nanoid(),
      ticketId: ticket3.id,
      senderId: customerUser.id,
      content: 'Thank you so much for the quick response! I appreciate it.',
    });
    
    // Messages for ticket 4 (resolved)
    await db.insert(ticketMessages).values({
      id: nanoid(),
      ticketId: ticket4.id,
      senderId: agentUser.id,
      content: "Hi Charlie, I've increased the API rate limit for your account from 100 to 500 requests per minute. Let me know if you need further adjustments.",
    });
    
    await db.insert(ticketMessages).values({
      id: nanoid(),
      ticketId: ticket4.id,
      senderId: customerUser.id,
      content: 'Perfect, that should be enough. Thank you!',
    });

    logger.info({ messageCount: 7 }, 'Messages created');

    logger.info('Database seeding completed successfully!');
    logger.info('---');
    logger.info('Test accounts:');
    logger.info('  Admin: admin@acme.com / Admin123!');
    logger.info('  Agent: agent@acme.com / Agent123!');
    logger.info('  Customer: customer@example.com / Customer123!');
    logger.info('  TechStart Admin: admin@techstart.com / TechAdmin123!');
    logger.info('---');
  } catch (error) {
    logger.error({ err: error }, 'Seed failed');
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
    console.error('Seed error:', error);
    process.exit(1);
  });
