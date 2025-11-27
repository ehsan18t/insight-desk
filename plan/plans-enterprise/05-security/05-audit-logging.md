# Audit Logging

> Security event logging and compliance for InsightDesk

---

## Table of Contents

- [Audit Log Architecture](#audit-log-architecture)
- [Event Types](#event-types)
- [Log Structure](#log-structure)
- [Implementation](#implementation)
- [Log Storage and Retention](#log-storage-and-retention)
- [Alerting and Monitoring](#alerting-and-monitoring)
- [Compliance Requirements](#compliance-requirements)

---

## Audit Log Architecture

### Overview

```
┌─────────────┐     ┌───────────────┐     ┌─────────────────┐
│ Application │────▶│  Audit Log    │────▶│   PostgreSQL    │
│   Layer     │     │   Service     │     │   (Primary)     │
└─────────────┘     └───────────────┘     └─────────────────┘
                           │
                           ▼
                    ┌───────────────┐     ┌─────────────────┐
                    │  Log Stream   │────▶│  Elasticsearch  │
                    │   (Valkey)    │     │   (Search)      │
                    └───────────────┘     └─────────────────┘
                           │
                           ▼
                    ┌───────────────┐
                    │   Alerting    │
                    │   Engine      │
                    └───────────────┘
```

### Design Principles

1. **Immutability** — Logs cannot be modified once written
2. **Completeness** — Capture all security-relevant events
3. **Integrity** — Detect log tampering
4. **Availability** — Logs accessible for investigation
5. **Non-repudiation** — Actions traceable to actors

---

## Event Types

### Security Events

```typescript
// types/audit.types.ts
export type SecurityEvent =
  // Authentication
  | 'auth:login_success'
  | 'auth:login_failure'
  | 'auth:logout'
  | 'auth:token_refresh'
  | 'auth:password_change'
  | 'auth:password_reset_request'
  | 'auth:password_reset_complete'
  | 'auth:mfa_enabled'
  | 'auth:mfa_disabled'
  | 'auth:mfa_challenge'
  | 'auth:account_locked'
  | 'auth:account_unlocked'
  
  // Authorization
  | 'access:permission_granted'
  | 'access:permission_denied'
  | 'access:role_assigned'
  | 'access:role_revoked'
  | 'access:resource_unauthorized'
  
  // Data Access
  | 'data:read_sensitive'
  | 'data:export'
  | 'data:bulk_operation'
  | 'data:delete'
  | 'data:pii_accessed'
  
  // Administrative
  | 'admin:user_created'
  | 'admin:user_deleted'
  | 'admin:user_modified'
  | 'admin:settings_changed'
  | 'admin:api_key_created'
  | 'admin:api_key_revoked'
  
  // System
  | 'system:startup'
  | 'system:shutdown'
  | 'system:config_changed'
  | 'system:error'
  
  // Compliance
  | 'gdpr:data_export'
  | 'gdpr:data_deletion'
  | 'gdpr:consent_updated';
```

### Business Events

```typescript
export type BusinessEvent =
  // Tickets
  | 'ticket:created'
  | 'ticket:updated'
  | 'ticket:assigned'
  | 'ticket:escalated'
  | 'ticket:resolved'
  | 'ticket:reopened'
  
  // Messages
  | 'message:sent'
  | 'message:received'
  | 'message:deleted'
  
  // Knowledge Base
  | 'article:published'
  | 'article:updated'
  | 'article:archived'
  
  // Automation
  | 'automation:triggered'
  | 'automation:executed'
  | 'automation:failed';
```

---

## Log Structure

### Audit Log Entry

```typescript
// types/audit.types.ts
export interface AuditLogEntry {
  // Identity
  id: string;
  timestamp: Date;
  
  // Event Classification
  eventType: SecurityEvent | BusinessEvent;
  category: 'security' | 'business' | 'system';
  severity: 'info' | 'warning' | 'error' | 'critical';
  
  // Actor Information
  actor: {
    type: 'user' | 'system' | 'api_key' | 'automation';
    id: string;
    email?: string;
    role?: string;
    organizationId?: string;
  };
  
  // Request Context
  request: {
    id: string;
    ip: string;
    userAgent: string;
    method: string;
    path: string;
    correlationId?: string;
  };
  
  // Resource Information
  resource?: {
    type: string;
    id: string;
    organizationId?: string;
  };
  
  // Event Details
  action: string;
  outcome: 'success' | 'failure';
  details: Record<string, unknown>;
  
  // Changes (for updates)
  changes?: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  };
  
  // Integrity
  checksum: string;
  previousChecksum?: string;
}
```

### Example Entries

```json
{
  "id": "audit_01HX7QWERTY12345",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "eventType": "auth:login_success",
  "category": "security",
  "severity": "info",
  "actor": {
    "type": "user",
    "id": "usr_abc123",
    "email": "user@example.com",
    "role": "agent",
    "organizationId": "org_xyz789"
  },
  "request": {
    "id": "req_123abc",
    "ip": "203.0.113.42",
    "userAgent": "Mozilla/5.0...",
    "method": "POST",
    "path": "/api/auth/login"
  },
  "action": "User logged in successfully",
  "outcome": "success",
  "details": {
    "mfaUsed": true,
    "sessionId": "sess_xyz"
  },
  "checksum": "sha256:abc123..."
}
```

```json
{
  "id": "audit_01HX7QWERTY12346",
  "timestamp": "2024-01-15T10:31:00.000Z",
  "eventType": "admin:settings_changed",
  "category": "security",
  "severity": "warning",
  "actor": {
    "type": "user",
    "id": "usr_admin456",
    "email": "admin@example.com",
    "role": "admin"
  },
  "resource": {
    "type": "organization",
    "id": "org_xyz789"
  },
  "action": "Organization settings updated",
  "outcome": "success",
  "changes": {
    "before": { "mfaRequired": false },
    "after": { "mfaRequired": true }
  },
  "checksum": "sha256:def456..."
}
```

---

## Implementation

### Audit Service

```typescript
// services/audit.service.ts
import crypto from 'crypto';

export class AuditService {
  private lastChecksum: string | null = null;

  async log(event: AuditEventInput): Promise<AuditLogEntry> {
    const entry = this.createEntry(event);
    
    // Store in database
    await this.store(entry);
    
    // Stream for real-time processing
    await this.stream(entry);
    
    // Check for alerts
    await this.checkAlerts(entry);

    return entry;
  }

  private createEntry(event: AuditEventInput): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      eventType: event.eventType,
      category: this.categorize(event.eventType),
      severity: event.severity || this.defaultSeverity(event.eventType),
      actor: event.actor,
      request: event.request,
      resource: event.resource,
      action: event.action,
      outcome: event.outcome,
      details: event.details || {},
      changes: event.changes,
      previousChecksum: this.lastChecksum,
      checksum: '', // Will be set below
    };

    // Generate integrity checksum
    entry.checksum = this.generateChecksum(entry);
    this.lastChecksum = entry.checksum;

    return entry;
  }

  private generateChecksum(entry: AuditLogEntry): string {
    const content = JSON.stringify({
      id: entry.id,
      timestamp: entry.timestamp,
      eventType: entry.eventType,
      actor: entry.actor,
      action: entry.action,
      outcome: entry.outcome,
      details: entry.details,
      previousChecksum: entry.previousChecksum,
    });

    return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
  }

  private async store(entry: AuditLogEntry): Promise<void> {
    await prisma.auditLog.create({
      data: {
        id: entry.id,
        timestamp: entry.timestamp,
        eventType: entry.eventType,
        category: entry.category,
        severity: entry.severity,
        actorType: entry.actor.type,
        actorId: entry.actor.id,
        actorEmail: entry.actor.email,
        actorRole: entry.actor.role,
        organizationId: entry.actor.organizationId,
        requestId: entry.request?.id,
        requestIp: entry.request?.ip,
        requestUserAgent: entry.request?.userAgent,
        requestMethod: entry.request?.method,
        requestPath: entry.request?.path,
        resourceType: entry.resource?.type,
        resourceId: entry.resource?.id,
        action: entry.action,
        outcome: entry.outcome,
        details: entry.details,
        changes: entry.changes,
        checksum: entry.checksum,
        previousChecksum: entry.previousChecksum,
      },
    });
  }

  private async stream(entry: AuditLogEntry): Promise<void> {
    // Publish to Valkey stream for real-time processing
    await valkey.xadd(
      'audit:stream',
      '*',
      'data',
      JSON.stringify(entry)
    );
  }

  private categorize(eventType: string): 'security' | 'business' | 'system' {
    if (eventType.startsWith('auth:') || 
        eventType.startsWith('access:') ||
        eventType.startsWith('admin:') ||
        eventType.startsWith('gdpr:')) {
      return 'security';
    }
    if (eventType.startsWith('system:')) {
      return 'system';
    }
    return 'business';
  }

  private defaultSeverity(eventType: string): AuditSeverity {
    const critical = ['auth:account_locked', 'access:permission_denied'];
    const warning = ['auth:login_failure', 'auth:password_reset_request'];
    const error = ['system:error', 'automation:failed'];

    if (critical.includes(eventType)) return 'critical';
    if (warning.includes(eventType)) return 'warning';
    if (error.includes(eventType)) return 'error';
    return 'info';
  }

  private generateId(): string {
    return `audit_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
  }
}
```

### Audit Middleware

```typescript
// middleware/audit.middleware.ts
export const auditMiddleware = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Attach request info for audit logging
    req.auditContext = {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent') || 'unknown',
      method: req.method,
      path: req.path,
    };

    // Capture response for audit
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      // Log audit after response
      if (req.auditEvent) {
        auditService.log({
          ...req.auditEvent,
          request: req.auditContext,
          outcome: res.statusCode < 400 ? 'success' : 'failure',
        }).catch(err => logger.error('Audit log failed', { error: err }));
      }
      return originalJson(body);
    };

    next();
  };
};

// Usage in controller
export const updateSettings = async (req: Request, res: Response) => {
  const before = await getSettings(req.params.id);
  const after = await updateSettings(req.params.id, req.body);

  // Set audit event
  req.auditEvent = {
    eventType: 'admin:settings_changed',
    actor: {
      type: 'user',
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
    },
    resource: { type: 'settings', id: req.params.id },
    action: 'Settings updated',
    changes: { before, after },
  };

  res.json(after);
};
```

---

## Log Storage and Retention

### Storage Strategy

```typescript
// config/audit-storage.ts
export const auditStorage = {
  // Primary storage
  primary: {
    type: 'postgresql',
    retention: '7 years',
    encryption: true,
  },
  
  // Search/analytics
  secondary: {
    type: 'elasticsearch',
    retention: '1 year',
    indices: {
      security: 'audit-security-*',
      business: 'audit-business-*',
      system: 'audit-system-*',
    },
  },
  
  // Cold storage
  archive: {
    type: 's3',
    bucket: 'insightdesk-audit-archive',
    retention: '10 years',
    encryption: 'AES-256',
  },
};
```

### Archival Job

```typescript
// jobs/audit-archive.worker.ts
export class AuditArchiveWorker {
  async archiveOldLogs(): Promise<ArchiveResult> {
    const cutoffDate = dayjs().subtract(90, 'days').toDate();

    // Get logs to archive
    const logs = await prisma.auditLog.findMany({
      where: {
        timestamp: { lt: cutoffDate },
        archived: false,
      },
      take: 10000,
    });

    if (logs.length === 0) {
      return { archived: 0 };
    }

    // Create archive file
    const archiveKey = `audit/${dayjs().format('YYYY/MM/DD')}/${Date.now()}.json.gz`;
    const compressed = await this.compress(logs);

    // Upload to S3
    await s3.upload({
      Bucket: config.archiveBucket,
      Key: archiveKey,
      Body: compressed,
      ContentType: 'application/gzip',
      ServerSideEncryption: 'AES256',
    });

    // Mark as archived
    await prisma.auditLog.updateMany({
      where: { id: { in: logs.map(l => l.id) } },
      data: { archived: true, archiveKey },
    });

    // Delete from primary after verification
    await this.verifyAndDelete(logs, archiveKey);

    return { archived: logs.length, archiveKey };
  }
}
```

---

## Alerting and Monitoring

### Alert Rules

```typescript
// config/audit-alerts.ts
export const alertRules: AlertRule[] = [
  {
    name: 'Multiple Login Failures',
    eventType: 'auth:login_failure',
    threshold: 5,
    window: '5m',
    groupBy: 'actor.email',
    severity: 'high',
    action: 'notify_security',
  },
  {
    name: 'Account Locked',
    eventType: 'auth:account_locked',
    threshold: 1,
    window: '1m',
    severity: 'high',
    action: 'notify_security',
  },
  {
    name: 'Bulk Data Export',
    eventType: 'data:export',
    threshold: 3,
    window: '1h',
    groupBy: 'actor.id',
    severity: 'medium',
    action: 'notify_admin',
  },
  {
    name: 'Permission Denied Spike',
    eventType: 'access:permission_denied',
    threshold: 10,
    window: '10m',
    groupBy: 'actor.id',
    severity: 'high',
    action: 'investigate',
  },
  {
    name: 'Admin Settings Change',
    eventType: 'admin:settings_changed',
    threshold: 1,
    window: '1m',
    severity: 'info',
    action: 'notify_admin',
  },
];
```

### Alert Processor

```typescript
// services/alert-processor.service.ts
export class AlertProcessor {
  async processEvent(event: AuditLogEntry): Promise<void> {
    for (const rule of alertRules) {
      if (event.eventType !== rule.eventType) continue;

      const key = this.buildKey(rule, event);
      const count = await this.incrementCounter(key, rule.window);

      if (count >= rule.threshold) {
        await this.triggerAlert(rule, event, count);
        await this.resetCounter(key);
      }
    }
  }

  private buildKey(rule: AlertRule, event: AuditLogEntry): string {
    let key = `alert:${rule.name}`;
    
    if (rule.groupBy) {
      const groupValue = this.getNestedValue(event, rule.groupBy);
      key += `:${groupValue}`;
    }

    return key;
  }

  private async incrementCounter(key: string, window: string): Promise<number> {
    const count = await valkey.incr(key);
    
    if (count === 1) {
      const seconds = this.parseWindow(window);
      await valkey.expire(key, seconds);
    }

    return count;
  }

  private async triggerAlert(
    rule: AlertRule,
    event: AuditLogEntry,
    count: number
  ): Promise<void> {
    const alert: SecurityAlert = {
      id: crypto.randomUUID(),
      ruleName: rule.name,
      severity: rule.severity,
      triggerEvent: event,
      count,
      triggeredAt: new Date(),
    };

    // Log alert
    logger.security('Security alert triggered', alert);

    // Execute action
    switch (rule.action) {
      case 'notify_security':
        await this.notifySecurity(alert);
        break;
      case 'notify_admin':
        await this.notifyAdmins(alert);
        break;
      case 'investigate':
        await this.createInvestigation(alert);
        break;
    }

    // Store alert
    await prisma.securityAlert.create({ data: alert });
  }
}
```

---

## Compliance Requirements

### SOC 2 Requirements

```typescript
// Audit logging controls for SOC 2
const soc2Controls = {
  CC6_1: {
    description: 'Logical access security',
    events: [
      'auth:login_success',
      'auth:login_failure',
      'auth:logout',
      'access:permission_denied',
    ],
    retention: '1 year',
  },
  CC6_2: {
    description: 'Provisioning and deprovisioning',
    events: [
      'admin:user_created',
      'admin:user_deleted',
      'access:role_assigned',
      'access:role_revoked',
    ],
    retention: '1 year',
  },
  CC7_2: {
    description: 'System monitoring',
    events: [
      'system:error',
      'system:config_changed',
    ],
    retention: '1 year',
  },
};
```

### Audit Report Generation

```typescript
// services/compliance-report.service.ts
export class ComplianceReportService {
  async generateSoc2Report(
    startDate: Date,
    endDate: Date
  ): Promise<ComplianceReport> {
    const report: ComplianceReport = {
      type: 'SOC 2',
      period: { start: startDate, end: endDate },
      generatedAt: new Date(),
      controls: [],
    };

    for (const [controlId, control] of Object.entries(soc2Controls)) {
      const events = await prisma.auditLog.findMany({
        where: {
          eventType: { in: control.events },
          timestamp: { gte: startDate, lte: endDate },
        },
      });

      report.controls.push({
        controlId,
        description: control.description,
        eventCount: events.length,
        samples: events.slice(0, 10),
        status: events.length > 0 ? 'compliant' : 'review_required',
      });
    }

    return report;
  }

  async generateGdprReport(organizationId: string): Promise<GdprReport> {
    const dataSubjects = await prisma.user.count({
      where: { organizationId },
    });

    const accessRequests = await prisma.auditLog.count({
      where: {
        eventType: 'gdpr:data_export',
        'actor.organizationId': organizationId,
      },
    });

    const deletionRequests = await prisma.auditLog.count({
      where: {
        eventType: 'gdpr:data_deletion',
        'actor.organizationId': organizationId,
      },
    });

    return {
      organizationId,
      generatedAt: new Date(),
      dataSubjects,
      accessRequests,
      deletionRequests,
      dataProcessingActivities: await this.getProcessingActivities(organizationId),
    };
  }
}
```

---

## Related Documents

- [Security Overview](overview.md) — Security principles
- [OWASP Compliance](owasp.md) — OWASP Top 10
- [Data Protection](data-protection.md) — Encryption and PII
- [Monitoring](../07-devops/monitoring.md) — System monitoring

---

*Next: [Frontend Documentation →](../06-frontend/overview.md)*
