import { Router } from "express";
import { validate } from "@/middleware/validate";
import { authenticate } from "@/modules/auth/auth.middleware";
import { exportQuerySchema } from "./export.schema";
import { exportService } from "./export.service";

const router = Router();

// All export routes require authentication
router.use(authenticate);

// Get available export fields
router.get("/:organizationId/fields", (_req, res) => {
  const fields = exportService.getAvailableFields();
  res.json(fields);
});

// Export tickets
router.get(
  "/:organizationId/tickets",
  validate(exportQuerySchema, "query"),
  async (req, res, next) => {
    try {
      const { organizationId } = req.params;
      const format = (req.query.format as string) || "csv";

      if (format === "xlsx") {
        const { content, filename } = await exportService.exportTicketsXLSX(organizationId, {
          format: "xlsx",
          fields: req.query.fields ? (req.query.fields as string).split(",") : undefined,
          status: req.query.status as "open" | "pending" | "resolved" | "closed" | undefined,
          priority: req.query.priority as "low" | "medium" | "high" | "urgent" | undefined,
          assigneeId: req.query.assigneeId as string | undefined,
          categoryId: req.query.categoryId as string | undefined,
          dateFrom: req.query.dateFrom as string | undefined,
          dateTo: req.query.dateTo as string | undefined,
          search: req.query.search as string | undefined,
        });

        res.setHeader("Content-Type", "application/vnd.ms-excel");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(content);
      } else {
        const { content, filename } = await exportService.exportTicketsCSV(organizationId, {
          format: "csv",
          fields: req.query.fields ? (req.query.fields as string).split(",") : undefined,
          status: req.query.status as "open" | "pending" | "resolved" | "closed" | undefined,
          priority: req.query.priority as "low" | "medium" | "high" | "urgent" | undefined,
          assigneeId: req.query.assigneeId as string | undefined,
          categoryId: req.query.categoryId as string | undefined,
          dateFrom: req.query.dateFrom as string | undefined,
          dateTo: req.query.dateTo as string | undefined,
          search: req.query.search as string | undefined,
        });

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(content);
      }
    } catch (error) {
      next(error);
    }
  },
);

export default router;
