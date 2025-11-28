/**
 * Audit Module
 * Export all audit-related functionality
 */

// Register OpenAPI definitions
import "./audit.openapi";

export { auditRouter } from "./audit.routes";
export * from "./audit.schema";
export { type AuditLogContext, auditService } from "./audit.service";
