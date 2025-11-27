# Error Handling

> Standardized error responses, error codes, and error handling best practices

---

## Table of Contents

- [Error Response Format](#error-response-format)
- [HTTP Status Codes](#http-status-codes)
- [Error Codes Reference](#error-codes-reference)
- [Validation Errors](#validation-errors)
- [Rate Limiting](#rate-limiting)
- [Retry Strategies](#retry-strategies)
- [Error Logging](#error-logging)

---

## Error Response Format

All API errors follow a consistent JSON structure.

### Standard Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format",
        "code": "INVALID_FORMAT"
      }
    ],
    "requestId": "req_01HQ2V7K3NWXP1ABCD",
    "timestamp": "2024-01-15T10:30:00Z",
    "documentation": "https://docs.insightdesk.com/errors/VALIDATION_ERROR"
  }
}
```

### Error Response Schema

```typescript
interface ErrorResponse {
  success: false;
  error: {
    // Machine-readable error code
    code: string;
    
    // Human-readable message
    message: string;
    
    // Additional error details (optional)
    details?: ErrorDetail[] | Record<string, unknown>;
    
    // Unique request identifier for debugging
    requestId: string;
    
    // ISO 8601 timestamp
    timestamp: string;
    
    // Link to error documentation (optional)
    documentation?: string;
    
    // Retry information (optional)
    retry?: {
      after: number; // seconds
      limit?: number;
    };
  };
}

interface ErrorDetail {
  field?: string;
  message: string;
  code: string;
  value?: unknown;
}
```

---

## HTTP Status Codes

### Client Errors (4xx)

| Status | Name | Description | When to Use |
|--------|------|-------------|-------------|
| `400` | Bad Request | Invalid request syntax or parameters | Malformed JSON, invalid query params |
| `401` | Unauthorized | Missing or invalid authentication | No token, expired token |
| `403` | Forbidden | Insufficient permissions | Valid auth but no access |
| `404` | Not Found | Resource doesn't exist | Invalid ID, deleted resource |
| `405` | Method Not Allowed | HTTP method not supported | POST on GET-only endpoint |
| `409` | Conflict | Resource state conflict | Duplicate entry, stale update |
| `410` | Gone | Resource permanently removed | Deprecated endpoint |
| `422` | Unprocessable Entity | Validation error | Invalid field values |
| `429` | Too Many Requests | Rate limit exceeded | Throttled request |

### Server Errors (5xx)

| Status | Name | Description | When to Use |
|--------|------|-------------|-------------|
| `500` | Internal Server Error | Unexpected server error | Unhandled exceptions |
| `502` | Bad Gateway | Upstream service failure | Database/cache down |
| `503` | Service Unavailable | Server temporarily offline | Maintenance mode |
| `504` | Gateway Timeout | Upstream service timeout | Slow database query |

---

## Error Codes Reference

### Authentication Errors

| Code | HTTP | Message | Resolution |
|------|------|---------|------------|
| `AUTH_TOKEN_MISSING` | 401 | Authentication token required | Include Bearer token in Authorization header |
| `AUTH_TOKEN_INVALID` | 401 | Invalid authentication token | Token is malformed or corrupted |
| `AUTH_TOKEN_EXPIRED` | 401 | Authentication token has expired | Refresh your access token |
| `AUTH_REFRESH_INVALID` | 401 | Invalid refresh token | Re-authenticate with credentials |
| `AUTH_REFRESH_EXPIRED` | 401 | Refresh token has expired | Re-authenticate with credentials |
| `AUTH_CREDENTIALS_INVALID` | 401 | Invalid email or password | Check credentials and retry |
| `AUTH_ACCOUNT_LOCKED` | 403 | Account is locked | Contact support to unlock |
| `AUTH_ACCOUNT_DISABLED` | 403 | Account has been disabled | Contact administrator |
| `AUTH_EMAIL_UNVERIFIED` | 403 | Email address not verified | Check email for verification link |
| `AUTH_MFA_REQUIRED` | 403 | MFA verification required | Submit MFA code |
| `AUTH_MFA_INVALID` | 401 | Invalid MFA code | Check code and retry |
| `AUTH_SESSION_INVALID` | 401 | Session is invalid or expired | Re-authenticate |

### Authorization Errors

| Code | HTTP | Message | Resolution |
|------|------|---------|------------|
| `FORBIDDEN` | 403 | Access denied | Insufficient permissions |
| `ROLE_REQUIRED` | 403 | Required role: {role} | Request role upgrade |
| `RESOURCE_ACCESS_DENIED` | 403 | No access to this resource | Check resource ownership |
| `ACTION_NOT_ALLOWED` | 403 | This action is not permitted | Check allowed actions |
| `ORGANIZATION_ACCESS_DENIED` | 403 | No access to this organization | Check org membership |

### Validation Errors

| Code | HTTP | Message | Resolution |
|------|------|---------|------------|
| `VALIDATION_ERROR` | 422 | Validation failed | Check field errors in details |
| `REQUIRED_FIELD` | 422 | Field {field} is required | Provide required field |
| `INVALID_FORMAT` | 422 | Invalid format for {field} | Check field format requirements |
| `INVALID_TYPE` | 422 | Expected {expected}, got {actual} | Use correct data type |
| `INVALID_LENGTH` | 422 | Must be between {min} and {max} characters | Adjust value length |
| `INVALID_RANGE` | 422 | Must be between {min} and {max} | Adjust numeric value |
| `INVALID_ENUM` | 422 | Must be one of: {values} | Use allowed value |
| `INVALID_EMAIL` | 422 | Invalid email address | Use valid email format |
| `INVALID_URL` | 422 | Invalid URL format | Use valid URL |
| `INVALID_DATE` | 422 | Invalid date format | Use ISO 8601 format |
| `INVALID_UUID` | 422 | Invalid ID format | Use valid ULID/UUID |

### Resource Errors

| Code | HTTP | Message | Resolution |
|------|------|---------|------------|
| `RESOURCE_NOT_FOUND` | 404 | {resource} not found | Check ID exists |
| `TICKET_NOT_FOUND` | 404 | Ticket not found | Verify ticket ID |
| `USER_NOT_FOUND` | 404 | User not found | Verify user ID |
| `ARTICLE_NOT_FOUND` | 404 | Article not found | Verify article slug/ID |
| `ATTACHMENT_NOT_FOUND` | 404 | Attachment not found | Verify attachment ID |
| `RESOURCE_ALREADY_EXISTS` | 409 | {resource} already exists | Use different identifier |
| `EMAIL_ALREADY_EXISTS` | 409 | Email already registered | Use different email or login |
| `SLUG_ALREADY_EXISTS` | 409 | Slug already taken | Use different slug |
| `RESOURCE_DELETED` | 410 | {resource} has been deleted | Resource is permanently removed |
| `CONCURRENT_UPDATE` | 409 | Resource was modified | Fetch latest and retry |

### Rate Limiting Errors

| Code | HTTP | Message | Resolution |
|------|------|---------|------------|
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit exceeded | Wait and retry |
| `DAILY_LIMIT_EXCEEDED` | 429 | Daily limit exceeded | Wait until reset |
| `CONCURRENT_LIMIT` | 429 | Too many concurrent requests | Reduce parallelism |

### Server Errors

| Code | HTTP | Message | Resolution |
|------|------|---------|------------|
| `INTERNAL_ERROR` | 500 | An unexpected error occurred | Retry or contact support |
| `DATABASE_ERROR` | 500 | Database operation failed | Retry later |
| `EXTERNAL_SERVICE_ERROR` | 502 | External service unavailable | Retry later |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable | Wait and retry |
| `TIMEOUT` | 504 | Request timed out | Retry with simpler query |

---

## Validation Errors

### Detailed Field Errors

Validation errors include details for each invalid field:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format",
        "code": "INVALID_EMAIL",
        "value": "not-an-email"
      },
      {
        "field": "password",
        "message": "Must be at least 8 characters",
        "code": "INVALID_LENGTH",
        "value": null
      },
      {
        "field": "priority",
        "message": "Must be one of: low, medium, high, urgent",
        "code": "INVALID_ENUM",
        "value": "super-high"
      }
    ],
    "requestId": "req_01HQ2V7K3NWXP1ABCD"
  }
}
```

### Nested Field Errors

For nested objects, use dot notation:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "field": "address.zipCode",
        "message": "Invalid ZIP code format",
        "code": "INVALID_FORMAT"
      },
      {
        "field": "contacts[0].email",
        "message": "Invalid email format",
        "code": "INVALID_EMAIL"
      }
    ]
  }
}
```

---

## Rate Limiting

### Rate Limit Headers

All responses include rate limit information:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705320600
X-RateLimit-Policy: 100;w=60
```

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests per window |
| `X-RateLimit-Remaining` | Remaining requests in window |
| `X-RateLimit-Reset` | Unix timestamp when limit resets |
| `X-RateLimit-Policy` | Rate limit policy (requests;window) |

### Rate Limit Error Response

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please retry after 45 seconds.",
    "retry": {
      "after": 45
    },
    "requestId": "req_01HQ2V7K3NWXP1ABCD"
  }
}
```

### Rate Limit Tiers

| Tier | Limit | Window | Applies To |
|------|-------|--------|------------|
| **Anonymous** | 20/min | 60s | Unauthenticated requests |
| **Authenticated** | 100/min | 60s | Normal users |
| **Agent** | 300/min | 60s | Support agents |
| **Admin** | 500/min | 60s | Administrators |
| **API Key** | 1000/min | 60s | API integrations |

### Per-Endpoint Limits

Some endpoints have specific limits:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /auth/login` | 5/min | 60s |
| `POST /auth/forgot-password` | 3/hour | 3600s |
| `POST /tickets` | 10/min | 60s |
| `GET /kb/search` | 30/min | 60s |
| `POST /*/bulk` | 5/min | 60s |

---

## Retry Strategies

### Retryable Errors

| Status | Retry | Strategy |
|--------|-------|----------|
| `408` | ✅ | Immediate retry |
| `429` | ✅ | Wait for `Retry-After` header |
| `500` | ✅ | Exponential backoff |
| `502` | ✅ | Exponential backoff |
| `503` | ✅ | Wait for `Retry-After` header |
| `504` | ✅ | Exponential backoff |

### Non-Retryable Errors

| Status | Reason |
|--------|--------|
| `400` | Client error - fix request |
| `401` | Auth error - re-authenticate |
| `403` | Permission error - cannot retry |
| `404` | Resource doesn't exist |
| `409` | Conflict - resolve manually |
| `422` | Validation error - fix request |

### Exponential Backoff

Recommended retry strategy:

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (!isRetryable(error)) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      const jitter = Math.random() * 1000;
      
      await sleep(delay + jitter);
    }
  }
  
  throw lastError;
}

function isRetryable(error: any): boolean {
  const status = error.response?.status;
  return [408, 429, 500, 502, 503, 504].includes(status);
}
```

---

## Error Logging

### Client-Side Error Tracking

Include request ID in support tickets:

```typescript
try {
  const response = await api.post('/tickets', data);
} catch (error) {
  const requestId = error.response?.data?.error?.requestId;
  
  // Log for debugging
  console.error('API Error:', {
    requestId,
    code: error.response?.data?.error?.code,
    status: error.response?.status
  });
  
  // Show user-friendly message
  showError(`Something went wrong. Reference: ${requestId}`);
}
```

### Server-Side Correlation

All logs include the request ID for tracing:

```json
{
  "level": "error",
  "requestId": "req_01HQ2V7K3NWXP1ABCD",
  "userId": "user_123",
  "method": "POST",
  "path": "/api/v1/tickets",
  "statusCode": 500,
  "error": {
    "code": "DATABASE_ERROR",
    "message": "Connection timeout",
    "stack": "..."
  },
  "duration": 5032,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## Error Handling Best Practices

### For API Consumers

1. **Always check `success` field** - Don't rely only on HTTP status
2. **Handle rate limits gracefully** - Implement backoff
3. **Log request IDs** - Include in bug reports
4. **Parse validation errors** - Show field-specific messages
5. **Implement retry logic** - For transient errors only

### For API Implementation

1. **Never expose internal errors** - Map to safe error codes
2. **Always include request ID** - Enable debugging
3. **Log all errors server-side** - With full context
4. **Validate early** - Return 422 before processing
5. **Use specific error codes** - Not generic messages

---

## Related Documents

- [API Overview](./overview.md) — API design principles
- [Authentication](./authentication.md) — Auth error handling
- [Security](../05-security/overview.md) — Security error responses

---

*Next: [WebSockets API →](./websockets.md)*
