import { hexpire, hgetex, hsetex, valkey } from "./cache";
import { createLogger } from "./logger";

const logger = createLogger("presence");

// =============================================================================
// Presence Manager - Per-organization user presence tracking using Valkey 9
// =============================================================================

// Presence TTL in seconds - users are considered offline after this
const PRESENCE_TTL = 60;

// Typing indicator TTL in seconds - typing status expires after this
const TYPING_TTL = 5;

/**
 * Key patterns:
 * - presence:{organizationId} - Hash with userId -> timestamp
 * - typing:{ticketId} - Hash with odId -> JSON { userId, userName, timestamp }
 */

// =============================================================================
// Presence Functions
// =============================================================================

/**
 * Set a user as online in an organization
 */
export async function setUserOnline(organizationId: string, userId: string): Promise<void> {
  const key = `presence:${organizationId}`;
  const timestamp = Date.now().toString();

  await hsetex(key, { [userId]: timestamp }, PRESENCE_TTL);
  logger.debug({ organizationId, userId }, "User set online");
}

/**
 * Refresh a user's presence (heartbeat)
 */
export async function refreshPresence(organizationId: string, userId: string): Promise<void> {
  const key = `presence:${organizationId}`;
  const timestamp = Date.now().toString();

  // Use HSETEX with FXX (only update if field exists) to avoid creating phantom entries
  // If user was already offline, they need to explicitly reconnect
  const result = await hsetex(key, { [userId]: timestamp }, PRESENCE_TTL, { fxx: true });

  if (result === 0) {
    // Field didn't exist, user needs to be set online first
    await setUserOnline(organizationId, userId);
  }
}

/**
 * Set a user as offline in an organization
 */
export async function setUserOffline(organizationId: string, userId: string): Promise<void> {
  const key = `presence:${organizationId}`;

  await valkey.hdel(key, userId);
  logger.debug({ organizationId, userId }, "User set offline");
}

/**
 * Check if a user is online in an organization
 */
export async function isUserOnline(organizationId: string, userId: string): Promise<boolean> {
  const key = `presence:${organizationId}`;
  const [timestamp] = await hgetex(key, [userId]);

  if (!timestamp) return false;

  // Additional check: ensure timestamp is recent (in case TTL didn't fire yet)
  const lastSeen = parseInt(timestamp, 10);
  return Date.now() - lastSeen < PRESENCE_TTL * 1000;
}

/**
 * Get all online users in an organization
 */
export async function getOnlineUsers(organizationId: string): Promise<string[]> {
  const key = `presence:${organizationId}`;
  const all = await valkey.hgetall(key);

  if (!all || Object.keys(all).length === 0) return [];

  const now = Date.now();
  const onlineUsers: string[] = [];

  for (const [odId, timestamp] of Object.entries(all)) {
    const lastSeen = parseInt(timestamp, 10);
    if (now - lastSeen < PRESENCE_TTL * 1000) {
      onlineUsers.push(odId);
    }
  }

  return onlineUsers;
}

/**
 * Get online user count in an organization
 */
export async function getOnlineUserCount(organizationId: string): Promise<number> {
  const users = await getOnlineUsers(organizationId);
  return users.length;
}

// =============================================================================
// Typing Indicator Functions
// =============================================================================

interface TypingUser {
  userId: string;
  userName: string;
  timestamp: number;
}

/**
 * Set a user as typing in a ticket
 */
export async function setUserTyping(
  ticketId: string,
  userId: string,
  userName: string,
): Promise<void> {
  const key = `typing:${ticketId}`;
  const data: TypingUser = {
    userId,
    userName,
    timestamp: Date.now(),
  };

  await hsetex(key, { [userId]: JSON.stringify(data) }, TYPING_TTL);
  logger.debug({ ticketId, userId }, "User typing");
}

/**
 * Clear a user's typing status in a ticket
 */
export async function clearUserTyping(ticketId: string, userId: string): Promise<void> {
  const key = `typing:${ticketId}`;

  await valkey.hdel(key, userId);
  logger.debug({ ticketId, userId }, "User stopped typing");
}

/**
 * Get all users currently typing in a ticket
 */
export async function getTypingUsers(ticketId: string): Promise<TypingUser[]> {
  const key = `typing:${ticketId}`;
  const all = await valkey.hgetall(key);

  if (!all || Object.keys(all).length === 0) return [];

  const now = Date.now();
  const typingUsers: TypingUser[] = [];

  for (const [, value] of Object.entries(all)) {
    try {
      const data = JSON.parse(value) as TypingUser;
      // Double-check TTL hasn't expired (belt and suspenders)
      if (now - data.timestamp < TYPING_TTL * 1000) {
        typingUsers.push(data);
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return typingUsers;
}

/**
 * Extend typing TTL (for continuous typing)
 */
export async function extendTypingTTL(ticketId: string, userId: string): Promise<void> {
  const key = `typing:${ticketId}`;

  // Extend TTL on the field
  await hexpire(key, TYPING_TTL, [userId]);
}

// =============================================================================
// Session State Recovery
// =============================================================================

export interface SessionState {
  onlineUsers: string[];
  typingUsers: TypingUser[];
}

/**
 * Get full session state for a user reconnecting to a ticket
 * Used for state recovery after reconnection
 */
export async function getTicketSessionState(
  organizationId: string,
  ticketId: string,
): Promise<SessionState> {
  const [onlineUsers, typingUsers] = await Promise.all([
    getOnlineUsers(organizationId),
    getTypingUsers(ticketId),
  ]);

  return { onlineUsers, typingUsers };
}

/**
 * Get presence state for organization (without ticket context)
 */
export async function getOrganizationSessionState(organizationId: string): Promise<SessionState> {
  const onlineUsers = await getOnlineUsers(organizationId);

  return { onlineUsers, typingUsers: [] };
}
