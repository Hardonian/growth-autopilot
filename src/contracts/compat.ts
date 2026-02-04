import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Compatibility shim for @autopilot/contracts.
 * Replace this module with direct imports from @autopilot/contracts when available.
 * 
 * Aligned with @autopilot/contracts@0.1.0 canonical schemas.
 */

export const DEFAULT_SCHEMA_VERSION = '2024-09-01';
export const schema_version = DEFAULT_SCHEMA_VERSION;

// ============================================================================
// Capability Metadata Schema (for schema compliance tracking)
// ============================================================================

export const CapabilityMetadataSchema = z.object({
  capability_id: z.string().min(1),
  version: z.string().default('1.0.0'),
  schema_version: z.string().default(DEFAULT_SCHEMA_VERSION),
  supported_job_types: z.array(z.string()),
  deprecated: z.boolean().default(false),
  migration_guide: z.string().optional(),
});

export type CapabilityMetadata = z.infer<typeof CapabilityMetadataSchema>;

export function createCapabilityMetadata(
  capabilityId: string,
  supportedJobTypes: string[],
  options?: { version?: string; deprecated?: boolean; migrationGuide?: string }
): CapabilityMetadata {
  return CapabilityMetadataSchema.parse({
    capability_id: capabilityId,
    version: options?.version ?? '1.0.0',
    schema_version: DEFAULT_SCHEMA_VERSION,
    supported_job_types: supportedJobTypes,
    deprecated: options?.deprecated ?? false,
    migration_guide: options?.migrationGuide,
  });
}

// ============================================================================
// Primitive Types (aligned with canonical contracts)
// ============================================================================

export const TenantIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-_]+$/);
export const ProjectIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-_]+$/);

export type TenantId = z.infer<typeof TenantIdSchema>;
export type ProjectId = z.infer<typeof ProjectIdSchema>;

// ============================================================================
// Tenant Context (Multi-tenant Safety)
// ============================================================================

export const TenantContextSchema = z.object({
  tenant_id: TenantIdSchema,
  project_id: ProjectIdSchema,
});

export type TenantContext = z.infer<typeof TenantContextSchema>;

export function validateTenantContext(context: unknown): TenantContext {
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

// WeakMap-based memoization cache for sortKeys
// Uses WeakMap so cached objects can still be garbage collected
const sortKeysCache = new WeakMap<object, unknown>();

function sortKeys(value: unknown): unknown {
  // Handle primitives directly (no caching needed)
  if (value === null || typeof value !== 'object') {
    return value;
  }

  // Check cache for objects
  const cached = sortKeysCache.get(value);
  if (cached !== undefined) {
    return cached;
  }

  let result: unknown;

  if (Array.isArray(value)) {
    result = value.map((item) => sortKeys(item));
  } else {
    const record = value as Record<string, unknown>;
    result = Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys(record[key]);
        return acc;
      }, {});
  }

  sortKeysCache.set(value, result);
  return result;
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

// ============================================================================
// Degraded Response Schema (for upstream dependency failures)
// ============================================================================

export const RetryGuidanceSchema = z.object({
  retryable: z.boolean(),
  retry_after_seconds: z.number().optional(),
  max_retries: z.number().default(3),
  strategy: z.enum(['immediate', 'exponential_backoff', 'fixed_interval']).default('exponential_backoff'),
  reason: z.string(),
});

export type RetryGuidance = z.infer<typeof RetryGuidanceSchema>;

// ============================================================================
// Runner Maturity Report (Runner guarantees + metrics in standard format)
// ============================================================================

export const RunnerMetricSchema = z.object({
  metric: z.string().min(1),
  description: z.string().min(1),
  source: z.enum(['report', 'job_request', 'runner', 'external']),
});

export type RunnerMetric = z.infer<typeof RunnerMetricSchema>;

export const RunnerMaturitySchema = z.object({
  schema_version: z.string().min(1).default(DEFAULT_SCHEMA_VERSION),
  module_id: z.string().min(1),
  tenant_id: z.string().min(1),
  project_id: z.string().min(1),
  trace_id: z.string().min(1),
  created_at: z.string().datetime(),
  runners: z.array(
    z.object({
      runner_id: z.string().min(1),
      job_type: z.string().min(1),
      purpose: z.string().min(1),
      inputs: z.array(z.string().min(1)),
      outputs: z.array(z.string().min(1)),
      failure_modes: z.array(z.string().min(1)),
      idempotency: z.object({
        strategy: z.enum(['bundle_idempotency_key', 'request_id', 'payload_hash']),
        key_source: z.string().min(1),
      }),
      retry_guidance: RetryGuidanceSchema,
      metrics: z.object({
        success: z.array(RunnerMetricSchema),
        failure: z.array(RunnerMetricSchema),
      }),
      finops: z.object({
        max_cost_usd: z.number().nonnegative(),
        cost_controls: z.array(z.string().min(1)),
      }),
    })
  ),
  canonical_hash: z.string().min(1),
  canonical_hash_algorithm: z.literal('sha256'),
  canonicalization: z.literal('sorted_keys'),
});

export type RunnerMaturityReport = z.infer<typeof RunnerMaturitySchema>;

export const DegradedResponseSchema = z.object({
  success: z.literal(false),
  degraded: z.literal(true),
  capability_id: z.string().min(1),
  error_code: z.enum(['UPSTREAM_UNAVAILABLE', 'DEPENDENCY_TIMEOUT', 'RATE_LIMITED', 'CIRCUIT_OPEN']),
  message: z.string(),
  retry_guidance: RetryGuidanceSchema,
  timestamp: z.string().datetime(),
  fallback_data: z.record(z.unknown()).optional(),
});

export type DegradedResponse = z.infer<typeof DegradedResponseSchema>;

export function createDegradedResponse(
  capabilityId: string,
  errorCode: DegradedResponse['error_code'],
  message: string,
  retryGuidance: RetryGuidance,
  fallbackData?: Record<string, unknown>
): DegradedResponse {
  return DegradedResponseSchema.parse({
    success: false,
    degraded: true,
    capability_id: capabilityId,
    error_code: errorCode,
    message,
    retry_guidance: retryGuidance,
    timestamp: new Date().toISOString(),
    fallback_data: fallbackData,
  });
}

// Default retry delays to avoid thundering herd (exponential backoff: 1s, 2s, 4s...)
const DEFAULT_RETRY_AFTER_SECONDS = 1;
const DEFAULT_MAX_RETRIES = 2; // Reduced from 3 for faster failure detection

export function createRetryGuidance(
  retryable: boolean,
  reason: string,
  options?: {
    retryAfterSeconds?: number;
    maxRetries?: number;
    strategy?: RetryGuidance['strategy'];
  }
): RetryGuidance {
  return RetryGuidanceSchema.parse({
    retryable,
    reason,
    retry_after_seconds: options?.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS,
    max_retries: options?.maxRetries ?? DEFAULT_MAX_RETRIES,
    strategy: options?.strategy ?? 'exponential_backoff',
  });
}
