import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_SCHEMA_VERSION,
  JobRequestBundleSchema,
  ReportEnvelopeSchema,
  RunnerMaturitySchema,
  stableHash,
} from '../src/contracts/index.js';
import { validateBundle } from '../src/jobforge/analyze.js';

const fixturesDir = path.join(process.cwd(), 'fixtures', 'jobforge');

function readJson(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as unknown;
}

describe('JobForge fixtures', () => {
  it('validates stable request bundle fixture', () => {
    const bundlePath = path.join(fixturesDir, 'request-bundle.json');
    const bundle = readJson(bundlePath);

    const parsed = JobRequestBundleSchema.parse(bundle);
    expect(parsed.schema_version).toBe(DEFAULT_SCHEMA_VERSION);
    const validation = validateBundle(parsed);
    expect(validation.success).toBe(true);

    const { canonical_hash, canonical_hash_algorithm, ...rest } = parsed;
    expect(canonical_hash_algorithm).toBe('sha256');
    expect(canonical_hash).toBe(stableHash(rest));
  });

  it('validates stable report fixture', () => {
    const reportPath = path.join(fixturesDir, 'report.json');
    const report = readJson(reportPath);

    const parsed = ReportEnvelopeSchema.parse(report);
    expect(parsed.schema_version).toBe(DEFAULT_SCHEMA_VERSION);
    const { canonical_hash, canonical_hash_algorithm, ...rest } = parsed;
    expect(canonical_hash_algorithm).toBe('sha256');
    expect(canonical_hash).toBe(stableHash(rest));
  });

  it('validates stable runner maturity fixture', () => {
    const maturityPath = path.join(fixturesDir, 'runner-maturity.json');
    const maturity = readJson(maturityPath);

    const parsed = RunnerMaturitySchema.parse(maturity);
    expect(parsed.schema_version).toBe(DEFAULT_SCHEMA_VERSION);
    const { canonical_hash, canonical_hash_algorithm, ...rest } = parsed;
    expect(canonical_hash_algorithm).toBe('sha256');
    expect(canonical_hash).toBe(stableHash(rest));
  });

  it('rejects invalid bundles', () => {
    const negativeDir = path.join(fixturesDir, 'negative');
    const fixtures = [
      'missing-tenant.json',
      'wrong-schema-version.json',
      'missing-idempotency.json',
      'action-without-policy-token.json',
    ];

    for (const fixture of fixtures) {
      const bundle = readJson(path.join(negativeDir, fixture));
      const validation = validateBundle(bundle);
      expect(validation.success).toBe(false);
    }
  });
});
