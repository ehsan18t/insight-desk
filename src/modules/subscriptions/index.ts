/**
 * Subscriptions Module
 * Export all subscription-related functionality
 */

export { subscriptionsRouter } from "./subscriptions.routes";
export * from "./subscriptions.schema";
export { subscriptionsService } from "./subscriptions.service";

// OpenAPI registration - importing registers routes with the registry
import "./subscriptions.openapi";
