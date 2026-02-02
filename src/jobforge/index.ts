import {
  type JobRequest,
  type TenantContext,
  type FunnelMetrics,
  type ExperimentProposal,
  type ContentDraft,
} from '../contracts/index.js';

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create a JobForge job request for SEO scan
 */
export function createSEOScanJob(
  tenantContext: TenantContext,
  sourcePath: string,
  sourceType: 'nextjs_routes' | 'html_export',
  priority: JobRequest['priority'] = 'medium',
  options?: {
    relatedAuditId?: string;
    notes?: string;
  }
): JobRequest {
  return {
    ...tenantContext,
    id: generateId(),
    created_at: new Date().toISOString(),
    job_type: 'autopilot.growth.seo_scan',
    payload: {
      source_path: sourcePath,
      source_type: sourceType,
      check_external_links: false,
      max_pages: 1000,
    },
    priority,
    context: {
      triggered_by: 'growth-autopilot',
      related_audit_id: options?.relatedAuditId,
      notes: options?.notes,
    },
    constraints: {
      auto_execute: false,
      require_approval: true,
    },
  };
}

/**
 * Create a JobForge job request for experiment proposal
 */
export function createExperimentProposalJob(
  tenantContext: TenantContext,
  funnelMetrics: FunnelMetrics,
  priority: JobRequest['priority'] = 'medium',
  options?: {
    maxProposals?: number;
    notes?: string;
  }
): JobRequest {
  return {
    ...tenantContext,
    id: generateId(),
    created_at: new Date().toISOString(),
    job_type: 'autopilot.growth.experiment_propose',
    payload: {
      funnel_metrics_id: funnelMetrics.id,
      funnel_name: funnelMetrics.funnel_name,
      max_proposals: options?.maxProposals ?? 3,
      drop_off_threshold: 0.2,
    },
    priority,
    context: {
      triggered_by: 'growth-autopilot',
      related_funnel_id: funnelMetrics.id,
      notes: options?.notes,
    },
    constraints: {
      auto_execute: false,
      require_approval: true,
    },
  };
}

/**
 * Create a JobForge job request for content drafting
 */
export function createContentDraftJob(
  tenantContext: TenantContext,
  profileName: string,
  contentType: ContentDraft['content_type'],
  goal: string,
  priority: JobRequest['priority'] = 'medium',
  options?: {
    keywords?: string[];
    features?: string[];
    targetAudience?: string;
    useLLM?: boolean;
    llmProvider?: string;
    notes?: string;
  }
): JobRequest {
  return {
    ...tenantContext,
    id: generateId(),
    created_at: new Date().toISOString(),
    job_type: 'autopilot.growth.content_draft',
    payload: {
      profile_name: profileName,
      content_type: contentType,
      goal,
      keywords: options?.keywords ?? [],
      features: options?.features ?? [],
      target_audience: options?.targetAudience,
      use_llm: options?.useLLM ?? false,
      llm_provider: options?.llmProvider,
      variant_count: 1,
    },
    priority,
    context: {
      triggered_by: 'growth-autopilot',
      notes: options?.notes,
    },
    constraints: {
      auto_execute: false,
      require_approval: true,
      max_cost_usd: options?.useLLM ? 1.0 : 0.01,
    },
  };
}

/**
 * Create a JobForge job request for running an experiment
 */
export function createExperimentRunJob(
  tenantContext: TenantContext,
  proposal: ExperimentProposal,
  priority: JobRequest['priority'] = 'medium',
  options?: {
    durationDays?: number;
    trafficAllocation?: number;
    notes?: string;
  }
): JobRequest {
  return {
    ...tenantContext,
    id: generateId(),
    created_at: new Date().toISOString(),
    job_type: 'autopilot.growth.experiment_run',
    payload: {
      proposal_id: proposal.id,
      experiment_title: proposal.title,
      hypothesis: proposal.hypothesis,
      target_step: proposal.target_step,
      variants: proposal.suggested_variants,
      duration_days: options?.durationDays ?? 14,
      traffic_allocation: options?.trafficAllocation ?? 0.5,
      success_metric: proposal.expected_impact.metric,
      minimum_detectable_effect: proposal.expected_impact.lift_percent,
    },
    priority,
    context: {
      triggered_by: 'growth-autopilot',
      related_funnel_id: proposal.funnel_metrics_id,
      notes: options?.notes ?? `Run experiment: ${proposal.title}`,
    },
    constraints: {
      auto_execute: false,
      require_approval: true,
      deadline: new Date(Date.now() + (options?.durationDays ?? 14) * 24 * 60 * 60 * 1000).toISOString(),
    },
  };
}

/**
 * Create a JobForge job request for publishing content
 */
export function createPublishContentJob(
  tenantContext: TenantContext,
  contentDraft: ContentDraft,
  destination: string,
  priority: JobRequest['priority'] = 'low',
  options?: {
    publishAt?: string;
    notes?: string;
  }
): JobRequest {
  return {
    ...tenantContext,
    id: generateId(),
    created_at: new Date().toISOString(),
    job_type: 'autopilot.growth.publish_content',
    payload: {
      draft_id: contentDraft.id,
      content_type: contentDraft.content_type,
      destination,
      content: contentDraft.draft,
      seo_metadata: contentDraft.seo_metadata,
    },
    priority,
    context: {
      triggered_by: 'growth-autopilot',
      notes: options?.notes ?? `Publish ${contentDraft.content_type} to ${destination}`,
    },
    constraints: {
      auto_execute: false,
      require_approval: true,
      deadline: options?.publishAt,
    },
  };
}

/**
 * Serialize job request to JSON for JobForge
 */
export function serializeJobRequest(job: JobRequest): string {
  return JSON.stringify(job, null, 2);
}

/**
 * Batch multiple job requests
 */
export function createJobBatch(
  jobs: JobRequest[],
  tenantContext: TenantContext
): { batch_id: string; tenant_context: TenantContext; jobs: JobRequest[] } {
  return {
    batch_id: generateId(),
    tenant_context: tenantContext,
    jobs,
  };
}