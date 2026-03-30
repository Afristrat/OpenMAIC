const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

type LogContext = Record<string, unknown>;

function getMinLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  return env in LOG_LEVELS ? (env as LogLevel) : 'info';
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function isJsonFormat(): boolean {
  // In production, always output JSON for Loki ingestion
  if (isProduction()) return true;
  return process.env.LOG_FORMAT === 'json';
}

function extractContext(args: unknown[]): { messages: unknown[]; context: LogContext } {
  const last = args[args.length - 1];
  if (
    last !== null &&
    last !== undefined &&
    typeof last === 'object' &&
    !Array.isArray(last) &&
    !(last instanceof Error)
  ) {
    return { messages: args.slice(0, -1), context: last as LogContext };
  }
  return { messages: args, context: {} };
}

function formatLine(level: LogLevel, tag: string, args: unknown[]): string {
  const timestamp = new Date().toISOString();
  const upperLevel = level.toUpperCase();
  const { messages, context } = extractContext(args);

  const msg = messages
    .map((a) =>
      a instanceof Error ? (a.stack ?? a.message) : typeof a === 'string' ? a : JSON.stringify(a),
    )
    .join(' ');

  if (isJsonFormat()) {
    return JSON.stringify({ timestamp, level: upperLevel, module: tag, message: msg, ...context });
  }
  return `[${timestamp}] [${upperLevel}] [${tag}] ${msg}`;
}

export function createLogger(tag: string) {
  const emit = (level: LogLevel, args: unknown[]) => {
    if (LOG_LEVELS[level] < LOG_LEVELS[getMinLevel()]) return;

    const line = formatLine(level, tag, args);

    // Console output
    const fn =
      level === 'debug'
        ? console.debug
        : level === 'warn'
          ? console.warn
          : level === 'error'
            ? console.error
            : console.log;
    fn(line);
  };

  return {
    debug: (...args: unknown[]) => emit('debug', args),
    info: (...args: unknown[]) => emit('info', args),
    warn: (...args: unknown[]) => emit('warn', args),
    error: (...args: unknown[]) => emit('error', args),
  };
}
