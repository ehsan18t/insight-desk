// Auth module exports
export { auth } from "./auth.config";
export {
  authenticate,
  optionalAuth,
  requireAdmin,
  requireAgent,
  requireAuth,
  requireOwner,
  requireRole,
} from "./auth.middleware";
export { authRouter } from "./auth.routes";

// OpenAPI registration - importing registers routes with the registry
import "./auth.openapi";
