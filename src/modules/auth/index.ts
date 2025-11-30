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

// API Key management
export { apiKeyRouter } from "./api-key.routes";
export {
  createApiKey,
  listApiKeys,
  getApiKeyById,
  revokeApiKey,
  deleteApiKey,
  getApiKeyStats,
  API_KEY_SCOPES,
} from "./api-key.service";
export { generateApiKey, hashApiKey, isValidApiKeyFormat } from "./api-key.utils";

// OpenAPI registration - importing registers routes with the registry
import "./auth.openapi";
import "./api-key.openapi";
