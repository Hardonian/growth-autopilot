import {
  type JobRequest,
  type TenantContext,
  buildJobRequest,
  createGrowthSEOScanRequest,
} from '@autopilot/jobforge-client';
import type { FunnelMetrics, ExperimentProposal, ContentDraft } from '../contracts/index.js';

export interface JobOptions {
  priority?: 'low' | 'normal' | 'high' | 'critical';
  triggeredBy?: string;
  correlationId?: string;
  notes?: string;
  scheduledFor?: string;
  maxCostUsd?: number;
}

function toSuitePriority(priority?: string): 'low' | 'normal' | 'high' | 'critical' {
  switch (priority) {
    case 'low': return 'low';
    case 'high': return 'high';
    case 'critical': return 'critical';
    default: return 'normal';
  }
}

/**
 * Create a JobForge job request for SEO scan
 * Uses suite's createGrowthSEOScanRequest with enhancements
 */
export function createSEOScanJob(
  tenantContext: TenantContext,
  sourcePath: string,
  sourceType: 'nextjs_routes' | 'html_export',
  priority: JobRequest['priority'] = 'normal',
  options?: {
    relatedAuditId?: string;
    notes?: string;
  }
): JobRequest {
  // Use suite's pre-built helper
  const job = createGrowthSEOScanRequest(
    tenantContext,
    sourcePath,
    {
      priority: toSuitePriority(priority),
      triggeredBy: 'growth-autopilot',
      correlationId: options?.relatedAuditId,
      notes: options?.notes,
    }
  );

  // Add module-specific payload enhancements
  return {
    ...job,
    payload: {
      ...job.payload,
      source_type: sourceType,
      check_external_links: false,
      max_pages: 1000,
    },
  };
}

/**
 * Create a JobForge job request for experiment proposal
 */
export function createExperimentProposalJob(
  tenantContext: TenantContext,
  funnelMetrics: FunnelMetrics,
  priority: JobRequest['priority'] = 'normal',
  options?: {
    maxProposals?: number;
    notes?: string;
  }
): JobRequest {
  return buildJobRequest(
    tenantContext,
    'autopilot.growth.experiment_propose',
    {
      funnel_metrics_id: funnelMetrics.id,
      funnel_name: funnelMetrics.funnel_name,
      max_proposals: options?.maxProposals ?? 3,
      drop_off_threshold: 0.2,
    },
    {
      priority: toSuitePriority(priority),
      triggeredBy: 'growth-autopilot',
      correlationId: funnelMetrics.id,
      notes: options?.notes,
    }
  );
}

/**
 * Create a JobForge job request for content drafting
 */
export function createContentDraftJob(
  tenantContext: TenantContext,
  profileName: string,
  contentType: ContentDraft['content_type'],
  goal: string,
  priority: JobRequest['priority'] = 'normal',
  options?: {
    keywords?: string[];
    features?: string[];
    targetAudience?: string;
    useLLM?: boolean;
    llmProvider?: string;
    notes?: string;
  }
): JobRequest {
  return buildJobRequest(
    tenantContext,
    'autopilot.growth.content_draft',
    {
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
    {
      priority: toSuitePriority(priority),
      triggeredBy: 'growth-autopilot',
      notes: options?.notes,
      maxCostUsd: options?.useLLM ? 1.0 : 0.01,
    }
  );
}

/**
 * Create a JobForge job request for running an experiment
 */
export function createExperimentRunJob(
  tenantContext: TenantContext,
  proposal: ExperimentProposal,
  priority: JobRequest['priority'] = 'normal',
  options?: {
    durationDays?: number;
    trafficAllocation?: number;
    notes?: string;
  }
): JobRequest {
  const durationDays = options?.durationDays ?? 14;
  
  return buildJobRequest(
    tenantContext,
    'autopilot.growth.experiment_run',
    {
      proposal_id: proposal.id,
      experiment_title: proposal.title,
      hypothesis: proposal.hypothesis,
      target_step: proposal.target_step,
      variants: proposal.suggested_variants,
      duration_days: durationDays,
      traffic_allocation: options?.trafficAllocation ?? 0.5,
      success_metric: proposal.expected_impact.metric,
      minimum_detectable_effect: proposal.expected_impact.lift_percent,
    },
    {
      priority: toSuitePriority(priority),
      triggeredBy: 'growth-autopilot',
      correlationId: proposal.funnel_metrics_id,
      notes: options?.notes ?? `Run experiment: ${proposal.title}`,
      deadline: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
    }
  );
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
  return buildJobRequest(
    tenantContext,
    'autopilot.growth.publish_content',
    {
      draft_id: contentDraft.id,
      content_type: contentDraft.content_type,
      destination,
      content: contentDraft.draft,
      seo_metadata: contentDraft.seo_metadata,
    },
    {
      priority: toSuitePriority(priority),
      triggeredBy: 'growth-autopilot',
      notes: options?.notes ?? `Publish ${contentDraft.content_type} to ${destination}`,
      deadline: options?.publishAt,
    }
  );
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
): { batch_id: string; tenant_context: TenantContext; jobs: JobRequest[]; created_at: string } {
  return {
    batch_id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
    tenant_context: tenantContext,
    jobs,
    created_at: new Date().toISOString(),
  };
}

// Re-export suite types for convenience
export type { JobRequest, TenantContext } from '@autopilot/jobforge-client';
