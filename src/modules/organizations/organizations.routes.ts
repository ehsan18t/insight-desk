/** biome-ignore-all lint/suspicious/noExplicitAny: fine for routes handler */
import { type NextFunction, type Request, type Response, Router } from "express";
import { ForbiddenError } from "@/middleware/error-handler";
import { validateRequest } from "@/middleware/validate";
import { authenticate } from "@/modules/auth/auth.middleware";
import { apiKeysRouter } from "@/modules/api-keys";
import {
  acceptInvitationSchema,
  createOrganizationSchema,
  inviteMemberSchema,
  listInvitationsSchema,
  memberIdParamSchema,
  organizationIdParamSchema,
  organizationQuerySchema,
  updateMemberRoleSchema,
  updateOrganizationSchema,
} from "./organizations.schema";
import { organizationsService } from "./organizations.service";

export const organizationsRouter = Router();

// All routes require authentication
organizationsRouter.use(authenticate);

// Mount API key routes as nested router
organizationsRouter.use("/:organizationId/api-keys", apiKeysRouter);

/**
 * GET /api/organizations
 * List all organizations for the current user
 */
organizationsRouter.get(
  "/",
  validateRequest({ query: organizationQuerySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await organizationsService.listForUser(req.user!.id, req.query as any);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/organizations
 * Create a new organization
 */
organizationsRouter.post(
  "/",
  validateRequest({ body: createOrganizationSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = await organizationsService.create(req.body, req.user!.id);
      res.status(201).json({ success: true, data: org });
    } catch (error) {
      if (error instanceof Error && error.message.includes("already taken")) {
        res.status(409).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  },
);

/**
 * GET /api/organizations/:organizationId
 * Get organization details
 */
organizationsRouter.get(
  "/:organizationId",
  validateRequest({ params: organizationIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if user is a member
      const role = await organizationsService.getUserRole(req.user!.id, req.params.organizationId);

      if (!role) {
        res.status(403).json({
          success: false,
          error: "Not a member of this organization",
        });
        return;
      }

      const org = await organizationsService.getById(req.params.organizationId);

      if (!org) {
        res.status(404).json({ success: false, error: "Organization not found" });
        return;
      }

      res.json({ success: true, data: { ...org, userRole: role } });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PATCH /api/organizations/:organizationId
 * Update organization settings (admin/owner only)
 */
organizationsRouter.patch(
  "/:organizationId",
  validateRequest({
    params: organizationIdParamSchema,
    body: updateOrganizationSchema,
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if user has admin role
      const hasPermission = await organizationsService.checkUserRole(
        req.user!.id,
        req.params.organizationId,
        ["admin", "owner"],
      );

      if (!hasPermission) {
        throw new ForbiddenError("Admin or owner role required");
      }

      const org = await organizationsService.update(req.params.organizationId, req.body);

      res.json({ success: true, data: org });
    } catch (error) {
      if (error instanceof Error && error.message === "Organization not found") {
        res.status(404).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  },
);

/**
 * GET /api/organizations/:organizationId/members
 * List organization members
 */
organizationsRouter.get(
  "/:organizationId/members",
  validateRequest({
    params: organizationIdParamSchema,
    query: organizationQuerySchema,
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if user is a member
      const role = await organizationsService.getUserRole(req.user!.id, req.params.organizationId);

      if (!role) {
        res.status(403).json({
          success: false,
          error: "Not a member of this organization",
        });
        return;
      }

      const result = await organizationsService.listMembers(
        req.params.organizationId,
        req.query as any,
      );

      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/organizations/:organizationId/members
 * Invite a member to the organization (admin/owner only)
 */
organizationsRouter.post(
  "/:organizationId/members",
  validateRequest({
    params: organizationIdParamSchema,
    body: inviteMemberSchema,
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if user has admin role
      const hasPermission = await organizationsService.checkUserRole(
        req.user!.id,
        req.params.organizationId,
        ["admin", "owner"],
      );

      if (!hasPermission) {
        throw new ForbiddenError("Admin or owner role required");
      }

      const result = await organizationsService.inviteMember(
        req.params.organizationId,
        req.body,
        req.user!.id,
      );

      res.status(201).json({ success: true, ...result });
    } catch (error) {
      if (error instanceof Error && error.message.includes("already a member")) {
        res.status(409).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  },
);

/**
 * GET /api/organizations/:organizationId/invitations
 * List invitations for the organization (admin/owner only)
 */
organizationsRouter.get(
  "/:organizationId/invitations",
  validateRequest({
    params: organizationIdParamSchema,
    query: listInvitationsSchema,
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const hasPermission = await organizationsService.checkUserRole(
        req.user!.id,
        req.params.organizationId,
        ["admin", "owner"],
      );

      if (!hasPermission) {
        throw new ForbiddenError("Admin or owner role required");
      }

      const result = await organizationsService.listInvitations(
        req.params.organizationId,
        req.query as any,
      );

      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/organizations/:organizationId/invitations/:invitationId
 * Cancel a pending invitation (admin/owner only)
 */
organizationsRouter.delete(
  "/:organizationId/invitations/:invitationId",
  validateRequest({
    params: organizationIdParamSchema,
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const hasPermission = await organizationsService.checkUserRole(
        req.user!.id,
        req.params.organizationId,
        ["admin", "owner"],
      );

      if (!hasPermission) {
        throw new ForbiddenError("Admin or owner role required");
      }

      const cancelled = await organizationsService.cancelInvitation(
        req.params.organizationId,
        req.params.invitationId,
      );

      if (!cancelled) {
        res.status(404).json({ success: false, error: "Invitation not found or not pending" });
        return;
      }

      res.json({ success: true, message: "Invitation cancelled" });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/organizations/:organizationId/invitations/:invitationId/resend
 * Resend a pending invitation (admin/owner only)
 */
organizationsRouter.post(
  "/:organizationId/invitations/:invitationId/resend",
  validateRequest({
    params: organizationIdParamSchema,
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const hasPermission = await organizationsService.checkUserRole(
        req.user!.id,
        req.params.organizationId,
        ["admin", "owner"],
      );

      if (!hasPermission) {
        throw new ForbiddenError("Admin or owner role required");
      }

      const result = await organizationsService.resendInvitation(
        req.params.organizationId,
        req.params.invitationId,
      );

      if (!result.success) {
        res.status(404).json({ success: false, error: "Invitation not found or not pending" });
        return;
      }

      res.json({ success: true, message: "Invitation resent", expiresAt: result.expiresAt });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/organizations/invitations/preview/:token
 * Get invitation details by token (no auth required)
 */
organizationsRouter.get(
  "/invitations/preview/:token",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invitation = await organizationsService.getInvitationByToken(req.params.token);

      if (!invitation) {
        res.status(404).json({ success: false, error: "Invitation not found or expired" });
        return;
      }

      res.json({ success: true, data: invitation });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/organizations/invitations/accept
 * Accept an invitation (requires auth)
 */
organizationsRouter.post(
  "/invitations/accept",
  validateRequest({
    body: acceptInvitationSchema,
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await organizationsService.acceptInvitation(req.body.token, req.user!.id);

      res.json({
        success: true,
        message: "Invitation accepted",
        organizationId: result.organizationId,
        role: result.role,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("Invalid or expired")) {
          res.status(400).json({ success: false, error: error.message });
          return;
        }
        if (error.message.includes("different email")) {
          res.status(403).json({ success: false, error: error.message });
          return;
        }
      }
      next(error);
    }
  },
);

/**
 * PATCH /api/organizations/:organizationId/members/:userId
 * Update member role (admin/owner only)
 */
organizationsRouter.patch(
  "/:organizationId/members/:userId",
  validateRequest({
    params: memberIdParamSchema,
    body: updateMemberRoleSchema,
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if user has admin role
      const hasPermission = await organizationsService.checkUserRole(
        req.user!.id,
        req.params.organizationId,
        ["admin", "owner"],
      );

      if (!hasPermission) {
        throw new ForbiddenError("Admin or owner role required");
      }

      const member = await organizationsService.updateMemberRole(
        req.params.organizationId,
        req.params.userId,
        req.body,
        req.user!.id,
      );

      res.json({ success: true, data: member });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("Cannot change") || error.message.includes("Cannot remove")) {
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

/**
 * DELETE /api/organizations/:organizationId/members/:userId
 * Remove member from organization (admin/owner only)
 */
organizationsRouter.delete(
  "/:organizationId/members/:userId",
  validateRequest({ params: memberIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if user has admin role
      const hasPermission = await organizationsService.checkUserRole(
        req.user!.id,
        req.params.organizationId,
        ["admin", "owner"],
      );

      if (!hasPermission) {
        throw new ForbiddenError("Admin or owner role required");
      }

      await organizationsService.removeMember(
        req.params.organizationId,
        req.params.userId,
        req.user!.id,
      );

      res.json({ success: true, message: "Member removed from organization" });
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

/**
 * POST /api/organizations/:organizationId/deactivate
 * Deactivate organization (owner only)
 */
organizationsRouter.post(
  "/:organizationId/deactivate",
  validateRequest({ params: organizationIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if user is owner
      const hasPermission = await organizationsService.checkUserRole(
        req.user!.id,
        req.params.organizationId,
        ["owner"],
      );

      if (!hasPermission) {
        throw new ForbiddenError("Owner role required");
      }

      const org = await organizationsService.deactivate(req.params.organizationId);
      res.json({
        success: true,
        data: org,
        message: "Organization deactivated",
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Organization not found") {
        res.status(404).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  },
);

/**
 * POST /api/organizations/:organizationId/reactivate
 * Reactivate organization (owner only)
 */
organizationsRouter.post(
  "/:organizationId/reactivate",
  validateRequest({ params: organizationIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if user is owner
      const hasPermission = await organizationsService.checkUserRole(
        req.user!.id,
        req.params.organizationId,
        ["owner"],
      );

      if (!hasPermission) {
        throw new ForbiddenError("Owner role required");
      }

      const org = await organizationsService.reactivate(req.params.organizationId);
      res.json({
        success: true,
        data: org,
        message: "Organization reactivated",
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Organization not found") {
        res.status(404).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  },
);
