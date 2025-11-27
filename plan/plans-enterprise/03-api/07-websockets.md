# WebSockets API

> Real-time communication via Socket.IO for live updates, chat, and presence

---

## Table of Contents

- [Overview](#overview)
- [Connection](#connection)
- [Authentication](#authentication)
- [Namespaces](#namespaces)
- [Events Reference](#events-reference)
- [Rooms & Channels](#rooms--channels)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)

---

## Overview

InsightDesk uses Socket.IO for real-time features:

- Live ticket updates
- Real-time chat messaging
- Agent presence/status
- Typing indicators
- Push notifications
- Live dashboard updates

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Load Balancer                          │
│                    (Sticky Sessions)                        │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   Socket.IO   │   │   Socket.IO   │   │   Socket.IO   │
│   Server 1    │◄─►│   Server 2    │◄─►│   Server 3    │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                    ┌───────▼───────┐
                    │    Valkey     │
                    │    Adapter    │
                    └───────────────┘
```

---

## Connection

### Client Connection

```typescript
import { io, Socket } from 'socket.io-client';

const socket = io('wss://api.insightdesk.com', {
  // Authentication
  auth: {
    token: 'your-access-token'
  },
  
  // Connection options
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  
  // Path
  path: '/socket.io'
});

// Connection events
socket.on('connect', () => {
  console.log('Connected:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});
```

### Connection URL by Environment

| Environment | URL |
|-------------|-----|
| Development | `ws://localhost:3001` |
| Staging | `wss://staging-api.insightdesk.com` |
| Production | `wss://api.insightdesk.com` |

---

## Authentication

### Token-Based Auth

Send access token on connection:

```typescript
const socket = io(WS_URL, {
  auth: {
    token: accessToken
  }
});

// Handle auth errors
socket.on('connect_error', (error) => {
  if (error.message === 'AUTH_TOKEN_EXPIRED') {
    // Refresh token and reconnect
    refreshToken().then((newToken) => {
      socket.auth.token = newToken;
      socket.connect();
    });
  }
});
```

### Token Refresh During Connection

```typescript
// Server requests new token
socket.on('token:refresh', () => {
  const newToken = await refreshAccessToken();
  socket.emit('token:update', { token: newToken });
});

// Confirmation
socket.on('token:updated', () => {
  console.log('Token refreshed successfully');
});
```

---

## Namespaces

### Available Namespaces

| Namespace | Purpose | Auth Required |
|-----------|---------|---------------|
| `/` | Default namespace | ✅ |
| `/tickets` | Ticket updates | ✅ |
| `/chat` | Live chat | ✅ |
| `/notifications` | Push notifications | ✅ |
| `/presence` | Agent status | ✅ |
| `/dashboard` | Live metrics | ✅ Admin |

### Connecting to Namespaces

```typescript
// Main connection
const mainSocket = io(WS_URL, { auth: { token } });

// Ticket namespace
const ticketSocket = io(`${WS_URL}/tickets`, { auth: { token } });

// Chat namespace
const chatSocket = io(`${WS_URL}/chat`, { auth: { token } });
```

---

## Events Reference

### Default Namespace (`/`)

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `ping` | `{ timestamp: number }` | Keep-alive ping |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `pong` | `{ timestamp: number, serverTime: number }` | Ping response |
| `user:updated` | `User` | Current user updated |
| `system:maintenance` | `{ message, startsAt }` | Maintenance notice |

---

### Tickets Namespace (`/tickets`)

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `ticket:subscribe` | `{ ticketId: string }` | Subscribe to ticket |
| `ticket:unsubscribe` | `{ ticketId: string }` | Unsubscribe |
| `ticket:typing` | `{ ticketId: string }` | Started typing |
| `ticket:stopTyping` | `{ ticketId: string }` | Stopped typing |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `ticket:created` | `Ticket` | New ticket |
| `ticket:updated` | `TicketUpdate` | Ticket changed |
| `ticket:assigned` | `{ ticket, agent }` | Agent assigned |
| `ticket:message` | `Message` | New message |
| `ticket:typing` | `{ ticketId, user }` | Someone typing |
| `ticket:stopTyping` | `{ ticketId, userId }` | Stopped typing |
| `ticket:status` | `{ ticketId, status, by }` | Status changed |
| `ticket:sla:warning` | `{ ticket, minutesLeft }` | SLA warning |
| `ticket:sla:breached` | `{ ticket }` | SLA breached |

**Example:**

```typescript
const ticketSocket = io(`${WS_URL}/tickets`, { auth: { token } });

// Subscribe to a ticket
ticketSocket.emit('ticket:subscribe', { ticketId: 'ticket_123' });

// Listen for updates
ticketSocket.on('ticket:message', (message) => {
  console.log('New message:', message);
  appendMessageToUI(message);
});

ticketSocket.on('ticket:typing', ({ ticketId, user }) => {
  showTypingIndicator(ticketId, user);
});

// Emit typing status
let typingTimeout;
function handleTyping(ticketId) {
  ticketSocket.emit('ticket:typing', { ticketId });
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    ticketSocket.emit('ticket:stopTyping', { ticketId });
  }, 3000);
}

// Cleanup
ticketSocket.emit('ticket:unsubscribe', { ticketId: 'ticket_123' });
```

---

### Chat Namespace (`/chat`)

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `chat:join` | `{ conversationId }` | Join conversation |
| `chat:leave` | `{ conversationId }` | Leave conversation |
| `chat:message` | `{ conversationId, content, type }` | Send message |
| `chat:typing` | `{ conversationId }` | Typing indicator |
| `chat:read` | `{ conversationId, messageId }` | Mark as read |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `chat:message` | `ChatMessage` | New message |
| `chat:typing` | `{ conversationId, user }` | User typing |
| `chat:read` | `{ conversationId, userId, messageId }` | Read receipt |
| `chat:online` | `{ conversationId, users }` | Online users |
| `chat:ended` | `{ conversationId, reason }` | Chat ended |

**Example:**

```typescript
const chatSocket = io(`${WS_URL}/chat`, { auth: { token } });

// Join conversation
chatSocket.emit('chat:join', { conversationId: 'conv_123' });

// Send message
chatSocket.emit('chat:message', {
  conversationId: 'conv_123',
  content: 'Hello, how can I help you?',
  type: 'text'
});

// Receive messages
chatSocket.on('chat:message', (message) => {
  displayMessage(message);
  
  // Mark as read
  chatSocket.emit('chat:read', {
    conversationId: message.conversationId,
    messageId: message.id
  });
});
```

---

### Notifications Namespace (`/notifications`)

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `notification` | `Notification` | New notification |
| `notification:read` | `{ id }` | Marked as read |
| `notification:count` | `{ unread: number }` | Unread count |

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `notification:markRead` | `{ id }` | Mark as read |
| `notification:markAllRead` | `{}` | Mark all read |

**Example:**

```typescript
const notifSocket = io(`${WS_URL}/notifications`, { auth: { token } });

notifSocket.on('notification', (notif) => {
  showToast(notif.title, notif.message);
  incrementBadge();
});

notifSocket.on('notification:count', ({ unread }) => {
  updateBadge(unread);
});
```

---

### Presence Namespace (`/presence`)

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `presence:status` | `{ status }` | Set status |
| `presence:subscribe` | `{ userIds }` | Watch users |
| `presence:unsubscribe` | `{ userIds }` | Stop watching |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `presence:update` | `{ userId, status, lastSeen }` | Status changed |
| `presence:list` | `[{ userId, status }]` | Initial list |

**Agent Status Values:**

| Status | Description |
|--------|-------------|
| `online` | Available for tickets |
| `busy` | Working, limited capacity |
| `away` | Temporarily unavailable |
| `offline` | Not connected |

**Example:**

```typescript
const presenceSocket = io(`${WS_URL}/presence`, { auth: { token } });

// Set status
presenceSocket.emit('presence:status', { status: 'online' });

// Watch team members
presenceSocket.emit('presence:subscribe', {
  userIds: ['agent_1', 'agent_2', 'agent_3']
});

// Receive updates
presenceSocket.on('presence:update', ({ userId, status }) => {
  updateAgentStatus(userId, status);
});
```

---

### Dashboard Namespace (`/dashboard`)

Admin-only real-time metrics.

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `metrics:tickets` | `TicketMetrics` | Ticket counts |
| `metrics:queue` | `QueueMetrics` | Queue status |
| `metrics:agents` | `AgentMetrics` | Agent workload |
| `metrics:sla` | `SlaMetrics` | SLA status |

**Example:**

```typescript
const dashSocket = io(`${WS_URL}/dashboard`, { auth: { token } });

dashSocket.on('metrics:tickets', (metrics) => {
  updateTicketChart(metrics);
});

dashSocket.on('metrics:queue', ({ waiting, avgWaitTime }) => {
  updateQueueDisplay(waiting, avgWaitTime);
});
```

---

## Rooms & Channels

### Automatic Room Assignment

Users are automatically joined to:

| Room | Pattern | Purpose |
|------|---------|---------|
| User room | `user:{userId}` | Personal notifications |
| Team room | `team:{teamId}` | Team updates |
| Org room | `org:{orgId}` | Organization broadcasts |
| Ticket room | `ticket:{ticketId}` | Ticket subscribers |

### Room Subscription

```typescript
// Server-side room management
socket.on('ticket:subscribe', ({ ticketId }) => {
  // Verify access
  if (await canAccessTicket(socket.user, ticketId)) {
    socket.join(`ticket:${ticketId}`);
    socket.emit('ticket:subscribed', { ticketId });
  }
});

// Broadcast to room
io.to(`ticket:${ticketId}`).emit('ticket:message', message);
```

---

## Error Handling

### Error Events

```typescript
socket.on('error', (error) => {
  console.error('Socket error:', error);
  
  switch (error.code) {
    case 'AUTH_TOKEN_EXPIRED':
      // Refresh token
      break;
    case 'FORBIDDEN':
      // No permission
      break;
    case 'RATE_LIMITED':
      // Too many events
      break;
  }
});
```

### Error Response Format

```typescript
interface SocketError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
```

### Common Errors

| Code | Description | Resolution |
|------|-------------|------------|
| `AUTH_TOKEN_EXPIRED` | Token expired | Refresh and reconnect |
| `AUTH_TOKEN_INVALID` | Invalid token | Re-authenticate |
| `FORBIDDEN` | No access | Check permissions |
| `RATE_LIMITED` | Too many messages | Slow down |
| `ROOM_NOT_FOUND` | Invalid room | Check room ID |
| `PAYLOAD_TOO_LARGE` | Message too big | Reduce size |

---

## Best Practices

### Connection Management

```typescript
class SocketManager {
  private socket: Socket;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  
  connect(token: string) {
    this.socket = io(WS_URL, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    
    this.setupEventHandlers();
  }
  
  private setupEventHandlers() {
    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      this.resubscribeRooms();
    });
    
    this.socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') {
        // Server disconnected, need to reconnect manually
        this.socket.connect();
      }
    });
    
    this.socket.on('connect_error', (error) => {
      this.reconnectAttempts++;
      
      if (error.message === 'AUTH_TOKEN_EXPIRED') {
        this.handleTokenRefresh();
      }
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.handleMaxReconnectReached();
      }
    });
  }
  
  private async handleTokenRefresh() {
    const newToken = await refreshAccessToken();
    this.socket.auth.token = newToken;
    this.socket.connect();
  }
  
  disconnect() {
    this.socket.disconnect();
  }
}
```

### Event Deduplication

```typescript
const processedEvents = new Set<string>();

socket.on('ticket:message', (message) => {
  // Skip if already processed
  if (processedEvents.has(message.id)) {
    return;
  }
  
  processedEvents.add(message.id);
  handleMessage(message);
  
  // Cleanup old entries
  if (processedEvents.size > 1000) {
    const iterator = processedEvents.values();
    for (let i = 0; i < 500; i++) {
      processedEvents.delete(iterator.next().value);
    }
  }
});
```

### Graceful Degradation

```typescript
// Fallback to polling if WebSocket fails
if (!socket.connected) {
  // Switch to HTTP polling
  startPollingMode();
}

function startPollingMode() {
  setInterval(async () => {
    const updates = await api.get('/tickets/updates?since=' + lastUpdate);
    processUpdates(updates);
  }, 5000);
}
```

---

## Related Documents

- [API Overview](./overview.md) — API design principles
- [Real-time Module](../04-modules/realtime/overview.md) — Implementation
- [Infrastructure](../01-architecture/infrastructure.md) — Scaling WebSockets

---

*Back to: [API Documentation](./overview.md)*
