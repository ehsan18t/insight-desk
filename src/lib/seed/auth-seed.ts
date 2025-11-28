/**
 * Auth Seed - Manual seeding for authentication-related data
 *
 * Users must be created via better-auth API to properly hash passwords
 * and create associated accounts/sessions.
 */

import { auth } from "@/modules/auth";
import { logger } from "@/lib/logger";

export interface SeedUser {
  email: string;
  password: string;
  name: string;
}

export const DEV_USERS: SeedUser[] = [
  { email: "owner@acme.com", password: "Owner123!", name: "Alice Owner" },
  { email: "admin@acme.com", password: "Admin123!", name: "Bob Admin" },
  { email: "agent@acme.com", password: "Agent123!", name: "Charlie Agent" },
  { email: "customer@acme.com", password: "Customer123!", name: "Diana Customer" },
  { email: "admin@techstart.com", password: "Admin123!", name: "Eve TechAdmin" },
];

export const TEST_USERS: SeedUser[] = [
  { email: "test-owner@test.com", password: "TestOwner123!", name: "Test Owner" },
  { email: "test-admin@test.com", password: "TestAdmin123!", name: "Test Admin" },
  { email: "test-agent@test.com", password: "TestAgent123!", name: "Test Agent" },
  { email: "test-customer@test.com", password: "TestCustomer123!", name: "Test Customer" },
  { email: "test-customer2@test.com", password: "TestCustomer123!", name: "Test Customer 2" },
];

/**
 * Seed users via better-auth API
 * Returns a map of email -> userId for use in subsequent seeding
 */
export async function seedUsers(users: SeedUser[]): Promise<Map<string, string>> {
  const userMap = new Map<string, string>();

  for (const user of users) {
    try {
      const result = await auth.api.signUpEmail({
        body: {
          email: user.email,
          password: user.password,
          name: user.name,
        },
      });

      if (result.user?.id) {
        userMap.set(user.email, result.user.id);
        logger.info(`Created user: ${user.email}`);
      }
    } catch (error) {
      // User might already exist
      logger.warn(`Failed to create user ${user.email}: ${error}`);
    }
  }

  return userMap;
}

/**
 * Get existing user IDs by email (for when users already exist)
 */
export async function getExistingUserIds(
  db: typeof import("@/db").db,
  emails: string[],
): Promise<Map<string, string>> {
  const { users } = await import("@/db/schema");
  const { inArray } = await import("drizzle-orm");

  const existingUsers = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.email, emails));

  const userMap = new Map<string, string>();
  for (const user of existingUsers) {
    userMap.set(user.email, user.id);
  }

  return userMap;
}
