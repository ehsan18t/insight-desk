export { organizationsRouter } from "./organizations.routes";
export * from "./organizations.schema";
export * from "./organizations.service";

// OpenAPI registration - importing registers routes with the registry
import "./organizations.openapi";
