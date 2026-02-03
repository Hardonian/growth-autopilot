import { z } from 'zod';
import {
  DEFAULT_SCHEMA_VERSION,
  TenantContextSchema,
  type TenantContext,
  validateTenantContext,
  EventEnvelopeSchema,
  type EventEnvelope,
  type EventMetadata,
  createEventEnvelope,
  RunManifestSchema,
  type RunManifest,
  type Output,
  createRunManifest,
  ReportEnvelopeSchema,
  type ReportEnvelope,
  type ReportType,
  type Severity,
  type EvidenceLink,
  type Finding,
  createReportEnvelope,
  JobRequestSchema,
  type JobRequest,
  type JobType,
  type JobPriority,
  createJobRequest,
  JobRequestBundleSchema,
  type JobRequestBundle,
  canonicalizeForHash,
  stableHash,
  serializeDeterministic,
} from './compat.js';

export {
  DEFAULT_SCHEMA_VERSION,
  TenantContextSchema,
  type TenantContext,
  validateTenantContext,
  EventEnvelopeSchema,
  type EventEnvelope,
  type EventMetadata,
  createEventEnvelope,
  RunManifestSchema,
  type RunManifest,
  type Output,
  createRunManifest,
  ReportEnvelopeSchema,
  type ReportEnvelope,
  type ReportType,
  type Severity,
  type EvidenceLink,
  type Finding,
  createReportEnvelope,
  JobRequestSchema,
  type JobRequest,
  type JobType,
  type JobPriority,
  createJobRequest,
  JobRequestBundleSchema,
  type JobRequestBundle,
  canonicalizeForHash,
  stableHash,
  serializeDeterministic,
};

// ============================================================================
// Domain-Specific Schemas (Growth-specific)
// ============================================================================

/**
 * Local Severity schema for growth-specific usage
 * Note: Also re-export type Severity from suite
 */
export const SeveritySchema = z.enum(['critical', 'warning', 'info', 'opportunity']);

/**
 * SEO Finding - represents a single SEO issue or opportunity
 */
export const SEOFindingSchema = z.object({
  id: z.string(),
  url: z.string(),
  severity: z.enum(['critical', 'warning', 'info', 'opportunity']),
  category: z.enum([
    'title',
    'meta_description',
    'og_tags',
    'canonical',
    'broken_link',
    'sitemap',
    'robots',
    'performance_hint',
    'structure',
  ]),
  message: z.string(),
  current_value: z.union([z.string(), z.null()]).optional(),
  recommendation: z.string(),
  evidence: z.array(z.object({
    type: z.enum(['html_element', 'json_path', 'url', 'event_count', 'calculation', 'assumption']),
    path: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    description: z.string(),
  })),
  line_number: z.number().optional(),
});

export type SEOFinding = z.infer<typeof SEOFindingSchema>;

/**
 * Complete SEO Audit result
 */
export const SEOAuditSchema = z.object({
  tenant_id: z.string(),
  project_id: z.string(),
  id: z.string(),
  scanned_at: z.string().datetime(),
  source_type: z.enum(['nextjs_routes', 'html_export', 'sitemap_url']),
  source_path: z.string(),
  urls_scanned: z.number(),
  findings: z.array(SEOFindingSchema),
  summary: z.object({
    critical: z.number(),
    warning: z.number(),
    info: z.number(),
    opportunity: z.number(),
  }),
});

export type SEOAudit = z.infer<typeof SEOAuditSchema>;

/**
 * Funnel Step with metrics
 */
export const FunnelStepSchema = z.object({
  step_name: z.string(),
  event_name: z.string(),
  unique_users: z.number(),
  total_events: z.number(),
  drop_off_count: z.number(),
  drop_off_rate: z.number(),
  avg_time_to_next_seconds: z.number().optional(),
});

export type FunnelStep = z.infer<typeof FunnelStepSchema>;

/**
 * Funnel Metrics - computed from event exports
 */
export const FunnelMetricsSchema = z.object({
  tenant_id: z.string(),
  project_id: z.string(),
  id: z.string(),
  computed_at: z.string().datetime(),
  source_file: z.string(),
  funnel_name: z.string(),
  date_range: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  total_entrances: z.number(),
  total_conversions: z.number(),
  overall_conversion_rate: z.number(),
  steps: z.array(FunnelStepSchema),
  biggest_drop_off_step: z.string().optional(),
  evidence: z.array(z.object({
    type: z.enum(['html_element', 'json_path', 'url', 'event_count', 'calculation', 'assumption']),
    path: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    description: z.string(),
  })),
});

export type FunnelMetrics = z.infer<typeof FunnelMetricsSchema>;

/**
 * Experiment Proposal
 */
export const ExperimentProposalSchema = z.object({
  tenant_id: z.string(),
  project_id: z.string(),
  id: z.string(),
  created_at: z.string().datetime(),
  title: z.string(),
  hypothesis: z.string(),
  funnel_metrics_id: z.string(),
  target_step: z.string(),
  experiment_type: z.enum(['ab_test', 'multivariate', 'feature_flag', 'content_change', 'flow_change']),
  effort: z.object({
    level: z.enum(['small', 'medium', 'large']),
    days_estimate: z.number(),
    resources_needed: z.array(z.string()),
  }),
  expected_impact: z.object({
    metric: z.string(),
    lift_percent: z.number(),
    confidence: z.enum(['low', 'medium', 'high']),
    rationale: z.string(),
  }),
  suggested_variants: z.array(z.object({
    name: z.string(),
    description: z.string(),
    changes: z.array(z.string()),
  })),
  evidence: z.array(z.object({
    type: z.enum(['html_element', 'json_path', 'url', 'event_count', 'calculation', 'assumption']),
    path: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    description: z.string(),
  })),
  job_request_id: z.string().optional(),
});

export type ExperimentProposal = z.infer<typeof ExperimentProposalSchema>;

/**
 * Content Draft
 */
export const ContentDraftSchema = z.object({
  tenant_id: z.string(),
  project_id: z.string(),
  id: z.string(),
  created_at: z.string().datetime(),
  content_type: z.enum([
    'landing_page',
    'onboarding_email',
    'changelog_note',
    'blog_post',
    'meta_description',
    'title_tag',
    'og_copy',
    'ad_copy',
  ]),
  profile_used: z.string(),
  llm_used: z.boolean(),
  llm_provider: z.string().optional(),
  input_context: z.object({
    keywords: z.array(z.string()).optional(),
    features: z.array(z.string()).optional(),
    target_audience: z.string().optional(),
    goal: z.string(),
  }),
  draft: z.object({
    headline: z.string().optional(),
    body: z.string(),
    cta: z.string().optional(),
    subject_line: z.string().optional(),
  }),
  seo_metadata: z.object({
    title: z.string().optional(),
    meta_description: z.string().optional(),
    keywords: z.array(z.string()).optional(),
  }).optional(),
  variant_count: z.number(),
  evidence: z.array(z.object({
    type: z.enum(['html_element', 'json_path', 'url', 'event_count', 'calculation', 'assumption']),
    path: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    description: z.string(),
  })),
  job_request_id: z.string().optional(),
});

export type ContentDraft = z.infer<typeof ContentDraftSchema>;

/**
 * Growth Profile configuration for content generation
 * Note: This is domain-specific and different from @autopilot/profiles
 */
export const GrowthProfileSchema = z.object({
  name: z.string(),
  extends: z.string().optional(),
  icp: z.object({
    description: z.string(),
    pain_points: z.array(z.string()),
    goals: z.array(z.string()),
  }),
  voice: z.object({
    tone: z.enum(['professional', 'casual', 'technical', 'playful', 'formal']),
    style_guide: z.string(),
    vocabulary: z.array(z.string()),
  }),
  keywords: z.object({
    primary: z.array(z.string()),
    secondary: z.array(z.string()),
    prohibited: z.array(z.string()),
  }),
  features: z.array(z.object({
    name: z.string(),
    description: z.string(),
    benefits: z.array(z.string()),
  })),
  prohibited_claims: z.array(z.string()),
  required_disclaimers: z.array(z.string()).optional(),
});

export type GrowthProfile = z.infer<typeof GrowthProfileSchema>;

export const ProfileSchema = GrowthProfileSchema;
export type Profile = GrowthProfile;
