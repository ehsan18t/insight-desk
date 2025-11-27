# Authentication & Security

> Better Auth implementation for solo developers

## Table of Contents

1. [Overview](#overview)
2. [Better Auth Setup](#better-auth-setup)
3. [Database Integration](#database-integration)
4. [Session Management](#session-management)
5. [Role-Based Access Control](#role-based-access-control)
6. [API Security](#api-security)
7. [Input Validation](#input-validation)
8. [Security Best Practices](#security-best-practices)

---

## Overview

### Why Better Auth?

| Feature              | Better Auth       | NextAuth.js      |
| -------------------- | ----------------- | ---------------- |
| Database-first       | ✅ Built-in        | ❌ Adapter needed |
| Type safety          | ✅ Full TypeScript | ⚠️ Partial        |
| Organization support | ✅ Built-in plugin | ❌ Custom needed  |
| Session handling     | ✅ JWT + Database  | ✅ Both           |
| Learning curve       | Low               | Medium           |

### Auth Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Next.js)                        │
├─────────────────────────────────────────────────────────────────┤
│  useSession()  │  signIn()  │  signOut()  │  Protected Routes   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Better Auth (Express)                        │
├─────────────────────────────────────────────────────────────────┤
│  /api/auth/signin  │  /api/auth/session  │  /api/auth/signout   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PostgreSQL + Drizzle                       │
├─────────────────────────────────────────────────────────────────┤
│     users     │    sessions    │    accounts    │    tokens     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Better Auth Setup

### Installation

```bash
bun add better-auth
```

### Auth Configuration (Express)

```ts
// apps/api/src/lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  // Database adapter
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verificationTokens,
    },
  }),

  // Email & Password authentication
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Set true in production
    minPasswordLength: 8,
  },

  // Session configuration
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes cache
    },
  },

  // User configuration
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "customer",
      },
      organizationId: {
        type: "string",
        required: false,
      },
    },
  },

  // OAuth providers (optional)
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },

  // Plugins
  plugins: [
    organization({
      allowUserToCreateOrganization: false, // Admin only
    }),
  ],

  // Advanced options
  advanced: {
    generateId: () => crypto.randomUUID(),
  },
});

// Export types
export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session["user"];
```

### Express Integration

```ts
// apps/api/src/index.ts
import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "@/lib/auth";

const app = express();

// CORS for Next.js frontend
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

// Better Auth handler - handles all /api/auth/* routes
app.all("/api/auth/*", toNodeHandler(auth));

// Parse JSON for other routes
app.use(express.json());

// Your API routes
app.use("/api/v1", apiRoutes);

app.listen(4000, () => {
  console.log("API server running on http://localhost:4000");
});
```

---

## Database Integration

### Auth Tables Schema

```ts
// packages/database/src/schema/auth.ts
import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

// Users table (extends Better Auth's user)
export const users = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false),
    name: text("name").notNull(),
    image: text("image"),
    role: text("role").notNull().default("customer"), // customer, agent, admin
    organizationId: text("organization_id").references(() => organizations.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index("users_email_idx").on(table.email),
    orgIdx: index("users_org_idx").on(table.organizationId),
  })
);

// Sessions table
export const sessions = pgTable(
  "sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("sessions_user_idx").on(table.userId),
    tokenIdx: index("sessions_token_idx").on(table.token),
    expiresIdx: index("sessions_expires_idx").on(table.expiresAt),
  })
);

// Accounts table (for OAuth providers)
export const accounts = pgTable(
  "accounts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"), // Hashed password for email/password auth
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("accounts_user_idx").on(table.userId),
    providerIdx: index("accounts_provider_idx").on(
      table.providerId,
      table.accountId
    ),
  })
);

// Verification tokens (email verification, password reset)
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    identifier: text("identifier").notNull(),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    tokenIdx: index("verification_token_idx").on(table.token),
    identifierIdx: index("verification_identifier_idx").on(table.identifier),
  })
);
```

### Type Exports

```ts
// packages/database/src/schema/types.ts
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { users, sessions, accounts } from "./auth";

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type Session = InferSelectModel<typeof sessions>;
export type Account = InferSelectModel<typeof accounts>;

export type UserRole = "customer" | "agent" | "admin";
```

---

## Session Management

### Auth Client (Next.js)

```ts
// apps/web/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
});

// Export hooks
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
} = authClient;
```

### Session Hook Usage

```tsx
// components/auth/user-menu.tsx
"use client";

import { useSession, signOut } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, Settings, LogOut } from "lucide-react";
import Link from "next/link";

export function UserMenu() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />;
  }

  if (!session?.user) {
    return (
      <Link
        href="/login"
        className="text-sm font-medium hover:text-primary"
      >
        Sign In
      </Link>
    );
  }

  const { user } = session;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.image ?? undefined} />
            <AvatarFallback>
              {user.name?.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{user.name}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <User className="mr-2 h-4 w-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut()}
          className="text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### Server-Side Session (Next.js)

```ts
// apps/web/lib/auth.ts
import { headers } from "next/headers";

const API_URL = process.env.API_URL || "http://localhost:4000";

export async function getSession() {
  try {
    const headersList = await headers();
    const cookie = headersList.get("cookie");

    const response = await fetch(`${API_URL}/api/auth/get-session`, {
      headers: {
        cookie: cookie || "",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const session = await response.json();
    return session;
  } catch {
    return null;
  }
}

export async function requireSession() {
  const session = await getSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  return session;
}
```

### Login Page

```tsx
// app/(auth)/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsPending(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const result = await signIn.email({
        email,
        password,
      });

      if (result.error) {
        toast.error(result.error.message);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      toast.error("An error occurred during sign in");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Sign In</CardTitle>
          <CardDescription>
            Enter your email and password to access your account
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Signing in..." : "Sign In"}
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              Don't have an account?{" "}
              <Link href="/register" className="text-primary hover:underline">
                Sign up
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
```

---

## Role-Based Access Control

### Role Definitions

```ts
// packages/shared/src/auth/roles.ts

export const ROLES = {
  customer: "customer",
  agent: "agent",
  admin: "admin",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

// Permissions by role
export const PERMISSIONS = {
  // Ticket permissions
  "tickets:create": ["customer", "agent", "admin"],
  "tickets:read": ["customer", "agent", "admin"],
  "tickets:update": ["agent", "admin"],
  "tickets:delete": ["admin"],
  "tickets:assign": ["agent", "admin"],

  // User management
  "users:read": ["agent", "admin"],
  "users:update": ["admin"],
  "users:delete": ["admin"],

  // Organization settings
  "org:read": ["agent", "admin"],
  "org:update": ["admin"],

  // Reports
  "reports:read": ["agent", "admin"],
  "reports:export": ["admin"],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: Role, permission: Permission): boolean {
  const allowedRoles = PERMISSIONS[permission];
  return allowedRoles.includes(role);
}

export function requireRole(...roles: Role[]) {
  return (userRole: Role) => roles.includes(userRole);
}
```

### Express Middleware

```ts
// apps/api/src/middleware/auth.ts
import type { Request, Response, NextFunction } from "express";
import { auth } from "@/lib/auth";
import { hasPermission, type Permission, type Role } from "@shared/auth/roles";

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: Role;
        organizationId?: string;
      };
      session?: {
        id: string;
        userId: string;
        expiresAt: Date;
      };
    }
  }
}

// Authenticate request
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as Headers,
    });

    if (!session) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    req.user = session.user as Request["user"];
    req.session = session.session;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: "Invalid session",
    });
  }
}

// Require specific role
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: "Forbidden: Insufficient permissions",
      });
    }

    next();
  };
}

// Require specific permission
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Missing permission '${permission}'`,
      });
    }

    next();
  };
}

// Optional authentication (doesn't fail if not authenticated)
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as Headers,
    });

    if (session) {
      req.user = session.user as Request["user"];
      req.session = session.session;
    }
  } catch {
    // Ignore errors, continue without user
  }

  next();
}
```

### Using Middleware in Routes

```ts
// apps/api/src/routes/tickets.ts
import { Router } from "express";
import { authenticate, requireRole, requirePermission } from "@/middleware/auth";
import * as ticketController from "@/controllers/ticket";

const router = Router();

// All ticket routes require authentication
router.use(authenticate);

// Anyone authenticated can list their tickets
router.get("/", ticketController.list);

// Anyone authenticated can create a ticket
router.get("/:id", ticketController.get);
router.post("/", ticketController.create);

// Only agents and admins can update tickets
router.patch(
  "/:id",
  requirePermission("tickets:update"),
  ticketController.update
);

// Only agents and admins can assign tickets
router.post(
  "/:id/assign",
  requirePermission("tickets:assign"),
  ticketController.assign
);

// Only admins can delete tickets
router.delete(
  "/:id",
  requireRole("admin"),
  ticketController.remove
);

export default router;
```

### Client-Side Role Checks

```tsx
// components/auth/role-gate.tsx
"use client";

import { useSession } from "@/lib/auth-client";
import type { Role } from "@shared/auth/roles";

interface RoleGateProps {
  children: React.ReactNode;
  allowedRoles: Role[];
  fallback?: React.ReactNode;
}

export function RoleGate({
  children,
  allowedRoles,
  fallback = null,
}: RoleGateProps) {
  const { data: session } = useSession();

  if (!session?.user) {
    return fallback;
  }

  if (!allowedRoles.includes(session.user.role as Role)) {
    return fallback;
  }

  return <>{children}</>;
}

// Usage
export function AdminPanel() {
  return (
    <RoleGate allowedRoles={["admin"]}>
      <div>Admin-only content</div>
    </RoleGate>
  );
}
```

---

## API Security

### Rate Limiting

```ts
// apps/api/src/middleware/rate-limit.ts
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { valkey } from "@/lib/valkey";

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => valkey.sendCommand(args),
  }),
  message: {
    success: false,
    error: "Too many requests, please try again later",
  },
});

// Strict limiter for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => valkey.sendCommand(args),
  }),
  message: {
    success: false,
    error: "Too many login attempts, please try again later",
  },
});
```

### Security Headers

```ts
// apps/api/src/middleware/security.ts
import helmet from "helmet";
import type { Express } from "express";

export function setupSecurity(app: Express) {
  // Helmet for security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", process.env.FRONTEND_URL!],
        },
      },
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  // Disable X-Powered-By
  app.disable("x-powered-by");
}
```

### CORS Configuration

```ts
// apps/api/src/config/cors.ts
import cors from "cors";

const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3000",
];

export const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
  exposedHeaders: ["X-Request-ID", "X-RateLimit-Remaining"],
  maxAge: 86400, // 24 hours
};
```

---

## Input Validation

### Zod Validation Middleware

```ts
// apps/api/src/middleware/validate.ts
import type { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";

type ValidateTarget = "body" | "query" | "params";

export function validate<T extends z.ZodSchema>(
  schema: T,
  target: ValidateTarget = "body"
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req[target];
      const validated = await schema.parseAsync(data);

      // Replace with validated data
      req[target] = validated;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: error.errors.map((err) => ({
            field: err.path.join("."),
            message: err.message,
          })),
        });
      }

      next(error);
    }
  };
}
```

### Using Validation in Routes

```ts
// apps/api/src/routes/tickets.ts
import { Router } from "express";
import { validate } from "@/middleware/validate";
import { createTicketSchema, updateTicketSchema } from "@shared/schemas/ticket";
import { paginationSchema } from "@shared/schemas/common";

const router = Router();

// Validate query params for list
router.get(
  "/",
  validate(paginationSchema, "query"),
  ticketController.list
);

// Validate body for create
router.post(
  "/",
  validate(createTicketSchema, "body"),
  ticketController.create
);

// Validate body for update
router.patch(
  "/:id",
  validate(updateTicketSchema, "body"),
  ticketController.update
);

export default router;
```

### Common Schemas

```ts
// packages/shared/src/schemas/common.ts
import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const idParamSchema = z.object({
  id: z.string().uuid("Invalid ID format"),
});

export const searchSchema = z.object({
  q: z.string().min(1).max(100).optional(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
export type IdParam = z.infer<typeof idParamSchema>;
```

---

## Security Best Practices

### Environment Variables

```env
# .env.example
# Never commit actual values!

# App
NODE_ENV=development
PORT=4000

# Auth
AUTH_SECRET=your-32-char-secret-key-here  # Generate with: openssl rand -base64 32
AUTH_URL=http://localhost:4000

# OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/insightdesk

# Valkey
VALKEY_URL=redis://localhost:6379

# Frontend
FRONTEND_URL=http://localhost:3000
```

### Secret Management

```ts
// apps/api/src/config/env.ts
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),

  // Auth
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_URL: z.string().url(),

  // Database
  DATABASE_URL: z.string().url(),

  // Valkey
  VALKEY_URL: z.string().url(),

  // Frontend
  FRONTEND_URL: z.string().url(),

  // Optional OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

export const env = envSchema.parse(process.env);

// Type-safe environment variables
export type Env = z.infer<typeof envSchema>;
```

### Password Hashing (Built-in)

Better Auth handles password hashing internally using Argon2. You don't need to manage this yourself.

### Security Checklist

```markdown
## Pre-Launch Security Checklist

### Authentication
- [ ] AUTH_SECRET is at least 32 characters
- [ ] AUTH_SECRET is unique per environment
- [ ] Email verification enabled in production
- [ ] Password min length is 8+ characters
- [ ] Rate limiting on auth endpoints

### Sessions
- [ ] Session expiry is reasonable (7-30 days)
- [ ] Sessions stored in database (not just JWT)
- [ ] Session invalidation on password change

### API Security
- [ ] CORS configured for production domain only
- [ ] Rate limiting on all endpoints
- [ ] Input validation on all endpoints
- [ ] SQL injection prevented (using Drizzle ORM)
- [ ] XSS prevented (React escapes by default)

### Headers
- [ ] HTTPS enforced in production
- [ ] Security headers via Helmet
- [ ] Content-Security-Policy configured

### Data
- [ ] Sensitive data encrypted at rest
- [ ] Database credentials not in code
- [ ] Logs don't contain sensitive data
```

---

## Next Steps

- **09-realtime.md** - Socket.IO with authentication
- **10-background-jobs.md** - Secure job processing

---

*Solo Developer Note: Better Auth handles most auth complexity for you. Focus on role-based access control and input validation—those are your responsibilities.*
