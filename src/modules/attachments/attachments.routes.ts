/**
 * Attachments Routes
 * File upload, download, and management endpoints
 */

import { Router } from "express";
import multer from "multer";
import { config } from "@/config";
import { createLogger } from "@/lib/logger";
import { requireAuth } from "@/middleware/auth";
import { requireOrg, requireOrgRole } from "@/middleware/organization";
import { validateRequest } from "@/middleware/validate";
import { storage } from "@/lib/storage";
import * as attachmentsService from "./attachments.service";
import { attachmentIdSchema, listAttachmentsSchema, uploadAttachmentSchema } from "./attachments.schema";

const router = Router();
const logger = createLogger("attachments:routes");

// Configure multer for memory storage (we'll handle file storage ourselves)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.MAX_FILE_SIZE,
  },
});

// All routes require authentication and organization context
router.use(requireAuth);
router.use(requireOrg);

// ─────────────────────────────────────────────────────────────
// POST /api/attachments/upload - Upload a file
// ─────────────────────────────────────────────────────────────
router.post(
  "/upload",
  upload.single("file"),
  validateRequest({ body: uploadAttachmentSchema }),
  async (req, res) => {
    try {
      // Check if file was uploaded (using multipart/form-data)
      const file = req.file;
      if (!file) {
        return res.status(400).json({
          success: false,
          error: "No file provided",
        });
      }

      // Validate file
      const validation = storage.validate({
        size: file.size,
        mimetype: file.mimetype,
        originalname: file.originalname,
      });

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.error,
        });
      }

      const { ticketId, folder } = req.body;

      const attachment = await attachmentsService.uploadAttachment({
        buffer: file.buffer,
        orgId: req.organization!.id,
        uploadedById: req.user!.id,
        filename: file.originalname,
        mimeType: file.mimetype,
        ticketId,
        folder,
      });

      logger.info(
        { attachmentId: attachment.id, filename: attachment.originalName },
        "File uploaded successfully",
      );

      return res.status(201).json({
        success: true,
        data: attachment,
      });
    } catch (error) {
      logger.error({ error }, "Failed to upload file");
      return res.status(500).json({
        success: false,
        error: "Failed to upload file",
      });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/attachments - List attachments
// ─────────────────────────────────────────────────────────────
router.get(
  "/",
  validateRequest({ query: listAttachmentsSchema }),
  async (req, res) => {
    try {
      const { ticketId, page, limit } = req.query;

      const result = await attachmentsService.listAttachments({
        orgId: req.organization!.id,
        ticketId: ticketId as string | undefined,
        page: Number(page) || 1,
        limit: Number(limit) || 20,
      });

      return res.json({
        success: true,
        data: result.attachments,
        pagination: result.pagination,
      });
    } catch (error) {
      logger.error({ error }, "Failed to list attachments");
      return res.status(500).json({
        success: false,
        error: "Failed to list attachments",
      });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/attachments/:id - Get attachment metadata
// ─────────────────────────────────────────────────────────────
router.get(
  "/:id",
  validateRequest({ params: attachmentIdSchema }),
  async (req, res) => {
    try {
      const attachment = await attachmentsService.getAttachmentById(
        req.params.id,
        req.organization!.id,
      );

      if (!attachment) {
        return res.status(404).json({
          success: false,
          error: "Attachment not found",
        });
      }

      return res.json({
        success: true,
        data: attachment,
      });
    } catch (error) {
      logger.error({ error }, "Failed to get attachment");
      return res.status(500).json({
        success: false,
        error: "Failed to get attachment",
      });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/attachments/:id/download - Download attachment file
// ─────────────────────────────────────────────────────────────
router.get(
  "/:id/download",
  validateRequest({ params: attachmentIdSchema }),
  async (req, res) => {
    try {
      const result = await attachmentsService.downloadAttachment(
        req.params.id,
        req.organization!.id,
      );

      if (!result) {
        return res.status(404).json({
          success: false,
          error: "Attachment not found",
        });
      }

      // Set headers for file download
      res.setHeader("Content-Type", result.mimeType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(result.filename)}"`,
      );
      res.setHeader("Content-Length", result.buffer.length);

      return res.send(result.buffer);
    } catch (error) {
      logger.error({ error }, "Failed to download attachment");
      return res.status(500).json({
        success: false,
        error: "Failed to download attachment",
      });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// DELETE /api/attachments/:id - Delete attachment
// ─────────────────────────────────────────────────────────────
router.delete(
  "/:id",
  requireOrgRole(["admin", "agent"]),
  validateRequest({ params: attachmentIdSchema }),
  async (req, res) => {
    try {
      const deleted = await attachmentsService.deleteAttachment(
        req.params.id,
        req.organization!.id,
      );

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: "Attachment not found",
        });
      }

      logger.info({ attachmentId: req.params.id }, "Attachment deleted");

      return res.json({
        success: true,
        message: "Attachment deleted successfully",
      });
    } catch (error) {
      logger.error({ error }, "Failed to delete attachment");
      return res.status(500).json({
        success: false,
        error: "Failed to delete attachment",
      });
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/attachments/ticket/:ticketId - Get all attachments for a ticket
// ─────────────────────────────────────────────────────────────
router.get(
  "/ticket/:ticketId",
  async (req, res) => {
    try {
      const attachments = await attachmentsService.getTicketAttachments(
        req.params.ticketId,
        req.organization!.id,
      );

      return res.json({
        success: true,
        data: attachments,
      });
    } catch (error) {
      logger.error({ error }, "Failed to get ticket attachments");
      return res.status(500).json({
        success: false,
        error: "Failed to get ticket attachments",
      });
    }
  },
);

export { router as attachmentsRouter };
