export { usersRouter } from "./users.routes";
export * from "./users.schema";
export * from "./users.service";

// OpenAPI registration - importing registers routes with the registry
import "./users.openapi";
