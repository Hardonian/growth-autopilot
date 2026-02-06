import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ArtifactWriter, generateRunId } from '../src/lib/artifacts.js';
import type { LogEntry } from '../src/lib/logger.js';

describe('ArtifactWriter', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'artifacts-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('creates standard directory structure', async () => {
    const writer = new ArtifactWriter('test-run-1', tmpDir);
    await writer.init();

    const stat = await fs.stat(path.join(tmpDir, 'test-run-1'));
    expect(stat.isDirectory()).toBe(true);

    const evidenceStat = await fs.stat(path.join(tmpDir, 'test-run-1', 'evidence'));
    expect(evidenceStat.isDirectory()).toBe(true);
  });

  it('writes logs.jsonl', async () => {
    const writer = new ArtifactWriter('test-run-2', tmpDir);
    await writer.init();

    const entries: LogEntry[] = [
      { ts: '2024-01-01T00:00:00Z', level: 'info', msg: 'started' },
      { ts: '2024-01-01T00:00:01Z', level: 'info', msg: 'done' },
    ];

    const logsPath = await writer.writeLogs(entries);
    expect(logsPath).toContain('logs.jsonl');

    const content = await fs.readFile(logsPath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(2);

    const parsed = JSON.parse(lines[0]) as LogEntry;
    expect(parsed.msg).toBe('started');
  });

  it('writes evidence/*.json', async () => {
    const writer = new ArtifactWriter('test-run-3', tmpDir);
    await writer.init();

    const evidencePath = await writer.writeEvidence('my-report', { key: 'value' });
    expect(evidencePath).toContain('evidence');
    expect(evidencePath).toContain('my-report.json');

    const content = await fs.readFile(evidencePath, 'utf-8');
    expect(JSON.parse(content)).toEqual({ key: 'value' });
  });

  it('writes summary.json', async () => {
    const writer = new ArtifactWriter('test-run-4', tmpDir);
    await writer.init();

    await writer.writeEvidence('data', { x: 1 });
    const summaryPath = await writer.writeSummary(
      'plan',
      { smoke: true },
      '2024-01-01T00:00:00Z',
      'success'
    );

    const content = await fs.readFile(summaryPath, 'utf-8');
    const summary = JSON.parse(content) as Record<string, unknown>;

    expect(summary['runId']).toBe('test-run-4');
    expect(summary['command']).toBe('plan');
    expect(summary['status']).toBe('success');
    expect(Array.isArray(summary['outputs'])).toBe(true);
    expect((summary['outputs'] as string[]).length).toBe(1);
  });

  it('sanitizes evidence file names', async () => {
    const writer = new ArtifactWriter('test-run-5', tmpDir);
    await writer.init();

    const evidencePath = await writer.writeEvidence('my/bad..name', { ok: true });
    expect(evidencePath).toContain('my_bad__name.json');
  });
});

describe('generateRunId', () => {
  it('generates deterministic ID from seed', () => {
    const id1 = generateRunId('same-seed');
    const id2 = generateRunId('same-seed');
    expect(id1).toBe(id2);
  });

  it('generates different IDs for different seeds', () => {
    const id1 = generateRunId('seed-a');
    const id2 = generateRunId('seed-b');
    expect(id1).not.toBe(id2);
  });

  it('generates random ID without seed', () => {
    const id = generateRunId();
    expect(id.length).toBeGreaterThan(0);
  });
});
