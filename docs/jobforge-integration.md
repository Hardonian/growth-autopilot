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
- `runner-maturity.json` — RunnerMaturityReport (execution guarantees + metrics + FinOps caps)

Each JSON output includes:

- `schema_version`
- `module_id` (`growth`)
- `tenant_id` + `project_id`
- `trace_id`
- `canonical_hash` + `canonical_hash_algorithm`

Each job request includes an `idempotency_key` at the bundle level.

## Runner Maturity (Execution Guarantees, Metrics, FinOps)

The runner maturity report is a standard format that JobForge can ingest for governance.

### Execution Guarantees

- **Idempotency:** Each request bundle entry includes an `idempotency_key` derived from tenant, project, job_type, and payload. JobForge should treat identical keys as safe replays.
- **Retry semantics:** The `runner-maturity.json` report includes per-runner `retry_guidance` (exponential backoff, bounded retries). Retrying is safe when JobForge honors idempotency keys.

### Per-runner Documentation (Purpose / Inputs / Outputs / Failure Modes)

| Runner (job_type) | Purpose | Inputs | Outputs | Failure Modes |
| --- | --- | --- | --- | --- |
| `autopilot.growth.seo_scan` | Scan site export and emit SEO scan request. | `source_path`, `source_type`, tenant/project context. | Job request + report findings. | Invalid source path, schema validation failure, job type unavailable. |
| `autopilot.growth.experiment_propose` | Generate experiment proposals from funnel metrics. | `funnel_metrics_id`, `funnel_name`, tenant/project context. | Job request + report findings/recommendations. | Missing funnel metrics, schema validation failure, job type unavailable. |
| `autopilot.growth.content_draft` | Draft content using a profile. | `profile_name`, `content_type`, `goal`, tenant/project context. | Job request + report findings. | Missing profile, invalid content type, LLM provider unavailable. |
| `autopilot.growth.experiment_run` | Run a proposed experiment (action job). | `proposal_id`, variants, duration, tenant/project context. | Job request + report recommendations. | Missing proposal, policy token required, schema validation failure. |
| `autopilot.growth.publish_content` | Publish drafted content (action job). | `draft_id`, destination, tenant/project context. | Job request + report recommendations. | Missing draft, invalid destination, policy token required. |

### Metrics (Success / Failure)

Each runner defines success and failure metrics in `runner-maturity.json`, including:

- Success: `job_request_enqueued`, report summary counts (e.g., `seo_findings_count`, `content_drafts_count`).
- Failure: `bundle_validation_failed`, `job_type_unavailable`, and runner-specific errors (e.g., `profile_missing`, `policy_token_missing`).

### Cost Awareness (FinOps Hooks)

- Every runner declares a `max_cost_usd` cap in `runner-maturity.json`.
- Job requests embed `constraints.max_cost_usd` and require approval.
- Action jobs (`experiment_run`, `publish_content`) are marked `requires_policy_token` in the bundle.

## Ingestion / Validation

JobForge can validate bundles using the exported schemas:

- `JobRequestBundleSchema`
- `ReportEnvelopeSchema`

Validation expectations:

- All requests share the same `tenant_id` + `project_id` as the bundle
- `job_type` must be known or marked `job_type_status: "unavailable"`
- Action job types require `requires_policy_token: true`

## Deterministic Fixtures

To export stable fixtures used by JobForge ingestion tests:

```bash
pnpm fixtures:export
```

This writes:

- `fixtures/jobforge/request-bundle.json`
- `fixtures/jobforge/report.json`
- `fixtures/jobforge/report.md`

To confirm compatibility against the canonical hash snapshots:

```bash
pnpm contracts:compat
```

### Schema Version

The pinned canonical contract version is:

- `schema_version: 2024-09-01`

All exported JobForge outputs must stay on this version until the canonical contracts are updated.

## Safety Boundaries

- Runnerless: emits requests only, never runs jobs.
- No secrets/PII in outputs.
- Action requests (`experiment_run`, `publish_content`) are always marked as requiring policy tokens.

## Migration Note

This repo ships a compatibility shim under `src/contracts/compat.ts` and `src/jobforge/client.ts` to avoid external dependencies.
When `@autopilot/contracts` and `@autopilot/jobforge-client` are available, replace the shim imports with the official packages.

To keep the shim aligned with the canonical contracts:

1. Update `schema_version` and the Zod schemas in `src/contracts/compat.ts`.
2. Re-export any updated fields from `src/contracts/index.ts`.
3. Re-run `pnpm fixtures:export` and `pnpm contracts:compat` to validate byte-for-byte alignment.
