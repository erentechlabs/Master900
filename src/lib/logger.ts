/**
 * Minimal structured (JSON lines) logger with secret redaction.
 * Works in the Next.js server runtime, scripts and the background worker.
 */
type Level = "debug" | "info" | "warn" | "error";
type Context = Record<string, unknown>;

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEYS = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|hash/i;

function threshold(): number {
  const level = (process.env.LOG_LEVEL ?? "info") as Level;
  return ORDER[level] ?? ORDER.info;
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack?.split("\n").slice(0, 5).join("\n") };
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

function write(level: Level, msg: string, bindings: Context, ctx?: Context) {
  if (ORDER[level] < threshold()) return;
  const entry = { ts: new Date().toISOString(), level, msg, ...(redact({ ...bindings, ...ctx }) as Context) };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export type Logger = {
  debug: (msg: string, ctx?: Context) => void;
  info: (msg: string, ctx?: Context) => void;
  warn: (msg: string, ctx?: Context) => void;
  error: (msg: string, ctx?: Context) => void;
  child: (bindings: Context) => Logger;
};

function create(bindings: Context): Logger {
  return {
    debug: (msg, ctx) => write("debug", msg, bindings, ctx),
    info: (msg, ctx) => write("info", msg, bindings, ctx),
    warn: (msg, ctx) => write("warn", msg, bindings, ctx),
    error: (msg, ctx) => write("error", msg, bindings, ctx),
    child: (more) => create({ ...bindings, ...more }),
  };
}

export const logger = create({ app: "fundamentals-academy" });
