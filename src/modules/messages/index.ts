export { messagesRouter } from "./messages.routes";
export * from "./messages.schema";
export { messagesService } from "./messages.service";

// OpenAPI registration - importing registers routes with the registry
import "./messages.openapi";
