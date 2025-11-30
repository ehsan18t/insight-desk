import { and, eq, isNull } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db } from "@/db";
import { type UserRole, apiKeys, userOrganizations, users } from "@/db/schema/index";
import { ForbiddenError, UnauthorizedError } from "@/middleware/error-handler";
import { hashApiKey } from "@/modules/api-keys";
import { auth } from "./auth.config";

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
      // API key context
      apiKey?: {
        id: string;
        organizationId: string;
        scopes: string[];
      };
    }
  }
}

// Authenticate request using Better Auth session or API key
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    // Check for API key authentication first
    const apiKeyHeader = req.headers["x-api-key"];
    if (apiKeyHeader && typeof apiKeyHeader === "string") {
      return await authenticateWithApiKey(req, next, apiKeyHeader);
    }

    // Fall back to session-based authentication
    return await authenticateWithSession(req, next);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      next(error);
    } else {
      next(new UnauthorizedError("Invalid or expired credentials"));
    }
  }
}

// Authenticate using API key
async function authenticateWithApiKey(req: Request, next: NextFunction, apiKey: string) {
  const keyHash = hashApiKey(apiKey);

  // Find the API key in database
  const key = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true), isNull(apiKeys.revokedAt)),
  });

  if (!key) {
    throw new UnauthorizedError("Invalid API key");
  }

  // Check if key has expired
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
    throw new UnauthorizedError("API key has expired");
  }

  // Get the user who created the key (for context)
  const user = await db.query.users.findFirst({
    where: eq(users.id, key.createdById),
  });

  if (!user || !user.isActive) {
    throw new UnauthorizedError("API key owner is inactive");
  }

  // Update last used timestamp (fire and forget for performance)
  db.update(apiKeys)
    .set({
      lastUsedAt: new Date(),
      lastUsedIp: req.ip || req.socket.remoteAddress,
      usageCount: key.usageCount + 1,
    })
    .where(eq(apiKeys.id, key.id))
    .execute()
    .catch(() => {
      // Silently ignore update failures to not block the request
    });

  // Attach user and API key context to request
  req.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl || undefined,
    isActive: user.isActive,
  };

  req.apiKey = {
    id: key.id,
    organizationId: key.organizationId,
    scopes: key.scopes || ["read"],
  };

  // Auto-set organization ID from API key
  req.organizationId = key.organizationId;

  next();
}

// Authenticate using session cookie
async function authenticateWithSession(req: Request, next: NextFunction) {
  // Get session from Better Auth
  const session = await auth.api.getSession({
    headers: req.headers as unknown as Headers,
  });

  if (!session?.user) {
    throw new UnauthorizedError("Authentication required");
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
}

// Require specific role(s) - must be called after authenticate
export function requireRole(...allowedRoles: UserRole[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }

    const orgId = req.organizationId || req.headers["x-organization-id"];
    if (!orgId || typeof orgId !== "string") {
      return next(new ForbiddenError("Organization context required"));
    }

    // Get user's role in this organization
    const membership = await db.query.userOrganizations.findFirst({
      where: and(
        eq(userOrganizations.userId, req.user.id),
        eq(userOrganizations.organizationId, orgId),
      ),
    });

    if (!membership) {
      return next(new ForbiddenError("Not a member of this organization"));
    }

    // Check if user's role is allowed
    if (!allowedRoles.includes(membership.role)) {
      return next(new ForbiddenError(`Access denied. Required role: ${allowedRoles.join(" or ")}`));
    }

    // Attach org info to request
    req.organizationId = orgId;
    req.userRole = membership.role;

    next();
  };
}

// Convenience middleware combinations
export const requireAuth = authenticate;
export const requireAgent = [authenticate, requireRole("agent", "admin", "owner")];
export const requireAdmin = [authenticate, requireRole("admin", "owner")];
export const requireOwner = [authenticate, requireRole("owner")];

// Optional auth - doesn't fail if not authenticated
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as unknown as Headers,
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
