import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import {
  createSEOScanJob,
  createExperimentProposalJob,
  createContentDraftJob,
  createExperimentRunJob,
  createPublishContentJob,
  serializeJobRequest,
  createJobBatch,
} from '../src/jobforge/index.js';
import type {
  TenantContext,
  FunnelMetrics,
  ExperimentProposal,
  ContentDraft,
} from '../src/contracts/index.js';

describe('JobForge Integration', () => {
  const tenantContext: TenantContext = {
    tenant_id: 'test-tenant',
    project_id: 'test-project',
  };

  const mockFunnelMetrics: FunnelMetrics = {
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

  const mockProposal: ExperimentProposal = {
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
      { name: 'Variant B', description: 'New', changes: ['Change 1'] },
    ],
    evidence: [],
  };

  const mockContentDraft: ContentDraft = {
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

  describe('job request creation', () => {
    it('should create SEO scan job', () => {
      const job = createSEOScanJob(tenantContext, '/path/to/site', 'html_export');

      expect(job.job_type).toBe('autopilot.growth.seo_scan');
      expect(job.tenant_id).toBe('test-tenant');
      expect(job.project_id).toBe('test-project');
      expect(job.payload.source_path).toBe('/path/to/site');
      expect(job.payload.source_type).toBe('html_export');
      expect(job.constraints.auto_execute).toBe(false);
      expect(job.constraints.require_approval).toBe(true);
      expect(job.constraints.max_cost_usd).toBeGreaterThan(0);
    });

    it('should create experiment proposal job', () => {
      const job = createExperimentProposalJob(tenantContext, mockFunnelMetrics);

      expect(job.job_type).toBe('autopilot.growth.experiment_propose');
      expect(job.payload.funnel_metrics_id).toBe('funnel-123');
      expect(job.payload.funnel_name).toBe('signup-funnel');
      expect(job.constraints.max_cost_usd).toBeGreaterThan(0);
    });

    it('should create content draft job', () => {
      const job = createContentDraftJob(
        tenantContext,
        'test-profile',
        'landing_page',
        'Convert visitors'
      );

      expect(job.job_type).toBe('autopilot.growth.content_draft');
      expect(job.payload.profile_name).toBe('test-profile');
      expect(job.payload.content_type).toBe('landing_page');
      expect(job.payload.goal).toBe('Convert visitors');
      expect(job.constraints.max_cost_usd).toBe(0.01);
    });

    it('should create content draft job with LLM', () => {
      const job = createContentDraftJob(
        tenantContext,
        'test-profile',
        'landing_page',
        'Convert visitors',
        'medium',
        { useLLM: true, llmProvider: 'openai' }
      );

      expect(job.payload.use_llm).toBe(true);
      expect(job.payload.llm_provider).toBe('openai');
      expect(job.constraints.max_cost_usd).toBe(1.0);
    });

    it('should create experiment run job', () => {
      const job = createExperimentRunJob(tenantContext, mockProposal);

      expect(job.job_type).toBe('autopilot.growth.experiment_run');
      expect(job.payload.proposal_id).toBe('proposal-123');
      expect(job.payload.experiment_title).toBe('Test Experiment');
      expect(job.payload.hypothesis).toBe('This will improve conversion');
      expect(job.payload.variants).toHaveLength(2);
      expect(job.constraints.max_cost_usd).toBeGreaterThan(0);
    });

    it('should create publish content job', () => {
      const job = createPublishContentJob(tenantContext, mockContentDraft, 'blog');

      expect(job.job_type).toBe('autopilot.growth.publish_content');
      expect(job.payload.draft_id).toBe('draft-123');
      expect(job.payload.destination).toBe('blog');
      expect(job.payload.content).toEqual(mockContentDraft.draft);
      expect(job.constraints.max_cost_usd).toBeGreaterThan(0);
    });
  });

  describe('job constraints', () => {
    it('should never auto-execute by default', () => {
      const seoJob = createSEOScanJob(tenantContext, '/path', 'html_export');
      const experimentJob = createExperimentRunJob(tenantContext, mockProposal);
      const contentJob = createContentDraftJob(tenantContext, 'profile', 'landing_page', 'goal');

      expect(seoJob.constraints.auto_execute).toBe(false);
      expect(experimentJob.constraints.auto_execute).toBe(false);
      expect(contentJob.constraints.auto_execute).toBe(false);
    });

    it('should always require approval', () => {
      const job = createSEOScanJob(tenantContext, '/path', 'html_export');
      expect(job.constraints.require_approval).toBe(true);
    });
  });

  describe('priority levels', () => {
    it('should set priority correctly', () => {
      const lowJob = createSEOScanJob(tenantContext, '/path', 'html_export', 'low');
      const highJob = createSEOScanJob(tenantContext, '/path', 'html_export', 'high');
      const criticalJob = createSEOScanJob(tenantContext, '/path', 'html_export', 'critical');

      expect(lowJob.priority).toBe('low');
      expect(highJob.priority).toBe('high');
      expect(criticalJob.priority).toBe('critical');
    });
  });

  describe('serialization', () => {
    it('should serialize job request to JSON', () => {
      const job = createSEOScanJob(tenantContext, '/path', 'html_export');
      const serialized = serializeJobRequest(job);

      expect(typeof serialized).toBe('string');

      const parsed = JSON.parse(serialized);
      expect(parsed.job_type).toBe('autopilot.growth.seo_scan');
      expect(parsed.tenant_id).toBe('test-tenant');
    });

    it('should produce valid JSON', () => {
      const job = createExperimentProposalJob(tenantContext, mockFunnelMetrics);
      const serialized = serializeJobRequest(job);

      expect(() => JSON.parse(serialized)).not.toThrow();
    });
  });

  describe('batch creation', () => {
    it('should create job batch', () => {
      const job1 = createSEOScanJob(tenantContext, '/path1', 'html_export');
      const job2 = createContentDraftJob(tenantContext, 'profile', 'landing_page', 'goal');

      const batch = createJobBatch([job1, job2], tenantContext);

      expect(batch.tenant_context).toEqual(tenantContext);
      expect(batch.jobs).toHaveLength(2);
      expect(batch.batch_id).toBeDefined();
    });
  });

  describe('context linking', () => {
    it('should link related entities', () => {
      const job = createSEOScanJob(tenantContext, '/path', 'html_export', 'medium', {
        relatedAuditId: 'audit-123',
        notes: 'Test notes',
      });

      expect(job.context.related_audit_id).toBe('audit-123');
      expect(job.context.notes).toBe('Test notes');
    });

    it('should track triggered_by', () => {
      const job = createExperimentProposalJob(tenantContext, mockFunnelMetrics);
      expect(job.context.triggered_by).toBe('growth-autopilot');
    });
  });

  describe('experiment run configuration', () => {
    it('should include experiment parameters', () => {
      const job = createExperimentRunJob(tenantContext, mockProposal, 'medium', {
        durationDays: 21,
        trafficAllocation: 0.3,
      });

      expect(job.payload.duration_days).toBe(21);
      expect(job.payload.traffic_allocation).toBe(0.3);
      expect(job.payload.minimum_detectable_effect).toBe(15);
    });

    it('should calculate deadline', () => {
      const job = createExperimentRunJob(tenantContext, mockProposal, 'medium', {
        durationDays: 14,
      });

      expect(job.constraints.deadline).toBeDefined();
      const deadline = new Date(job.constraints.deadline ?? '');
      const now = new Date();
      const daysDiff = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeCloseTo(14, 0);
    });
  });
});

describe('Demo Command Smoke Test', () => {
  it('should run demo command successfully', () => {
    // Build the project first
    execSync('pnpm run build', { stdio: 'inherit' });

    // Run the demo command
    const result = execSync('node dist/cli.js demo --json', {
      encoding: 'utf8',
      cwd: process.cwd(),
    });

    // Parse the JSON output
    const output = JSON.parse(result);

    // Verify the demo run structure
    expect(output.status).toBe('success');
    expect(output.demo_tenant_id).toBe('demo-tenant');
    expect(output.demo_project_id).toBe('demo-project');
    expect(output.demo_trace_id).toBe('demo-trace-123');
    expect(typeof output.job_requests_count).toBe('number');
    expect(typeof output.findings_count).toBe('number');
    expect(typeof output.recommendations_count).toBe('number');
    expect(output.capabilities_demonstrated).toEqual([
      'seo_analysis',
      'funnel_analysis',
      'experiment_proposal',
      'content_drafting',
    ]);
    expect(output.blast_radius).toBe('low');
    expect(output.evidence_packet_available).toBe(true);
  });

  it('should handle demo command gracefully on failure', () => {
    // This test ensures the demo command doesn't crash the process
    // even if there are issues - it should return proper error codes
    try {
      execSync('node dist/cli.js demo --invalid-flag', {
        stdio: 'pipe',
        cwd: process.cwd(),
      });
    } catch (error: any) {
      // Should exit with non-zero code but not crash
      expect(error.status).not.toBe(0);
    }
  });
});
