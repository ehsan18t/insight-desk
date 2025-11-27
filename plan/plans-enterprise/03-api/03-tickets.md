# Tickets API

> Ticket management endpoints for creating, updating, and managing support tickets

---

## Table of Contents

- [Overview](#overview)
- [Endpoints](#endpoints)
- [Request/Response Schemas](#requestresponse-schemas)
- [Filtering & Sorting](#filtering--sorting)
- [Ticket Actions](#ticket-actions)
- [Webhooks](#webhooks)

---

## Overview

The Tickets API provides complete lifecycle management for support tickets:

- Create, read, update, delete tickets
- Manage messages and internal notes
- Assign to agents and teams
- Track status and priority changes
- SLA monitoring and enforcement

### Authorization

| Role | Permissions |
|------|-------------|
| **User** | Own tickets only (create, read, add messages) |
| **Agent** | Assigned/team tickets (full CRUD) |
| **Admin** | All tickets (full CRUD, delete) |

---

## Endpoints

### Ticket CRUD

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/tickets` | List tickets | ✅ |
| `POST` | `/tickets` | Create ticket | ✅ |
| `GET` | `/tickets/:id` | Get ticket details | ✅ |
| `PATCH` | `/tickets/:id` | Update ticket | ✅ |
| `DELETE` | `/tickets/:id` | Soft delete ticket | ✅ Admin |

### Ticket Messages

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/tickets/:id/messages` | List messages | ✅ |
| `POST` | `/tickets/:id/messages` | Add message | ✅ |
| `PATCH` | `/tickets/:id/messages/:msgId` | Edit message | ✅ |
| `DELETE` | `/tickets/:id/messages/:msgId` | Delete message | ✅ |

### Internal Notes (Agents Only)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/tickets/:id/notes` | List notes | ✅ Agent |
| `POST` | `/tickets/:id/notes` | Add note | ✅ Agent |

### Ticket Actions

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/tickets/:id/assign` | Assign to agent | ✅ Agent |
| `POST` | `/tickets/:id/transfer` | Transfer to team | ✅ Agent |
| `POST` | `/tickets/:id/resolve` | Mark as resolved | ✅ Agent |
| `POST` | `/tickets/:id/close` | Close ticket | ✅ Agent |
| `POST` | `/tickets/:id/reopen` | Reopen ticket | ✅ |
| `POST` | `/tickets/:id/merge` | Merge tickets | ✅ Agent |

### Activity Log

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/tickets/:id/activity` | Get activity log | ✅ Agent |

---

## Request/Response Schemas

### GET /tickets

List tickets with filtering and pagination.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `perPage` | number | Items per page (default: 20, max: 100) |
| `status` | string | Filter by status(es) |
| `priority` | string | Filter by priority(ies) |
| `assignedTo` | string | Filter by assigned agent ID or "me" |
| `teamId` | string | Filter by team ID |
| `createdBy` | string | Filter by creator ID |
| `q` | string | Search in subject/description |
| `createdAt[gte]` | ISO date | Created after date |
| `createdAt[lte]` | ISO date | Created before date |
| `sort` | string | Sort field (prefix `-` for desc) |

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "01HQ2V7K3NWXP1ABCD123456",
      "ticketNumber": "TKT-00042",
      "subject": "Cannot login to dashboard",
      "status": "open",
      "priority": "high",
      "channel": "web",
      "createdBy": {
        "id": "user_123",
        "name": "John Customer",
        "email": "john@example.com"
      },
      "assignedTo": {
        "id": "agent_456",
        "name": "Jane Agent"
      },
      "team": {
        "id": "team_support",
        "name": "Support Team"
      },
      "slaDueAt": "2024-01-15T12:30:00Z",
      "slaBreached": false,
      "messageCount": 5,
      "lastMessageAt": "2024-01-15T11:00:00Z",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T11:00:00Z"
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "perPage": 20,
      "totalPages": 5,
      "totalCount": 98,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

---

### POST /tickets

Create a new ticket.

**Request:**

```json
{
  "subject": "Cannot login to dashboard",
  "description": "I'm getting an error when trying to login. The error message says 'Invalid credentials' but I'm sure my password is correct.",
  "priority": "high",
  "channel": "web",
  "tags": ["login", "authentication"],
  "customFields": {
    "browser": "Chrome 120",
    "os": "Windows 11"
  }
}
```

**Validation Schema:**

```typescript
const CreateTicketSchema = z.object({
  subject: z.string().min(5).max(200),
  description: z.string().min(10).max(10000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  channel: z.enum(['web', 'email', 'chat', 'api']).default('web'),
  tags: z.array(z.string()).max(10).optional(),
  customFields: z.record(z.string()).optional(),
  attachments: z.array(z.string().url()).max(10).optional(),
});
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "01HQ2V7K3NWXP1ABCD123456",
    "ticketNumber": "TKT-00042",
    "subject": "Cannot login to dashboard",
    "description": "I'm getting an error when trying to login...",
    "status": "open",
    "priority": "high",
    "channel": "web",
    "createdBy": {
      "id": "user_123",
      "name": "John Customer",
      "email": "john@example.com"
    },
    "assignedTo": null,
    "team": null,
    "slaPolicy": {
      "id": "sla_default",
      "name": "Standard SLA",
      "firstResponseTime": 60,
      "resolutionTime": 480
    },
    "slaDueAt": "2024-01-15T18:30:00Z",
    "slaBreached": false,
    "tags": ["login", "authentication"],
    "customFields": {
      "browser": "Chrome 120",
      "os": "Windows 11"
    },
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

---

### GET /tickets/:id

Get single ticket with full details.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "01HQ2V7K3NWXP1ABCD123456",
    "ticketNumber": "TKT-00042",
    "subject": "Cannot login to dashboard",
    "description": "I'm getting an error when trying to login...",
    "status": "open",
    "priority": "high",
    "channel": "web",
    "createdBy": {
      "id": "user_123",
      "name": "John Customer",
      "email": "john@example.com",
      "avatarUrl": "https://..."
    },
    "assignedTo": {
      "id": "agent_456",
      "name": "Jane Agent",
      "avatarUrl": "https://..."
    },
    "team": {
      "id": "team_support",
      "name": "Support Team"
    },
    "slaPolicy": {
      "id": "sla_default",
      "name": "Standard SLA",
      "firstResponseTime": 60,
      "resolutionTime": 480
    },
    "slaDueAt": "2024-01-15T18:30:00Z",
    "slaBreached": false,
    "firstResponseAt": "2024-01-15T10:45:00Z",
    "resolvedAt": null,
    "closedAt": null,
    "tags": ["login", "authentication"],
    "customFields": {
      "browser": "Chrome 120",
      "os": "Windows 11"
    },
    "metadata": {},
    "messageCount": 5,
    "lastMessageAt": "2024-01-15T11:00:00Z",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T11:00:00Z"
  }
}
```

---

### PATCH /tickets/:id

Update ticket properties.

**Request:**

```json
{
  "priority": "urgent",
  "tags": ["login", "authentication", "urgent"],
  "customFields": {
    "browser": "Chrome 120",
    "os": "Windows 11",
    "errorCode": "AUTH_001"
  }
}
```

**Allowed fields by role:**

| Field | User | Agent | Admin |
|-------|------|-------|-------|
| `subject` | ✅ (own) | ✅ | ✅ |
| `description` | ✅ (own) | ✅ | ✅ |
| `priority` | ❌ | ✅ | ✅ |
| `status` | ❌ | ✅ | ✅ |
| `assignedTo` | ❌ | ✅ | ✅ |
| `teamId` | ❌ | ✅ | ✅ |
| `tags` | ❌ | ✅ | ✅ |
| `customFields` | ✅ (own) | ✅ | ✅ |
| `slaPolicyId` | ❌ | ❌ | ✅ |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "01HQ2V7K3NWXP1ABCD123456",
    "ticketNumber": "TKT-00042",
    "priority": "urgent",
    ...
  }
}
```

---

### POST /tickets/:id/messages

Add a message to a ticket.

**Request:**

```json
{
  "message": "Have you tried clearing your browser cache? This often resolves login issues.",
  "isInternal": false,
  "attachments": [
    "https://cdn.insightdesk.com/attachments/abc123.png"
  ]
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "msg_789",
    "ticketId": "01HQ2V7K3NWXP1ABCD123456",
    "sender": {
      "id": "agent_456",
      "name": "Jane Agent",
      "role": "agent",
      "avatarUrl": "https://..."
    },
    "message": "Have you tried clearing your browser cache?...",
    "messageHtml": "<p>Have you tried clearing your browser cache?...</p>",
    "attachments": [
      {
        "url": "https://cdn.insightdesk.com/attachments/abc123.png",
        "name": "screenshot.png",
        "size": 125000,
        "type": "image/png"
      }
    ],
    "isInternal": false,
    "createdAt": "2024-01-15T11:00:00Z"
  }
}
```

---

### GET /tickets/:id/messages

List all messages for a ticket.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `includeInternal` | boolean | Include internal notes (agents only) |
| `cursor` | string | Pagination cursor |
| `limit` | number | Messages per page (default: 50) |

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "msg_001",
      "sender": {
        "id": "user_123",
        "name": "John Customer",
        "role": "user"
      },
      "message": "I'm getting an error when trying to login...",
      "isInternal": false,
      "createdAt": "2024-01-15T10:30:00Z"
    },
    {
      "id": "msg_002",
      "sender": {
        "id": "agent_456",
        "name": "Jane Agent",
        "role": "agent"
      },
      "message": "Have you tried clearing your browser cache?",
      "isInternal": false,
      "createdAt": "2024-01-15T10:45:00Z"
    }
  ],
  "meta": {
    "pagination": {
      "nextCursor": "eyJpZCI6Im1zZ18wMDMifQ",
      "hasMore": true
    }
  }
}
```

---

## Ticket Actions

### POST /tickets/:id/assign

Assign ticket to an agent.

**Request:**

```json
{
  "agentId": "agent_456"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "01HQ2V7K3NWXP1ABCD123456",
    "assignedTo": {
      "id": "agent_456",
      "name": "Jane Agent"
    },
    "updatedAt": "2024-01-15T11:00:00Z"
  }
}
```

---

### POST /tickets/:id/transfer

Transfer ticket to a different team.

**Request:**

```json
{
  "teamId": "team_billing",
  "note": "Transferring to billing team for payment issue"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "01HQ2V7K3NWXP1ABCD123456",
    "team": {
      "id": "team_billing",
      "name": "Billing Team"
    },
    "assignedTo": null,
    "updatedAt": "2024-01-15T11:00:00Z"
  }
}
```

---

### POST /tickets/:id/resolve

Mark ticket as resolved.

**Request:**

```json
{
  "resolution": "Cleared browser cache and cookies, login now works."
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "01HQ2V7K3NWXP1ABCD123456",
    "status": "resolved",
    "resolvedAt": "2024-01-15T11:30:00Z",
    "updatedAt": "2024-01-15T11:30:00Z"
  }
}
```

---

### POST /tickets/:id/close

Close a resolved ticket.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "01HQ2V7K3NWXP1ABCD123456",
    "status": "closed",
    "closedAt": "2024-01-15T12:00:00Z",
    "updatedAt": "2024-01-15T12:00:00Z"
  }
}
```

---

### POST /tickets/:id/reopen

Reopen a closed ticket.

**Request:**

```json
{
  "reason": "Issue has returned after the fix"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "01HQ2V7K3NWXP1ABCD123456",
    "status": "open",
    "resolvedAt": null,
    "closedAt": null,
    "updatedAt": "2024-01-15T14:00:00Z"
  }
}
```

---

### POST /tickets/:id/merge

Merge another ticket into this one.

**Request:**

```json
{
  "sourceTicketId": "01HQ2V7K3NWXP1ABCD789012",
  "note": "Merging duplicate ticket about same issue"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "01HQ2V7K3NWXP1ABCD123456",
    "mergedTickets": ["01HQ2V7K3NWXP1ABCD789012"],
    "messageCount": 10,
    "updatedAt": "2024-01-15T11:00:00Z"
  }
}
```

---

## Filtering & Sorting

### Filter Examples

```http
# Open high-priority tickets
GET /tickets?status=open&priority=high

# Multiple statuses
GET /tickets?status=open,pending

# Assigned to me
GET /tickets?assignedTo=me

# Unassigned tickets
GET /tickets?assignedTo=null

# My team's tickets
GET /tickets?teamId=team_support

# Search by keyword
GET /tickets?q=login+error

# Date range
GET /tickets?createdAt[gte]=2024-01-01&createdAt[lte]=2024-01-31

# SLA breached
GET /tickets?slaBreached=true
```

### Sort Examples

```http
# Newest first (default)
GET /tickets?sort=-createdAt

# Oldest first
GET /tickets?sort=createdAt

# By SLA deadline (urgent first)
GET /tickets?sort=slaDueAt

# By priority then date
GET /tickets?sort=-priority,-createdAt
```

---

## Webhooks

Ticket events can trigger webhooks:

| Event | Trigger |
|-------|---------|
| `ticket.created` | New ticket created |
| `ticket.updated` | Ticket fields changed |
| `ticket.assigned` | Agent assigned |
| `ticket.status_changed` | Status changed |
| `ticket.message_added` | New message added |
| `ticket.sla_breached` | SLA deadline passed |
| `ticket.resolved` | Marked as resolved |
| `ticket.closed` | Ticket closed |

See [Webhooks Documentation](./webhooks.md) for payload formats.

---

## Related Documents

- [API Overview](./overview.md) — API design principles
- [Error Handling](./error-handling.md) — Error codes
- [Tickets Module](../04-modules/tickets/overview.md) — Implementation details

---

*Next: [Knowledge Base API →](./knowledge-base.md)*
