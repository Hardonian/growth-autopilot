import { readFile } from 'node:fs/promises';
import {
  JobRequestBundleSchema,
  stableHash,
  DEFAULT_SCHEMA_VERSION,
} from '../src/contracts/index.js';

async function debug() {
  const raw = await readFile('./fixtures/jobforge/request-bundle.json', 'utf-8');
  const bundle = JSON.parse(raw);

  console.log('Parsing bundle...');
  const parsed = JobRequestBundleSchema.safeParse(bundle);

  if (!parsed.success) {
    console.error('Parse error:', parsed.error);
    return;
  }

  console.log('Schema version:', parsed.data.schema_version);
  console.log('Stored hash:', parsed.data.canonical_hash);

  const { canonical_hash, canonical_hash_algorithm, canonicalization, ...rest } = parsed.data;
  const computedHash = stableHash(rest);
  console.log('Computed hash:', computedHash);
  console.log('Match:', canonical_hash === computedHash);
  console.log('Algorithm:', canonical_hash_algorithm);
  console.log('Canonicalization:', canonicalization);
}

debug();
