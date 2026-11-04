const isServer = typeof window === "undefined";
const isDev = process.env.NODE_ENV === "development";

type LogLevel = "error" | "warn" | "info" | "debug";
type LogMeta = Record<string, unknown>;

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: LogMeta;
  service: string;
}

function formatLog(level: LogLevel, message: string, meta?: LogMeta): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    meta,
    service: "fleet",
  };
}

function output(level: LogLevel, entry: LogEntry): void {
  if (isServer) {
    const logFn =
      level === "error"
        ? console.error
        : level === "warn"
          ? console.warn
          : console.log;
    logFn(JSON.stringify(entry));
  } else {
    if (isDev) {
      const logFn =
        level === "error"
          ? console.error
          : level === "warn"
            ? console.warn
            : level === "debug"
              ? console.debug
              : console.info;
      logFn(`[${level.toUpperCase()}] ${entry.message}`, entry.meta || "");
    } else if (level === "error" || level === "warn") {
      console[level](entry.message, entry.meta);
    }
  }
}

export const logger = {
  error: (message: string, meta?: LogMeta) => {
    output("error", formatLog("error", message, meta));
  },
  warn: (message: string, meta?: LogMeta) => {
    output("warn", formatLog("warn", message, meta));
  },
  info: (message: string, meta?: LogMeta) => {
    output("info", formatLog("info", message, meta));
  },
  debug: (message: string, meta?: LogMeta) => {
    if (isDev) {
      output("debug", formatLog("debug", message, meta));
    }
  },
};
