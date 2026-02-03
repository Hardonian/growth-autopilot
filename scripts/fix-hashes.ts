import { readFile, writeFile } from 'node:fs/promises';
import {
  JobRequestBundleSchema,
  ReportEnvelopeSchema,
  stableHash,
  serializeDeterministic,
} from '../src/contracts/index.js';

async function fixHashes() {
  // Fix request-bundle.json
  const bundleRaw = await readFile('./fixtures/jobforge/request-bundle.json', 'utf-8');
  const bundle = JSON.parse(bundleRaw);
  
  const parsedBundle = JobRequestBundleSchema.parse(bundle);
  const { canonical_hash: b1, canonical_hash_algorithm: b2, canonicalization: b3, ...bundleRest } = parsedBundle;
  const newBundleHash = stableHash(bundleRest);
  
  bundle.canonical_hash = newBundleHash;
  await writeFile('./fixtures/jobforge/request-bundle.json', serializeDeterministic(bundle), 'utf-8');
  console.log('Updated bundle hash:', newBundleHash);
  
  // Fix report.json
  const reportRaw = await readFile('./fixtures/jobforge/report.json', 'utf-8');
  const report = JSON.parse(reportRaw);
  
  const parsedReport = ReportEnvelopeSchema.parse(report);
  const { canonical_hash: r1, canonical_hash_algorithm: r2, canonicalization: r3, ...reportRest } = parsedReport;
  const newReportHash = stableHash(reportRest);
  
  report.canonical_hash = newReportHash;
  await writeFile('./fixtures/jobforge/report.json', serializeDeterministic(report), 'utf-8');
  console.log('Updated report hash:', newReportHash);
  
  console.log('Done!');
}

fixHashes();
