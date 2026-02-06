import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let exitCode = 0;
let passCount = 0;
let failCount = 0;
let warnCount = 0;

function pass(label: string): void {
  passCount++;
  console.log(`  ✓ ${label}`);
}

function warn(label: string, remedy?: string): void {
  warnCount++;
  console.log(`  ⚠ ${label}`);
  if (remedy) {
    console.log(`    → ${remedy}`);
  }
}

function fail(label: string, remedy?: string): void {
  failCount++;
  exitCode = 1;
  console.error(`  ✗ ${label}`);
  if (remedy) {
    console.error(`    → ${remedy}`);
  }
}

function getCommandOutput(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, { stdio: 'pipe', timeout: 10000 }).toString().trim();
  } catch {
    return null;
  }
}

function parseVersion(version: string): number[] {
  return version.replace(/^v/, '').split('.').map(Number);
}

function versionGte(actual: string, required: string): boolean {
  const a = parseVersion(actual);
  const r = parseVersion(required);
  for (let i = 0; i < r.length; i++) {
    if ((a[i] ?? 0) > (r[i] ?? 0)) return true;
    if ((a[i] ?? 0) < (r[i] ?? 0)) return false;
  }
  return true;
}

// ============================================================================
// 1. Node.js version
// ============================================================================
function checkNodeVersion(): void {
  console.log('\n── Node.js ──');

  const nodeVersion = getCommandOutput('node', ['--version']);
  if (nodeVersion === null) {
    fail('Node.js not found', 'Install Node.js >= 20.0.0');
    return;
  }

  if (versionGte(nodeVersion, '20.0.0')) {
    pass(`Node.js ${nodeVersion} (>= 20.0.0)`);
  } else {
    fail(`Node.js ${nodeVersion} is below minimum 20.0.0`, 'Upgrade Node.js to >= 20.0.0');
  }
}

// ============================================================================
// 2. pnpm version
// ============================================================================
function checkPnpmVersion(): void {
  console.log('\n── pnpm ──');

  const pnpmVersion = getCommandOutput('pnpm', ['--version']);
  if (pnpmVersion === null) {
    fail('pnpm not found', 'Install pnpm: npm install -g pnpm@9');
    return;
  }

  if (versionGte(pnpmVersion, '9.0.0')) {
    pass(`pnpm ${pnpmVersion} (>= 9.0.0)`);
  } else {
    fail(`pnpm ${pnpmVersion} is below minimum 9.0.0`, 'Upgrade: npm install -g pnpm@9');
  }
}

// ============================================================================
// 3. Dependencies installed
// ============================================================================
function checkDependencies(): void {
  console.log('\n── Dependencies ──');

  const nodeModules = path.join(root, 'node_modules');
  if (!existsSync(nodeModules)) {
    fail('node_modules not found', 'Run: pnpm install');
    return;
  }
  pass('node_modules present');

  const lockfile = path.join(root, 'pnpm-lock.yaml');
  if (existsSync(lockfile)) {
    pass('pnpm-lock.yaml present');
  } else {
    fail('pnpm-lock.yaml missing', 'Run: pnpm install');
  }

  // Check critical dependencies
  const criticalDeps = ['zod', 'commander', 'cheerio', 'typescript', 'vitest', 'tsup', 'tsx'];
  for (const dep of criticalDeps) {
    if (existsSync(path.join(nodeModules, dep))) {
      pass(`${dep} installed`);
    } else {
      fail(`${dep} missing`, 'Run: pnpm install');
    }
  }
}

// ============================================================================
// 4. Build output
// ============================================================================
function checkBuild(): void {
  console.log('\n── Build ──');

  const distDir = path.join(root, 'dist');
  if (!existsSync(distDir)) {
    warn('dist/ not found — build not run yet', 'Run: pnpm run build');
    return;
  }

  const requiredFiles = ['index.js', 'index.d.ts', 'cli.js', 'cli.d.ts'];
  for (const file of requiredFiles) {
    if (existsSync(path.join(distDir, file))) {
      pass(`dist/${file} present`);
    } else {
      fail(`dist/${file} missing`, 'Run: pnpm run build');
    }
  }
}

// ============================================================================
// 5. Contract Kit
// ============================================================================
function checkContractKit(): void {
  console.log('\n── Contract Kit ──');

  const contractsDir = path.join(root, 'contracts');
  if (!existsSync(contractsDir)) {
    fail('/contracts directory missing', 'Contract Kit must be initialized');
    return;
  }
  pass('/contracts directory present');

  const versionFile = path.join(contractsDir, 'contracts.version.json');
  if (existsSync(versionFile)) {
    try {
      const data = JSON.parse(readFileSync(versionFile, 'utf-8')) as { schema_version?: string };
      pass(`Contract version: ${data.schema_version ?? 'unknown'}`);
    } catch {
      fail('contracts.version.json is invalid JSON');
    }
  } else {
    fail('contracts.version.json missing');
  }

  const schemaFiles = readdirSync(contractsDir).filter((f) => f.endsWith('.schema.json'));
  if (schemaFiles.length >= 5) {
    pass(`${schemaFiles.length} contract schema files found`);
  } else {
    fail(`Only ${schemaFiles.length} schema files found (need >= 5)`);
  }
}

// ============================================================================
// 6. Secret leakage scan
// ============================================================================
function checkSecretLeakage(): void {
  console.log('\n── Secret Leakage Scan ──');

  const sensitivePatterns = [
    { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9]{20,}['"]/i, label: 'API key literal' },
    { pattern: /(?:secret|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/i, label: 'Secret/password literal' },
    { pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, label: 'Private key' },
    { pattern: /ghp_[A-Za-z0-9]{36}/, label: 'GitHub personal access token' },
    { pattern: /sk-[A-Za-z0-9]{48}/, label: 'OpenAI API key' },
    { pattern: /AKIA[0-9A-Z]{16}/, label: 'AWS access key' },
  ];

  const srcDir = path.join(root, 'src');
  const scriptsDir = path.join(root, 'scripts');

  const dirsToScan = [srcDir, scriptsDir].filter(existsSync);
  let scannedFiles = 0;
  let leaksFound = 0;

  for (const dir of dirsToScan) {
    const files = readdirSync(dir, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.mjs'));

    for (const file of files) {
      const filePath = path.join(dir, file);
      const content = readFileSync(filePath, 'utf-8');
      scannedFiles++;

      for (const { pattern, label } of sensitivePatterns) {
        if (pattern.test(content)) {
          fail(`Potential ${label} in ${path.relative(root, filePath)}`);
          leaksFound++;
        }
      }
    }
  }

  if (leaksFound === 0) {
    pass(`Scanned ${scannedFiles} source files — no secret patterns detected`);
  }

  // Check for .env files committed
  const envFiles = ['.env', '.env.local', '.env.production'];
  for (const envFile of envFiles) {
    if (existsSync(path.join(root, envFile))) {
      warn(`${envFile} exists in project root`, 'Ensure it is in .gitignore');
    }
  }
}

// ============================================================================
// 7. Profiles check
// ============================================================================
function checkProfiles(): void {
  console.log('\n── Profiles ──');

  const profilesDir = path.join(root, 'profiles');
  if (!existsSync(profilesDir)) {
    warn('profiles/ directory missing', 'Create profiles/ with YAML profile files');
    return;
  }

  const profiles = readdirSync(profilesDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  if (profiles.length > 0) {
    pass(`${profiles.length} profile(s) found: ${profiles.join(', ')}`);
  } else {
    warn('No YAML profiles found in profiles/', 'Add at least a base.yaml profile');
  }

  // Check base profile exists
  if (profiles.some((p) => p.startsWith('base'))) {
    pass('base profile present');
  } else {
    warn('No base profile found', 'Create profiles/base.yaml');
  }
}

// ============================================================================
// Run all checks
// ============================================================================
console.log('doctor — checking environment and prerequisites\n');

checkNodeVersion();
checkPnpmVersion();
checkDependencies();
checkBuild();
checkContractKit();
checkSecretLeakage();
checkProfiles();

console.log(`\n── Summary ──`);
console.log(`  ${passCount} passed, ${warnCount} warnings, ${failCount} failed`);

if (exitCode !== 0) {
  console.error('\ndoctor found issues — see remediation steps above.');
} else if (warnCount > 0) {
  console.log('\ndoctor passed with warnings.');
} else {
  console.log('\ndoctor passed — environment is healthy.');
}

process.exit(exitCode);
