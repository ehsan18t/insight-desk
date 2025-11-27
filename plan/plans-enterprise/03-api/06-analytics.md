# Analytics API

> API endpoints for reporting, metrics, dashboards, and data export

---

## Table of Contents

- [Overview](#overview)
- [Endpoints](#endpoints)
- [Dashboard Metrics](#dashboard-metrics)
- [Ticket Analytics](#ticket-analytics)
- [Agent Performance](#agent-performance)
- [Customer Insights](#customer-insights)
- [SLA Reports](#sla-reports)
- [Custom Reports](#custom-reports)
- [Data Export](#data-export)

---

## Overview

The Analytics API provides:

- Real-time dashboard metrics
- Historical trend analysis
- Agent performance tracking
- Customer satisfaction insights
- SLA compliance reporting
- Custom report generation
- Data export capabilities

### Authorization

| Role | Permissions |
|------|-------------|
| **Agent** | Own performance metrics |
| **Team Lead** | Team metrics |
| **Admin** | All analytics, custom reports, exports |

---

## Endpoints

### Dashboard

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/analytics/dashboard` | Real-time dashboard metrics | ✅ Agent |
| `GET` | `/analytics/dashboard/live` | Live ticket counts (SSE) | ✅ Agent |

### Ticket Analytics

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/analytics/tickets/overview` | Ticket overview stats | ✅ Admin |
| `GET` | `/analytics/tickets/volume` | Volume over time | ✅ Admin |
| `GET` | `/analytics/tickets/resolution` | Resolution metrics | ✅ Admin |
| `GET` | `/analytics/tickets/channels` | By channel breakdown | ✅ Admin |
| `GET` | `/analytics/tickets/tags` | Tag analysis | ✅ Admin |

### Agent Performance

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/analytics/agents` | Agent leaderboard | ✅ Admin |
| `GET` | `/analytics/agents/:id` | Individual agent stats | ✅ Agent |
| `GET` | `/analytics/agents/:id/trends` | Agent trend data | ✅ Agent |
| `GET` | `/analytics/teams` | Team performance | ✅ Admin |
| `GET` | `/analytics/teams/:id` | Individual team stats | ✅ Team Lead |

### Customer Analytics

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/analytics/customers/satisfaction` | CSAT scores | ✅ Admin |
| `GET` | `/analytics/customers/effort` | CES scores | ✅ Admin |
| `GET` | `/analytics/customers/segments` | Customer segments | ✅ Admin |

### SLA Reports

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/analytics/sla/overview` | SLA compliance overview | ✅ Admin |
| `GET` | `/analytics/sla/policies` | By policy breakdown | ✅ Admin |
| `GET` | `/analytics/sla/breaches` | Breach analysis | ✅ Admin |

### Custom Reports

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/admin/reports` | List saved reports | ✅ Admin |
| `POST` | `/admin/reports` | Create custom report | ✅ Admin |
| `GET` | `/admin/reports/:id` | Get report definition | ✅ Admin |
| `GET` | `/admin/reports/:id/run` | Execute report | ✅ Admin |
| `PATCH` | `/admin/reports/:id` | Update report | ✅ Admin |
| `DELETE` | `/admin/reports/:id` | Delete report | ✅ Admin |
| `POST` | `/admin/reports/:id/schedule` | Schedule report | ✅ Admin |

### Data Export

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/admin/exports` | Create export job | ✅ Admin |
| `GET` | `/admin/exports` | List export jobs | ✅ Admin |
| `GET` | `/admin/exports/:id` | Get export status | ✅ Admin |
| `GET` | `/admin/exports/:id/download` | Download export file | ✅ Admin |

---

## Dashboard Metrics

### GET /analytics/dashboard

Get real-time dashboard metrics.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | string | today, yesterday, week, month, custom |
| `startDate` | ISO date | Custom period start |
| `endDate` | ISO date | Custom period end |
| `teamId` | string | Filter by team |
| `agentId` | string | Filter by agent |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "period": {
      "type": "today",
      "start": "2024-01-15T00:00:00Z",
      "end": "2024-01-15T23:59:59Z"
    },
    "overview": {
      "openTickets": 42,
      "pendingTickets": 18,
      "unresolvedTickets": 60,
      "dueToday": 12,
      "overdue": 3
    },
    "today": {
      "created": 28,
      "createdChange": 0.15,
      "resolved": 35,
      "resolvedChange": 0.22,
      "firstResponseTime": 12.5,
      "firstResponseTimeChange": -0.08,
      "resolutionTime": 145.2,
      "resolutionTimeChange": -0.12,
      "customerSatisfaction": 4.6,
      "csatChange": 0.05
    },
    "agentsOnline": 8,
    "avgQueueTime": 4.2,
    "slaCompliance": 0.94
  }
}
```

---

### GET /analytics/dashboard/live

Server-Sent Events for real-time updates.

**Response (text/event-stream):**

```
event: ticket_counts
data: {"open": 43, "pending": 17, "resolved": 36}

event: agent_status
data: {"online": 8, "busy": 6, "away": 2}

event: queue_update
data: {"waiting": 5, "avgWaitTime": 3.5}
```

---

## Ticket Analytics

### GET /analytics/tickets/overview

Comprehensive ticket statistics.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | string | week, month, quarter, year |
| `startDate` | ISO date | Custom start |
| `endDate` | ISO date | Custom end |
| `groupBy` | string | day, week, month |
| `compareWith` | string | previous_period, previous_year |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "period": {
      "start": "2024-01-01",
      "end": "2024-01-31"
    },
    "summary": {
      "totalTickets": 892,
      "resolved": 845,
      "open": 47,
      "resolutionRate": 0.947,
      "avgFirstResponseMinutes": 15.2,
      "avgResolutionMinutes": 182.5,
      "avgMessagesPerTicket": 4.2,
      "reopenRate": 0.034
    },
    "comparison": {
      "totalTickets": { "value": 892, "change": 0.12, "previous": 796 },
      "resolutionRate": { "value": 0.947, "change": 0.02, "previous": 0.927 },
      "avgFirstResponseMinutes": { "value": 15.2, "change": -0.15, "previous": 17.9 }
    },
    "byStatus": [
      { "status": "open", "count": 25, "percentage": 0.028 },
      { "status": "pending", "count": 22, "percentage": 0.025 },
      { "status": "resolved", "count": 780, "percentage": 0.874 },
      { "status": "closed", "count": 65, "percentage": 0.073 }
    ],
    "byPriority": [
      { "priority": "urgent", "count": 45, "percentage": 0.05 },
      { "priority": "high", "count": 134, "percentage": 0.15 },
      { "priority": "medium", "count": 445, "percentage": 0.50 },
      { "priority": "low", "count": 268, "percentage": 0.30 }
    ]
  }
}
```

---

### GET /analytics/tickets/volume

Ticket volume over time.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | string | week, month, quarter, year |
| `granularity` | string | hour, day, week, month |
| `metric` | string | created, resolved, both |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "granularity": "day",
    "series": [
      {
        "date": "2024-01-01",
        "created": 28,
        "resolved": 32
      },
      {
        "date": "2024-01-02",
        "created": 35,
        "resolved": 29
      },
      {
        "date": "2024-01-03",
        "created": 22,
        "resolved": 28
      }
    ],
    "peakHours": [
      { "hour": 10, "avgTickets": 8.5 },
      { "hour": 14, "avgTickets": 7.2 },
      { "hour": 11, "avgTickets": 6.8 }
    ],
    "peakDays": [
      { "day": "Monday", "avgTickets": 42 },
      { "day": "Tuesday", "avgTickets": 38 }
    ]
  }
}
```

---

### GET /analytics/tickets/channels

Breakdown by channel.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "channels": [
      {
        "channel": "email",
        "count": 412,
        "percentage": 0.46,
        "avgResolutionMinutes": 195,
        "satisfactionScore": 4.5
      },
      {
        "channel": "web",
        "count": 298,
        "percentage": 0.33,
        "avgResolutionMinutes": 142,
        "satisfactionScore": 4.7
      },
      {
        "channel": "chat",
        "count": 156,
        "percentage": 0.18,
        "avgResolutionMinutes": 25,
        "satisfactionScore": 4.8
      },
      {
        "channel": "api",
        "count": 26,
        "percentage": 0.03,
        "avgResolutionMinutes": 210,
        "satisfactionScore": null
      }
    ]
  }
}
```

---

## Agent Performance

### GET /analytics/agents

Agent performance leaderboard.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | string | today, week, month |
| `teamId` | string | Filter by team |
| `sortBy` | string | resolved, satisfaction, responseTime |
| `limit` | number | Number of agents |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "agents": [
      {
        "id": "agent_456",
        "name": "Jane Agent",
        "avatarUrl": "https://...",
        "team": "Support Team",
        "metrics": {
          "ticketsResolved": 89,
          "avgFirstResponseMinutes": 8.5,
          "avgResolutionMinutes": 125,
          "satisfactionScore": 4.9,
          "responseRate": 0.98,
          "reopenRate": 0.02
        },
        "rank": 1,
        "previousRank": 2
      },
      {
        "id": "agent_789",
        "name": "John Support",
        "avatarUrl": "https://...",
        "team": "Support Team",
        "metrics": {
          "ticketsResolved": 76,
          "avgFirstResponseMinutes": 12.3,
          "avgResolutionMinutes": 142,
          "satisfactionScore": 4.7,
          "responseRate": 0.95,
          "reopenRate": 0.03
        },
        "rank": 2,
        "previousRank": 1
      }
    ]
  }
}
```

---

### GET /analytics/agents/:id

Individual agent detailed stats.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "agent": {
      "id": "agent_456",
      "name": "Jane Agent",
      "email": "jane@company.com",
      "team": "Support Team"
    },
    "period": {
      "start": "2024-01-01",
      "end": "2024-01-31"
    },
    "summary": {
      "ticketsAssigned": 95,
      "ticketsResolved": 89,
      "resolutionRate": 0.937,
      "avgFirstResponseMinutes": 8.5,
      "avgResolutionMinutes": 125,
      "avgMessagesPerTicket": 3.8,
      "satisfactionScore": 4.9,
      "satisfactionResponses": 72
    },
    "workload": {
      "currentOpen": 6,
      "avgDailyResolved": 4.2,
      "busiestDay": "Monday",
      "busiestHour": 10
    },
    "categories": [
      { "tag": "billing", "count": 25, "percentage": 0.28 },
      { "tag": "technical", "count": 42, "percentage": 0.47 },
      { "tag": "general", "count": 22, "percentage": 0.25 }
    ],
    "trends": {
      "daily": [
        { "date": "2024-01-15", "resolved": 5, "satisfaction": 4.8 },
        { "date": "2024-01-16", "resolved": 4, "satisfaction": 5.0 }
      ]
    }
  }
}
```

---

## Customer Insights

### GET /analytics/customers/satisfaction

Customer satisfaction analysis.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | string | week, month, quarter |
| `groupBy` | string | day, week, month |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "csat": {
      "score": 4.6,
      "responses": 456,
      "responseRate": 0.54,
      "distribution": [
        { "rating": 5, "count": 298, "percentage": 0.65 },
        { "rating": 4, "count": 98, "percentage": 0.22 },
        { "rating": 3, "count": 32, "percentage": 0.07 },
        { "rating": 2, "count": 18, "percentage": 0.04 },
        { "rating": 1, "count": 10, "percentage": 0.02 }
      ],
      "trend": [
        { "date": "2024-01-01", "score": 4.5 },
        { "date": "2024-01-08", "score": 4.6 },
        { "date": "2024-01-15", "score": 4.7 }
      ]
    },
    "nps": {
      "score": 42,
      "promoters": 156,
      "passives": 89,
      "detractors": 45
    },
    "topReasons": {
      "positive": [
        { "reason": "Quick response", "count": 145 },
        { "reason": "Helpful agent", "count": 123 },
        { "reason": "Problem solved", "count": 98 }
      ],
      "negative": [
        { "reason": "Long wait time", "count": 12 },
        { "reason": "Issue not resolved", "count": 8 },
        { "reason": "Multiple contacts needed", "count": 5 }
      ]
    }
  }
}
```

---

## SLA Reports

### GET /analytics/sla/overview

SLA compliance overview.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "overall": {
      "compliance": 0.94,
      "totalTickets": 892,
      "withinSla": 838,
      "breached": 54
    },
    "byMetric": {
      "firstResponse": {
        "compliance": 0.96,
        "avgMinutes": 15.2,
        "targetMinutes": 60,
        "breached": 32
      },
      "resolution": {
        "compliance": 0.92,
        "avgMinutes": 182,
        "targetMinutes": 480,
        "breached": 68
      }
    },
    "byPriority": [
      { "priority": "urgent", "compliance": 0.89, "breached": 5 },
      { "priority": "high", "compliance": 0.92, "breached": 11 },
      { "priority": "medium", "compliance": 0.95, "breached": 22 },
      { "priority": "low", "compliance": 0.97, "breached": 8 }
    ],
    "byPolicy": [
      {
        "policyId": "sla_premium",
        "name": "Premium Support",
        "compliance": 0.98,
        "tickets": 156
      },
      {
        "policyId": "sla_default",
        "name": "Standard Support",
        "compliance": 0.93,
        "tickets": 736
      }
    ],
    "trend": [
      { "date": "2024-01-01", "compliance": 0.92 },
      { "date": "2024-01-08", "compliance": 0.93 },
      { "date": "2024-01-15", "compliance": 0.94 }
    ]
  }
}
```

---

## Custom Reports

### POST /admin/reports

Create a custom report.

**Request:**

```json
{
  "name": "Weekly Team Performance",
  "description": "Weekly summary of team performance metrics",
  "type": "tabular",
  "query": {
    "entity": "tickets",
    "filters": [
      { "field": "status", "operator": "in", "value": ["resolved", "closed"] }
    ],
    "groupBy": ["assignedTo.team", "assignedTo.name"],
    "metrics": [
      { "field": "count", "alias": "ticketsResolved" },
      { "field": "avg:firstResponseMinutes", "alias": "avgResponseTime" },
      { "field": "avg:resolutionMinutes", "alias": "avgResolutionTime" },
      { "field": "avg:satisfactionRating", "alias": "avgSatisfaction" }
    ],
    "orderBy": [{ "field": "ticketsResolved", "direction": "desc" }]
  },
  "visualization": {
    "type": "table",
    "columns": [
      { "field": "team", "label": "Team" },
      { "field": "name", "label": "Agent" },
      { "field": "ticketsResolved", "label": "Resolved" },
      { "field": "avgResponseTime", "label": "Avg Response (min)", "format": "number" },
      { "field": "avgSatisfaction", "label": "Satisfaction", "format": "rating" }
    ]
  }
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "report_001",
    "name": "Weekly Team Performance",
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

---

### GET /admin/reports/:id/run

Execute a custom report.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | ISO date | Period start |
| `endDate` | ISO date | Period end |
| `format` | string | json, csv |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "report": {
      "id": "report_001",
      "name": "Weekly Team Performance"
    },
    "parameters": {
      "startDate": "2024-01-08",
      "endDate": "2024-01-14"
    },
    "results": [
      {
        "team": "Support Team",
        "name": "Jane Agent",
        "ticketsResolved": 42,
        "avgResponseTime": 8.5,
        "avgResolutionTime": 125,
        "avgSatisfaction": 4.9
      },
      {
        "team": "Support Team",
        "name": "John Support",
        "ticketsResolved": 38,
        "avgResponseTime": 12.3,
        "avgResolutionTime": 142,
        "avgSatisfaction": 4.7
      }
    ],
    "executedAt": "2024-01-15T10:30:00Z",
    "executionTimeMs": 234
  }
}
```

---

### POST /admin/reports/:id/schedule

Schedule report delivery.

**Request:**

```json
{
  "schedule": {
    "type": "weekly",
    "dayOfWeek": 1,
    "hour": 9,
    "timezone": "America/New_York"
  },
  "delivery": {
    "type": "email",
    "recipients": ["manager@company.com", "team-lead@company.com"],
    "format": "pdf",
    "includeCharts": true
  }
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "reportId": "report_001",
    "scheduleId": "schedule_001",
    "nextRunAt": "2024-01-22T09:00:00Z"
  }
}
```

---

## Data Export

### POST /admin/exports

Create a data export job.

**Request:**

```json
{
  "type": "tickets",
  "filters": {
    "createdAt": {
      "gte": "2024-01-01",
      "lte": "2024-01-31"
    },
    "status": ["resolved", "closed"]
  },
  "fields": [
    "ticketNumber",
    "subject",
    "status",
    "priority",
    "createdAt",
    "resolvedAt",
    "assignedTo.name",
    "createdBy.email",
    "satisfactionRating"
  ],
  "format": "csv"
}
```

**Response (202):**

```json
{
  "success": true,
  "data": {
    "id": "export_001",
    "status": "processing",
    "estimatedRecords": 845,
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

---

### GET /admin/exports/:id

Check export status.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "export_001",
    "status": "completed",
    "type": "tickets",
    "format": "csv",
    "recordCount": 845,
    "fileSize": 125432,
    "downloadUrl": "/admin/exports/export_001/download",
    "expiresAt": "2024-01-22T10:00:00Z",
    "createdAt": "2024-01-15T10:00:00Z",
    "completedAt": "2024-01-15T10:01:23Z"
  }
}
```

---

## Related Documents

- [API Overview](./overview.md) — API design principles
- [Dashboard Module](../04-modules/analytics/overview.md) — Implementation details

---

*Next: [Error Handling →](./error-handling.md)*
