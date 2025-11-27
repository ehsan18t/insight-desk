# OWASP Top 10 Compliance

> Security mitigations for OWASP Top 10 (2021)

---

## Table of Contents

- [A01: Broken Access Control](#a01-broken-access-control)
- [A02: Cryptographic Failures](#a02-cryptographic-failures)
- [A03: Injection](#a03-injection)
- [A04: Insecure Design](#a04-insecure-design)
- [A05: Security Misconfiguration](#a05-security-misconfiguration)
- [A06: Vulnerable Components](#a06-vulnerable-components)
- [A07: Auth Failures](#a07-authentication-failures)
- [A08: Software Integrity](#a08-software-and-data-integrity-failures)
- [A09: Logging Failures](#a09-security-logging-and-monitoring-failures)
- [A10: SSRF](#a10-server-side-request-forgery)

---

## A01: Broken Access Control

### Risk

Unauthorized access to resources, privilege escalation.

### Mitigations

```typescript
// 1. RBAC middleware
const requirePermission = (permission: Permission) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    
    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }
    
    const hasPermission = await rbacService.check(user.id, permission);
    
    if (!hasPermission) {
      logger.warn('Access denied', {
        userId: user.id,
        permission,
        resource: req.path,
      });
      throw new ForbiddenError('Insufficient permissions');
    }
    
    next();
  };
};

// 2. Resource ownership check
const requireOwnership = (resourceType: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const resourceId = req.params.id;
    const userId = req.user.id;
    
    const isOwner = await ownershipService.verify(
      resourceType,
      resourceId,
      userId
    );
    
    if (!isOwner) {
      throw new ForbiddenError('Resource access denied');
    }
    
    next();
  };
};

// 3. Organization isolation
const requireOrgAccess = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const targetOrgId = req.params.orgId || req.body.organizationId;
    const userOrgIds = req.user.organizationIds;
    
    if (!userOrgIds.includes(targetOrgId)) {
      throw new ForbiddenError('Organization access denied');
    }
    
    req.currentOrg = targetOrgId;
    next();
  };
};
```

### Implementation Checklist

- [x] Deny by default (require explicit permission)
- [x] RBAC on all protected endpoints
- [x] Resource-level authorization
- [x] Organization/tenant isolation
- [x] CORS properly configured
- [x] Disable directory listing
- [x] JWT claims validation
- [x] Rate limit access attempts

---

## A02: Cryptographic Failures

### Risk

Exposure of sensitive data through weak or missing encryption.

### Mitigations

```typescript
// 1. Password hashing with Argon2id
import argon2 from 'argon2';

export const hashPassword = async (password: string): Promise<string> => {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,    // 64 MB
    timeCost: 3,          // 3 iterations
    parallelism: 4,       // 4 parallel threads
    saltLength: 16,
  });
};

export const verifyPassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  return argon2.verify(hash, password);
};

// 2. Field-level encryption for PII
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

export const encryptField = (plaintext: string, key: Buffer): EncryptedField => {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
};

export const decryptField = (
  { encrypted, iv, authTag }: EncryptedField,
  key: Buffer
): string => {
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};

// 3. Secure token generation
export const generateSecureToken = (bytes: number = 32): string => {
  return randomBytes(bytes).toString('base64url');
};
```

### Implementation Checklist

- [x] TLS 1.2+ for all connections
- [x] Strong password hashing (Argon2id)
- [x] Encryption at rest for sensitive data
- [x] Secure random number generation
- [x] No deprecated algorithms (MD5, SHA1)
- [x] Key rotation procedures
- [x] Secrets in environment variables
- [x] No hardcoded credentials

---

## A03: Injection

### Risk

SQL injection, NoSQL injection, command injection.

### Mitigations

```typescript
// 1. Parameterized queries with Prisma (automatic)
// Prisma uses parameterized queries by default
const user = await prisma.user.findUnique({
  where: { email: userInput }, // Safe - parameterized
});

// 2. Input validation with Zod
import { z } from 'zod';

const createTicketSchema = z.object({
  subject: z.string()
    .min(5)
    .max(200)
    .regex(/^[a-zA-Z0-9\s\-_.,!?]+$/),
  description: z.string()
    .max(10000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  categoryId: z.string().uuid(),
});

// 3. HTML sanitization
import DOMPurify from 'isomorphic-dompurify';

export const sanitizeHtml = (dirty: string): string => {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'li'],
    ALLOWED_ATTR: ['href', 'title'],
  });
};

// 4. Command injection prevention
import { execFile } from 'child_process';

// Never use exec() with user input
// Use execFile() with array arguments
const runCommand = (filename: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Validate filename is in allowed list
    if (!allowedFiles.includes(filename)) {
      return reject(new Error('Invalid filename'));
    }
    
    execFile('process-file', [filename], (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
};
```

### Implementation Checklist

- [x] ORM with parameterized queries
- [x] Input validation on all endpoints
- [x] HTML sanitization for user content
- [x] No dynamic query construction
- [x] Allowlist validation for file paths
- [x] Escape special characters
- [x] Content-Type enforcement

---

## A04: Insecure Design

### Risk

Flawed design that cannot be fixed by implementation.

### Mitigations

```typescript
// 1. Threat modeling considerations
const threatModel = {
  assets: [
    { name: 'User credentials', sensitivity: 'critical' },
    { name: 'Customer PII', sensitivity: 'high' },
    { name: 'Ticket content', sensitivity: 'medium' },
  ],
  
  threats: [
    { threat: 'Account takeover', mitigation: 'MFA, rate limiting' },
    { threat: 'Data breach', mitigation: 'Encryption, access control' },
    { threat: 'Privilege escalation', mitigation: 'RBAC, validation' },
  ],
};

// 2. Business logic validation
const transferTicket = async (
  ticketId: string,
  fromAgentId: string,
  toAgentId: string,
  userId: string
): Promise<void> => {
  // Verify user has transfer permission
  await rbacService.require(userId, 'tickets:transfer');
  
  // Verify from-agent owns the ticket
  const ticket = await ticketRepository.findById(ticketId);
  if (ticket.assignedToId !== fromAgentId) {
    throw new BusinessLogicError('Ticket not assigned to source agent');
  }
  
  // Verify to-agent can receive tickets
  const toAgent = await userRepository.findById(toAgentId);
  if (!toAgent.canReceiveTickets) {
    throw new BusinessLogicError('Target agent cannot receive tickets');
  }
  
  // Verify same organization
  if (ticket.organizationId !== toAgent.organizationId) {
    throw new BusinessLogicError('Cannot transfer across organizations');
  }
  
  // Perform transfer
  await ticketRepository.update(ticketId, { assignedToId: toAgentId });
};

// 3. Rate limiting per business operation
const operationLimits: Record<string, RateLimit> = {
  'password-reset': { max: 3, window: '1h' },
  'login-attempts': { max: 5, window: '15m' },
  'ticket-creation': { max: 50, window: '1h' },
  'api-calls': { max: 1000, window: '1h' },
};
```

### Implementation Checklist

- [x] Threat modeling performed
- [x] Business logic validation
- [x] Rate limiting per operation
- [x] Multi-step verification for sensitive ops
- [x] Audit trail for all actions
- [x] Separation of duties
- [x] Secure defaults

---

## A05: Security Misconfiguration

### Risk

Insecure default configs, unnecessary features enabled.

### Mitigations

```typescript
// 1. Secure environment configuration
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'REFRESH_SECRET',
  'ENCRYPTION_KEY',
] as const;

const validateEnv = (): void => {
  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
  
  // Validate secret strength
  if (process.env.JWT_SECRET!.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
};

// 2. Production security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: 'same-origin' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
}));

// 3. Disable debug in production
if (process.env.NODE_ENV === 'production') {
  app.set('env', 'production');
  app.disable('x-powered-by');
  
  // Disable stack traces in errors
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    res.status(500).json({
      error: 'Internal server error',
      requestId: req.id,
    });
  });
}
```

### Implementation Checklist

- [x] Remove default credentials
- [x] Disable unnecessary features
- [x] Security headers configured
- [x] Error messages don't leak info
- [x] Debug mode disabled in production
- [x] Proper CORS settings
- [x] Regular security audits
- [x] Automated config scanning

---

## A06: Vulnerable Components

### Risk

Using components with known vulnerabilities.

### Mitigations

```bash
# 1. Dependency scanning with bun
bun audit

# 2. Package.json security settings
{
  "scripts": {
    "audit": "bun audit",
    "audit:fix": "bun audit --fix",
    "check-deps": "bunx npm-check-updates"
  }
}
```

```yaml
# 3. GitHub Actions for dependency scanning
name: Security Scan

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 0 * * *'  # Daily

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: oven-sh/setup-bun@v1
      
      - name: Install dependencies
        run: bun install
        
      - name: Run audit
        run: bun audit
        
      - name: Check for outdated deps
        run: bunx npm-check-updates --errorLevel 2

  snyk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

### Implementation Checklist

- [x] Automated dependency scanning
- [x] Regular dependency updates
- [x] Remove unused dependencies
- [x] Lock file checked in
- [x] Vulnerability monitoring
- [x] SBOM generation
- [x] Patch management process

---

## A07: Authentication Failures

### Risk

Weak authentication, credential stuffing, session hijacking.

### Mitigations

See [Auth Security](auth-security.md) for detailed implementation.

```typescript
// Summary of controls
const authControls = {
  passwordPolicy: {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSymbols: true,
    preventCommon: true,
  },
  
  accountLockout: {
    maxAttempts: 5,
    lockoutDuration: '30m',
    resetAfter: '15m',
  },
  
  sessionManagement: {
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d',
    absoluteTimeout: '24h',
    rotateRefreshToken: true,
  },
  
  mfa: {
    methods: ['totp', 'backup-codes'],
    requiredFor: ['admin', 'manager'],
  },
};
```

### Implementation Checklist

- [x] Strong password policy
- [x] Account lockout mechanism
- [x] Secure password storage (Argon2id)
- [x] Multi-factor authentication
- [x] Session timeout
- [x] Secure cookie settings
- [x] Credential stuffing protection
- [x] Password breach checking

---

## A08: Software and Data Integrity Failures

### Risk

CI/CD pipeline attacks, insecure deserialization.

### Mitigations

```yaml
# 1. Signed commits required
# GitHub branch protection rules
protection:
  require_signed_commits: true
  required_status_checks:
    strict: true
    contexts:
      - test
      - security-scan
```

```typescript
// 2. Safe JSON parsing
import { safeJsonParse } from '@/lib/security';

export const safeJsonParse = <T>(json: string, schema: z.Schema<T>): T => {
  // Parse JSON first
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ValidationError('Invalid JSON');
  }
  
  // Validate against schema
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ValidationError('JSON validation failed', result.error);
  }
  
  return result.data;
};

// 3. Subresource integrity
// In Next.js config for external scripts
const cspPolicy = {
  'script-src': [
    "'self'",
    "'sha256-{hash}'", // Hash of inline scripts
  ],
};
```

### Implementation Checklist

- [x] CI/CD pipeline secured
- [x] Signed commits/tags
- [x] Dependency integrity checks
- [x] No unsafe deserialization
- [x] Input validation on all data
- [x] Subresource integrity for CDN
- [x] Code review required

---

## A09: Security Logging and Monitoring Failures

### Risk

Insufficient logging, slow breach detection.

### Mitigations

See [Audit Logging](audit-logging.md) for detailed implementation.

```typescript
// Security events to log
const securityEvents = [
  'auth:login_success',
  'auth:login_failure',
  'auth:logout',
  'auth:password_change',
  'auth:password_reset',
  'auth:mfa_enabled',
  'auth:mfa_disabled',
  'access:permission_denied',
  'access:resource_unauthorized',
  'data:export',
  'data:bulk_delete',
  'admin:user_created',
  'admin:role_changed',
  'admin:settings_changed',
];
```

### Implementation Checklist

- [x] Audit logging enabled
- [x] Login attempts logged
- [x] Access failures logged
- [x] Sensitive operations logged
- [x] Log integrity protected
- [x] Centralized log management
- [x] Alerting on anomalies
- [x] Log retention policy

---

## A10: Server-Side Request Forgery

### Risk

Attacker-controlled server-side requests.

### Mitigations

```typescript
// 1. URL validation
import { URL } from 'url';

const allowedHosts = [
  'api.example.com',
  'cdn.example.com',
];

const validateUrl = (urlString: string): URL => {
  let url: URL;
  
  try {
    url = new URL(urlString);
  } catch {
    throw new ValidationError('Invalid URL');
  }
  
  // Protocol check
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ValidationError('Invalid protocol');
  }
  
  // Host allowlist
  if (!allowedHosts.includes(url.hostname)) {
    throw new ValidationError('Host not allowed');
  }
  
  // Block internal IPs
  if (isInternalIP(url.hostname)) {
    throw new ValidationError('Internal IPs not allowed');
  }
  
  return url;
};

// 2. Block internal IPs
const internalRanges = [
  /^127\./,                    // Loopback
  /^10\./,                     // Private Class A
  /^172\.(1[6-9]|2\d|3[01])\./, // Private Class B
  /^192\.168\./,               // Private Class C
  /^169\.254\./,               // Link-local
  /^0\./,                      // Current network
];

const isInternalIP = (host: string): boolean => {
  return internalRanges.some(range => range.test(host));
};

// 3. Disable redirects
import fetch from 'node-fetch';

const safeFetch = (url: string): Promise<Response> => {
  const validatedUrl = validateUrl(url);
  
  return fetch(validatedUrl.toString(), {
    redirect: 'error',  // Disable redirects
    timeout: 5000,      // Timeout
  });
};
```

### Implementation Checklist

- [x] URL allowlist validation
- [x] Block internal IP ranges
- [x] Disable HTTP redirects
- [x] DNS resolution validation
- [x] Network segmentation
- [x] Response validation
- [x] Request timeout limits

---

## Related Documents

- [Security Overview](overview.md) — Security principles
- [Auth Security](auth-security.md) — Authentication hardening
- [Data Protection](data-protection.md) — Encryption and PII
- [Audit Logging](audit-logging.md) — Security logging

---

*Next: [Auth Security →](auth-security.md)*
