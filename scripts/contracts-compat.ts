import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_SCHEMA_VERSION,
  JobRequestBundleSchema,
  ReportEnvelopeSchema,
  stableHash,
  serializeDeterministic,
} from '../src/contracts/index.js';
import { analyze, parseAnalyzeInputs } from '../src/jobforge/analyze.js';

const root = process.cwd();
const fixturesDir = path.join(root, 'fixtures', 'jobforge');
const inputsPath = path.join(fixturesDir, 'inputs.json');
const requestSnapshotPath = path.join(fixturesDir, 'request-bundle.json');
const reportSnapshotPath = path.join(fixturesDir, 'report.json');
const tempDir = path.join(fixturesDir, '.tmp');

async function readJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw) as unknown;
}

function assertEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`contracts:compat mismatch for ${label}`);
  }
}

function validateBundle(bundle: unknown): void {
  const parsed = JobRequestBundleSchema.parse(bundle);
  if (parsed.schema_version !== DEFAULT_SCHEMA_VERSION) {
    throw new Error(`Unexpected schema_version in bundle: ${parsed.schema_version}`);
  }

  const { canonical_hash, canonical_hash_algorithm, canonicalization, ...rest } = parsed;
  if (canonical_hash_algorithm !== 'sha256') {
    throw new Error(`Unexpected canonical_hash_algorithm in bundle: ${canonical_hash_algorithm}`);
  }
  if (canonicalization !== 'sorted_keys') {
    throw new Error(`Unexpected canonicalization in bundle: ${canonicalization}`);
  }
  const expectedHash = stableHash(rest);
  if (canonical_hash !== expectedHash) {
    throw new Error('Bundle canonical_hash does not match canonicalized payload');
  }
}

function validateReport(report: unknown): void {
  const parsed = ReportEnvelopeSchema.parse(report);
  if (parsed.schema_version !== DEFAULT_SCHEMA_VERSION) {
    throw new Error(`Unexpected schema_version in report: ${parsed.schema_version}`);
  }

  const { canonical_hash, canonical_hash_algorithm, canonicalization, ...rest } = parsed;
  if (canonical_hash_algorithm !== 'sha256') {
    throw new Error(`Unexpected canonical_hash_algorithm in report: ${canonical_hash_algorithm}`);
  }
  if (canonicalization !== 'sorted_keys') {
    throw new Error(`Unexpected canonicalization in report: ${canonicalization}`);
  }
  const expectedHash = stableHash(rest);
  if (canonical_hash !== expectedHash) {
    throw new Error('Report canonical_hash does not match canonicalized payload');
  }
}

async function main(): Promise<void> {
  const rawInputs = await readFile(inputsPath, 'utf-8');
  const inputs = parseAnalyzeInputs(rawInputs);

  const result = await analyze(inputs, {
    tenant_id: 'acme',
    project_id: 'growth',
    trace_id: 'trace-123',
    stable_output: true,
  });

  const bundleJson = serializeDeterministic(result.jobRequestBundle);
  const reportJson = serializeDeterministic(result.reportEnvelope);

  await mkdir(tempDir, { recursive: true });
  await writeFile(path.join(tempDir, 'request-bundle.json'), bundleJson, 'utf-8');
  await writeFile(path.join(tempDir, 'report.json'), reportJson, 'utf-8');

  const expectedBundle = await readFile(requestSnapshotPath, 'utf-8');
  const expectedReport = await readFile(reportSnapshotPath, 'utf-8');

  assertEqual(bundleJson, expectedBundle, 'request-bundle.json');
  assertEqual(reportJson, expectedReport, 'report.json');

  validateBundle(await readJson(requestSnapshotPath));
  validateReport(await readJson(reportSnapshotPath));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
