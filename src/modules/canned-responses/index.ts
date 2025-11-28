/**
 * Canned Responses Module
 * Exports for canned response management
 */

export { cannedResponsesRouter } from "./canned-responses.routes";
export * from "./canned-responses.schema";
export type {
  CannedResponse,
  PaginatedCannedResponses,
} from "./canned-responses.service";
export { cannedResponsesService } from "./canned-responses.service";
