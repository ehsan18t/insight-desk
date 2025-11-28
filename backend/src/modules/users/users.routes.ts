import { type NextFunction, type Request, type Response, Router } from "express";
import { ForbiddenError } from "../../middleware/error-handler";
import { validateRequest } from "../../middleware/validate";
import { authenticate, requireRole } from "../auth/auth.middleware";
import {
  updateProfileSchema,
  updateUserRoleSchema,
  userIdParamSchema,
  userQuerySchema,
} from "./users.schema";
import { usersService } from "./users.service";

export const usersRouter = Router();

// All routes require authentication
usersRouter.use(authenticate);

/**
 * GET /api/users
 * List all users in the organization (agents and admins only)
 */
usersRouter.get(
  "/",
  requireRole("agent", "admin", "owner"),
  validateRequest({ query: userQuerySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }
      const result = await usersService.listByOrganization(req.organizationId, req.query as any);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/users/agents
 * Get available agents for ticket assignment
 */
usersRouter.get(
  "/agents",
  requireRole("agent", "admin", "owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }
      const agents = await usersService.getAvailableAgents(req.organizationId);
      res.json({ success: true, data: agents });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/users/me
 * Get current user profile
 */
usersRouter.get("/me", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await usersService.getProfile(req.user!.id);
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/users/me
 * Update current user profile
 */
usersRouter.patch(
  "/me",
  validateRequest({ body: updateProfileSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await usersService.updateProfile(req.user!.id, req.body);
      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/users/:userId
 * Get user by ID within organization (agents and admins only)
 */
usersRouter.get(
  "/:userId",
  requireRole("agent", "admin", "owner"),
  validateRequest({ params: userIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }
      const user = await usersService.getByIdInOrganization(req.params.userId, req.organizationId);
      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found in this organization",
        });
        return;
      }
      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PATCH /api/users/:userId/role
 * Update user role in organization (admin only)
 */
usersRouter.patch(
  "/:userId/role",
  requireRole("admin", "owner"),
  validateRequest({ params: userIdParamSchema, body: updateUserRoleSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }
      const user = await usersService.updateRoleInOrganization(
        req.params.userId,
        req.organizationId,
        req.body,
        req.user!.id,
      );
      res.json({ success: true, data: user });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("Cannot change") || error.message.includes("Cannot remove")) {
          res.status(403).json({ success: false, error: error.message });
          return;
        }
        if (error.message.includes("not a member") || error.message.includes("not found")) {
          res.status(404).json({ success: false, error: error.message });
          return;
        }
      }
      next(error);
    }
  },
);

/**
 * POST /api/users/:userId/deactivate
 * Deactivate user account (admin only)
 */
usersRouter.post(
  "/:userId/deactivate",
  requireRole("admin", "owner"),
  validateRequest({ params: userIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await usersService.deactivate(req.params.userId, req.user!.id);
      res.json({
        success: true,
        data: user,
        message: "User deactivated successfully",
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("Cannot deactivate")) {
          res.status(403).json({ success: false, error: error.message });
          return;
        }
        if (error.message === "User not found") {
          res.status(404).json({ success: false, error: error.message });
          return;
        }
      }
      next(error);
    }
  },
);

/**
 * POST /api/users/:userId/reactivate
 * Reactivate user account (admin only)
 */
usersRouter.post(
  "/:userId/reactivate",
  requireRole("admin", "owner"),
  validateRequest({ params: userIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await usersService.reactivate(req.params.userId);
      res.json({
        success: true,
        data: user,
        message: "User reactivated successfully",
      });
    } catch (error) {
      if (error instanceof Error && error.message === "User not found") {
        res.status(404).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  },
);

/**
 * DELETE /api/users/:userId
 * Remove user from organization (admin only)
 */
usersRouter.delete(
  "/:userId",
  requireRole("admin", "owner"),
  validateRequest({ params: userIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }
      await usersService.removeFromOrganization(
        req.params.userId,
        req.organizationId,
        req.user!.id,
      );
      res.json({ success: true, message: "User removed from organization" });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("Cannot remove")) {
          res.status(403).json({ success: false, error: error.message });
          return;
        }
        if (error.message.includes("not a member")) {
          res.status(404).json({ success: false, error: error.message });
          return;
        }
      }
      next(error);
    }
  },
);
