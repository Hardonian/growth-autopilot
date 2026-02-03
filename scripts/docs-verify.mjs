import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distCli = path.join(root, 'dist', 'cli.js');
const exampleInputs = path.join(root, 'examples', 'jobforge', 'inputs.json');
const expectedOutputDir = path.join(root, 'examples', 'jobforge', 'output');
const tempOutputDir = path.join(root, 'examples', 'jobforge', '.tmp-output');

function run(cmd, args, options = {}) {
  execFileSync(cmd, args, { stdio: 'inherit', ...options });
}

function readText(filePath) {
  return readFileSync(filePath, 'utf-8');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`Docs verify mismatch for ${label}`);
  }
}

run('pnpm', ['run', 'build']);

run('node', [distCli, '--help']);
run('node', [distCli, 'seo-scan', '--help']);
run('node', [distCli, 'funnel', '--help']);
run('node', [distCli, 'propose-experiments', '--help']);
run('node', [distCli, 'draft-content', '--help']);
run('node', [distCli, 'analyze', '--help']);

rmSync(tempOutputDir, { recursive: true, force: true });
mkdirSync(tempOutputDir, { recursive: true });

run(
  'node',
  [
    distCli,
    'analyze',
    '--inputs',
    exampleInputs,
    '--tenant',
    'acme',
    '--project',
    'growth',
    '--trace',
    'trace-123',
    '--out',
    tempOutputDir,
    '--stable-output',
  ],
  {
    env: {
      ...process.env,
      GROWTH_PROFILES_DIR: path.join(root, 'profiles'),
    },
  }
);

const files = ['request-bundle.json', 'report.json', 'report.md'];
for (const file of files) {
  const actual = readText(path.join(tempOutputDir, file));
  const expected = readText(path.join(expectedOutputDir, file));
  assertEqual(actual, expected, file);
}

rmSync(tempOutputDir, { recursive: true, force: true });
