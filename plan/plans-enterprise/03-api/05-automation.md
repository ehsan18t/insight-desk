# Automation API

> API endpoints for workflow automation, triggers, actions, and rule management

---

## Table of Contents

- [Overview](#overview)
- [Endpoints](#endpoints)
- [Automation Rules](#automation-rules)
- [Triggers](#triggers)
- [Actions](#actions)
- [Macros](#macros)
- [SLA Policies](#sla-policies)
- [Scheduled Jobs](#scheduled-jobs)

---

## Overview

The Automation API enables:

- Creating automation rules with triggers and actions
- Managing SLA policies and escalations
- Building reusable macros for agents
- Scheduling recurring tasks
- Monitoring automation execution

### Authorization

All automation endpoints require **Admin** role.

---

## Endpoints

### Automation Rules

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/automations` | List automation rules |
| `POST` | `/admin/automations` | Create automation rule |
| `GET` | `/admin/automations/:id` | Get automation details |
| `PATCH` | `/admin/automations/:id` | Update automation |
| `DELETE` | `/admin/automations/:id` | Delete automation |
| `POST` | `/admin/automations/:id/enable` | Enable automation |
| `POST` | `/admin/automations/:id/disable` | Disable automation |
| `POST` | `/admin/automations/:id/test` | Test automation |
| `GET` | `/admin/automations/:id/logs` | Get execution logs |

### Macros

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/macros` | List macros |
| `POST` | `/admin/macros` | Create macro |
| `GET` | `/admin/macros/:id` | Get macro details |
| `PATCH` | `/admin/macros/:id` | Update macro |
| `DELETE` | `/admin/macros/:id` | Delete macro |
| `POST` | `/tickets/:id/apply-macro` | Apply macro to ticket |

### SLA Policies

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/sla-policies` | List SLA policies |
| `POST` | `/admin/sla-policies` | Create SLA policy |
| `GET` | `/admin/sla-policies/:id` | Get SLA policy details |
| `PATCH` | `/admin/sla-policies/:id` | Update SLA policy |
| `DELETE` | `/admin/sla-policies/:id` | Delete SLA policy |
| `POST` | `/admin/sla-policies/reorder` | Reorder priorities |

### Scheduled Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/scheduled-jobs` | List scheduled jobs |
| `POST` | `/admin/scheduled-jobs` | Create scheduled job |
| `GET` | `/admin/scheduled-jobs/:id` | Get job details |
| `PATCH` | `/admin/scheduled-jobs/:id` | Update job |
| `DELETE` | `/admin/scheduled-jobs/:id` | Delete job |
| `POST` | `/admin/scheduled-jobs/:id/run` | Run job now |

---

## Automation Rules

### Rule Structure

```typescript
interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  priority: number; // Execution order
  trigger: Trigger;
  conditions: Condition[];
  conditionLogic: 'all' | 'any';
  actions: Action[];
  rateLimiting?: {
    maxExecutions: number;
    windowMinutes: number;
  };
  createdAt: string;
  updatedAt: string;
}
```

---

### POST /admin/automations

Create a new automation rule.

**Request:**

```json
{
  "name": "Auto-assign urgent tickets",
  "description": "Assign urgent tickets to senior agents team",
  "enabled": true,
  "priority": 1,
  "trigger": {
    "type": "ticket.created"
  },
  "conditions": [
    {
      "field": "priority",
      "operator": "equals",
      "value": "urgent"
    },
    {
      "field": "channel",
      "operator": "in",
      "value": ["web", "email"]
    }
  ],
  "conditionLogic": "all",
  "actions": [
    {
      "type": "assign_team",
      "params": {
        "teamId": "team_senior"
      }
    },
    {
      "type": "add_tag",
      "params": {
        "tag": "urgent-auto-assigned"
      }
    },
    {
      "type": "send_notification",
      "params": {
        "channel": "slack",
        "message": "🚨 Urgent ticket assigned: {{ticket.subject}}"
      }
    }
  ]
}
```

**Validation Schema:**

```typescript
const AutomationSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(1).max(100).default(50),
  trigger: TriggerSchema,
  conditions: z.array(ConditionSchema).max(20),
  conditionLogic: z.enum(['all', 'any']).default('all'),
  actions: z.array(ActionSchema).min(1).max(10),
  rateLimiting: z.object({
    maxExecutions: z.number().int().min(1),
    windowMinutes: z.number().int().min(1)
  }).optional()
});
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "auto_001",
    "name": "Auto-assign urgent tickets",
    "enabled": true,
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

---

### GET /admin/automations/:id/logs

Get execution logs for an automation.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status (success, failed, skipped) |
| `startDate` | ISO date | Start date |
| `endDate` | ISO date | End date |
| `limit` | number | Max results |
| `cursor` | string | Pagination cursor |

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "log_001",
      "automationId": "auto_001",
      "ticketId": "ticket_123",
      "status": "success",
      "trigger": "ticket.created",
      "conditionsMatched": true,
      "actionsExecuted": [
        { "type": "assign_team", "status": "success" },
        { "type": "add_tag", "status": "success" },
        { "type": "send_notification", "status": "success" }
      ],
      "executionTimeMs": 45,
      "executedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "meta": {
    "pagination": {
      "nextCursor": "eyJpZCI6ImxvZ18wMDIifQ",
      "hasMore": true
    }
  }
}
```

---

## Triggers

Available trigger types for automation rules.

### Ticket Triggers

| Trigger | Description | Available Fields |
|---------|-------------|------------------|
| `ticket.created` | New ticket created | All ticket fields |
| `ticket.updated` | Ticket updated | Changed fields, previous values |
| `ticket.status_changed` | Status changed | status, previousStatus |
| `ticket.assigned` | Agent assigned | assignedTo, previousAssignee |
| `ticket.priority_changed` | Priority changed | priority, previousPriority |
| `ticket.message_added` | New message added | message, isInternal |
| `ticket.sla_warning` | SLA about to breach | slaDueAt, remainingMinutes |
| `ticket.sla_breached` | SLA breached | slaDueAt, breachedAt |

### Time-Based Triggers

| Trigger | Description | Parameters |
|---------|-------------|------------|
| `schedule.hourly` | Every hour | minute (0-59) |
| `schedule.daily` | Every day | hour, minute, timezone |
| `schedule.weekly` | Every week | dayOfWeek, hour, minute |
| `schedule.cron` | Cron expression | cronExpression |

### User Triggers

| Trigger | Description | Available Fields |
|---------|-------------|------------------|
| `user.created` | New user registered | User fields |
| `user.login` | User logged in | User, device, location |
| `user.inactive` | User inactive for period | lastActiveAt, inactiveDays |

---

## Actions

Available action types for automation rules.

### Ticket Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| `set_priority` | Change priority | priority |
| `set_status` | Change status | status |
| `assign_agent` | Assign to agent | agentId |
| `assign_team` | Assign to team | teamId |
| `add_tag` | Add tag | tag |
| `remove_tag` | Remove tag | tag |
| `add_note` | Add internal note | message |
| `send_reply` | Send reply to customer | message, template |
| `apply_sla` | Apply SLA policy | slaPolicyId |
| `merge_ticket` | Merge into ticket | targetTicketId |
| `close_ticket` | Close ticket | resolution |

### Notification Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| `send_email` | Send email | to, subject, body, template |
| `send_notification` | Send app notification | userId, message |
| `send_slack` | Send Slack message | channel, message |
| `send_webhook` | Call webhook | url, method, headers, body |

### Custom Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| `run_script` | Execute custom script | scriptId, params |
| `call_api` | Call external API | url, method, headers, body |
| `delay` | Wait before next action | minutes |
| `condition` | Conditional action | condition, thenActions, elseActions |

---

## Conditions

Condition operators for filtering.

### Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `equals` | Exact match | `priority equals "high"` |
| `not_equals` | Not equal | `status not_equals "closed"` |
| `contains` | Contains substring | `subject contains "urgent"` |
| `not_contains` | Doesn't contain | `subject not_contains "spam"` |
| `starts_with` | Starts with | `email starts_with "support@"` |
| `ends_with` | Ends with | `email ends_with ".edu"` |
| `in` | In list | `priority in ["high", "urgent"]` |
| `not_in` | Not in list | `channel not_in ["api"]` |
| `greater_than` | Greater than | `messageCount greater_than 10` |
| `less_than` | Less than | `hoursOpen less_than 24` |
| `is_set` | Has value | `assignedTo is_set` |
| `is_not_set` | No value | `teamId is_not_set` |
| `matches_regex` | Regex match | `subject matches_regex "^\\[.*\\]"` |

### Available Fields

| Field | Type | Description |
|-------|------|-------------|
| `subject` | string | Ticket subject |
| `description` | string | Ticket description |
| `status` | enum | open, pending, resolved, closed |
| `priority` | enum | low, medium, high, urgent |
| `channel` | enum | web, email, chat, api |
| `assignedTo` | string | Agent ID |
| `teamId` | string | Team ID |
| `createdBy` | string | Creator ID |
| `tags` | array | Ticket tags |
| `messageCount` | number | Number of messages |
| `hoursOpen` | number | Hours since creation |
| `hoursSinceResponse` | number | Hours since last response |
| `isFirstTicket` | boolean | User's first ticket |
| `customField.*` | any | Custom field values |

---

## Macros

Macros are reusable action sets that agents can apply to tickets.

### POST /admin/macros

Create a macro.

**Request:**

```json
{
  "name": "Close as Duplicate",
  "description": "Mark ticket as duplicate and close",
  "category": "closing",
  "availableFor": ["agent", "admin"],
  "actions": [
    {
      "type": "add_tag",
      "params": { "tag": "duplicate" }
    },
    {
      "type": "send_reply",
      "params": {
        "message": "Thank you for reaching out. This issue has already been reported and is being tracked. We'll update you when it's resolved."
      }
    },
    {
      "type": "close_ticket",
      "params": {
        "resolution": "Closed as duplicate"
      }
    }
  ]
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "macro_001",
    "name": "Close as Duplicate",
    "shortcut": "ctrl+shift+d",
    "usageCount": 0,
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

---

### POST /tickets/:id/apply-macro

Apply macro to a ticket (Agent role required).

**Request:**

```json
{
  "macroId": "macro_001"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "ticketId": "ticket_123",
    "macroApplied": "macro_001",
    "actionsExecuted": [
      { "type": "add_tag", "status": "success" },
      { "type": "send_reply", "status": "success" },
      { "type": "close_ticket", "status": "success" }
    ]
  }
}
```

---

## SLA Policies

### POST /admin/sla-policies

Create an SLA policy.

**Request:**

```json
{
  "name": "Premium Support",
  "description": "SLA for premium customers",
  "priority": 1,
  "conditions": [
    {
      "field": "customerTier",
      "operator": "equals",
      "value": "premium"
    }
  ],
  "targets": {
    "firstResponse": {
      "low": 240,
      "medium": 120,
      "high": 60,
      "urgent": 15
    },
    "resolution": {
      "low": 2880,
      "medium": 1440,
      "high": 480,
      "urgent": 120
    }
  },
  "businessHours": {
    "enabled": true,
    "scheduleId": "schedule_business"
  },
  "escalations": [
    {
      "event": "warning",
      "minutesBefore": 30,
      "actions": [
        {
          "type": "send_notification",
          "params": {
            "userId": "{{ticket.assignedTo.id}}",
            "message": "SLA warning: {{ticket.ticketNumber}} due in 30 minutes"
          }
        }
      ]
    },
    {
      "event": "breached",
      "actions": [
        {
          "type": "assign_team",
          "params": { "teamId": "team_escalation" }
        },
        {
          "type": "send_slack",
          "params": {
            "channel": "#escalations",
            "message": "🚨 SLA breached: {{ticket.ticketNumber}}"
          }
        }
      ]
    }
  ]
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "sla_premium",
    "name": "Premium Support",
    "priority": 1,
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

---

### GET /admin/sla-policies

List all SLA policies.

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "sla_premium",
      "name": "Premium Support",
      "description": "SLA for premium customers",
      "priority": 1,
      "targets": {
        "firstResponse": {
          "low": 240,
          "medium": 120,
          "high": 60,
          "urgent": 15
        },
        "resolution": {
          "low": 2880,
          "medium": 1440,
          "high": 480,
          "urgent": 120
        }
      },
      "ticketCount": 156,
      "complianceRate": 0.94,
      "enabled": true,
      "createdAt": "2024-01-15T10:00:00Z"
    },
    {
      "id": "sla_default",
      "name": "Standard Support",
      "description": "Default SLA for all customers",
      "priority": 100,
      "targets": {
        "firstResponse": {
          "low": 480,
          "medium": 240,
          "high": 120,
          "urgent": 60
        },
        "resolution": {
          "low": 5760,
          "medium": 2880,
          "high": 1440,
          "urgent": 480
        }
      },
      "ticketCount": 892,
      "complianceRate": 0.87,
      "enabled": true,
      "createdAt": "2024-01-10T10:00:00Z"
    }
  ]
}
```

---

## Scheduled Jobs

### POST /admin/scheduled-jobs

Create a scheduled job.

**Request:**

```json
{
  "name": "Daily Stale Ticket Check",
  "description": "Find and flag tickets without response for 48+ hours",
  "schedule": {
    "type": "cron",
    "expression": "0 9 * * *",
    "timezone": "America/New_York"
  },
  "job": {
    "type": "query_and_action",
    "query": {
      "status": "open",
      "hoursSinceResponse": { "gte": 48 }
    },
    "actions": [
      {
        "type": "add_tag",
        "params": { "tag": "stale" }
      },
      {
        "type": "send_notification",
        "params": {
          "userId": "{{ticket.assignedTo.id}}",
          "message": "Ticket {{ticket.ticketNumber}} needs attention"
        }
      }
    ]
  },
  "enabled": true
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "job_001",
    "name": "Daily Stale Ticket Check",
    "nextRunAt": "2024-01-16T09:00:00Z",
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

---

### GET /admin/scheduled-jobs

List scheduled jobs.

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "job_001",
      "name": "Daily Stale Ticket Check",
      "description": "Find and flag tickets without response for 48+ hours",
      "schedule": {
        "type": "cron",
        "expression": "0 9 * * *",
        "timezone": "America/New_York"
      },
      "enabled": true,
      "lastRunAt": "2024-01-15T09:00:00Z",
      "lastRunStatus": "success",
      "nextRunAt": "2024-01-16T09:00:00Z",
      "stats": {
        "totalRuns": 30,
        "successfulRuns": 28,
        "failedRuns": 2,
        "avgDurationMs": 1234
      }
    }
  ]
}
```

---

## Template Variables

Variables available in automation messages.

### Ticket Variables

| Variable | Description |
|----------|-------------|
| `{{ticket.id}}` | Ticket ID |
| `{{ticket.ticketNumber}}` | Ticket number (TKT-00042) |
| `{{ticket.subject}}` | Subject line |
| `{{ticket.description}}` | Description |
| `{{ticket.status}}` | Current status |
| `{{ticket.priority}}` | Priority level |
| `{{ticket.url}}` | Link to ticket |
| `{{ticket.createdAt}}` | Creation date |

### User Variables

| Variable | Description |
|----------|-------------|
| `{{ticket.createdBy.name}}` | Customer name |
| `{{ticket.createdBy.email}}` | Customer email |
| `{{ticket.assignedTo.name}}` | Agent name |
| `{{ticket.assignedTo.email}}` | Agent email |

### Organization Variables

| Variable | Description |
|----------|-------------|
| `{{org.name}}` | Organization name |
| `{{org.supportEmail}}` | Support email |
| `{{org.domain}}` | Domain URL |

---

## Related Documents

- [API Overview](./overview.md) — API design principles
- [Automation Module](../04-modules/automation/overview.md) — Implementation details

---

*Next: [Analytics API →](./analytics.md)*
