import { Router, type Request, type Response, type NextFunction } from 'express';
import { messagesService } from './messages.service';
import {
  createMessageSchema,
  updateMessageSchema,
  messageQuerySchema,
  ticketIdParamSchema,
  messageIdParamSchema,
  type MessageQuery,
} from './messages.schema';
import { validateRequest } from '../../middleware/validate';
import { authenticate } from '../auth/auth.middleware';

const router = Router({ mergeParams: true }); // Enable access to :id from parent router

// All message routes require authentication
router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// GET /api/tickets/:id/messages - List messages for a ticket
// ─────────────────────────────────────────────────────────────
router.get(
  '/',
  validateRequest({ params: ticketIdParamSchema, query: messageQuerySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await messagesService.list(
        req.params.id,
        req.query as unknown as MessageQuery,
        req.user!.id,
        req.userRole
      );

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// GET /api/tickets/:id/messages/:messageId - Get a specific message
// ─────────────────────────────────────────────────────────────
router.get(
  '/:messageId',
  validateRequest({ params: messageIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const message = await messagesService.getById(
        req.params.id,
        req.params.messageId,
        req.user!.id,
        req.userRole
      );

      res.json({
        success: true,
        data: message,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// POST /api/tickets/:id/messages - Create a new message
// ─────────────────────────────────────────────────────────────
router.post(
  '/',
  validateRequest({ params: ticketIdParamSchema, body: createMessageSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const message = await messagesService.create(
        req.params.id,
        req.body,
        req.user!.id,
        req.userRole
      );

      res.status(201).json({
        success: true,
        data: message,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// PATCH /api/tickets/:id/messages/:messageId - Update a message
// ─────────────────────────────────────────────────────────────
router.patch(
  '/:messageId',
  validateRequest({ params: messageIdParamSchema, body: updateMessageSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const message = await messagesService.update(
        req.params.id,
        req.params.messageId,
        req.body,
        req.user!.id
      );

      res.json({
        success: true,
        data: message,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// DELETE /api/tickets/:id/messages/:messageId - Delete a message
// ─────────────────────────────────────────────────────────────
router.delete(
  '/:messageId',
  validateRequest({ params: messageIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await messagesService.delete(
        req.params.id,
        req.params.messageId,
        req.user!.id,
        req.userRole
      );

      res.json({
        success: true,
        message: 'Message deleted',
      });
    } catch (error) {
      next(error);
    }
  }
);

export const messagesRouter = router;
