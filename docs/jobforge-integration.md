# JobForge Integration (Growth Autopilot)

This module is runnerless and emits **dry-run** JobForge request bundles plus a report envelope. It never executes jobs.

## Command JobForge Should Run

```bash
growth analyze \
  --inputs ./fixtures/jobforge/inputs.json \
  --tenant <tenant_id> \
  --project <project_id> \
  --trace <trace_id> \
  --out <output_dir>
```

For deterministic fixtures and docs, add `--stable-output`.

## Outputs

The command writes the following files to `<output_dir>`:

- `request-bundle.json` — JobRequestBundle (dry-run job requests)
- `report.json` — ReportEnvelope (findings + recommendations)
- `report.md` — human-readable markdown report

Each JSON output includes:

- `schema_version`
- `module_id` (`growth`)
- `tenant_id` + `project_id`
- `trace_id`
- `canonical_hash` + `canonical_hash_algorithm`

Each job request includes an `idempotency_key` at the bundle level.

## Ingestion / Validation

JobForge can validate bundles using the exported schemas:

- `JobRequestBundleSchema`
- `ReportEnvelopeSchema`

Validation expectations:

- All requests share the same `tenant_id` + `project_id` as the bundle
- `job_type` must be known or marked `job_type_status: "unavailable"`
- Action job types require `requires_policy_token: true`

## Safety Boundaries

- Runnerless: emits requests only, never runs jobs.
- No secrets/PII in outputs.
- Action requests (`experiment_run`, `publish_content`) are always marked as requiring policy tokens.

## Migration Note

This repo ships a compatibility shim under `src/contracts/compat.ts` and `src/jobforge/client.ts` to avoid external dependencies.
When `@autopilot/contracts` and `@autopilot/jobforge-client` are available, replace the shim imports with the official packages.
