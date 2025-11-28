import pino from "pino";
import { config, isDev } from "@/config";

// Create logger instance
export const logger = pino({
  level: config.LOG_LEVEL,
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});

// Child loggers for modules
export const createLogger = (module: string) => logger.child({ module });

// Request logger middleware helper
export const httpLogger = createLogger("http");
export const dbLogger = createLogger("db");
export const authLogger = createLogger("auth");
export const socketLogger = createLogger("socket");
export const jobLogger = createLogger("jobs");
