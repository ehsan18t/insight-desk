import { Router } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.config';
import { authenticate } from './auth.middleware';
import { db } from '../../db';
import { users, userOrganizations, organizations } from '../../db/schema/index';
import { eq } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
import { authRateLimit } from '../../middleware/rate-limit';
import { BadRequestError } from '../../middleware/error-handler';
import { nanoid } from 'nanoid';

const router = Router();
const logger = createLogger('auth');

// ─────────────────────────────────────────────────────────────
// Better Auth handles these routes:
// POST /api/auth/sign-up
// POST /api/auth/sign-in
// POST /api/auth/sign-out
// GET  /api/auth/session
// POST /api/auth/forgot-password
// POST /api/auth/reset-password
// POST /api/auth/verify-email
// GET  /api/auth/callback/:provider (OAuth)
// ─────────────────────────────────────────────────────────────

// Apply rate limiting to auth endpoints
router.use(authRateLimit);

// Mount Better Auth handler
router.all('/*', toNodeHandler(auth));

// ─────────────────────────────────────────────────────────────
// Custom auth endpoints
// ─────────────────────────────────────────────────────────────

// Get current user with organization membership
router.get('/me', authenticate, async (req, res) => {
  const userId = req.user!.id;

  // Get user with their organization memberships
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    with: {
      organizations: {
        with: {
          organization: true,
        },
      },
    },
  });

  if (!user) {
    throw new BadRequestError('User not found');
  }

  res.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
      organizations: user.organizations.map((m: { organization: { id: string; name: string; slug: string }; role: string; joinedAt: Date }) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    },
  });
});

// Register with auto-create organization (for new signups)
router.post('/register-with-org', authRateLimit, async (req, res, next) => {
  try {
    const { email, password, name, organizationName } = req.body;

    if (!email || !password || !name) {
      throw new BadRequestError('Email, password, and name are required');
    }

    // Use Better Auth to create user
    const signUpResult = await auth.api.signUpEmail({
      body: { email, password, name },
    });

    if (!signUpResult || 'error' in signUpResult) {
      throw new BadRequestError('Failed to create account');
    }

    const userId = signUpResult.user.id;

    // Create default organization if name provided
    if (organizationName) {
      const slug = organizationName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') + '-' + nanoid(6);

      const [org] = await db
        .insert(organizations)
        .values({
          name: organizationName,
          slug,
        })
        .returning();

      // Add user as owner
      await db.insert(userOrganizations).values({
        userId,
        organizationId: org.id,
        role: 'owner',
      });

      logger.info(
        { userId, orgId: org.id },
        'User registered with new organization'
      );
    }

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        userId,
      },
    });
  } catch (error) {
    next(error);
  }
});

export const authRouter = router;
