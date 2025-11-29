/**
 * Input Sanitization Middleware
 * Escapes HTML/XSS in user-provided text fields
 */

import type { NextFunction, Request, Response } from "express";

/**
 * Escape HTML special characters to prevent XSS
 * Converts dangerous characters to their HTML entity equivalents
 */
export function escapeHtml(str: string): string {
  if (typeof str !== "string") return str;

  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/**
 * Recursively sanitize string values in an object
 * Preserves object structure while escaping HTML in string values
 */
export function sanitizeObject<T>(obj: T, fieldsToSanitize?: string[]): T {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    return escapeHtml(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, fieldsToSanitize)) as T;
  }

  if (typeof obj === "object") {
    const result = { ...obj } as Record<string, unknown>;
    for (const key of Object.keys(result)) {
      // If fieldsToSanitize is specified, only sanitize those fields
      // Otherwise, sanitize all string fields
      if (!fieldsToSanitize || fieldsToSanitize.includes(key)) {
        result[key] = sanitizeObject(result[key], fieldsToSanitize);
      }
    }
    return result as T;
  }

  return obj;
}

/**
 * List of fields that commonly contain user-generated content
 * These fields are always sanitized when found in request body
 */
const DEFAULT_SANITIZE_FIELDS = [
  "title",
  "description",
  "content",
  "message",
  "comment",
  "name",
  "subject",
  "body",
  "text",
  "feedback",
  "reason",
];

/**
 * Middleware to sanitize request body
 * Escapes HTML in common user input fields to prevent XSS
 *
 * @param options - Configuration options
 * @param options.fields - Specific fields to sanitize (default: common user input fields)
 * @param options.sanitizeAll - If true, sanitize all string fields (default: false)
 */
export function sanitizeInput(options?: { fields?: string[]; sanitizeAll?: boolean }) {
  const fieldsToSanitize = options?.sanitizeAll
    ? undefined
    : (options?.fields ?? DEFAULT_SANITIZE_FIELDS);

  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === "object") {
      req.body = sanitizeObject(req.body, fieldsToSanitize);
    }
    next();
  };
}

/**
 * Strip HTML tags from a string (more aggressive than escaping)
 * Use when HTML is not allowed at all
 */
export function stripHtml(str: string): string {
  if (typeof str !== "string") return str;
  return str.replace(/<[^>]*>/g, "");
}

/**
 * Sanitize a string for use in URLs/slugs
 * Removes special characters and converts to lowercase
 */
export function sanitizeSlug(str: string): string {
  if (typeof str !== "string") return str;
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
