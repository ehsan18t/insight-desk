// API Key Routes
// Endpoints for managing organization API keys

import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { validateRequest } from "@/middleware/validate";
import {
  createApiKey,
  deleteApiKey,
  getApiKeyById,
  getApiKeyStats,
  listApiKeys,
  revokeApiKey,
} from "./api-keys.service";
import { apiKeyIdParamSchema, createApiKeySchema } from "./api-keys.schema";
import { authenticate, requireRole } from "@/modules/auth";
import { organizationIdParamSchema } from "@/modules/organizations/organizations.schema";

// Use mergeParams to access :organizationId from parent router
export const apiKeysRouter = Router({ mergeParams: true });

// All routes require authentication and admin role
apiKeysRouter.use(authenticate);

// Middleware to extract and validate organizationId
apiKeysRouter.use(
  validateRequest({ params: organizationIdParamSchema }),
  requireRole("admin", "owner"),
);

/**
 * POST /api/organizations/:organizationId/api-keys
 * Create a new API key
 */
apiKeysRouter.post(
  "/",
  validateRequest({ body: createApiKeySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.params.organizationId as string;
      const userId = req.user!.id;

      const apiKey = await createApiKey(orgId, userId, req.body);

      res.status(201).json({
        success: true,
        data: apiKey,
        message:
          "API key created successfully. Store the key securely - it will not be shown again!",
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/organizations/:organizationId/api-keys
 * List all API keys for the organization
 */
apiKeysRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.organizationId as string;
    const keys = await listApiKeys(orgId);

    res.json({
      success: true,
      data: keys,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/organizations/:organizationId/api-keys/stats
 * Get API key statistics
 */
apiKeysRouter.get("/stats", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.organizationId as string;
    const stats = await getApiKeyStats(orgId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/organizations/:organizationId/api-keys/:keyId
 * Get a specific API key
 */
apiKeysRouter.get(
  "/:keyId",
  validateRequest({ params: apiKeyIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.params.organizationId as string;
      const { keyId } = req.params;

      const key = await getApiKeyById(orgId, keyId);

      res.json({
        success: true,
        data: key,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/organizations/:organizationId/api-keys/:keyId/revoke
 * Revoke an API key (soft delete - keeps record but disables)
 */
apiKeysRouter.post(
  "/:keyId/revoke",
  validateRequest({ params: apiKeyIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.params.organizationId as string;
      const userId = req.user!.id;
      const { keyId } = req.params;

      await revokeApiKey(orgId, keyId, userId);

      res.json({
        success: true,
        message: "API key revoked successfully",
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/organizations/:organizationId/api-keys/:keyId
 * Permanently delete an API key (owner only)
 */
apiKeysRouter.delete(
  "/:keyId",
  requireRole("owner"),
  validateRequest({ params: apiKeyIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.params.organizationId as string;
      const { keyId } = req.params;

      await deleteApiKey(orgId, keyId);

      res.json({
        success: true,
        message: "API key deleted permanently",
      });
    } catch (error) {
      next(error);
    }
  },
);
