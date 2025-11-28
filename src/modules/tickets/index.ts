export { ticketsRouter } from "./tickets.routes";
export * from "./tickets.schema";
export { ticketsService } from "./tickets.service";

// OpenAPI registration - importing registers routes with the registry
import "./tickets.openapi";
