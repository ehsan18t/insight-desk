/**
 * Plans Module
 * Export all plan-related functionality
 */

export { plansRouter } from "./plans.routes";
export * from "./plans.schema";
export { DEFAULT_FREE_FEATURES, DEFAULT_FREE_LIMITS, plansService } from "./plans.service";

// OpenAPI registration - importing registers routes with the registry
import "./plans.openapi";
