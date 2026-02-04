import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { serializeDeterministic } from '../src/contracts/index.js';
import { analyze, parseAnalyzeInputs, renderReport } from '../src/jobforge/analyze.js';

const root = process.cwd();
const fixturesDir = path.join(root, 'fixtures', 'jobforge');
const inputsPath = path.join(fixturesDir, 'inputs.json');

async function main(): Promise<void> {
  const rawInputs = await readFile(inputsPath, 'utf-8');
  const inputs = parseAnalyzeInputs(rawInputs);

  const result = await analyze(inputs, {
    tenant_id: 'acme',
    project_id: 'growth',
    trace_id: 'trace-123',
    stable_output: true,
  });

  await mkdir(fixturesDir, { recursive: true });

  await writeFile(
    path.join(fixturesDir, 'request-bundle.json'),
    serializeDeterministic(result.jobRequestBundle),
    'utf-8'
  );
  await writeFile(
    path.join(fixturesDir, 'report.json'),
    serializeDeterministic(result.reportEnvelope),
    'utf-8'
  );
  await writeFile(
    path.join(fixturesDir, 'runner-maturity.json'),
    serializeDeterministic(result.runnerMaturityReport),
    'utf-8'
  );
  await writeFile(
    path.join(fixturesDir, 'report.md'),
    renderReport(result.reportEnvelope, 'md'),
    'utf-8'
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
