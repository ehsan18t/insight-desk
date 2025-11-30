// API Keys module exports
export { apiKeysRouter } from "./api-keys.routes";
export {
  createApiKey,
  listApiKeys,
  getApiKeyById,
  revokeApiKey,
  deleteApiKey,
  getApiKeyStats,
  validateApiKeyByHash,
  updateApiKeyUsage,
  API_KEY_SCOPES,
  type CreateApiKeyInput,
  type ApiKeyResponse,
  type ApiKeyWithSecret,
} from "./api-keys.service";
export {
  generateApiKey,
  hashApiKey,
  isValidApiKeyFormat,
  isTestKey,
  extractPrefix,
} from "./api-keys.utils";
export {
  createApiKeySchema,
  apiKeyScopeSchema,
  apiKeyIdParamSchema,
  apiKeyResponseSchema,
  apiKeyWithSecretSchema,
  apiKeyStatsSchema,
} from "./api-keys.schema";

// OpenAPI registration - importing registers routes with the registry
import "./api-keys.openapi";
