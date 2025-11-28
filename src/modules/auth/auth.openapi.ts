/**
 * Auth Module - OpenAPI Route Definitions
 *
 * Registers all authentication-related endpoints with the OpenAPI registry.
 * Includes both Better Auth managed routes and custom endpoints.
 */

import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "@/lib/openapi";
import {
  createDataResponseSchema,
  createMessageResponseSchema,
  commonErrorResponses,
  UserRoleSchema,
  EmailSchema,
  UuidSchema,
  TimestampSchema,
} from "@/lib/openapi/responses";

extendZodWithOpenApi(z);

// ═══════════════════════════════════════════════════════════════════════════
// AUTH SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sign-in request body
 */
const SignInRequestSchema = z
  .object({
    email: EmailSchema.describe("User's email address"),
    password: z.string().min(8).max(128).describe("User's password (8-128 characters)"),
    rememberMe: z
      .boolean()
      .optional()
      .default(false)
      .describe("Extend session duration for persistent login"),
  })
  .openapi("SignInRequest");

/**
 * Sign-up request body
 */
const SignUpRequestSchema = z
  .object({
    email: EmailSchema.describe("User's email address (must be unique)"),
    password: z.string().min(8).max(128).describe("User's password (8-128 characters)"),
    name: z.string().min(1).max(255).describe("User's display name"),
  })
  .openapi("SignUpRequest");

/**
 * User data returned from auth endpoints
 */
const AuthUserSchema = z
  .object({
    id: UuidSchema.describe("Unique user identifier"),
    email: EmailSchema,
    name: z.string().describe("User's display name"),
    avatarUrl: z.url().nullable().describe("URL to user's avatar image"),
    emailVerified: z.boolean().describe("Whether email has been verified"),
    createdAt: TimestampSchema.describe("Account creation timestamp"),
  })
  .openapi("AuthUser");

/**
 * Session data
 */
const SessionSchema = z
  .object({
    user: AuthUserSchema,
    session: z.object({
      id: UuidSchema.describe("Session identifier"),
      expiresAt: TimestampSchema.describe("Session expiration timestamp"),
    }),
  })
  .openapi("Session");

/**
 * Organization membership in current user response
 */
const UserOrganizationSchema = z
  .object({
    id: UuidSchema.describe("Organization ID"),
    name: z.string().describe("Organization display name"),
    slug: z.string().describe("URL-friendly organization identifier"),
    role: UserRoleSchema.describe("User's role in this organization"),
    joinedAt: TimestampSchema.describe("When the user joined this organization"),
  })
  .openapi("UserOrganization");

/**
 * Current user with organization memberships
 */
const CurrentUserSchema = z
  .object({
    id: UuidSchema.describe("User's unique identifier"),
    email: EmailSchema,
    name: z.string().describe("User's display name"),
    avatarUrl: z.url().nullable().describe("URL to user's avatar image"),
    emailVerified: z.boolean().describe("Whether email has been verified"),
    organizations: z.array(UserOrganizationSchema).describe("Organizations the user belongs to"),
  })
  .openapi("CurrentUser");

/**
 * Register with organization request
 */
const RegisterWithOrgRequestSchema = z
  .object({
    email: EmailSchema.describe("User's email address (must be unique)"),
    password: z.string().min(8).max(128).describe("User's password (8-128 characters)"),
    name: z.string().min(1).max(255).describe("User's display name"),
    organizationName: z
      .string()
      .min(1)
      .max(255)
      .optional()
      .describe("Name for the new organization (optional)"),
  })
  .openapi("RegisterWithOrgRequest");

/**
 * Register with organization response
 */
const RegisterWithOrgResponseSchema = z
  .object({
    userId: UuidSchema.describe("ID of the newly created user"),
  })
  .openapi("RegisterWithOrgResponseData");

/**
 * Password reset request body
 */
const ForgotPasswordRequestSchema = z
  .object({
    email: EmailSchema.describe("Email address to send password reset link to"),
  })
  .openapi("ForgotPasswordRequest");

/**
 * Reset password with token request body
 */
const ResetPasswordRequestSchema = z
  .object({
    token: z.string().describe("Password reset token from email link"),
    password: z.string().min(8).max(128).describe("New password (8-128 characters)"),
  })
  .openapi("ResetPasswordRequest");

// ═══════════════════════════════════════════════════════════════════════════
// BETTER AUTH ROUTES (Managed by better-auth library)
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/auth/sign-up
registry.registerPath({
  method: "post",
  path: "/api/auth/sign-up",
  tags: ["Authentication"],
  summary: "Create a new user account",
  description: `
Register a new user account with email and password.

**Notes:**
- A verification email will be sent to the provided address
- The user must verify their email before full access is granted
- Passwords must be 8-128 characters
- Email addresses must be unique across the system
`,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: SignUpRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Account created successfully. Check email for verification link.",
      content: {
        "application/json": {
          schema: createDataResponseSchema(AuthUserSchema, "SignUpResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    409: {
      description: "Conflict - Email address already registered",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(false),
            error: z.string().default("Email already in use"),
          }),
        },
      },
    },
    429: commonErrorResponses[429],
    500: commonErrorResponses[500],
  },
});

// POST /api/auth/sign-in
registry.registerPath({
  method: "post",
  path: "/api/auth/sign-in",
  tags: ["Authentication"],
  summary: "Sign in to an existing account",
  description: `
Authenticate with email and password credentials.

**Notes:**
- On success, a session cookie is set automatically
- The cookie is HTTP-only and secure in production
- Use \`rememberMe: true\` for extended session duration
- Include the cookie in subsequent requests for authentication
`,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: SignInRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Successfully authenticated. Session cookie set.",
      content: {
        "application/json": {
          schema: createDataResponseSchema(SessionSchema, "SignInResponse"),
        },
      },
      headers: {
        "Set-Cookie": {
          description: "Session cookie for authenticated requests",
          schema: { type: "string" },
        },
      },
    },
    400: commonErrorResponses[400],
    401: {
      description: "Unauthorized - Invalid email or password",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(false),
            error: z.string().default("Invalid credentials"),
          }),
        },
      },
    },
    429: commonErrorResponses[429],
    500: commonErrorResponses[500],
  },
});

// POST /api/auth/sign-out
registry.registerPath({
  method: "post",
  path: "/api/auth/sign-out",
  tags: ["Authentication"],
  summary: "Sign out of the current session",
  description: `
End the current authenticated session.

**Notes:**
- The session cookie will be invalidated
- The user will need to sign in again to access protected resources
- This action cannot be undone
`,
  security: [{ cookieAuth: [] }],
  responses: {
    200: {
      description: "Successfully signed out. Session cookie cleared.",
      content: {
        "application/json": {
          schema: createMessageResponseSchema("SignOutResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    500: commonErrorResponses[500],
  },
});

// GET /api/auth/session
registry.registerPath({
  method: "get",
  path: "/api/auth/session",
  tags: ["Authentication"],
  summary: "Get current session information",
  description: `
Retrieve the current user's session data.

**Notes:**
- Returns the authenticated user and session details
- Returns null/empty if no active session
- Useful for checking authentication status on page load
`,
  security: [{ cookieAuth: [] }],
  responses: {
    200: {
      description: "Session data retrieved successfully",
      content: {
        "application/json": {
          schema: createDataResponseSchema(SessionSchema.nullable(), "SessionResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    500: commonErrorResponses[500],
  },
});

// POST /api/auth/forgot-password
registry.registerPath({
  method: "post",
  path: "/api/auth/forgot-password",
  tags: ["Authentication"],
  summary: "Request password reset email",
  description: `
Send a password reset link to the specified email address.

**Notes:**
- An email will be sent if the account exists
- For security, the response is the same whether the email exists or not
- Reset tokens expire after 1 hour
- Rate limited to prevent abuse
`,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: ForgotPasswordRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Password reset email sent if account exists",
      content: {
        "application/json": {
          schema: createMessageResponseSchema("ForgotPasswordResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    429: commonErrorResponses[429],
    500: commonErrorResponses[500],
  },
});

// POST /api/auth/reset-password
registry.registerPath({
  method: "post",
  path: "/api/auth/reset-password",
  tags: ["Authentication"],
  summary: "Reset password with token",
  description: `
Set a new password using the reset token from the email link.

**Notes:**
- The token is single-use and expires after 1 hour
- New password must meet security requirements (8-128 characters)
- After successful reset, user can sign in with the new password
`,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: ResetPasswordRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Password reset successfully",
      content: {
        "application/json": {
          schema: createMessageResponseSchema("ResetPasswordResponse"),
        },
      },
    },
    400: {
      description: "Bad Request - Invalid or expired token",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(false),
            error: z.string().default("Invalid or expired reset token"),
          }),
        },
      },
    },
    429: commonErrorResponses[429],
    500: commonErrorResponses[500],
  },
});

// POST /api/auth/verify-email (with token in body or query)
registry.registerPath({
  method: "post",
  path: "/api/auth/verify-email",
  tags: ["Authentication"],
  summary: "Verify email address",
  description: `
Confirm the user's email address using the verification token.

**Notes:**
- Token is sent via email during sign-up
- Verification tokens expire after 24 hours
- After verification, user gains full access to the system
- User is automatically signed in after successful verification
`,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({
              token: z.string().describe("Email verification token from the link"),
            })
            .openapi("VerifyEmailRequest"),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Email verified successfully. User is now signed in.",
      content: {
        "application/json": {
          schema: createDataResponseSchema(SessionSchema, "VerifyEmailResponse"),
        },
      },
    },
    400: {
      description: "Bad Request - Invalid or expired verification token",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(false),
            error: z.string().default("Invalid or expired verification token"),
          }),
        },
      },
    },
    500: commonErrorResponses[500],
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/auth/me
registry.registerPath({
  method: "get",
  path: "/api/auth/me",
  tags: ["Authentication"],
  summary: "Get current user with organizations",
  description: `
Retrieve the authenticated user's profile including all organization memberships.

**Notes:**
- Requires authentication
- Returns detailed information about each organization membership
- Includes the user's role in each organization
- Useful for building navigation and organization switchers
`,
  security: [{ cookieAuth: [] }],
  responses: {
    200: {
      description: "Current user data with organization memberships",
      content: {
        "application/json": {
          schema: createDataResponseSchema(CurrentUserSchema, "CurrentUserResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    500: commonErrorResponses[500],
  },
});

// POST /api/auth/register-with-org
registry.registerPath({
  method: "post",
  path: "/api/auth/register-with-org",
  tags: ["Authentication"],
  summary: "Register user with new organization",
  description: `
Create a new user account and optionally a new organization in one step.

**Notes:**
- Combines user registration with organization creation
- User becomes the owner of the newly created organization
- If no organization name is provided, only the user account is created
- A verification email will be sent to the provided address
- Rate limited to prevent abuse
`,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: RegisterWithOrgRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "User and organization created successfully",
      content: {
        "application/json": {
          schema: z
            .object({
              success: z.literal(true),
              message: z.string().default("Account created successfully"),
              data: RegisterWithOrgResponseSchema,
            })
            .openapi("RegisterWithOrgResponse"),
        },
      },
    },
    400: commonErrorResponses[400],
    409: {
      description: "Conflict - Email address already registered",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(false),
            error: z.string().default("Email already in use"),
          }),
        },
      },
    },
    429: commonErrorResponses[429],
    500: commonErrorResponses[500],
  },
});
