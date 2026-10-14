/*
  Structured JSON logging with redaction.

  Rules: never log tokens, secrets, email addresses, questionnaire answers or
  report text. Keys matching the deny-list are replaced before output, and
  string values that look like bearer tokens or emails are masked as a second
  line of defence.
*/

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const DENY_KEY = /(token|secret|password|authorization|signature|api[_-]?key|cookie)/i;
const DENY_EXACT = new Set([
  'email',
  'to',
  'answers',
  'content',
  'body',
  'text',
  'html',
  'payload',
  'snippet',
  'idea_name',
  'ideaName',
  'customer_email',
]);
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/g;
const LONG_TOKEN_RE = /\b[A-Za-z0-9_-]{32,}\b/g;

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.replace(EMAIL_RE, '[email]').replace(LONG_TOKEN_RE, (m) => (m.length > 40 ? '[token]' : m));
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) {
    return { name: value.name, message: redactValue(value.message, depth + 1) };
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactValue(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (DENY_KEY.test(k) || DENY_EXACT.has(k)) out[k] = '[redacted]';
      else out[k] = redactValue(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
  child(base: Record<string, unknown>): Logger;
}

export function createLogger(base: Record<string, unknown> = {}, sink: (line: string) => void = console.log): Logger {
  const emit = (level: LogLevel, event: string, fields?: Record<string, unknown>) => {
    const record = { ts: new Date().toISOString(), level, event, ...base, ...(fields ?? {}) };
    sink(JSON.stringify(redactValue(record)));
  };
  return {
    debug: (e, f) => emit('debug', e, f),
    info: (e, f) => emit('info', e, f),
    warn: (e, f) => emit('warn', e, f),
    error: (e, f) => emit('error', e, f),
    child: (more) => createLogger({ ...base, ...more }, sink),
  };
}

export const silentLogger: Logger = createLogger({}, () => {});
