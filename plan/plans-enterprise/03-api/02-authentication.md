# Authentication API

> Authentication endpoints, flows, and security specifications

---

## Table of Contents

- [Overview](#overview)
- [Endpoints](#endpoints)
- [Authentication Flows](#authentication-flows)
- [Token Management](#token-management)
- [Request/Response Schemas](#requestresponse-schemas)
- [Error Codes](#error-codes)

---

## Overview

InsightDesk uses JWT-based authentication with:

- **Access Tokens**: Short-lived (15 min), used for API requests
- **Refresh Tokens**: Long-lived (7 days), used to obtain new access tokens
- **Secure storage**: Refresh tokens stored in database, hashed

### Security Features

- Argon2id password hashing
- Token rotation on refresh
- Session tracking (device, IP)
- Rate limiting on auth endpoints
- 2FA support (optional)

---

## Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/auth/register` | Create new user account | ❌ |
| `POST` | `/auth/login` | Authenticate & get tokens | ❌ |
| `POST` | `/auth/refresh` | Refresh access token | ❌ (refresh token) |
| `POST` | `/auth/logout` | Revoke refresh token | ✅ |
| `POST` | `/auth/logout-all` | Revoke all sessions | ✅ |
| `GET` | `/auth/me` | Get current user | ✅ |
| `POST` | `/auth/forgot-password` | Request password reset | ❌ |
| `POST` | `/auth/reset-password` | Reset with token | ❌ |
| `POST` | `/auth/verify-email` | Verify email address | ❌ |
| `POST` | `/auth/resend-verification` | Resend verification email | ❌ |
| `POST` | `/auth/2fa/enable` | Enable 2FA | ✅ |
| `POST` | `/auth/2fa/verify` | Verify 2FA setup | ✅ |
| `POST` | `/auth/2fa/disable` | Disable 2FA | ✅ |

---

## Authentication Flows

### Registration Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │     │   API    │     │ Database │     │  Email   │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ POST /register │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ Create user    │                │
     │                │───────────────>│                │
     │                │                │                │
     │                │ User created   │                │
     │                │<───────────────│                │
     │                │                │                │
     │                │ Send verify    │                │
     │                │───────────────────────────────>│
     │                │                │                │
     │ 201 Created    │                │                │
     │ (tokens)       │                │                │
     │<───────────────│                │                │
     │                │                │                │
```

### Login Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │     │   API    │     │ Database │     │  Valkey  │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ POST /login    │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ Find user      │                │
     │                │───────────────>│                │
     │                │                │                │
     │                │ Verify password│                │
     │                │───────────────>│                │
     │                │                │                │
     │                │ Create session │                │
     │                │───────────────>│                │
     │                │                │                │
     │                │ Cache session  │                │
     │                │───────────────────────────────>│
     │                │                │                │
     │ 200 OK         │                │                │
     │ (tokens)       │                │                │
     │<───────────────│                │                │
     │                │                │                │
```

### Token Refresh Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │     │   API    │     │ Database │
└────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │
     │ POST /refresh  │                │
     │ (refresh token)│                │
     │───────────────>│                │
     │                │                │
     │                │ Validate token │
     │                │───────────────>│
     │                │                │
     │                │ Rotate token   │
     │                │───────────────>│
     │                │                │
     │ 200 OK         │                │
     │ (new tokens)   │                │
     │<───────────────│                │
     │                │                │
```

### Password Reset Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │     │   API    │     │ Database │     │  Email   │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ POST /forgot   │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ Create reset   │                │
     │                │ token          │                │
     │                │───────────────>│                │
     │                │                │                │
     │                │ Send email     │                │
     │                │───────────────────────────────>│
     │                │                │                │
     │ 200 OK         │                │                │
     │ (always)       │                │                │
     │<───────────────│                │                │
     │                │                │                │
     │ [User clicks email link]        │                │
     │                │                │                │
     │ POST /reset    │                │                │
     │ (token, pass)  │                │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ Validate token │                │
     │                │ Update password│                │
     │                │ Revoke sessions│                │
     │                │───────────────>│                │
     │                │                │                │
     │ 200 OK         │                │                │
     │<───────────────│                │                │
     │                │                │                │
```

---

## Token Management

### Access Token

```typescript
// JWT Payload
interface AccessTokenPayload {
  sub: string;          // User ID
  email: string;
  name: string;
  role: UserRole;
  teams: string[];      // Team IDs (for agents/admins)
  permissions: string[]; // Computed permissions
  iat: number;          // Issued at (Unix timestamp)
  exp: number;          // Expiry (15 minutes from iat)
}

// Example decoded token
{
  "sub": "01HQ2V7K3NWXP1ABCD123456",
  "email": "agent@example.com",
  "name": "Jane Agent",
  "role": "agent",
  "teams": ["team_support", "team_billing"],
  "permissions": ["tickets:read", "tickets:write", "kb:read"],
  "iat": 1705312800,
  "exp": 1705313700
}
```

### Refresh Token

Stored in database, not exposed in JWT:

```typescript
interface RefreshToken {
  id: string;           // Token ID
  userId: string;       // Owner
  tokenHash: string;    // SHA-256 hash of actual token
  userAgent: string;    // Browser/device info
  ipAddress: string;    // Client IP
  expiresAt: Date;      // 7 days from creation
  createdAt: Date;
}
```

### Token Rotation

On each refresh:
1. Old refresh token is invalidated
2. New refresh token is issued
3. New access token is issued

This limits the window for stolen tokens.

---

## Request/Response Schemas

### POST /auth/register

**Request:**

```json
{
  "email": "user@example.com",
  "password": "SecureP@ssw0rd123",
  "name": "John Doe"
}
```

**Validation:**

```typescript
const RegisterSchema = z.object({
  email: z.string().email().max(255),
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Password must contain uppercase letter')
    .regex(/[a-z]/, 'Password must contain lowercase letter')
    .regex(/[0-9]/, 'Password must contain number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain special character'),
  name: z.string().min(2).max(100),
});
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "01HQ2V7K3NWXP1ABCD123456",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "user",
      "emailVerified": false,
      "createdAt": "2024-01-15T10:30:00Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4...",
      "expiresIn": 900
    }
  }
}
```

---

### POST /auth/login

**Request:**

```json
{
  "email": "user@example.com",
  "password": "SecureP@ssw0rd123",
  "twoFactorCode": "123456"  // Optional, if 2FA enabled
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "01HQ2V7K3NWXP1ABCD123456",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "user",
      "emailVerified": true,
      "twoFactorEnabled": false,
      "lastLoginAt": "2024-01-15T10:30:00Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4...",
      "expiresIn": 900
    }
  }
}
```

**Response (2FA Required):**

```json
{
  "success": true,
  "data": {
    "requiresTwoFactor": true,
    "twoFactorToken": "temp_token_for_2fa_step"
  }
}
```

---

### POST /auth/refresh

**Request:**

```json
{
  "refreshToken": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4..."
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "bmV3IHJlZnJlc2ggdG9rZW4...",
      "expiresIn": 900
    }
  }
}
```

---

### POST /auth/logout

**Request Headers:**

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Request:**

```json
{
  "refreshToken": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4..."
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "message": "Successfully logged out"
  }
}
```

---

### GET /auth/me

**Request Headers:**

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "01HQ2V7K3NWXP1ABCD123456",
    "email": "agent@example.com",
    "name": "Jane Agent",
    "role": "agent",
    "status": "active",
    "avatarUrl": "https://cdn.example.com/avatars/123.jpg",
    "emailVerified": true,
    "twoFactorEnabled": true,
    "teams": [
      {
        "id": "team_support",
        "name": "Support Team",
        "roleInTeam": "agent"
      }
    ],
    "createdAt": "2024-01-01T00:00:00Z",
    "lastLoginAt": "2024-01-15T10:30:00Z"
  }
}
```

---

### POST /auth/forgot-password

**Request:**

```json
{
  "email": "user@example.com"
}
```

**Response (200):** *(Always returns success to prevent email enumeration)*

```json
{
  "success": true,
  "data": {
    "message": "If an account exists with this email, a reset link has been sent."
  }
}
```

---

### POST /auth/reset-password

**Request:**

```json
{
  "token": "reset_token_from_email",
  "password": "NewSecureP@ssw0rd456"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "message": "Password reset successfully. Please login with your new password."
  }
}
```

---

### POST /auth/2fa/enable

**Request Headers:**

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
    "backupCodes": [
      "ABCD-EFGH-1234",
      "IJKL-MNOP-5678",
      "QRST-UVWX-9012"
    ]
  }
}
```

---

### POST /auth/2fa/verify

**Request:**

```json
{
  "code": "123456"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "message": "Two-factor authentication enabled successfully"
  }
}
```

---

## Error Codes

### Authentication Errors

| Code | HTTP | Description |
|------|------|-------------|
| `AUTH_INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `AUTH_USER_NOT_FOUND` | 401 | User doesn't exist |
| `AUTH_USER_SUSPENDED` | 403 | Account suspended |
| `AUTH_EMAIL_NOT_VERIFIED` | 403 | Email not verified |
| `AUTH_INVALID_TOKEN` | 401 | Token invalid or expired |
| `AUTH_TOKEN_EXPIRED` | 401 | Token has expired |
| `AUTH_REFRESH_TOKEN_REVOKED` | 401 | Refresh token was revoked |
| `AUTH_2FA_REQUIRED` | 403 | 2FA code needed |
| `AUTH_2FA_INVALID` | 401 | Invalid 2FA code |
| `AUTH_PASSWORD_WEAK` | 400 | Password doesn't meet requirements |
| `AUTH_EMAIL_EXISTS` | 409 | Email already registered |
| `AUTH_RESET_TOKEN_INVALID` | 400 | Reset token invalid/expired |

### Example Error Responses

```json
{
  "success": false,
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Invalid email or password",
    "requestId": "req_01HQ2V7K3NWXP1ABCD123456"
  }
}
```

```json
{
  "success": false,
  "error": {
    "code": "AUTH_2FA_REQUIRED",
    "message": "Two-factor authentication required",
    "data": {
      "twoFactorToken": "temp_token_for_2fa"
    },
    "requestId": "req_01HQ2V7K3NWXP1ABCD123456"
  }
}
```

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /auth/login` | 5 attempts | 15 minutes |
| `POST /auth/register` | 3 attempts | 1 hour |
| `POST /auth/forgot-password` | 3 attempts | 1 hour |
| `POST /auth/reset-password` | 5 attempts | 1 hour |
| `POST /auth/refresh` | 30 requests | 1 minute |

---

## Related Documents

- [Security Overview](../05-security/overview.md)
- [Authentication Security](../05-security/authentication-security.md)
- [Error Handling](./error-handling.md)

---

*Next: [Tickets API →](./tickets.md)*
