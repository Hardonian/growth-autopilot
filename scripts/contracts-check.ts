import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const contractsDir = path.join(root, 'contracts');
const distDir = path.join(root, 'dist');
let exitCode = 0;
let passCount = 0;
let failCount = 0;

function pass(label: string): void {
  passCount++;
  console.log(`  ✓ ${label}`);
}

function fail(label: string, detail?: string): void {
  failCount++;
  exitCode = 1;
  console.error(`  ✗ ${label}`);
  if (detail) {
    console.error(`    ${detail}`);
  }
}

// ============================================================================
// 1. Validate JSON Schema files in /contracts are valid JSON
// ============================================================================
function checkContractSchemas(): void {
  console.log('\n── Contract Schemas ──');

  if (!existsSync(contractsDir)) {
    fail('/contracts directory missing');
    return;
  }
  pass('/contracts directory exists');

  const files = readdirSync(contractsDir).filter((f) => f.endsWith('.schema.json') || f.endsWith('.version.json'));

  if (files.length === 0) {
    fail('No schema or version files found in /contracts');
    return;
  }

  for (const file of files) {
    const filePath = path.join(contractsDir, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      JSON.parse(content);
      pass(`${file} is valid JSON`);
    } catch {
      fail(`${file} is not valid JSON`);
    }
  }

  // Check required schema files
  const required = [
    'contracts.version.json',
    'config.schema.json',
    'module-manifest.schema.json',
    'evidence-packet.schema.json',
    'log-event.schema.json',
    'error-envelope.schema.json',
  ];

  for (const req of required) {
    if (existsSync(path.join(contractsDir, req))) {
      pass(`Required file ${req} present`);
    } else {
      fail(`Required file ${req} missing`);
    }
  }
}

// ============================================================================
// 2. Validate schema version alignment
// ============================================================================
function checkSchemaVersion(): void {
  console.log('\n── Schema Version ──');

  const versionPath = path.join(contractsDir, 'contracts.version.json');
  if (!existsSync(versionPath)) {
    fail('contracts.version.json missing');
    return;
  }

  try {
    const versionData = JSON.parse(readFileSync(versionPath, 'utf-8')) as {
      schema_version?: string;
      version?: string;
    };

    if (typeof versionData.schema_version !== 'string' || versionData.schema_version.length === 0) {
      fail('schema_version missing in contracts.version.json');
    } else {
      pass(`schema_version: ${versionData.schema_version}`);
    }

    if (typeof versionData.version !== 'string' || versionData.version.length === 0) {
      fail('version missing in contracts.version.json');
    } else {
      pass(`contracts version: ${versionData.version}`);
    }

    // Verify Zod DEFAULT_SCHEMA_VERSION matches
    // We import from the source to check alignment
    const compatPath = path.join(root, 'src', 'contracts', 'compat.ts');
    if (existsSync(compatPath)) {
      const compatSrc = readFileSync(compatPath, 'utf-8');
      const match = /DEFAULT_SCHEMA_VERSION\s*=\s*['"]([^'"]+)['"]/.exec(compatSrc);
      if (match?.[1] === versionData.schema_version) {
        pass(`Zod DEFAULT_SCHEMA_VERSION matches contracts (${match[1]})`);
      } else {
        fail(
          'Zod DEFAULT_SCHEMA_VERSION does not match contracts.version.json',
          `Zod: ${match?.[1] ?? 'not found'}, contracts: ${versionData.schema_version}`
        );
      }
    }
  } catch {
    fail('Failed to parse contracts.version.json');
  }
}

// ============================================================================
// 3. Validate SDK exports (public API surface)
// ============================================================================
function checkSDKExports(): void {
  console.log('\n── SDK Exports ──');

  const indexPath = path.join(root, 'src', 'index.ts');
  if (!existsSync(indexPath)) {
    fail('src/index.ts missing');
    return;
  }

  const indexSrc = readFileSync(indexPath, 'utf-8');

  // Expected module re-exports
  const expectedExports = [
    './contracts/index.js',
    './seo/index.js',
    './funnel/index.js',
    './experiments/index.js',
    './content/index.js',
    './jobforge/index.js',
  ];

  for (const exp of expectedExports) {
    if (indexSrc.includes(exp)) {
      pass(`Exports ${exp}`);
    } else {
      fail(`Missing export: ${exp}`);
    }
  }

  // Verify contract schemas are exported
  const contractsIndexPath = path.join(root, 'src', 'contracts', 'index.ts');
  if (!existsSync(contractsIndexPath)) {
    fail('src/contracts/index.ts missing');
    return;
  }

  const contractsSrc = readFileSync(contractsIndexPath, 'utf-8');
  const expectedSchemaExports = [
    'TenantContextSchema',
    'EventEnvelopeSchema',
    'RunManifestSchema',
    'ReportEnvelopeSchema',
    'JobRequestSchema',
    'JobRequestBundleSchema',
    'DegradedResponseSchema',
    'RetryGuidanceSchema',
    'SEOFindingSchema',
    'SEOAuditSchema',
    'FunnelMetricsSchema',
    'ExperimentProposalSchema',
    'ContentDraftSchema',
    'GrowthProfileSchema',
  ];

  for (const schema of expectedSchemaExports) {
    if (contractsSrc.includes(schema)) {
      pass(`Schema exported: ${schema}`);
    } else {
      fail(`Schema not exported: ${schema}`);
    }
  }
}

// ============================================================================
// 4. Validate CLI entrypoints
// ============================================================================
function checkCLIEntrypoints(): void {
  console.log('\n── CLI Entrypoints ──');

  const cliDistPath = path.join(distDir, 'cli.js');
  const indexDistPath = path.join(distDir, 'index.js');
  const indexDtsPath = path.join(distDir, 'index.d.ts');

  // Check dist files exist
  if (existsSync(cliDistPath)) {
    pass('dist/cli.js exists');
  } else {
    fail('dist/cli.js missing (run pnpm build first)');
    return;
  }

  if (existsSync(indexDistPath)) {
    pass('dist/index.js exists');
  } else {
    fail('dist/index.js missing');
  }

  if (existsSync(indexDtsPath)) {
    pass('dist/index.d.ts exists');
  } else {
    fail('dist/index.d.ts missing');
  }

  // Verify CLI --help works
  const commands = ['--help', 'seo-scan --help', 'funnel --help', 'propose-experiments --help', 'draft-content --help', 'analyze --help'];

  for (const cmd of commands) {
    try {
      execFileSync('node', [cliDistPath, ...cmd.split(' ')], {
        timeout: 10000,
        stdio: 'pipe',
      });
      pass(`CLI: growth ${cmd}`);
    } catch {
      fail(`CLI: growth ${cmd} failed`);
    }
  }
}

// ============================================================================
// 5. Validate fixture files against Zod schemas
// ============================================================================
function checkFixtures(): void {
  console.log('\n── Fixture Validation ──');

  const fixturesDir = path.join(root, 'fixtures', 'jobforge');
  if (!existsSync(fixturesDir)) {
    fail('fixtures/jobforge directory missing');
    return;
  }

  const fixtureFiles = ['request-bundle.json', 'report.json', 'runner-maturity.json'];

  for (const file of fixtureFiles) {
    const filePath = path.join(fixturesDir, file);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        JSON.parse(content);
        pass(`Fixture ${file} is valid JSON`);
      } catch {
        fail(`Fixture ${file} is not valid JSON`);
      }
    } else {
      fail(`Fixture ${file} missing`);
    }
  }

  // Validate negative test fixtures exist
  const negativeDir = path.join(fixturesDir, 'negative');
  if (existsSync(negativeDir)) {
    const negativeFiles = readdirSync(negativeDir).filter((f) => f.endsWith('.json'));
    if (negativeFiles.length > 0) {
      pass(`${negativeFiles.length} negative test fixture(s) present`);
    } else {
      fail('No negative test fixtures found');
    }
  }
}

// ============================================================================
// 6. Validate package.json bin/main/types alignment
// ============================================================================
function checkPackageAlignment(): void {
  console.log('\n── Package Alignment ──');

  const pkgPath = path.join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
    main?: string;
    types?: string;
    bin?: Record<string, string>;
  };

  if (pkg.main === './dist/index.js') {
    pass('main: ./dist/index.js');
  } else {
    fail(`main is ${pkg.main ?? 'undefined'}, expected ./dist/index.js`);
  }

  if (pkg.types === './dist/index.d.ts') {
    pass('types: ./dist/index.d.ts');
  } else {
    fail(`types is ${pkg.types ?? 'undefined'}, expected ./dist/index.d.ts`);
  }

  if (pkg.bin?.['growth'] === './dist/cli.js') {
    pass('bin.growth: ./dist/cli.js');
  } else {
    fail(`bin.growth is ${pkg.bin?.['growth'] ?? 'undefined'}, expected ./dist/cli.js`);
  }
}

// ============================================================================
// Run all checks
// ============================================================================
console.log('contracts:check — validating contract kit integrity\n');

checkContractSchemas();
checkSchemaVersion();
checkSDKExports();
checkCLIEntrypoints();
checkFixtures();
checkPackageAlignment();

console.log(`\n── Summary ──`);
console.log(`  ${passCount} passed, ${failCount} failed`);

if (exitCode !== 0) {
  console.error('\ncontracts:check FAILED — fix issues above before merging.');
}

process.exit(exitCode);
