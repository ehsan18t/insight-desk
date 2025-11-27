# Data Protection

> Encryption, PII handling, and privacy compliance for InsightDesk

---

## Table of Contents

- [Encryption Strategy](#encryption-strategy)
- [Data Classification](#data-classification)
- [PII Handling](#pii-handling)
- [Data Retention](#data-retention)
- [Privacy Compliance](#privacy-compliance)
- [Data Export and Deletion](#data-export-and-deletion)

---

## Encryption Strategy

### Encryption at Rest

```typescript
// lib/security/encryption.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12;  // 96 bits for GCM
const AUTH_TAG_LENGTH = 16;

export class EncryptionService {
  private masterKey: Buffer;
  private keyCache: Map<string, Buffer> = new Map();

  constructor() {
    const masterKeyHex = process.env.ENCRYPTION_MASTER_KEY;
    if (!masterKeyHex || masterKeyHex.length !== 64) {
      throw new Error('Invalid ENCRYPTION_MASTER_KEY');
    }
    this.masterKey = Buffer.from(masterKeyHex, 'hex');
  }

  // Encrypt data with a derived key for each field type
  encrypt(plaintext: string, context: string): EncryptedData {
    const key = this.deriveKey(context);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      version: 1,
    };
  }

  decrypt(data: EncryptedData, context: string): string {
    const key = this.deriveKey(context);
    const iv = Buffer.from(data.iv, 'base64');
    const authTag = Buffer.from(data.authTag, 'base64');
    const ciphertext = Buffer.from(data.ciphertext, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  }

  // Derive context-specific keys from master key
  private deriveKey(context: string): Buffer {
    if (this.keyCache.has(context)) {
      return this.keyCache.get(context)!;
    }

    const key = crypto.hkdfSync(
      'sha256',
      this.masterKey,
      Buffer.from(context),
      Buffer.from('insightdesk-encryption'),
      KEY_LENGTH
    );

    this.keyCache.set(context, Buffer.from(key));
    return Buffer.from(key);
  }

  // Rotate encryption key
  async rotateKey(oldKey: Buffer, newKey: Buffer): Promise<void> {
    // Re-encrypt all data with new key
    // This should be done in batches during off-peak hours
  }
}
```

### Encryption in Transit

```typescript
// TLS configuration for Express
import https from 'https';
import fs from 'fs';

const tlsOptions: https.ServerOptions = {
  key: fs.readFileSync('/etc/ssl/private/server.key'),
  cert: fs.readFileSync('/etc/ssl/certs/server.crt'),
  ca: fs.readFileSync('/etc/ssl/certs/ca.crt'),
  
  // TLS 1.2+ only
  minVersion: 'TLSv1.2',
  
  // Strong cipher suites
  ciphers: [
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
  ].join(':'),
  
  // HSTS
  honorCipherOrder: true,
};

// Database connection with SSL
const databaseUrl = process.env.DATABASE_URL + '?sslmode=verify-full';
```

### Key Management

```typescript
// Key rotation schedule
const keyRotation = {
  masterKey: {
    rotationPeriod: '365d',
    gracePeriod: '30d', // Both keys valid during transition
  },
  jwtSecret: {
    rotationPeriod: '90d',
    gracePeriod: '24h',
  },
  apiKeys: {
    rotationPeriod: '180d',
    notifyDays: 14,
  },
};

// Key storage (use HSM or cloud KMS in production)
const keyStorage = {
  development: 'environment-variables',
  staging: 'aws-secrets-manager',
  production: 'aws-kms', // Hardware-backed
};
```

---

## Data Classification

### Classification Levels

| Level | Description | Examples | Handling |
|-------|-------------|----------|----------|
| **Public** | Non-sensitive | Help articles, FAQs | No restrictions |
| **Internal** | Business data | Ticket metadata, stats | Auth required |
| **Confidential** | Sensitive business | Customer communications | Encrypted, ACL |
| **Restricted** | PII, credentials | Passwords, SSN, payment | Encrypted, audit |

### Field-Level Classification

```typescript
// Database field classifications
const dataClassification: Record<string, DataClass> = {
  // User table
  'user.id': 'internal',
  'user.email': 'restricted',
  'user.passwordHash': 'restricted',
  'user.name': 'confidential',
  'user.phone': 'restricted',
  'user.avatar': 'internal',
  
  // Ticket table
  'ticket.id': 'internal',
  'ticket.subject': 'confidential',
  'ticket.description': 'confidential',
  'ticket.priority': 'internal',
  
  // Message table
  'message.content': 'confidential',
  'message.attachments': 'confidential',
};

// Prisma middleware for automatic classification handling
prisma.$use(async (params, next) => {
  // Log access to restricted data
  if (hasRestrictedFields(params)) {
    await auditLog.logDataAccess({
      table: params.model,
      action: params.action,
      userId: getCurrentUserId(),
      fields: getAccessedFields(params),
    });
  }
  
  return next(params);
});
```

---

## PII Handling

### PII Detection

```typescript
// lib/security/pii-detector.ts
export class PiiDetector {
  private patterns: Record<string, RegExp> = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    phone: /\b(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    ipAddress: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
  };

  detect(text: string): PiiMatch[] {
    const matches: PiiMatch[] = [];

    for (const [type, pattern] of Object.entries(this.patterns)) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        matches.push({
          type: type as PiiType,
          value: match[0],
          index: match.index,
          length: match[0].length,
        });
      }
    }

    return matches;
  }

  redact(text: string): string {
    let redacted = text;
    const matches = this.detect(text);

    // Sort by index descending to replace from end
    matches.sort((a, b) => b.index - a.index);

    for (const match of matches) {
      const replacement = this.getRedactionMask(match.type, match.length);
      redacted =
        redacted.slice(0, match.index) +
        replacement +
        redacted.slice(match.index + match.length);
    }

    return redacted;
  }

  private getRedactionMask(type: PiiType, length: number): string {
    const masks: Record<PiiType, string> = {
      email: '[EMAIL REDACTED]',
      phone: '[PHONE REDACTED]',
      ssn: '[SSN REDACTED]',
      creditCard: '[CARD REDACTED]',
      ipAddress: '[IP REDACTED]',
    };
    return masks[type] || '*'.repeat(length);
  }
}
```

### PII Encryption in Database

```typescript
// Prisma extension for PII encryption
import { Prisma } from '@prisma/client';

const piiFields = {
  User: ['email', 'phone', 'address'],
  Customer: ['email', 'phone', 'notes'],
};

export const piiMiddleware: Prisma.Middleware = async (params, next) => {
  const modelPiiFields = piiFields[params.model as keyof typeof piiFields];
  
  if (!modelPiiFields) {
    return next(params);
  }

  // Encrypt on write
  if (['create', 'update', 'upsert'].includes(params.action)) {
    const data = params.args.data;
    for (const field of modelPiiFields) {
      if (data[field]) {
        data[field] = encryption.encrypt(data[field], `${params.model}.${field}`);
      }
    }
  }

  const result = await next(params);

  // Decrypt on read
  if (result && ['findUnique', 'findFirst', 'findMany'].includes(params.action)) {
    const decryptRecord = (record: any) => {
      for (const field of modelPiiFields) {
        if (record[field] && typeof record[field] === 'object') {
          record[field] = encryption.decrypt(record[field], `${params.model}.${field}`);
        }
      }
    };

    if (Array.isArray(result)) {
      result.forEach(decryptRecord);
    } else {
      decryptRecord(result);
    }
  }

  return result;
};
```

---

## Data Retention

### Retention Policies

```typescript
// config/data-retention.ts
export const retentionPolicies: Record<string, RetentionPolicy> = {
  // User data
  users: {
    active: 'indefinite',
    deleted: '30d',
    purge: true,
  },
  
  // Tickets
  tickets: {
    active: 'indefinite',
    resolved: '7y',
    archived: '2y',
    purge: false, // Anonymize instead
  },
  
  // Messages
  messages: {
    attached: 'follow-ticket',
    orphaned: '30d',
    purge: true,
  },
  
  // Audit logs
  auditLogs: {
    security: '7y',
    access: '1y',
    activity: '90d',
    purge: true,
  },
  
  // Session data
  sessions: {
    active: 'session',
    expired: '24h',
    purge: true,
  },
  
  // Analytics
  analytics: {
    raw: '90d',
    aggregated: '7y',
    purge: true,
  },
};
```

### Retention Job

```typescript
// jobs/data-retention.worker.ts
export class DataRetentionWorker {
  async processRetention(): Promise<RetentionReport> {
    const report: RetentionReport = {
      processedAt: new Date(),
      tables: [],
    };

    for (const [table, policy] of Object.entries(retentionPolicies)) {
      const result = await this.processTable(table, policy);
      report.tables.push(result);
    }

    await this.generateReport(report);
    return report;
  }

  private async processTable(
    table: string,
    policy: RetentionPolicy
  ): Promise<TableResult> {
    const cutoffDate = this.calculateCutoff(policy);
    
    // Find records past retention
    const expiredRecords = await this.findExpiredRecords(table, cutoffDate);

    if (expiredRecords.length === 0) {
      return { table, action: 'none', count: 0 };
    }

    if (policy.purge) {
      // Hard delete
      await this.purgeRecords(table, expiredRecords);
      return { table, action: 'purged', count: expiredRecords.length };
    } else {
      // Anonymize
      await this.anonymizeRecords(table, expiredRecords);
      return { table, action: 'anonymized', count: expiredRecords.length };
    }
  }

  private async anonymizeRecords(
    table: string,
    recordIds: string[]
  ): Promise<void> {
    // Replace PII with anonymous placeholders
    const anonymizedData = {
      email: `deleted-${crypto.randomUUID()}@anonymous.local`,
      name: 'Deleted User',
      phone: null,
      address: null,
    };

    await prisma[table].updateMany({
      where: { id: { in: recordIds } },
      data: anonymizedData,
    });
  }
}
```

---

## Privacy Compliance

### GDPR Compliance

```typescript
// services/gdpr.service.ts
export class GdprService {
  // Right to access (Article 15)
  async exportUserData(userId: string): Promise<UserDataExport> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        tickets: true,
        messages: true,
        auditLogs: true,
        preferences: true,
      },
    });

    return {
      profile: this.sanitizeProfile(user),
      tickets: user.tickets.map(t => this.sanitizeTicket(t)),
      messages: user.messages.map(m => this.sanitizeMessage(m)),
      activityLog: user.auditLogs.map(l => this.sanitizeLog(l)),
      preferences: user.preferences,
      exportedAt: new Date(),
      format: 'json',
    };
  }

  // Right to erasure (Article 17)
  async deleteUserData(
    userId: string,
    options: DeleteOptions
  ): Promise<DeletionResult> {
    // Verify request authenticity
    await this.verifyDeletionRequest(userId);

    const result: DeletionResult = {
      userId,
      requestedAt: new Date(),
      items: [],
    };

    // Delete or anonymize based on legal requirements
    await prisma.$transaction(async (tx) => {
      // Anonymize tickets (keep for business records)
      const tickets = await tx.ticket.updateMany({
        where: { createdById: userId },
        data: { createdById: null, anonymizedAt: new Date() },
      });
      result.items.push({ type: 'tickets', action: 'anonymized', count: tickets.count });

      // Delete messages
      const messages = await tx.message.deleteMany({
        where: { authorId: userId },
      });
      result.items.push({ type: 'messages', action: 'deleted', count: messages.count });

      // Delete user profile
      await tx.user.delete({ where: { id: userId } });
      result.items.push({ type: 'profile', action: 'deleted', count: 1 });
    });

    // Audit the deletion
    await auditLog.log({
      action: 'gdpr:erasure',
      details: result,
    });

    return result;
  }

  // Right to rectification (Article 16)
  async updateUserData(
    userId: string,
    updates: ProfileUpdates
  ): Promise<void> {
    // Validate updates
    const validated = profileSchema.parse(updates);

    await prisma.user.update({
      where: { id: userId },
      data: validated,
    });

    await auditLog.log({
      action: 'gdpr:rectification',
      userId,
      details: { fields: Object.keys(updates) },
    });
  }

  // Right to portability (Article 20)
  async exportPortableData(userId: string): Promise<Buffer> {
    const data = await this.exportUserData(userId);
    
    // Return in machine-readable format
    return Buffer.from(JSON.stringify(data, null, 2));
  }
}
```

### Consent Management

```typescript
// services/consent.service.ts
export class ConsentService {
  async recordConsent(
    userId: string,
    consent: ConsentRecord
  ): Promise<void> {
    await prisma.consent.create({
      data: {
        userId,
        type: consent.type,
        granted: consent.granted,
        source: consent.source,
        ipAddress: consent.ipAddress,
        userAgent: consent.userAgent,
        version: consent.policyVersion,
      },
    });
  }

  async getConsentStatus(
    userId: string
  ): Promise<Record<ConsentType, boolean>> {
    const consents = await prisma.consent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      distinct: ['type'],
    });

    return consents.reduce((acc, c) => ({
      ...acc,
      [c.type]: c.granted,
    }), {} as Record<ConsentType, boolean>);
  }

  async revokeConsent(
    userId: string,
    type: ConsentType
  ): Promise<void> {
    await this.recordConsent(userId, {
      type,
      granted: false,
      source: 'user-revocation',
    });

    // Handle downstream effects
    switch (type) {
      case 'marketing':
        await this.unsubscribeFromMarketing(userId);
        break;
      case 'analytics':
        await this.optOutAnalytics(userId);
        break;
    }
  }
}
```

---

## Data Export and Deletion

### Export API

```typescript
// controllers/privacy.controller.ts
export class PrivacyController {
  @Post('/export')
  @Authenticated()
  async requestExport(req: Request, res: Response): Promise<void> {
    const userId = req.user.id;

    // Rate limit exports
    const recentExport = await prisma.dataExport.findFirst({
      where: {
        userId,
        createdAt: { gt: dayjs().subtract(24, 'hours').toDate() },
      },
    });

    if (recentExport) {
      throw new RateLimitError('Export already requested in last 24 hours');
    }

    // Queue export job
    const job = await exportQueue.add('user-export', { userId });

    await prisma.dataExport.create({
      data: {
        userId,
        jobId: job.id,
        status: 'pending',
      },
    });

    res.json({
      message: 'Export request received',
      jobId: job.id,
      estimatedTime: '24 hours',
    });
  }

  @Post('/delete')
  @Authenticated()
  async requestDeletion(req: Request, res: Response): Promise<void> {
    const userId = req.user.id;
    const { confirmation } = req.body;

    // Require typed confirmation
    if (confirmation !== 'DELETE MY ACCOUNT') {
      throw new ValidationError('Invalid confirmation');
    }

    // Send verification email
    const token = crypto.randomBytes(32).toString('hex');
    await valkey.setex(`deletion:${token}`, 86400, userId);

    await emailService.send(req.user.email, 'deletion-confirmation', {
      confirmUrl: `${config.appUrl}/confirm-deletion?token=${token}`,
    });

    res.json({
      message: 'Deletion confirmation email sent',
    });
  }

  @Post('/delete/confirm')
  async confirmDeletion(req: Request, res: Response): Promise<void> {
    const { token } = req.body;

    const userId = await valkey.get(`deletion:${token}`);
    if (!userId) {
      throw new ValidationError('Invalid or expired token');
    }

    // Schedule deletion (30-day grace period)
    const scheduledDate = dayjs().add(30, 'days').toDate();

    await prisma.user.update({
      where: { id: userId },
      data: {
        deletionScheduledAt: scheduledDate,
        status: 'pending_deletion',
      },
    });

    await valkey.del(`deletion:${token}`);

    res.json({
      message: 'Account scheduled for deletion',
      scheduledDate,
    });
  }
}
```

---

## Related Documents

- [Security Overview](overview.md) — Security principles
- [Auth Security](auth-security.md) — Authentication security
- [Audit Logging](audit-logging.md) — Security logging
- [OWASP Compliance](owasp.md) — OWASP Top 10

---

*Next: [Audit Logging →](audit-logging.md)*
