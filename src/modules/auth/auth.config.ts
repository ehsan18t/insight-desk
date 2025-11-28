import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { config } from "@/config";
import { db } from "@/db";
import * as schema from "@/db/schema/index";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),

  // Base URL
  baseURL: config.BETTER_AUTH_URL || config.API_URL || `http://${config.HOST}:${config.PORT}`,

  // Secret key for signing
  secret: config.BETTER_AUTH_SECRET,

  // Email and password authentication
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },

  // Session configuration
  session: {
    expiresIn: config.SESSION_MAX_AGE,
    updateAge: config.SESSION_UPDATE_AGE,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },

  // Social login providers (optional)
  socialProviders: {
    ...(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: config.GOOGLE_CLIENT_ID,
            clientSecret: config.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...(config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: config.GITHUB_CLIENT_ID,
            clientSecret: config.GITHUB_CLIENT_SECRET,
          },
        }
      : {}),
  },

  // User configuration
  user: {
    additionalFields: {
      isActive: {
        type: "boolean",
        defaultValue: true,
        input: false, // Not settable by user
      },
    },
  },

  // Advanced options
  advanced: {
    cookiePrefix: "insightdesk",
    generateId: () => crypto.randomUUID(),
  },
});

// Export auth types
export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
