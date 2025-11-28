import type { Request, Response, NextFunction } from 'express';
import { auth } from './auth.config';
import { db } from '../../db';
import { userOrganizations, type UserRole } from '../../db/schema/users';
import { eq, and } from 'drizzle-orm';
import { UnauthorizedError, ForbiddenError } from '../../middleware/error-handler';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        avatarUrl?: string;
        isActive: boolean;
      };
      session?: {
        id: string;
        userId: string;
        expiresAt: Date;
      };
      organizationId?: string;
      userRole?: UserRole;
    }
  }
}

// Authenticate request using Better Auth session
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Get session from Better Auth
    const session = await auth.api.getSession({
      headers: req.headers as Headers,
    });

    if (!session?.user) {
      throw new UnauthorizedError('Authentication required');
    }

    // Attach user and session to request
    req.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      avatarUrl: session.user.image || undefined,
      isActive: true, // Better Auth manages this
    };

    req.session = {
      id: session.session.id,
      userId: session.user.id,
      expiresAt: session.session.expiresAt,
    };

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      next(error);
    } else {
      next(new UnauthorizedError('Invalid or expired session'));
    }
  }
}

// Require specific role(s) - must be called after authenticate
export function requireRole(...allowedRoles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    const orgId = req.organizationId || req.headers['x-organization-id'];
    if (!orgId || typeof orgId !== 'string') {
      return next(new ForbiddenError('Organization context required'));
    }

    // Get user's role in this organization
    const membership = await db.query.userOrganizations.findFirst({
      where: and(
        eq(userOrganizations.userId, req.user.id),
        eq(userOrganizations.organizationId, orgId)
      ),
    });

    if (!membership) {
      return next(new ForbiddenError('Not a member of this organization'));
    }

    // Check if user's role is allowed
    if (!allowedRoles.includes(membership.role)) {
      return next(
        new ForbiddenError(
          `Access denied. Required role: ${allowedRoles.join(' or ')}`
        )
      );
    }

    // Attach org info to request
    req.organizationId = orgId;
    req.userRole = membership.role;

    next();
  };
}

// Convenience middleware combinations
export const requireAuth = authenticate;
export const requireAgent = [authenticate, requireRole('agent', 'admin', 'owner')];
export const requireAdmin = [authenticate, requireRole('admin', 'owner')];
export const requireOwner = [authenticate, requireRole('owner')];

// Optional auth - doesn't fail if not authenticated
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as Headers,
    });

    if (session?.user) {
      req.user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        avatarUrl: session.user.image || undefined,
        isActive: true,
      };
      req.session = {
        id: session.session.id,
        userId: session.user.id,
        expiresAt: session.session.expiresAt,
      };
    }
  } catch {
    // Ignore auth errors for optional auth
  }

  next();
}
