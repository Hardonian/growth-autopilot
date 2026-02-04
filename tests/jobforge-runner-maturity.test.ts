import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  RunnerMaturitySchema,
  DEFAULT_SCHEMA_VERSION,
} from '../src/contracts/index.js';
import { analyze, parseAnalyzeInputs } from '../src/jobforge/analyze.js';

const fixturesDir = path.join(process.cwd(), 'fixtures', 'jobforge');

function readInputs(): string {
  return fs.readFileSync(path.join(fixturesDir, 'inputs.json'), 'utf-8');
}

describe('Runner maturity report', () => {
  it('exports runner maturity in standard format', async () => {
    const inputs = parseAnalyzeInputs(readInputs());
    const result = await analyze(inputs, {
      tenant_id: 'acme',
      project_id: 'growth',
      trace_id: 'trace-123',
      stable_output: true,
    });

    const parsed = RunnerMaturitySchema.parse(result.runnerMaturityReport);
    expect(parsed.schema_version).toBe(DEFAULT_SCHEMA_VERSION);
    expect(parsed.runners).toHaveLength(5);

    for (const runner of parsed.runners) {
      expect(runner.idempotency.strategy).toBe('payload_hash');
      expect(runner.idempotency.key_source.length).toBeGreaterThan(0);
      expect(runner.retry_guidance.retryable).toBe(true);
      expect(runner.retry_guidance.max_retries).toBeGreaterThan(0);
      expect(runner.metrics.success.length).toBeGreaterThan(0);
      expect(runner.metrics.failure.length).toBeGreaterThan(0);
      expect(runner.finops.max_cost_usd).toBeGreaterThan(0);
    }
  });

  it('keeps idempotency keys stable for identical inputs', async () => {
    const inputs = parseAnalyzeInputs(readInputs());
    const first = await analyze(inputs, {
      tenant_id: 'acme',
      project_id: 'growth',
      trace_id: 'trace-123',
    });
    const second = await analyze(inputs, {
      tenant_id: 'acme',
      project_id: 'growth',
      trace_id: 'trace-456',
    });

    const firstKeys = first.jobRequestBundle.requests.map((req) => req.idempotency_key);
    const secondKeys = second.jobRequestBundle.requests.map((req) => req.idempotency_key);

    expect(firstKeys).toEqual(secondKeys);
  });
});
