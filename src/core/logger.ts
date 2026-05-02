import pino from "pino";

export const logger = pino({
  serializers: {
    error(value) {
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
          cause: value.cause,
        };
      }
      return value;
    },
  },
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss",
      ignore: "pid,hostname",
    },
  },
  level: process.env.LOG_LEVEL ?? "info",
});
