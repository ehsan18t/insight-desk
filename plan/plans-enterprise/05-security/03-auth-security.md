# Authentication Security

> Secure authentication implementation for InsightDesk

---

## Table of Contents

- [Password Security](#password-security)
- [JWT Security](#jwt-security)
- [Session Management](#session-management)
- [Multi-Factor Authentication](#multi-factor-authentication)
- [Account Protection](#account-protection)

---

## Password Security

### Password Policy

```typescript
// lib/security/password.ts
import argon2 from 'argon2';
import zxcvbn from 'zxcvbn';

export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSymbols: boolean;
  minStrength: number;
  preventReuse: number;
}

const defaultPolicy: PasswordPolicy = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: true,
  minStrength: 3,         // zxcvbn score 0-4
  preventReuse: 5,        // last 5 passwords
};

export const validatePassword = (
  password: string,
  policy: PasswordPolicy = defaultPolicy
): ValidationResult => {
  const errors: string[] = [];

  // Length checks
  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters`);
  }
  if (password.length > policy.maxLength) {
    errors.push(`Password must be at most ${policy.maxLength} characters`);
  }

  // Character requirements
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (policy.requireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (policy.requireSymbols && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one symbol');
  }

  // Strength check with zxcvbn
  const strength = zxcvbn(password);
  if (strength.score < policy.minStrength) {
    errors.push(`Password is too weak: ${strength.feedback.warning || 'Try a more complex password'}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    score: strength.score,
    feedback: strength.feedback.suggestions,
  };
};
```

### Password Hashing

```typescript
// Argon2id configuration (OWASP recommended)
const ARGON2_CONFIG: argon2.Options = {
  type: argon2.argon2id,     // Hybrid algorithm
  memoryCost: 65536,         // 64 MB
  timeCost: 3,               // 3 iterations
  parallelism: 4,            // 4 parallel threads
  saltLength: 16,            // 128-bit salt
  hashLength: 32,            // 256-bit hash
};

export const hashPassword = async (password: string): Promise<string> => {
  return argon2.hash(password, ARGON2_CONFIG);
};

export const verifyPassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
};

// Check if rehashing is needed (config update)
export const needsRehash = (hash: string): boolean => {
  return argon2.needsRehash(hash, ARGON2_CONFIG);
};
```

### Password History

```typescript
// services/password-history.service.ts
export class PasswordHistoryService {
  private readonly maxHistory = 5;

  async checkReuse(
    userId: string,
    newPassword: string
  ): Promise<boolean> {
    const history = await prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: this.maxHistory,
    });

    for (const record of history) {
      if (await verifyPassword(newPassword, record.passwordHash)) {
        return true; // Password was used before
      }
    }

    return false;
  }

  async recordPassword(userId: string, passwordHash: string): Promise<void> {
    // Add new entry
    await prisma.passwordHistory.create({
      data: { userId, passwordHash },
    });

    // Clean up old entries
    const entries = await prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: this.maxHistory,
    });

    if (entries.length > 0) {
      await prisma.passwordHistory.deleteMany({
        where: {
          id: { in: entries.map(e => e.id) },
        },
      });
    }
  }
}
```

### Breached Password Check

```typescript
// services/breach-check.service.ts
import crypto from 'crypto';

export class BreachCheckService {
  private readonly apiUrl = 'https://api.pwnedpasswords.com/range';

  async isBreached(password: string): Promise<boolean> {
    // SHA-1 hash of password
    const hash = crypto
      .createHash('sha1')
      .update(password)
      .digest('hex')
      .toUpperCase();

    const prefix = hash.substring(0, 5);
    const suffix = hash.substring(5);

    try {
      const response = await fetch(`${this.apiUrl}/${prefix}`, {
        headers: {
          'Add-Padding': 'true', // k-Anonymity
        },
      });

      const text = await response.text();
      const lines = text.split('\n');

      for (const line of lines) {
        const [hashSuffix] = line.split(':');
        if (hashSuffix === suffix) {
          return true;
        }
      }

      return false;
    } catch (error) {
      // Fail open - don't block registration if service unavailable
      logger.warn('Breach check service unavailable', { error });
      return false;
    }
  }
}
```

---

## JWT Security

### Token Generation

```typescript
// lib/security/jwt.ts
import jwt from 'jsonwebtoken';

interface TokenConfig {
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
  issuer: string;
  audience: string;
}

const config: TokenConfig = {
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  issuer: 'insightdesk',
  audience: 'insightdesk-api',
};

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(
    {
      sub: payload.userId,
      email: payload.email,
      role: payload.role,
      orgId: payload.organizationId,
      permissions: payload.permissions,
    },
    process.env.JWT_SECRET!,
    {
      expiresIn: config.accessTokenExpiry,
      issuer: config.issuer,
      audience: config.audience,
      algorithm: 'HS256',
    }
  );
};

export const generateRefreshToken = (
  userId: string,
  tokenId: string
): string => {
  return jwt.sign(
    {
      sub: userId,
      jti: tokenId,
      type: 'refresh',
    },
    process.env.REFRESH_SECRET!,
    {
      expiresIn: config.refreshTokenExpiry,
      issuer: config.issuer,
    }
  );
};

export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ['HS256'],
    });
    
    return decoded as TokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthError('Token expired', 'TOKEN_EXPIRED');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthError('Invalid token', 'INVALID_TOKEN');
    }
    throw error;
  }
};
```

### Refresh Token Rotation

```typescript
// services/refresh-token.service.ts
export class RefreshTokenService {
  async create(userId: string): Promise<{ token: string; id: string }> {
    const tokenId = crypto.randomUUID();
    const expiresAt = dayjs().add(7, 'days').toDate();

    // Store in database
    await prisma.refreshToken.create({
      data: {
        id: tokenId,
        userId,
        expiresAt,
        createdAt: new Date(),
      },
    });

    const token = generateRefreshToken(userId, tokenId);

    return { token, id: tokenId };
  }

  async rotate(oldTokenId: string): Promise<{ token: string; id: string }> {
    // Find and invalidate old token
    const oldToken = await prisma.refreshToken.findUnique({
      where: { id: oldTokenId },
    });

    if (!oldToken || oldToken.revokedAt) {
      // Potential token reuse attack - revoke all user tokens
      if (oldToken) {
        await this.revokeAllUserTokens(oldToken.userId);
        logger.security('Refresh token reuse detected', {
          userId: oldToken.userId,
          tokenId: oldTokenId,
        });
      }
      throw new AuthError('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
    }

    if (oldToken.expiresAt < new Date()) {
      throw new AuthError('Refresh token expired', 'REFRESH_TOKEN_EXPIRED');
    }

    // Revoke old token
    await prisma.refreshToken.update({
      where: { id: oldTokenId },
      data: { revokedAt: new Date() },
    });

    // Create new token
    return this.create(oldToken.userId);
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async cleanupExpired(): Promise<number> {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          {
            revokedAt: { not: null },
            revokedAt: { lt: dayjs().subtract(30, 'days').toDate() },
          },
        ],
      },
    });

    return result.count;
  }
}
```

---

## Session Management

### Cookie Security

```typescript
// lib/security/cookies.ts
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
};

export const setRefreshTokenCookie = (
  res: Response,
  token: string
): void => {
  res.cookie('refreshToken', token, {
    ...COOKIE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

export const clearRefreshTokenCookie = (res: Response): void => {
  res.clearCookie('refreshToken', COOKIE_OPTIONS);
};
```

### Session Timeout

```typescript
// middleware/session.middleware.ts
export const sessionMiddleware = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = extractToken(req);
    
    if (!token) {
      return next();
    }

    try {
      const payload = verifyAccessToken(token);
      
      // Check absolute session timeout (24 hours)
      const sessionStart = payload.iat ? new Date(payload.iat * 1000) : null;
      if (sessionStart) {
        const sessionAge = Date.now() - sessionStart.getTime();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        if (sessionAge > maxAge) {
          throw new AuthError('Session expired', 'SESSION_EXPIRED');
        }
      }

      req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        organizationId: payload.orgId,
        permissions: payload.permissions,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
};
```

### Concurrent Session Control

```typescript
// services/session.service.ts
export class SessionService {
  private readonly maxConcurrentSessions = 5;

  async createSession(
    userId: string,
    deviceInfo: DeviceInfo
  ): Promise<Session> {
    // Check active session count
    const activeSessions = await prisma.session.count({
      where: {
        userId,
        expiresAt: { gt: new Date() },
        revokedAt: null,
      },
    });

    if (activeSessions >= this.maxConcurrentSessions) {
      // Revoke oldest session
      const oldest = await prisma.session.findFirst({
        where: {
          userId,
          expiresAt: { gt: new Date() },
          revokedAt: null,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (oldest) {
        await this.revokeSession(oldest.id);
      }
    }

    // Create new session
    return prisma.session.create({
      data: {
        userId,
        deviceInfo,
        ipAddress: deviceInfo.ip,
        userAgent: deviceInfo.userAgent,
        expiresAt: dayjs().add(7, 'days').toDate(),
      },
    });
  }

  async getUserSessions(userId: string): Promise<Session[]> {
    return prisma.session.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
        revokedAt: null,
      },
      orderBy: { lastActiveAt: 'desc' },
    });
  }

  async revokeSession(sessionId: string): Promise<void> {
    await prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeOtherSessions(
    userId: string,
    currentSessionId: string
  ): Promise<void> {
    await prisma.session.updateMany({
      where: {
        userId,
        id: { not: currentSessionId },
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }
}
```

---

## Multi-Factor Authentication

### TOTP Setup

```typescript
// services/mfa.service.ts
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

export class MfaService {
  async setupTotp(userId: string): Promise<TotpSetup> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    // Generate secret
    const secret = authenticator.generateSecret();
    
    // Generate QR code
    const otpauth = authenticator.keyuri(
      user.email,
      'InsightDesk',
      secret
    );
    const qrCode = await QRCode.toDataURL(otpauth);

    // Generate backup codes
    const backupCodes = this.generateBackupCodes(10);
    const hashedBackupCodes = await Promise.all(
      backupCodes.map(code => hashPassword(code))
    );

    // Store pending setup (not active yet)
    await prisma.mfaPending.create({
      data: {
        userId,
        secret,
        backupCodes: hashedBackupCodes,
        expiresAt: dayjs().add(10, 'minutes').toDate(),
      },
    });

    return {
      secret,
      qrCode,
      backupCodes, // Show once, user must save
    };
  }

  async verifyAndActivate(userId: string, code: string): Promise<void> {
    const pending = await prisma.mfaPending.findFirst({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
    });

    if (!pending) {
      throw new AuthError('MFA setup expired', 'MFA_SETUP_EXPIRED');
    }

    // Verify TOTP code
    const isValid = authenticator.check(code, pending.secret);
    
    if (!isValid) {
      throw new AuthError('Invalid code', 'INVALID_MFA_CODE');
    }

    // Activate MFA
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: true,
          mfaSecret: pending.secret,
          mfaBackupCodes: pending.backupCodes,
        },
      }),
      prisma.mfaPending.delete({ where: { id: pending.id } }),
    ]);

    // Audit log
    await auditLog.log({
      action: 'mfa:enabled',
      userId,
      details: { method: 'totp' },
    });
  }

  async verifyCode(userId: string, code: string): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user.mfaEnabled || !user.mfaSecret) {
      return true; // MFA not enabled
    }

    // Try TOTP first
    if (authenticator.check(code, user.mfaSecret)) {
      return true;
    }

    // Try backup codes
    return this.tryBackupCode(userId, code, user.mfaBackupCodes);
  }

  private async tryBackupCode(
    userId: string,
    code: string,
    hashedCodes: string[]
  ): Promise<boolean> {
    for (let i = 0; i < hashedCodes.length; i++) {
      if (await verifyPassword(code, hashedCodes[i])) {
        // Remove used backup code
        const updatedCodes = [...hashedCodes];
        updatedCodes.splice(i, 1);

        await prisma.user.update({
          where: { id: userId },
          data: { mfaBackupCodes: updatedCodes },
        });

        await auditLog.log({
          action: 'mfa:backup_code_used',
          userId,
          details: { remainingCodes: updatedCodes.length },
        });

        return true;
      }
    }

    return false;
  }

  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      codes.push(
        crypto.randomBytes(4).toString('hex').toUpperCase()
      );
    }
    return codes;
  }
}
```

---

## Account Protection

### Account Lockout

```typescript
// services/lockout.service.ts
export class LockoutService {
  private readonly maxAttempts = 5;
  private readonly lockoutDuration = 30 * 60 * 1000; // 30 minutes
  private readonly attemptWindow = 15 * 60 * 1000;   // 15 minutes

  async recordFailedAttempt(
    identifier: string,
    type: 'email' | 'ip'
  ): Promise<LockoutStatus> {
    const key = `lockout:${type}:${identifier}`;
    
    const attempts = await valkey.incr(key);
    
    if (attempts === 1) {
      await valkey.pexpire(key, this.attemptWindow);
    }

    if (attempts >= this.maxAttempts) {
      await valkey.pexpire(key, this.lockoutDuration);
      
      logger.security('Account locked', {
        identifier,
        type,
        attempts,
      });

      return {
        locked: true,
        remainingTime: this.lockoutDuration,
        attempts,
      };
    }

    return {
      locked: false,
      remainingAttempts: this.maxAttempts - attempts,
      attempts,
    };
  }

  async checkLockout(
    identifier: string,
    type: 'email' | 'ip'
  ): Promise<LockoutStatus> {
    const key = `lockout:${type}:${identifier}`;
    const attempts = await valkey.get(key);

    if (!attempts) {
      return { locked: false, attempts: 0 };
    }

    const count = parseInt(attempts, 10);
    
    if (count >= this.maxAttempts) {
      const ttl = await valkey.pttl(key);
      return {
        locked: true,
        remainingTime: ttl,
        attempts: count,
      };
    }

    return {
      locked: false,
      remainingAttempts: this.maxAttempts - count,
      attempts: count,
    };
  }

  async clearLockout(identifier: string, type: 'email' | 'ip'): Promise<void> {
    await valkey.del(`lockout:${type}:${identifier}`);
  }
}
```

### Suspicious Activity Detection

```typescript
// services/suspicious-activity.service.ts
export class SuspiciousActivityService {
  async check(userId: string, context: LoginContext): Promise<RiskLevel> {
    const factors: RiskFactor[] = [];

    // Check for new device
    const knownDevices = await this.getKnownDevices(userId);
    if (!knownDevices.includes(context.deviceFingerprint)) {
      factors.push({ type: 'new_device', weight: 2 });
    }

    // Check for new location
    const knownLocations = await this.getKnownLocations(userId);
    const currentLocation = await this.geolocate(context.ip);
    if (!this.isNearKnownLocation(currentLocation, knownLocations)) {
      factors.push({ type: 'new_location', weight: 3 });
    }

    // Check for impossible travel
    const lastLogin = await this.getLastLogin(userId);
    if (lastLogin && this.isImpossibleTravel(lastLogin, context)) {
      factors.push({ type: 'impossible_travel', weight: 5 });
    }

    // Check for unusual time
    const loginPattern = await this.getLoginPattern(userId);
    if (!this.matchesPattern(context.timestamp, loginPattern)) {
      factors.push({ type: 'unusual_time', weight: 1 });
    }

    // Calculate risk score
    const score = factors.reduce((sum, f) => sum + f.weight, 0);

    if (score >= 8) {
      await this.alertSecurity(userId, factors, 'high');
      return 'high';
    }
    if (score >= 4) {
      await this.alertSecurity(userId, factors, 'medium');
      return 'medium';
    }

    return 'low';
  }

  private isImpossibleTravel(
    lastLogin: LoginRecord,
    current: LoginContext
  ): boolean {
    const distance = this.calculateDistance(
      lastLogin.location,
      current.location
    );
    const timeDiff = current.timestamp.getTime() - lastLogin.timestamp.getTime();
    const hours = timeDiff / (1000 * 60 * 60);
    
    // Max human travel speed ~900 km/h (commercial flight)
    const maxDistance = hours * 900;
    
    return distance > maxDistance;
  }
}
```

---

## Related Documents

- [Security Overview](overview.md) — Security principles
- [OWASP Compliance](owasp.md) — OWASP Top 10
- [Data Protection](data-protection.md) — Encryption and PII
- [Auth Module](../04-modules/auth/overview.md) — Auth implementation

---

*Next: [Data Protection →](data-protection.md)*
