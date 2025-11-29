import type { Server as HttpServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import { and, eq } from "drizzle-orm";
import { type Socket, Server as SocketServer } from "socket.io";
import { config } from "@/config";
import { db } from "@/db";
import { userOrganizations } from "@/db/schema";
import { auth } from "@/modules/auth/auth.config";
import { valkey } from "./cache";
import { logger } from "./logger";
import {
  clearUserTyping,
  getOnlineUsers,
  getTicketSessionState,
  setUserOffline,
  setUserOnline,
  setUserTyping,
} from "./presence";

// Socket with user data
interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    email: string;
    name: string;
  };
  organizationId?: string;
}

// Event types
export interface TicketEvent {
  type:
    | "ticket:created"
    | "ticket:updated"
    | "ticket:assigned"
    | "ticket:status_changed"
    | "ticket:message_added"
    | "ticket:closed";
  ticketId: string;
  organizationId: string;
  data: Record<string, unknown>;
}

export interface NotificationEvent {
  type: "notification";
  userId: string;
  data: {
    title: string;
    message: string;
    ticketId?: string;
    action?: string;
  };
}

let io: SocketServer | null = null;

/**
 * Initialize Socket.IO server with Redis adapter for horizontal scaling
 */
export async function initializeSocketIO(httpServer: HttpServer): Promise<SocketServer> {
  // Create Redis clients for pub/sub using ioredis
  const pubClient = valkey.duplicate();
  const subClient = valkey.duplicate();

  // Create Socket.IO server
  io = new SocketServer(httpServer, {
    cors: {
      origin: config.FRONTEND_URL,
      credentials: true,
    },
    adapter: createAdapter(pubClient, subClient),
  });

  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      // Get session from cookie or authorization header
      const cookies = socket.handshake.headers.cookie;
      const headers = new Headers();

      if (cookies) {
        headers.set("cookie", cookies);
      }

      const authHeader = socket.handshake.auth?.token;
      if (authHeader) {
        headers.set("authorization", `Bearer ${authHeader}`);
      }

      const session = await auth.api.getSession({ headers });

      if (!session?.user) {
        return next(new Error("Authentication required"));
      }

      socket.user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      };

      // Get organization from handshake
      const orgId = socket.handshake.auth?.organizationId;
      if (orgId) {
        // Verify membership
        const membership = await db.query.userOrganizations.findFirst({
          where: and(
            eq(userOrganizations.userId, session.user.id),
            eq(userOrganizations.organizationId, orgId),
          ),
        });

        if (membership) {
          socket.organizationId = orgId;
        }
      }

      next();
    } catch (error) {
      logger.error({ err: error }, "Socket authentication error");
      next(new Error("Authentication failed"));
    }
  });

  // Connection handler
  io.on("connection", async (socket: AuthenticatedSocket) => {
    logger.info(`Socket connected: ${socket.id} (user: ${socket.user?.id})`);

    // Join user-specific room for notifications
    if (socket.user) {
      socket.join(`user:${socket.user.id}`);
    }

    // Join organization room for real-time updates and set presence
    if (socket.organizationId && socket.user) {
      socket.join(`org:${socket.organizationId}`);
      logger.info(`User ${socket.user.id} joined organization room: ${socket.organizationId}`);

      // Set user as online in Valkey
      await setUserOnline(socket.organizationId, socket.user.id);

      // Notify other users in the organization
      socket.to(`org:${socket.organizationId}`).emit("user:online", {
        userId: socket.user.id,
        userName: socket.user.name,
      });

      // Send current online users to the connecting user (state recovery)
      const onlineUsers = await getOnlineUsers(socket.organizationId);
      socket.emit("presence:sync", { onlineUsers });
    }

    // Handle joining a specific ticket room
    socket.on("ticket:join", async (ticketId: string) => {
      if (!socket.organizationId || !socket.user) {
        socket.emit("error", { message: "Organization context required" });
        return;
      }

      // Join ticket-specific room
      socket.join(`ticket:${ticketId}`);
      logger.info(`User ${socket.user.id} joined ticket room: ${ticketId}`);

      // Send session state recovery for this ticket
      const sessionState = await getTicketSessionState(socket.organizationId, ticketId);
      socket.emit("ticket:state", {
        ticketId,
        typingUsers: sessionState.typingUsers,
      });
    });

    // Handle leaving a ticket room
    socket.on("ticket:leave", async (ticketId: string) => {
      socket.leave(`ticket:${ticketId}`);
      logger.info(`User ${socket.user?.id} left ticket room: ${ticketId}`);

      // Clear typing status when leaving
      if (socket.user) {
        await clearUserTyping(ticketId, socket.user.id);
      }
    });

    // Handle typing indicator - now persisted to Valkey
    socket.on("ticket:typing", async (data: { ticketId: string; isTyping: boolean }) => {
      if (!socket.user) return;

      if (data.isTyping) {
        // Set typing in Valkey with auto-expiration
        await setUserTyping(data.ticketId, socket.user.id, socket.user.name);
      } else {
        // Clear typing status
        await clearUserTyping(data.ticketId, socket.user.id);
      }

      // Broadcast to ticket room (real-time notification)
      socket.to(`ticket:${data.ticketId}`).emit("ticket:typing", {
        userId: socket.user.id,
        userName: socket.user.name,
        isTyping: data.isTyping,
      });
    });

    // Handle presence heartbeat
    socket.on("presence:ping", async () => {
      if (socket.organizationId && socket.user) {
        await setUserOnline(socket.organizationId, socket.user.id);
      }
    });

    // Handle switching organizations
    socket.on("organization:switch", async (organizationId: string) => {
      if (!socket.user) return;

      // Verify membership
      const membership = await db.query.userOrganizations.findFirst({
        where: and(
          eq(userOrganizations.userId, socket.user.id),
          eq(userOrganizations.organizationId, organizationId),
        ),
      });

      if (!membership) {
        socket.emit("error", { message: "Not a member of this organization" });
        return;
      }

      // Set offline in old organization
      if (socket.organizationId) {
        await setUserOffline(socket.organizationId, socket.user.id);
        socket.to(`org:${socket.organizationId}`).emit("user:offline", {
          userId: socket.user.id,
        });
        socket.leave(`org:${socket.organizationId}`);
      }

      // Join new organization room
      socket.join(`org:${organizationId}`);
      socket.organizationId = organizationId;

      // Set online in new organization
      await setUserOnline(organizationId, socket.user.id);
      socket.to(`org:${organizationId}`).emit("user:online", {
        userId: socket.user.id,
        userName: socket.user.name,
      });

      // Send presence state for new organization
      const onlineUsers = await getOnlineUsers(organizationId);
      socket.emit("presence:sync", { onlineUsers });

      logger.info(`User ${socket.user.id} switched to organization: ${organizationId}`);
    });

    // Disconnect handler
    socket.on("disconnect", async () => {
      logger.info(`Socket disconnected: ${socket.id}`);

      if (socket.organizationId && socket.user) {
        // Check if user has other active connections in this org
        const io = getIO();
        const sockets = await io.in(`user:${socket.user.id}`).fetchSockets();
        const hasOtherConnections = sockets.some(
          (s) =>
            s.id !== socket.id &&
            (s as unknown as AuthenticatedSocket).organizationId === socket.organizationId,
        );

        if (!hasOtherConnections) {
          // No other connections, set user as offline
          await setUserOffline(socket.organizationId, socket.user.id);
          io.to(`org:${socket.organizationId}`).emit("user:offline", {
            userId: socket.user.id,
          });
        }
      }
    });
  });

  logger.info("Socket.IO server initialized with Redis adapter");
  return io;
}

/**
 * Get the Socket.IO server instance
 */
export function getIO(): SocketServer {
  if (!io) {
    throw new Error("Socket.IO not initialized");
  }
  return io;
}

/**
 * Emit event to all users in an organization
 */
export function emitToOrganization(organizationId: string, event: string, data: unknown): void {
  if (!io) return;
  io.to(`org:${organizationId}`).emit(event, data);
}

/**
 * Emit event to users watching a specific ticket
 */
export function emitToTicket(ticketId: string, event: string, data: unknown): void {
  if (!io) return;
  io.to(`ticket:${ticketId}`).emit(event, data);
}

/**
 * Emit notification to a specific user
 */
export function emitToUser(userId: string, event: string, data: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
}

/**
 * Broadcast ticket event
 */
export function broadcastTicketEvent(event: TicketEvent): void {
  // Emit to organization
  emitToOrganization(event.organizationId, event.type, {
    ticketId: event.ticketId,
    ...event.data,
  });

  // Also emit to ticket room for detailed updates
  emitToTicket(event.ticketId, event.type, event.data);
}

/**
 * Send notification to user
 */
export function sendNotification(event: NotificationEvent): void {
  emitToUser(event.userId, "notification", event.data);
}
