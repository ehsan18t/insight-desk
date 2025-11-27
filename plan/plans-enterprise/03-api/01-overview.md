# API Design Overview

> REST API design principles, standards, and conventions for InsightDesk

---

## Table of Contents

- [API Design Principles](#api-design-principles)
- [URL Structure](#url-structure)
- [Request/Response Format](#requestresponse-format)
- [Authentication](#authentication)
- [Pagination](#pagination)
- [Filtering & Sorting](#filtering--sorting)
- [API Versioning](#api-versioning)
- [Rate Limiting](#rate-limiting)
- [Caching](#caching)

---

## API Design Principles

### Core Principles

1. **RESTful**: Resource-oriented URLs, standard HTTP methods
2. **Consistent**: Uniform patterns across all endpoints
3. **Predictable**: Developers can guess endpoint structure
4. **Documented**: OpenAPI/Swagger specification
5. **Versioned**: Breaking changes only in new versions
6. **Secure**: Authentication, authorization, input validation

### HTTP Methods

| Method | Usage | Idempotent | Safe |
|--------|-------|------------|------|
| `GET` | Retrieve resource(s) | ✅ | ✅ |
| `POST` | Create resource | ❌ | ❌ |
| `PUT` | Replace resource entirely | ✅ | ❌ |
| `PATCH` | Partial update | ❌ | ❌ |
| `DELETE` | Remove resource | ✅ | ❌ |

### HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| `200` | OK | Successful GET, PUT, PATCH, DELETE |
| `201` | Created | Successful POST creating a resource |
| `204` | No Content | Successful DELETE with no body |
| `400` | Bad Request | Validation errors, malformed request |
| `401` | Unauthorized | Missing or invalid authentication |
| `403` | Forbidden | Authenticated but not authorized |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Resource conflict (duplicate, etc.) |
| `422` | Unprocessable Entity | Semantic validation errors |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Unexpected server error |

---

## URL Structure

### Base URL

```
Production:  https://api.insightdesk.com/v1
Staging:     https://api-staging.insightdesk.com/v1
Development: http://localhost:3001/api/v1
```

### Resource Naming

| Pattern | Example | Notes |
|---------|---------|-------|
| Collection | `/tickets` | Plural nouns |
| Single resource | `/tickets/:id` | Resource by ID |
| Nested resource | `/tickets/:id/messages` | Sub-resources |
| Actions | `/tickets/:id/assign` | POST for actions |

### URL Examples

```
# Resources
GET    /api/v1/tickets                    # List tickets
POST   /api/v1/tickets                    # Create ticket
GET    /api/v1/tickets/:id                # Get ticket
PATCH  /api/v1/tickets/:id                # Update ticket
DELETE /api/v1/tickets/:id                # Delete ticket

# Nested resources
GET    /api/v1/tickets/:id/messages       # List ticket messages
POST   /api/v1/tickets/:id/messages       # Add message to ticket
GET    /api/v1/tickets/:id/notes          # List internal notes
POST   /api/v1/tickets/:id/notes          # Add internal note

# Actions (RPC-style when REST doesn't fit)
POST   /api/v1/tickets/:id/assign         # Assign ticket
POST   /api/v1/tickets/:id/resolve        # Resolve ticket
POST   /api/v1/tickets/:id/reopen         # Reopen ticket
POST   /api/v1/tickets/:id/merge          # Merge tickets

# Relationships
GET    /api/v1/users/:id/tickets          # User's tickets
GET    /api/v1/teams/:id/members          # Team members

# Search & filtering
GET    /api/v1/tickets?status=open&priority=high
GET    /api/v1/kb/articles?q=password+reset
```

---

## Request/Response Format

### Request Headers

```http
Content-Type: application/json
Accept: application/json
Authorization: Bearer <access_token>
X-Request-ID: <uuid>                      # For request tracing
X-Idempotency-Key: <uuid>                 # For POST/PATCH idempotency
Accept-Language: en-US                    # For i18n
```

### Response Envelope

All responses follow a consistent envelope format:

```typescript
// Success response
interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    pagination?: PaginationMeta;
    [key: string]: any;
  };
}

// Error response
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
    requestId?: string;
  };
}
```

### Success Response Examples

**Single Resource:**

```json
{
  "success": true,
  "data": {
    "id": "01HQ2V7K3NWXP1ABCD123456",
    "ticketNumber": "TKT-00042",
    "subject": "Cannot login to dashboard",
    "status": "open",
    "priority": "high",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

**Collection with Pagination:**

```json
{
  "success": true,
  "data": [
    { "id": "...", "subject": "..." },
    { "id": "...", "subject": "..." }
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

**Created Resource:**

```json
{
  "success": true,
  "data": {
    "id": "01HQ2V7K3NWXP1ABCD123456",
    "ticketNumber": "TKT-00042",
    ...
  }
}
```

### Error Response Examples

**Validation Error (400/422):**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "subject": ["Subject is required", "Subject must be at least 5 characters"],
      "priority": ["Invalid priority value"]
    },
    "requestId": "req_01HQ2V7K3NWXP1ABCD123456"
  }
}
```

**Not Found (404):**

```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Ticket not found",
    "requestId": "req_01HQ2V7K3NWXP1ABCD123456"
  }
}
```

**Unauthorized (401):**

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired access token",
    "requestId": "req_01HQ2V7K3NWXP1ABCD123456"
  }
}
```

---

## Authentication

### JWT Bearer Tokens

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token Structure

```typescript
// Access Token Payload
interface AccessTokenPayload {
  sub: string;        // User ID
  email: string;
  role: 'user' | 'agent' | 'admin';
  teams: string[];    // Team IDs (for agents)
  iat: number;        // Issued at
  exp: number;        // Expiration (15 minutes)
}

// Refresh Token (opaque, stored in database)
// Only contains reference ID, validated server-side
```

### Auth Endpoints

```
POST /api/v1/auth/register    # User registration
POST /api/v1/auth/login       # Get tokens
POST /api/v1/auth/refresh     # Refresh access token
POST /api/v1/auth/logout      # Revoke refresh token
POST /api/v1/auth/forgot      # Request password reset
POST /api/v1/auth/reset       # Reset password with token
GET  /api/v1/auth/me          # Get current user
```

See [Authentication API](./authentication.md) for detailed specs.

---

## Pagination

### Offset-based Pagination

For most list endpoints:

```http
GET /api/v1/tickets?page=2&perPage=20
```

**Parameters:**

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `page` | integer | 1 | - | Page number (1-indexed) |
| `perPage` | integer | 20 | 100 | Items per page |

**Response Meta:**

```json
{
  "meta": {
    "pagination": {
      "page": 2,
      "perPage": 20,
      "totalPages": 5,
      "totalCount": 98,
      "hasNextPage": true,
      "hasPrevPage": true
    }
  }
}
```

### Cursor-based Pagination

For real-time data or large datasets:

```http
GET /api/v1/tickets/:id/messages?cursor=eyJpZCI6IjEyMyJ9&limit=50
```

**Parameters:**

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `cursor` | string | - | - | Opaque cursor from previous response |
| `limit` | integer | 20 | 100 | Items per page |

**Response Meta:**

```json
{
  "meta": {
    "pagination": {
      "nextCursor": "eyJpZCI6IjE1MCJ9",
      "prevCursor": "eyJpZCI6IjEwMCJ9",
      "hasMore": true
    }
  }
}
```

---

## Filtering & Sorting

### Query Parameters

```http
GET /api/v1/tickets?status=open&priority=high,urgent&assignedTo=me
```

### Filter Operators

| Operator | Example | Description |
|----------|---------|-------------|
| Equality | `status=open` | Exact match |
| Multiple | `priority=high,urgent` | Any of values (OR) |
| Range | `createdAt[gte]=2024-01-01` | Greater than or equal |
| Search | `q=login issue` | Full-text search |
| Null | `assignedTo=null` | Check for null |
| Not | `status[not]=closed` | Not equal |

### Sorting

```http
GET /api/v1/tickets?sort=-createdAt,priority
```

| Prefix | Direction |
|--------|-----------|
| (none) | Ascending |
| `-` | Descending |

**Multiple sorts:** Comma-separated, applied in order.

### Filtering Examples

```http
# Open high-priority tickets
GET /api/v1/tickets?status=open&priority=high

# Tickets created in last 7 days
GET /api/v1/tickets?createdAt[gte]=2024-01-08

# Search tickets
GET /api/v1/tickets?q=password+reset

# Unassigned tickets
GET /api/v1/tickets?assignedTo=null

# My team's tickets, sorted by SLA
GET /api/v1/tickets?teamId=123&sort=slaDueAt
```

### Field Selection (Sparse Fieldsets)

```http
GET /api/v1/tickets?fields=id,subject,status,createdAt
```

Reduces payload size by returning only requested fields.

---

## API Versioning

### URL Path Versioning

```
/api/v1/tickets
/api/v2/tickets
```

### Versioning Strategy

| Version | Status | Description |
|---------|--------|-------------|
| `v1` | Current | Active development |
| `v2` | Future | Breaking changes |

### Deprecation Policy

1. **6-month notice** before deprecating a version
2. **Deprecation header** in responses:
   ```http
   Deprecation: true
   Sunset: Sat, 01 Jul 2025 00:00:00 GMT
   Link: <https://api.insightdesk.com/v2/tickets>; rel="successor-version"
   ```
3. **Migration guide** published

### Breaking vs Non-Breaking Changes

**Breaking Changes (require new version):**
- Removing endpoints
- Removing fields from response
- Changing field types
- Renaming required parameters

**Non-Breaking Changes (same version):**
- Adding new endpoints
- Adding optional fields to response
- Adding optional parameters
- Deprecating fields (but keeping them)

---

## Rate Limiting

### Default Limits

| Tier | Rate | Window |
|------|------|--------|
| Anonymous | 30 req | 1 minute |
| Authenticated User | 100 req | 1 minute |
| Agent | 200 req | 1 minute |
| Admin | 500 req | 1 minute |

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705312800
Retry-After: 30
```

### Rate Limit Response (429)

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again in 30 seconds.",
    "retryAfter": 30
  }
}
```

### Per-Endpoint Limits

Some endpoints have stricter limits:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /auth/login` | 5 | 15 minutes |
| `POST /auth/forgot` | 3 | 1 hour |
| `POST /tickets` | 10 | 1 minute |
| `POST /tickets/:id/messages` | 30 | 1 minute |

---

## Caching

### Cache Headers

```http
# Cacheable response
Cache-Control: private, max-age=300
ETag: "abc123"

# Conditional request
If-None-Match: "abc123"

# Not modified response (304)
HTTP/1.1 304 Not Modified
ETag: "abc123"
```

### Cache Strategies

| Resource | Strategy | TTL |
|----------|----------|-----|
| User profile | Private, revalidate | 5 min |
| Ticket list | Private, no-cache | 0 |
| KB article (public) | Public, stale-while-revalidate | 1 hour |
| Static assets | Immutable | 1 year |

### ETag Implementation

```typescript
// Server-side ETag generation
const etag = crypto
  .createHash('md5')
  .update(JSON.stringify(data))
  .digest('hex');

res.setHeader('ETag', `"${etag}"`);

// Conditional response
if (req.headers['if-none-match'] === `"${etag}"`) {
  return res.status(304).end();
}
```

---

## OpenAPI Specification

### Generating OpenAPI Docs

```typescript
// Using Zod to OpenAPI
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

const TicketSchema = z.object({
  id: z.string().uuid().openapi({ example: '01HQ2V7K3NWXP1ABCD123456' }),
  subject: z.string().min(5).max(200).openapi({ example: 'Cannot login' }),
  status: z.enum(['open', 'pending', 'resolved', 'closed']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
}).openapi('Ticket');
```

### Swagger UI

Available at:
- Development: `http://localhost:3001/api/docs`
- Staging: `https://api-staging.insightdesk.com/docs`

---

## Related Documents

- [Authentication API](./authentication.md) — Auth endpoints
- [Tickets API](./tickets.md) — Ticket CRUD
- [Error Handling](./error-handling.md) — Error codes
- [Security](../05-security/overview.md) — Security practices

---

*Next: [Authentication API →](./authentication.md)*
