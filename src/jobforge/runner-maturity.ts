import {
  DEFAULT_SCHEMA_VERSION,
  createRetryGuidance,
  type RunnerMaturityReport,
} from '../contracts/index.js';

export const RUNNER_COST_CAPS_USD = {
  'autopilot.growth.seo_scan': 0.5,
  'autopilot.growth.experiment_propose': 0.2,
  'autopilot.growth.content_draft': 1.0,
  'autopilot.growth.experiment_run': 5.0,
  'autopilot.growth.publish_content': 0.5,
} as const;

const IDEMPOTENCY = {
  strategy: 'payload_hash' as const,
  key_source: 'tenant_id + project_id + job_type + payload (stable hash)',
};

const DEFAULT_RETRY = createRetryGuidance(
  true,
  'JobForge queueing failures can be retried safely when using idempotency keys.',
  { maxRetries: 3, strategy: 'exponential_backoff' }
);

export const RUNNER_MATURITY_DEFINITIONS: RunnerMaturityReport['runners'] = [
  {
    runner_id: 'growth.seo_scan',
    job_type: 'autopilot.growth.seo_scan',
    purpose: 'Scan a site export for SEO issues and emit a JobForge request bundle entry.',
    inputs: ['source_path', 'source_type', 'tenant_id', 'project_id'],
    outputs: ['job_request', 'report.findings', 'request-bundle.json'],
    failure_modes: [
      'Invalid or missing source_path',
      'Schema validation failure',
      'Job type unavailable in JobForge',
    ],
    idempotency: IDEMPOTENCY,
    retry_guidance: DEFAULT_RETRY,
    metrics: {
      success: [
        {
          metric: 'job_request_enqueued',
          description: 'JobForge request for seo_scan created and validated.',
          source: 'job_request',
        },
        {
          metric: 'seo_findings_count',
          description: 'Number of SEO findings recorded in report.summary.',
          source: 'report',
        },
      ],
      failure: [
        {
          metric: 'bundle_validation_failed',
          description: 'Request bundle failed schema or invariants validation.',
          source: 'runner',
        },
        {
          metric: 'job_type_unavailable',
          description: 'job_type_status marked unavailable for seo_scan.',
          source: 'job_request',
        },
      ],
    },
    finops: {
      max_cost_usd: RUNNER_COST_CAPS_USD['autopilot.growth.seo_scan'],
      cost_controls: ['max_cost_usd constraint', 'require_approval=true'],
    },
  },
  {
    runner_id: 'growth.experiment_propose',
    job_type: 'autopilot.growth.experiment_propose',
    purpose: 'Generate experiment proposals from funnel metrics and emit a JobForge request.',
    inputs: ['funnel_metrics_id', 'funnel_name', 'tenant_id', 'project_id'],
    outputs: ['job_request', 'report.findings', 'report.recommendations'],
    failure_modes: [
      'Missing funnel metrics or invalid funnel metrics file',
      'Schema validation failure',
      'Job type unavailable in JobForge',
    ],
    idempotency: IDEMPOTENCY,
    retry_guidance: DEFAULT_RETRY,
    metrics: {
      success: [
        {
          metric: 'job_request_enqueued',
          description: 'Experiment proposal job request created and validated.',
          source: 'job_request',
        },
        {
          metric: 'experiment_proposals_count',
          description: 'Count of proposals captured in report.summary.',
          source: 'report',
        },
      ],
      failure: [
        {
          metric: 'funnel_metrics_missing',
          description: 'Input funnel metrics missing or invalid.',
          source: 'runner',
        },
        {
          metric: 'bundle_validation_failed',
          description: 'Request bundle failed schema or invariants validation.',
          source: 'runner',
        },
      ],
    },
    finops: {
      max_cost_usd: RUNNER_COST_CAPS_USD['autopilot.growth.experiment_propose'],
      cost_controls: ['max_cost_usd constraint', 'require_approval=true'],
    },
  },
  {
    runner_id: 'growth.content_draft',
    job_type: 'autopilot.growth.content_draft',
    purpose: 'Draft content using a profile and emit a JobForge request.',
    inputs: ['profile_name', 'content_type', 'goal', 'tenant_id', 'project_id'],
    outputs: ['job_request', 'report.findings', 'report.summary.content_drafts'],
    failure_modes: [
      'Missing profile or invalid content_type',
      'Schema validation failure',
      'LLM provider unavailable (if configured)',
    ],
    idempotency: IDEMPOTENCY,
    retry_guidance: DEFAULT_RETRY,
    metrics: {
      success: [
        {
          metric: 'job_request_enqueued',
          description: 'Content draft job request created and validated.',
          source: 'job_request',
        },
        {
          metric: 'content_drafts_count',
          description: 'Number of content drafts recorded in report.summary.',
          source: 'report',
        },
      ],
      failure: [
        {
          metric: 'profile_missing',
          description: 'Requested content profile not found.',
          source: 'runner',
        },
        {
          metric: 'llm_provider_error',
          description: 'LLM provider failed during draft preparation.',
          source: 'runner',
        },
      ],
    },
    finops: {
      max_cost_usd: RUNNER_COST_CAPS_USD['autopilot.growth.content_draft'],
      cost_controls: ['max_cost_usd constraint', 'require_approval=true'],
    },
  },
  {
    runner_id: 'growth.experiment_run',
    job_type: 'autopilot.growth.experiment_run',
    purpose: 'Run a proposed experiment and emit a JobForge request.',
    inputs: ['proposal_id', 'variants', 'duration_days', 'tenant_id', 'project_id'],
    outputs: ['job_request', 'report.recommendations'],
    failure_modes: [
      'Missing experiment proposal',
      'Policy token required for action jobs',
      'Schema validation failure',
    ],
    idempotency: IDEMPOTENCY,
    retry_guidance: DEFAULT_RETRY,
    metrics: {
      success: [
        {
          metric: 'job_request_enqueued',
          description: 'Experiment run job request created and validated.',
          source: 'job_request',
        },
        {
          metric: 'action_job_requires_policy_token',
          description: 'Action job flagged with requires_policy_token=true.',
          source: 'job_request',
        },
      ],
      failure: [
        {
          metric: 'policy_token_missing',
          description: 'Action job cannot execute without policy token.',
          source: 'runner',
        },
        {
          metric: 'bundle_validation_failed',
          description: 'Request bundle failed schema or invariants validation.',
          source: 'runner',
        },
      ],
    },
    finops: {
      max_cost_usd: RUNNER_COST_CAPS_USD['autopilot.growth.experiment_run'],
      cost_controls: ['max_cost_usd constraint', 'require_approval=true', 'policy_token_required'],
    },
  },
  {
    runner_id: 'growth.publish_content',
    job_type: 'autopilot.growth.publish_content',
    purpose: 'Publish drafted content to a destination via JobForge.',
    inputs: ['draft_id', 'destination', 'tenant_id', 'project_id'],
    outputs: ['job_request', 'report.recommendations'],
    failure_modes: [
      'Missing draft content',
      'Invalid publish destination',
      'Policy token required for action jobs',
    ],
    idempotency: IDEMPOTENCY,
    retry_guidance: DEFAULT_RETRY,
    metrics: {
      success: [
        {
          metric: 'job_request_enqueued',
          description: 'Publish content job request created and validated.',
          source: 'job_request',
        },
        {
          metric: 'action_job_requires_policy_token',
          description: 'Action job flagged with requires_policy_token=true.',
          source: 'job_request',
        },
      ],
      failure: [
        {
          metric: 'policy_token_missing',
          description: 'Action job cannot execute without policy token.',
          source: 'runner',
        },
        {
          metric: 'destination_invalid',
          description: 'Publish destination rejected by downstream systems.',
          source: 'runner',
        },
      ],
    },
    finops: {
      max_cost_usd: RUNNER_COST_CAPS_USD['autopilot.growth.publish_content'],
      cost_controls: ['max_cost_usd constraint', 'require_approval=true', 'policy_token_required'],
    },
  },
];

export function buildRunnerMaturityBase(params: {
  moduleId: string;
  tenantId: string;
  projectId: string;
  traceId: string;
  createdAt: string;
}): Omit<RunnerMaturityReport, 'canonical_hash' | 'canonical_hash_algorithm' | 'canonicalization'> {
  return {
    schema_version: DEFAULT_SCHEMA_VERSION,
    module_id: params.moduleId,
    tenant_id: params.tenantId,
    project_id: params.projectId,
    trace_id: params.traceId,
    created_at: params.createdAt,
    runners: RUNNER_MATURITY_DEFINITIONS,
  };
}
