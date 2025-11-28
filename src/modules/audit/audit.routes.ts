/**
 * Audit Routes
 * API endpoints for viewing audit logs
 */

import { type NextFunction, type Request, type Response, Router } from "express";
import { ForbiddenError, NotFoundError } from "@/middleware/error-handler";
import { validateRequest } from "@/middleware/validate";
import { authenticate, requireRole } from "@/modules/auth";
import {
  type AuditAction,
  auditLogIdParam,
  exportAuditLogsQuery,
  listAuditLogsQuery,
} from "./audit.schema";
import { auditService } from "./audit.service";

const router = Router();

// All routes require authentication and admin+ role
router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// GET /api/audit - List audit logs
// ─────────────────────────────────────────────────────────────
router.get(
  "/",
  requireRole("admin", "owner"),
  validateRequest({ query: listAuditLogsQuery }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const result = await auditService.list(req.organizationId, {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 50,
        action: req.query.action as AuditAction | undefined,
        userId: req.query.userId as string | undefined,
        resourceType: req.query.resourceType as string | undefined,
        resourceId: req.query.resourceId as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        sortBy: (req.query.sortBy as "createdAt" | "action" | "userId") || "createdAt",
        sortOrder: (req.query.sortOrder as "asc" | "desc") || "desc",
      });

      res.json({
        success: true,
        data: result.logs,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/audit/export - Export audit logs
// ─────────────────────────────────────────────────────────────
router.get(
  "/export",
  requireRole("admin", "owner"),
  validateRequest({ query: exportAuditLogsQuery }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const format = (req.query.format as "json" | "csv") || "json";

      const logs = await auditService.export(req.organizationId, {
        action: req.query.action as AuditAction | undefined,
        userId: req.query.userId as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
      });

      if (format === "csv") {
        // Generate CSV
        const headers = [
          "ID",
          "Action",
          "User Name",
          "User Email",
          "Resource Type",
          "Resource ID",
          "IP Address",
          "User Agent",
          "Created At",
        ];

        const rows = logs.map((log) => [
          log.id,
          log.action,
          log.user?.name || "",
          log.user?.email || "",
          log.resourceType || "",
          log.resourceId || "",
          log.ipAddress || "",
          log.userAgent || "",
          log.createdAt?.toISOString() || "",
        ]);

        const csvContent = [
          headers.join(","),
          ...rows.map((row) =>
            row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
          ),
        ].join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="audit-logs-${Date.now()}.csv"`);
        return res.send(csvContent);
      }

      // JSON format
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="audit-logs-${Date.now()}.json"`);
      res.json({
        success: true,
        data: logs,
        exportedAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/audit/:id - Get single audit log
// ─────────────────────────────────────────────────────────────
router.get(
  "/:id",
  requireRole("admin", "owner"),
  validateRequest({ params: auditLogIdParam }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const log = await auditService.getById(req.params.id, req.organizationId);

      if (!log) {
        throw new NotFoundError("Audit log not found");
      }

      res.json({
        success: true,
        data: log,
      });
    } catch (error) {
      next(error);
    }
  },
);

export { router as auditRouter };
