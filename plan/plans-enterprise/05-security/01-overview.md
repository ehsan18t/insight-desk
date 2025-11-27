# Security Documentation

> Comprehensive security practices for InsightDesk

---

## Table of Contents

- [Security Principles](#security-principles)
- [Security Architecture](#security-architecture)
- [Defense in Depth](#defense-in-depth)
- [Security Checklist](#security-checklist)
- [Incident Response](#incident-response)

---

## Security Principles

### Core Principles

1. **Defense in Depth** — Multiple security layers
2. **Least Privilege** — Minimal necessary access
3. **Zero Trust** — Verify everything
4. **Security by Design** — Built-in, not bolted-on
5. **Fail Secure** — Deny on error

### Security Goals

| Goal | Description |
|------|-------------|
| **Confidentiality** | Data accessible only to authorized parties |
| **Integrity** | Data accuracy and consistency maintained |
| **Availability** | System accessible when needed |
| **Non-repudiation** | Actions traceable to actors |
| **Privacy** | Personal data protected per regulations |

---

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Internet                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare WAF/DDoS                          │
│  • Rate limiting    • Bot protection    • SSL termination       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Load Balancer                                 │
│  • SSL passthrough  • Health checks    • Geographic routing     │
└─────────────────────────────────────────────────────────────────┘
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│     Frontend (Next.js)    │  │     API (Express)        │
│  • CSP headers            │  │  • JWT validation        │
│  • XSS protection         │  │  • RBAC enforcement      │
│  • CSRF tokens            │  │  • Input validation      │
│  • Secure cookies         │  │  • Rate limiting         │
└──────────────────────────┘  └──────────────────────────┘
                                         │
                              ┌──────────┴──────────┐
                              ▼                     ▼
                    ┌──────────────┐      ┌──────────────┐
                    │  PostgreSQL  │      │    Valkey    │
                    │  • Encrypted │      │  • Auth req  │
                    │  • Row-level │      │  • No extern │
                    │  • Backups   │      │    access    │
                    └──────────────┘      └──────────────┘
```

---

## Defense in Depth

### Layer 1: Network Security

```yaml
# Cloudflare configuration
security:
  ssl: full_strict
  min_tls_version: "1.2"
  
  waf:
    enabled: true
    ruleset: owasp-crs-4.0
    sensitivity: medium
    
  rate_limiting:
    - path: /api/auth/*
      requests_per_minute: 10
    - path: /api/*
      requests_per_minute: 100
      
  ddos:
    sensitivity: medium
    auto_mitigate: true
    
  bot_management:
    mode: challenge
    verified_bots: allow
```

### Layer 2: Application Security

```typescript
// Security middleware stack
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Required for Next.js
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.WS_URL],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
}));
```

### Layer 3: Data Security

```typescript
// Data encryption
const encryption = {
  // Data at rest
  database: {
    method: 'AES-256-GCM',
    keyRotation: '90d',
  },
  
  // Data in transit
  transport: {
    protocol: 'TLS 1.3',
    ciphers: 'TLS_AES_256_GCM_SHA384',
  },
  
  // Sensitive fields
  pii: {
    method: 'AES-256-GCM',
    fields: ['email', 'phone', 'address'],
  },
};
```

---

## Security Checklist

### Authentication ✓

- [ ] Secure password hashing (Argon2id)
- [ ] JWT with short expiry (15min)
- [ ] Refresh token rotation
- [ ] Account lockout after failed attempts
- [ ] MFA support (TOTP)
- [ ] Secure session management

### Authorization ✓

- [ ] Role-based access control (RBAC)
- [ ] Permission-based actions
- [ ] Resource-level authorization
- [ ] API key scoping
- [ ] Organization isolation

### Input Validation ✓

- [ ] Schema validation (Zod)
- [ ] SQL injection prevention (Prisma)
- [ ] XSS prevention (sanitization)
- [ ] File upload validation
- [ ] Request size limits

### API Security ✓

- [ ] Rate limiting per endpoint
- [ ] Request authentication
- [ ] HTTPS only
- [ ] CORS configuration
- [ ] Security headers

### Data Protection ✓

- [ ] Encryption at rest
- [ ] Encryption in transit
- [ ] PII handling compliance
- [ ] Data retention policies
- [ ] Secure backup storage

### Monitoring ✓

- [ ] Audit logging
- [ ] Security event alerting
- [ ] Anomaly detection
- [ ] Access logging
- [ ] Error tracking

---

## Incident Response

### Response Plan

```
┌─────────────────────────────────────────────────────────────┐
│                    INCIDENT DETECTED                        │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  1. IDENTIFY                                                │
│     • Confirm incident                                      │
│     • Classify severity (P1-P4)                            │
│     • Notify on-call team                                  │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  2. CONTAIN                                                 │
│     • Isolate affected systems                             │
│     • Revoke compromised credentials                       │
│     • Block malicious IPs                                  │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  3. ERADICATE                                               │
│     • Remove threat                                         │
│     • Patch vulnerabilities                                │
│     • Update security rules                                │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  4. RECOVER                                                 │
│     • Restore services                                      │
│     • Verify security                                       │
│     • Monitor for recurrence                               │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  5. POST-MORTEM                                             │
│     • Document timeline                                     │
│     • Root cause analysis                                   │
│     • Update runbooks                                       │
│     • Implement preventive measures                        │
└─────────────────────────────────────────────────────────────┘
```

### Severity Classification

| Severity | Description | Response Time | Examples |
|----------|-------------|---------------|----------|
| **P1** | Critical | 15 min | Data breach, system compromise |
| **P2** | High | 1 hour | Auth bypass, escalation vuln |
| **P3** | Medium | 4 hours | Minor vuln, suspicious activity |
| **P4** | Low | 24 hours | Policy violation, best practice |

### Contact Escalation

```yaml
escalation:
  - level: 1
    role: On-Call Engineer
    response: 15 min
    
  - level: 2
    role: Security Lead
    response: 30 min
    trigger: P1 or unresolved after 1 hour
    
  - level: 3
    role: CTO / Executive
    response: 1 hour
    trigger: Data breach or extended outage
```

---

## Section Documents

| Document | Description |
|----------|-------------|
| [OWASP Compliance](owasp.md) | OWASP Top 10 mitigations |
| [Auth Security](auth-security.md) | Authentication hardening |
| [Data Protection](data-protection.md) | Encryption and PII |
| [Audit Logging](audit-logging.md) | Security event logging |

---

*Next: [OWASP Compliance →](owasp.md)*
