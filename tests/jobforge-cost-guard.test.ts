import { describe, expect, it } from 'vitest';
import {
  createSEOScanJob,
  createExperimentProposalJob,
  createContentDraftJob,
  createExperimentRunJob,
  createPublishContentJob,
} from '../src/jobforge/index.js';
import type { ContentDraft, ExperimentProposal, FunnelMetrics, TenantContext } from '../src/contracts/index.js';

describe('FinOps guardrails', () => {
  const tenantContext: TenantContext = {
    tenant_id: 'finops-tenant',
    project_id: 'finops-project',
  };

  const funnelMetrics: FunnelMetrics = {
    ...tenantContext,
    id: 'funnel-123',
    computed_at: '2024-01-01T00:00:00Z',
    source_file: 'test.json',
    funnel_name: 'signup-funnel',
    date_range: {
      start: '2024-01-01T00:00:00Z',
      end: '2024-01-02T00:00:00Z',
    },
    total_entrances: 1000,
    total_conversions: 100,
    overall_conversion_rate: 0.1,
    steps: [],
    evidence: [],
  };

  const proposal: ExperimentProposal = {
    ...tenantContext,
    id: 'proposal-123',
    created_at: '2024-01-01T00:00:00Z',
    title: 'Test Experiment',
    hypothesis: 'This will improve conversion',
    funnel_metrics_id: 'funnel-123',
    target_step: 'signup',
    experiment_type: 'ab_test',
    effort: {
      level: 'medium',
      days_estimate: 7,
      resources_needed: ['developer'],
    },
    expected_impact: {
      metric: 'conversion_rate',
      lift_percent: 15,
      confidence: 'medium',
      rationale: 'Based on similar experiments',
    },
    suggested_variants: [
      { name: 'Control', description: 'Current', changes: [] },
    ],
    evidence: [],
  };

  const contentDraft: ContentDraft = {
    ...tenantContext,
    id: 'draft-123',
    created_at: '2024-01-01T00:00:00Z',
    content_type: 'landing_page',
    profile_used: 'test-profile',
    llm_used: false,
    input_context: {
      goal: 'Convert visitors',
    },
    draft: {
      headline: 'Test Headline',
      body: 'Test body content',
      cta: 'Sign up',
    },
    variant_count: 1,
    evidence: [],
  };

  it('sets max_cost_usd for all JobForge requests', () => {
    const jobs = [
      createSEOScanJob(tenantContext, '/path', 'html_export'),
      createExperimentProposalJob(tenantContext, funnelMetrics),
      createContentDraftJob(tenantContext, 'profile', 'landing_page', 'goal'),
      createExperimentRunJob(tenantContext, proposal),
      createPublishContentJob(tenantContext, contentDraft, 'blog'),
    ];

    for (const job of jobs) {
      expect(job.constraints.max_cost_usd).toBeDefined();
      expect(job.constraints.max_cost_usd).toBeGreaterThan(0);
    }
  });
});
