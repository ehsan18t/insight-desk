# Real-time Features

> Socket.IO implementation with Valkey adapter

## Table of Contents

1. [Overview](#overview)
2. [Socket.IO Server Setup](#socketio-server-setup)
3. [Valkey Adapter](#valkey-adapter)
4. [Authentication](#authentication)
5. [Room Management](#room-management)
6. [Event Patterns](#event-patterns)
7. [Client Integration](#client-integration)
8. [Presence System](#presence-system)

---

## Overview

### Real-time Features for MVP

| Feature             | Priority | Description                            |
| ------------------- | -------- | -------------------------------------- |
| Live ticket updates | High     | See status changes instantly           |
| Chat messaging      | High     | Real-time message delivery             |
| Agent presence      | Medium   | Show who's online                      |
| Typing indicators   | Low      | Show when someone is typing            |
| Notifications       | Medium   | Browser notifications for new messages |

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Next.js Frontend                           │
│                    (Socket.IO Client)                           │
└────────────────────────────┬────────────────────────────────────┘
                             │ WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Express + Socket.IO                          │
│                      (Port 4000)                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Valkey (Redis Fork)                         │
│                   Socket.IO Adapter + Pub/Sub                   │
└─────────────────────────────────────────────────────────────────┘
```

### Why Valkey?

- **Scalability**: Multiple server instances share state
- **Pub/Sub**: Events broadcast across all instances
- **Caching**: Double-duty as application cache
- **No extra infra**: One service for multiple purposes

---

## Socket.IO Server Setup

### Installation

```bash
bun add socket.io @socket.io/redis-adapter ioredis
```

### Server Configuration

```ts
// apps/api/src/lib/socket.ts
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "ioredis";
import type { Server as HttpServer } from "http";
import { auth } from "@/lib/auth";

// Type definitions for events
export interface ServerToClientEvents {
  // Ticket events
  "ticket:created": (ticket: TicketSummary) => void;
  "ticket:updated": (ticket: TicketSummary) => void;
  "ticket:assigned": (data: { ticketId: string; assigneeId: string }) => void;

  // Message events
  "message:new": (message: MessageData) => void;
  "message:updated": (message: MessageData) => void;

  // Presence events
  "user:online": (userId: string) => void;
  "user:offline": (userId: string) => void;
  "presence:sync": (users: string[]) => void;

  // Typing events
  "typing:start": (data: { ticketId: string; userId: string; userName: string }) => void;
  "typing:stop": (data: { ticketId: string; userId: string }) => void;

  // Error events
  error: (error: { message: string; code?: string }) => void;
}

export interface ClientToServerEvents {
  // Room management
  "ticket:join": (ticketId: string) => void;
  "ticket:leave": (ticketId: string) => void;

  // Messaging
  "message:send": (data: { ticketId: string; content: string }) => void;

  // Typing
  "typing:start": (ticketId: string) => void;
  "typing:stop": (ticketId: string) => void;

  // Presence
  "presence:ping": () => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: string;
  userEmail: string;
  userName: string;
  userRole: string;
  organizationId?: string;
}

export type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

let io: SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export async function initializeSocket(httpServer: HttpServer) {
  // Create Socket.IO server
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      credentials: true,
    },
    transports: ["websocket", "polling"],
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // Setup Valkey adapter for scaling
  const pubClient = createClient(process.env.VALKEY_URL);
  const subClient = pubClient.duplicate();

  await Promise.all([pubClient.connect(), subClient.connect()]);

  io.adapter(createAdapter(pubClient, subClient));

  // Setup event handlers
  io.on("connection", handleConnection);

  console.log("Socket.IO initialized with Valkey adapter");

  return io;
}

export function getIO() {
  if (!io) {
    throw new Error("Socket.IO not initialized");
  }
  return io;
}
```

### Express Integration

```ts
// apps/api/src/index.ts
import express from "express";
import { createServer } from "http";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "@/lib/auth";
import { initializeSocket } from "@/lib/socket";
import { apiRoutes } from "@/routes";

const app = express();
const httpServer = createServer(app);

// CORS
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

// Better Auth routes
app.all("/api/auth/*", toNodeHandler(auth));

// JSON parsing
app.use(express.json());

// API routes
app.use("/api/v1", apiRoutes);

// Initialize Socket.IO
await initializeSocket(httpServer);

// Start server
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

---

## Valkey Adapter

### Connection Setup

```ts
// apps/api/src/lib/valkey.ts
import { createClient, type RedisClientType } from "ioredis";

let client: RedisClientType;

export async function connectValkey() {
  client = createClient({
    url: process.env.VALKEY_URL || "redis://localhost:6379",
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
  });

  client.on("error", (err) => {
    console.error("Valkey connection error:", err);
  });

  client.on("connect", () => {
    console.log("Connected to Valkey");
  });

  await client.connect();

  return client;
}

export function getValkey() {
  if (!client) {
    throw new Error("Valkey not connected");
  }
  return client;
}

// Utility functions for caching
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  },

  async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  },

  async del(key: string): Promise<void> {
    await client.del(key);
  },

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  },
};
```

### Pub/Sub Patterns

```ts
// apps/api/src/lib/pubsub.ts
import { getValkey } from "./valkey";

// Channel names
export const CHANNELS = {
  TICKET_UPDATES: "tickets:updates",
  USER_PRESENCE: "users:presence",
  NOTIFICATIONS: "notifications",
} as const;

// Publish event
export async function publish<T>(channel: string, event: string, data: T) {
  const valkey = getValkey();
  await valkey.publish(
    channel,
    JSON.stringify({ event, data, timestamp: Date.now() })
  );
}

// Subscribe to channel (for non-Socket.IO consumers)
export async function subscribe(
  channel: string,
  handler: (message: unknown) => void
) {
  const valkey = getValkey();
  const subscriber = valkey.duplicate();

  await subscriber.subscribe(channel);

  subscriber.on("message", (ch, message) => {
    if (ch === channel) {
      try {
        handler(JSON.parse(message));
      } catch (error) {
        console.error("Error parsing pub/sub message:", error);
      }
    }
  });

  return () => subscriber.unsubscribe(channel);
}
```

---

## Authentication

### Socket Authentication Middleware

```ts
// apps/api/src/lib/socket/auth.ts
import type { Socket } from "socket.io";
import { auth } from "@/lib/auth";
import type { SocketData } from "./types";

export async function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void
) {
  try {
    // Get cookies from handshake
    const cookies = socket.handshake.headers.cookie;

    if (!cookies) {
      return next(new Error("Authentication required"));
    }

    // Verify session using Better Auth
    const session = await auth.api.getSession({
      headers: new Headers({
        cookie: cookies,
      }),
    });

    if (!session?.user) {
      return next(new Error("Invalid session"));
    }

    // Attach user data to socket
    socket.data = {
      userId: session.user.id,
      userEmail: session.user.email,
      userName: session.user.name,
      userRole: session.user.role as string,
      organizationId: session.user.organizationId as string | undefined,
    } satisfies SocketData;

    next();
  } catch (error) {
    console.error("Socket auth error:", error);
    next(new Error("Authentication failed"));
  }
}
```

### Connection Handler

```ts
// apps/api/src/lib/socket/handlers.ts
import { getIO, type TypedSocket } from "./index";
import { socketAuthMiddleware } from "./auth";
import { presenceManager } from "./presence";

export function setupSocketHandlers() {
  const io = getIO();

  // Authentication middleware
  io.use(socketAuthMiddleware);

  // Connection handler
  io.on("connection", async (socket: TypedSocket) => {
    const { userId, userName, organizationId } = socket.data;

    console.log(`User connected: ${userName} (${userId})`);

    // Join organization room for org-wide updates
    if (organizationId) {
      socket.join(`org:${organizationId}`);
    }

    // Join personal room for direct messages
    socket.join(`user:${userId}`);

    // Register user as online
    await presenceManager.setOnline(userId);
    io.to(`org:${organizationId}`).emit("user:online", userId);

    // Handle room events
    socket.on("ticket:join", (ticketId) => {
      socket.join(`ticket:${ticketId}`);
      console.log(`${userName} joined ticket:${ticketId}`);
    });

    socket.on("ticket:leave", (ticketId) => {
      socket.leave(`ticket:${ticketId}`);
      console.log(`${userName} left ticket:${ticketId}`);
    });

    // Handle messaging
    socket.on("message:send", async (data) => {
      await handleNewMessage(socket, data);
    });

    // Handle typing indicators
    socket.on("typing:start", (ticketId) => {
      socket.to(`ticket:${ticketId}`).emit("typing:start", {
        ticketId,
        userId,
        userName,
      });
    });

    socket.on("typing:stop", (ticketId) => {
      socket.to(`ticket:${ticketId}`).emit("typing:stop", {
        ticketId,
        userId,
      });
    });

    // Handle presence ping
    socket.on("presence:ping", async () => {
      await presenceManager.refreshPresence(userId);
    });

    // Handle disconnection
    socket.on("disconnect", async (reason) => {
      console.log(`User disconnected: ${userName} (${reason})`);

      // Check if user has other connections
      const sockets = await io.in(`user:${userId}`).fetchSockets();

      if (sockets.length === 0) {
        await presenceManager.setOffline(userId);
        io.to(`org:${organizationId}`).emit("user:offline", userId);
      }
    });
  });
}
```

---

## Room Management

### Room Structure

```ts
// Room naming conventions
const ROOMS = {
  // Organization-wide events
  organization: (orgId: string) => `org:${orgId}`,

  // Ticket-specific events (messages, updates)
  ticket: (ticketId: string) => `ticket:${ticketId}`,

  // User-specific events (notifications)
  user: (userId: string) => `user:${userId}`,

  // Agent pool (for ticket assignment)
  agents: (orgId: string) => `agents:${orgId}`,
};
```

### Joining/Leaving Rooms

```ts
// apps/api/src/lib/socket/rooms.ts
import { getIO, type TypedSocket } from "./index";

export function joinTicketRoom(socket: TypedSocket, ticketId: string) {
  const roomName = `ticket:${ticketId}`;
  socket.join(roomName);

  console.log(
    `User ${socket.data.userName} joined room ${roomName}`
  );
}

export function leaveTicketRoom(socket: TypedSocket, ticketId: string) {
  const roomName = `ticket:${ticketId}`;
  socket.leave(roomName);

  console.log(
    `User ${socket.data.userName} left room ${roomName}`
  );
}

// Get users in a room
export async function getRoomMembers(roomName: string): Promise<string[]> {
  const io = getIO();
  const sockets = await io.in(roomName).fetchSockets();

  return sockets.map((s) => s.data.userId);
}

// Broadcast to ticket participants
export function broadcastToTicket<T>(
  ticketId: string,
  event: string,
  data: T,
  excludeUserId?: string
) {
  const io = getIO();
  const room = `ticket:${ticketId}`;

  if (excludeUserId) {
    io.to(room)
      .except(`user:${excludeUserId}`)
      .emit(event as any, data);
  } else {
    io.to(room).emit(event as any, data);
  }
}
```

---

## Event Patterns

### Ticket Events

```ts
// apps/api/src/services/ticket/events.ts
import { getIO } from "@/lib/socket";
import type { Ticket } from "@/types";

export function emitTicketCreated(ticket: Ticket) {
  const io = getIO();

  // Notify organization (for agents to see new tickets)
  io.to(`org:${ticket.organizationId}`).emit("ticket:created", {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    customerId: ticket.customerId,
    createdAt: ticket.createdAt,
  });

  // Notify customer
  io.to(`user:${ticket.customerId}`).emit("ticket:created", {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    createdAt: ticket.createdAt,
  });
}

export function emitTicketUpdated(ticket: Ticket, updatedBy: string) {
  const io = getIO();

  // Emit to ticket room (everyone watching this ticket)
  io.to(`ticket:${ticket.id}`).emit("ticket:updated", {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    assigneeId: ticket.assigneeId,
    updatedAt: ticket.updatedAt,
    updatedBy,
  });
}

export function emitTicketAssigned(
  ticketId: string,
  assigneeId: string,
  assignedBy: string
) {
  const io = getIO();

  // Notify the assignee
  io.to(`user:${assigneeId}`).emit("ticket:assigned", {
    ticketId,
    assigneeId,
    assignedBy,
  });

  // Notify ticket watchers
  io.to(`ticket:${ticketId}`).emit("ticket:assigned", {
    ticketId,
    assigneeId,
    assignedBy,
  });
}
```

### Message Events

```ts
// apps/api/src/services/message/events.ts
import { getIO } from "@/lib/socket";
import type { Message } from "@/types";

export function emitNewMessage(message: Message) {
  const io = getIO();

  const messageData = {
    id: message.id,
    ticketId: message.ticketId,
    content: message.content,
    senderId: message.senderId,
    senderName: message.sender?.name,
    senderRole: message.sender?.role,
    createdAt: message.createdAt,
    attachments: message.attachments,
  };

  // Emit to ticket room
  io.to(`ticket:${message.ticketId}`).emit("message:new", messageData);
}

// Handle message from socket
export async function handleNewMessage(
  socket: TypedSocket,
  data: { ticketId: string; content: string }
) {
  const { userId, userName, userRole } = socket.data;

  try {
    // Validate user can send message to this ticket
    const canAccess = await canAccessTicket(userId, data.ticketId);

    if (!canAccess) {
      socket.emit("error", { message: "Access denied to ticket" });
      return;
    }

    // Create message in database
    const message = await messageService.create({
      ticketId: data.ticketId,
      senderId: userId,
      content: data.content,
    });

    // Emit to ticket room
    emitNewMessage(message);
  } catch (error) {
    console.error("Error sending message:", error);
    socket.emit("error", { message: "Failed to send message" });
  }
}
```

### Integration with API Routes

```ts
// apps/api/src/controllers/ticket.ts
import { Router } from "express";
import { ticketService } from "@/services/ticket";
import { emitTicketCreated, emitTicketUpdated } from "@/services/ticket/events";

export const create = async (req: Request, res: Response) => {
  const ticket = await ticketService.create({
    ...req.body,
    customerId: req.user!.id,
    organizationId: req.user!.organizationId,
  });

  // Emit real-time event
  emitTicketCreated(ticket);

  res.status(201).json({
    success: true,
    data: ticket,
  });
};

export const update = async (req: Request, res: Response) => {
  const { id } = req.params;

  const ticket = await ticketService.update(id, req.body);

  // Emit real-time event
  emitTicketUpdated(ticket, req.user!.id);

  res.json({
    success: true,
    data: ticket,
  });
};
```

---

## Client Integration

### Socket Client Setup

```ts
// apps/web/lib/socket.ts
import { io, Socket } from "socket.io-client";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "@shared/socket/types";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;

export function getSocket(): TypedSocket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000", {
      withCredentials: true,
      transports: ["websocket", "polling"],
      autoConnect: false,
    });
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}
```

### Socket Provider

```tsx
// components/providers/socket-provider.tsx
"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { getSocket, connectSocket, disconnectSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";
import { useSocketStore } from "@/stores/socket-store";
import type { Socket } from "socket.io-client";

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { setSocket, setConnected } = useSocketStore();
  const [socket, setSocketState] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      setSocket(null);
      setConnected(false);
      return;
    }

    const s = getSocket();
    setSocketState(s);
    setSocket(s);

    function onConnect() {
      setIsConnected(true);
      setConnected(true);
      console.log("Socket connected");
    }

    function onDisconnect() {
      setIsConnected(false);
      setConnected(false);
      console.log("Socket disconnected");
    }

    function onError(error: { message: string }) {
      console.error("Socket error:", error.message);
    }

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("error", onError);

    connectSocket();

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("error", onError);
    };
  }, [isAuthenticated, setSocket, setConnected]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
```

### Using Socket in Components

```tsx
// components/tickets/ticket-chat.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useSocket } from "@/components/providers/socket-provider";
import { useMessages } from "@/hooks/use-messages";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";

interface TicketChatProps {
  ticketId: string;
}

export function TicketChat({ ticketId }: TicketChatProps) {
  const { socket, isConnected } = useSocket();
  const { data: messages, refetch } = useMessages(ticketId);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(
    new Map()
  );

  // Join ticket room on mount
  useEffect(() => {
    if (!socket || !isConnected) return;

    socket.emit("ticket:join", ticketId);

    return () => {
      socket.emit("ticket:leave", ticketId);
    };
  }, [socket, isConnected, ticketId]);

  // Listen for new messages
  useEffect(() => {
    if (!socket) return;

    function onNewMessage(message: MessageData) {
      if (message.ticketId === ticketId) {
        refetch(); // Refetch messages
      }
    }

    function onTypingStart(data: {
      ticketId: string;
      userId: string;
      userName: string;
    }) {
      if (data.ticketId === ticketId) {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.set(data.userId, data.userName);
          return next;
        });
      }
    }

    function onTypingStop(data: { ticketId: string; userId: string }) {
      if (data.ticketId === ticketId) {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.delete(data.userId);
          return next;
        });
      }
    }

    socket.on("message:new", onNewMessage);
    socket.on("typing:start", onTypingStart);
    socket.on("typing:stop", onTypingStop);

    return () => {
      socket.off("message:new", onNewMessage);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
    };
  }, [socket, ticketId, refetch]);

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!socket) return;
      socket.emit("message:send", { ticketId, content });
    },
    [socket, ticketId]
  );

  const handleTypingStart = useCallback(() => {
    socket?.emit("typing:start", ticketId);
  }, [socket, ticketId]);

  const handleTypingStop = useCallback(() => {
    socket?.emit("typing:stop", ticketId);
  }, [socket, ticketId]);

  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages?.data ?? []} />

      {typingUsers.size > 0 && (
        <div className="px-4 py-2 text-sm text-muted-foreground">
          {Array.from(typingUsers.values()).join(", ")}{" "}
          {typingUsers.size === 1 ? "is" : "are"} typing...
        </div>
      )}

      <MessageInput
        onSend={handleSendMessage}
        onTypingStart={handleTypingStart}
        onTypingStop={handleTypingStop}
      />
    </div>
  );
}
```

### Live Ticket Updates Hook

```tsx
// hooks/use-ticket-updates.ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "@/components/providers/socket-provider";
import { ticketKeys } from "./use-tickets";

export function useTicketUpdates() {
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    function onTicketCreated(ticket: TicketSummary) {
      // Invalidate ticket list to show new ticket
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
    }

    function onTicketUpdated(ticket: TicketSummary) {
      // Update specific ticket in cache
      queryClient.setQueryData(ticketKeys.detail(ticket.id), (old: any) => ({
        ...old,
        ...ticket,
      }));

      // Invalidate lists to reflect status changes
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
    }

    socket.on("ticket:created", onTicketCreated);
    socket.on("ticket:updated", onTicketUpdated);

    return () => {
      socket.off("ticket:created", onTicketCreated);
      socket.off("ticket:updated", onTicketUpdated);
    };
  }, [socket, queryClient]);
}
```

---

## Presence System

### Server-Side Presence

```ts
// apps/api/src/lib/socket/presence.ts
import { getValkey } from "@/lib/valkey";

const PRESENCE_KEY = "presence:online";
const PRESENCE_TTL = 60; // 60 seconds

export const presenceManager = {
  async setOnline(userId: string): Promise<void> {
    const valkey = getValkey();
    await valkey.hset(PRESENCE_KEY, userId, Date.now().toString());
  },

  async setOffline(userId: string): Promise<void> {
    const valkey = getValkey();
    await valkey.hdel(PRESENCE_KEY, userId);
  },

  async refreshPresence(userId: string): Promise<void> {
    await this.setOnline(userId);
  },

  async isOnline(userId: string): Promise<boolean> {
    const valkey = getValkey();
    const timestamp = await valkey.hget(PRESENCE_KEY, userId);

    if (!timestamp) return false;

    // Consider user offline if no heartbeat in 60 seconds
    const lastSeen = parseInt(timestamp, 10);
    return Date.now() - lastSeen < PRESENCE_TTL * 1000;
  },

  async getOnlineUsers(): Promise<string[]> {
    const valkey = getValkey();
    const all = await valkey.hgetall(PRESENCE_KEY);

    const now = Date.now();
    const onlineUsers: string[] = [];

    for (const [userId, timestamp] of Object.entries(all)) {
      const lastSeen = parseInt(timestamp, 10);
      if (now - lastSeen < PRESENCE_TTL * 1000) {
        onlineUsers.push(userId);
      }
    }

    return onlineUsers;
  },

  async getOnlineAgents(organizationId: string): Promise<string[]> {
    // This would query the database to filter by org and role
    const onlineUsers = await this.getOnlineUsers();
    // Filter by organization - simplified
    return onlineUsers;
  },

  // Cleanup stale presence entries
  async cleanup(): Promise<void> {
    const valkey = getValkey();
    const all = await valkey.hgetall(PRESENCE_KEY);

    const now = Date.now();
    const staleUsers: string[] = [];

    for (const [userId, timestamp] of Object.entries(all)) {
      const lastSeen = parseInt(timestamp, 10);
      if (now - lastSeen > PRESENCE_TTL * 1000) {
        staleUsers.push(userId);
      }
    }

    if (staleUsers.length > 0) {
      await valkey.hdel(PRESENCE_KEY, ...staleUsers);
    }
  },
};

// Run cleanup every 30 seconds
setInterval(() => {
  presenceManager.cleanup().catch(console.error);
}, 30000);
```

### Client-Side Presence Hook

```tsx
// hooks/use-presence.ts
import { useEffect } from "react";
import { useSocket } from "@/components/providers/socket-provider";
import { useSocketStore } from "@/stores/socket-store";

// Heartbeat interval
const PING_INTERVAL = 30000; // 30 seconds

export function usePresence() {
  const { socket, isConnected } = useSocket();
  const { onlineUsers, addOnlineUser, removeOnlineUser } = useSocketStore();

  // Send presence ping every 30 seconds
  useEffect(() => {
    if (!socket || !isConnected) return;

    const interval = setInterval(() => {
      socket.emit("presence:ping");
    }, PING_INTERVAL);

    // Initial ping
    socket.emit("presence:ping");

    return () => clearInterval(interval);
  }, [socket, isConnected]);

  // Listen for presence events
  useEffect(() => {
    if (!socket) return;

    function onUserOnline(userId: string) {
      addOnlineUser(userId);
    }

    function onUserOffline(userId: string) {
      removeOnlineUser(userId);
    }

    function onPresenceSync(users: string[]) {
      // Reset and set all online users
      users.forEach(addOnlineUser);
    }

    socket.on("user:online", onUserOnline);
    socket.on("user:offline", onUserOffline);
    socket.on("presence:sync", onPresenceSync);

    return () => {
      socket.off("user:online", onUserOnline);
      socket.off("user:offline", onUserOffline);
      socket.off("presence:sync", onPresenceSync);
    };
  }, [socket, addOnlineUser, removeOnlineUser]);

  return {
    onlineUsers,
    isOnline: (userId: string) => onlineUsers.has(userId),
  };
}
```

### Online Indicator Component

```tsx
// components/shared/online-indicator.tsx
"use client";

import { usePresence } from "@/hooks/use-presence";
import { cn } from "@/lib/utils";

interface OnlineIndicatorProps {
  userId: string;
  showLabel?: boolean;
  className?: string;
}

export function OnlineIndicator({
  userId,
  showLabel = false,
  className,
}: OnlineIndicatorProps) {
  const { isOnline } = usePresence();
  const online = isOnline(userId);

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          online ? "bg-green-500" : "bg-gray-300"
        )}
      />
      {showLabel && (
        <span className="text-xs text-muted-foreground">
          {online ? "Online" : "Offline"}
        </span>
      )}
    </div>
  );
}
```

---

## Next Steps

- **10-background-jobs.md** - pg-boss for async tasks
- **11-testing.md** - Testing real-time features

---

*Solo Developer Note: Start with basic ticket updates and messaging. Add typing indicators and presence only after the core features work well.*
