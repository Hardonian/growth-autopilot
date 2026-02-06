import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'node:crypto';
import type { LogEntry } from './logger.js';

export interface ArtifactSummary {
  runId: string;
  startedAt: string;
  completedAt: string;
  status: 'success' | 'failure' | 'partial';
  command: string;
  flags: Record<string, unknown>;
  outputs: string[];
  errors: Array<{ code: string; message: string }>;
}

/**
 * Manages the standard artifact layout:
 *   ./artifacts/<runId>/logs.jsonl
 *   ./artifacts/<runId>/evidence/*.json
 *   ./artifacts/<runId>/summary.json
 */
export class ArtifactWriter {
  private readonly dir: string;
  private readonly evidenceDir: string;
  private readonly outputs: string[] = [];
  private readonly errors: Array<{ code: string; message: string }> = [];

  constructor(
    private readonly runId: string,
    private readonly baseDir: string = './artifacts'
  ) {
    this.dir = path.join(this.baseDir, this.runId);
    this.evidenceDir = path.join(this.dir, 'evidence');
  }

  /** Initialize directories. */
  async init(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.mkdir(this.evidenceDir, { recursive: true });
  }

  /** Write logs.jsonl from accumulated log entries. */
  async writeLogs(entries: LogEntry[]): Promise<string> {
    const logsPath = path.join(this.dir, 'logs.jsonl');
    const content = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
    await fs.writeFile(logsPath, content);
    this.outputs.push(logsPath);
    return logsPath;
  }

  /** Write an evidence JSON file. Returns the file path. */
  async writeEvidence(name: string, data: unknown): Promise<string> {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(this.evidenceDir, `${safeName}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    this.outputs.push(filePath);
    return filePath;
  }

  /** Write summary.json. */
  async writeSummary(
    command: string,
    flags: Record<string, unknown>,
    startedAt: string,
    status: ArtifactSummary['status']
  ): Promise<string> {
    const summary: ArtifactSummary = {
      runId: this.runId,
      startedAt,
      completedAt: new Date().toISOString(),
      status,
      command,
      flags,
      outputs: this.outputs,
      errors: this.errors,
    };
    const summaryPath = path.join(this.dir, 'summary.json');
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    return summaryPath;
  }

  /** Record an error for inclusion in summary. */
  addError(code: string, message: string): void {
    this.errors.push({ code, message });
  }

  /** Get the artifact directory path. */
  getDir(): string {
    return this.dir;
  }
}

/**
 * Generate a deterministic run ID from inputs.
 * Ensures idempotent re-runs produce the same artifact directory.
 */
export function generateRunId(seed?: string): string {
  if (seed) {
    return createHash('sha256').update(seed).digest('hex').slice(0, 12);
  }
  const now = new Date();
  const datePart = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const rand = createHash('sha256')
    .update(`${Date.now()}-${Math.random()}`)
    .digest('hex')
    .slice(0, 6);
  return `${datePart}-${rand}`;
}
