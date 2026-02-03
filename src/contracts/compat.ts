import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Compatibility shim for @autopilot/contracts.
 * Replace this module with direct imports from @autopilot/contracts when available.
 */

export const DEFAULT_SCHEMA_VERSION = '2024-09-01';
export const schema_version = DEFAULT_SCHEMA_VERSION;

export const TenantContextSchema = z.object({
  tenant_id: z.string().min(1),
  project_id: z.string().min(1),
});

export type TenantContext = z.infer<typeof TenantContextSchema>;

export function validateTenantContext(context: TenantContext): TenantContext {
  return TenantContextSchema.parse(context);
}

export const EventMetadataSchema = z.record(z.unknown()).optional();

export const EventEnvelopeSchema = z.object({
  schema_version: z.string().min(1).default(DEFAULT_SCHEMA_VERSION),
  event_id: z.string().min(1),
  event_name: z.string().min(1),
  occurred_at: z.string().datetime(),
  tenant_id: z.string().min(1),
  project_id: z.string().min(1),
  trace_id: z.string().min(1).optional(),
  source: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  metadata: EventMetadataSchema,
});

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
export type EventMetadata = z.infer<typeof EventMetadataSchema>;

export function createEventEnvelope(input: Omit<EventEnvelope, 'schema_version'> & { schema_version?: string }): EventEnvelope {
  return EventEnvelopeSchema.parse({
    schema_version: DEFAULT_SCHEMA_VERSION,
    ...input,
  });
}

export const OutputSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  uri: z.string().optional(),
  checksum: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type Output = z.infer<typeof OutputSchema>;

export const RunManifestSchema = z.object({
  schema_version: z.string().min(1).default(DEFAULT_SCHEMA_VERSION),
  manifest_id: z.string().min(1),
  tenant_id: z.string().min(1),
  project_id: z.string().min(1),
  trace_id: z.string().min(1).optional(),
  created_at: z.string().datetime(),
  outputs: z.array(OutputSchema).default([]),
  metadata: z.record(z.unknown()).optional(),
});

export type RunManifest = z.infer<typeof RunManifestSchema>;

export function createRunManifest(input: Omit<RunManifest, 'schema_version'> & { schema_version?: string }): RunManifest {
  return RunManifestSchema.parse({
    schema_version: DEFAULT_SCHEMA_VERSION,
    ...input,
  });
}

export const EvidenceLinkSchema = z.object({
  type: z.enum(['html_element', 'json_path', 'url', 'event_count', 'calculation', 'assumption']),
  path: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  description: z.string(),
});

export type EvidenceLink = z.infer<typeof EvidenceLinkSchema>;

export const SeveritySchema = z.enum(['critical', 'warning', 'info', 'opportunity']);
export type Severity = z.infer<typeof SeveritySchema>;

export const FindingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  severity: SeveritySchema,
  evidence: z.array(EvidenceLinkSchema).optional(),
  related_job_types: z.array(z.string()).optional(),
});

export type Finding = z.infer<typeof FindingSchema>;

export const ReportEnvelopeSchema = z.object({
  schema_version: z.string().min(1).default(DEFAULT_SCHEMA_VERSION),
  module_id: z.string().min(1),
  report_id: z.string().min(1),
  tenant_id: z.string().min(1),
  project_id: z.string().min(1),
  trace_id: z.string().min(1),
  created_at: z.string().datetime(),
  report_type: z.string().min(1),
  summary: z.record(z.unknown()),
  findings: z.array(FindingSchema),
  recommendations: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      job_type: z.string().optional(),
      requires_policy_token: z.boolean().optional(),
    })
  ),
  inputs: z
    .object({
      event_count: z.number().int().nonnegative(),
      run_manifest_count: z.number().int().nonnegative(),
      notes: z.array(z.string()).optional(),
    })
    .optional(),
  canonical_hash: z.string().min(1),
  canonical_hash_algorithm: z.literal('sha256'),
  canonicalization: z.literal('sorted_keys'),
});

export type ReportEnvelope = z.infer<typeof ReportEnvelopeSchema>;
export type ReportType = ReportEnvelope['report_type'];

export function createReportEnvelope(input: Omit<ReportEnvelope, 'schema_version'> & { schema_version?: string }): ReportEnvelope {
  return ReportEnvelopeSchema.parse({
    schema_version: DEFAULT_SCHEMA_VERSION,
    ...input,
  });
}

export const JobRequestSchema = z.object({
  schema_version: z.string().optional(),
  tenant_id: z.string().min(1),
  project_id: z.string().min(1),
  id: z.string().min(1),
  created_at: z.string().datetime(),
  job_type: z.string().min(1),
  payload: z.record(z.unknown()),
  priority: z.enum(['low', 'medium', 'high', 'critical', 'normal']).optional(),
  context: z
    .object({
      triggered_by: z.string().min(1),
      correlation_id: z.string().optional(),
      related_audit_id: z.string().optional(),
      notes: z.string().optional(),
      trace_id: z.string().optional(),
    })
    .default({ triggered_by: 'growth-autopilot' }),
  constraints: z.object({
    auto_execute: z.boolean(),
    require_approval: z.boolean(),
    deadline: z.string().datetime().optional(),
    max_cost_usd: z.number().optional(),
  }),
});

export type JobRequest = z.infer<typeof JobRequestSchema>;
export type JobType = JobRequest['job_type'];
export type JobPriority = NonNullable<JobRequest['priority']>;

export function createJobRequest(input: JobRequest): JobRequest {
  return JobRequestSchema.parse(input);
}

export const JobRequestBundleSchema = z.object({
  schema_version: z.string().min(1).default(DEFAULT_SCHEMA_VERSION),
  module_id: z.string().min(1),
  bundle_id: z.string().min(1),
  tenant_id: z.string().min(1),
  project_id: z.string().min(1),
  trace_id: z.string().min(1),
  created_at: z.string().datetime(),
  requests: z.array(
    z.object({
      idempotency_key: z.string().min(1),
      request: JobRequestSchema,
      job_type_status: z.enum(['available', 'unavailable']).optional(),
      requires_policy_token: z.boolean().optional(),
    })
  ),
  canonical_hash: z.string().min(1),
  canonical_hash_algorithm: z.literal('sha256'),
  canonicalization: z.literal('sorted_keys'),
});

export type JobRequestBundle = z.infer<typeof JobRequestBundleSchema>;

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeys(item));
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys(record[key]);
        return acc;
      }, {});
  }

  return value;
}

export function canonicalizeForHash(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function serializeDeterministic(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2);
}

export function stableHash(value: unknown): string {
  return createHash('sha256').update(canonicalizeForHash(value)).digest('hex');
}
