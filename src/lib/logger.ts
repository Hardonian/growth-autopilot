import { redact } from './redact.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

/**
 * Structured JSONL logger.
 * All output is JSON, one object per line — suitable for logs.jsonl.
 */
export class Logger {
  private entries: LogEntry[] = [];
  private readonly jsonMode: boolean;

  constructor(opts?: { json?: boolean }) {
    this.jsonMode = opts?.json ?? false;
  }

  info(msg: string, data?: Record<string, unknown>): void {
    this.log('info', msg, data);
  }

  warn(msg: string, data?: Record<string, unknown>): void {
    this.log('warn', msg, data);
  }

  error(msg: string, data?: Record<string, unknown>): void {
    this.log('error', msg, data);
  }

  debug(msg: string, data?: Record<string, unknown>): void {
    if (process.env.DEBUG) {
      this.log('debug', msg, data);
    }
  }

  private log(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...redact(data ?? {}),
    };
    this.entries.push(entry);

    if (this.jsonMode) {
      const stream = level === 'error' ? process.stderr : process.stdout;
      stream.write(JSON.stringify(entry) + '\n');
    } else {
      const prefix = level === 'error' || level === 'warn' ? `[${level.toUpperCase()}]` : '';
      const line = prefix.length > 0 ? `${prefix} ${msg}` : msg;
      if (level === 'error') {
        console.error(line);
      } else if (level === 'warn') {
        console.warn(line);
      } else {
        console.log(line);
      }
    }
  }

  /** Return all accumulated log entries (for writing to logs.jsonl). */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /** Serialize all entries as JSONL string. */
  toJSONL(): string {
    return this.entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  }
}
