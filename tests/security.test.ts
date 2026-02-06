import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { containsSecret } from '../src/lib/redact.js';

/**
 * Security tests that fail if forbidden patterns appear in source or output.
 * These are the "tests that fail if forbidden patterns appear" from the spec.
 */

const ROOT = path.resolve(process.cwd());
const SRC_DIR = path.join(ROOT, 'src');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');

function collectTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  const entries = readdirSync(dir, { recursive: true }).map(String);
  for (const entry of entries) {
    if (entry.endsWith('.ts') || entry.endsWith('.js') || entry.endsWith('.mjs')) {
      files.push(path.join(dir, entry));
    }
  }
  return files;
}

const SECRET_PATTERNS = [
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9]{20,}['"]/i, label: 'API key literal' },
  { pattern: /(?:secret|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/i, label: 'Secret/password literal' },
  { pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, label: 'Private key' },
  { pattern: /ghp_[A-Za-z0-9]{36}/, label: 'GitHub personal access token' },
  { pattern: /sk-[A-Za-z0-9]{48}/, label: 'OpenAI API key' },
  { pattern: /AKIA[0-9A-Z]{16}/, label: 'AWS access key' },
];

describe('Security: no secrets in source', () => {
  const srcFiles = collectTsFiles(SRC_DIR);
  const scriptFiles = collectTsFiles(SCRIPTS_DIR);
  const allFiles = [...srcFiles, ...scriptFiles];

  it('scans at least one source file', () => {
    expect(allFiles.length).toBeGreaterThan(0);
  });

  for (const filePath of allFiles) {
    const relative = path.relative(ROOT, filePath);

    it(`${relative} contains no hardcoded secrets`, () => {
      const content = readFileSync(filePath, 'utf-8');

      // Skip test files and the redaction module itself (it defines patterns)
      if (relative.includes('redact.ts') || relative.includes('.test.')) return;

      for (const { pattern, label } of SECRET_PATTERNS) {
        expect(pattern.test(content), `Found ${label} in ${relative}`).toBe(false);
      }
    });
  }
});

describe('Security: containsSecret detects known patterns', () => {
  it('catches GitHub PAT', () => {
    expect(containsSecret('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij')).toBe(true);
  });

  it('catches AWS key', () => {
    expect(containsSecret('AKIAIOSFODNN7EXAMPLE')).toBe(true);
  });

  it('does not flag safe strings', () => {
    expect(containsSecret('just-a-normal-string')).toBe(false);
    expect(containsSecret('tenant_id=acme')).toBe(false);
  });
});

describe('Security: redaction module exists and exports', () => {
  it('exports redact function', async () => {
    const mod = await import('../src/lib/redact.js');
    expect(typeof mod.redact).toBe('function');
    expect(typeof mod.containsSecret).toBe('function');
    expect(mod.DENY_KEYS instanceof Set).toBe(true);
    expect(mod.DENY_KEYS.size).toBeGreaterThan(0);
  });
});
