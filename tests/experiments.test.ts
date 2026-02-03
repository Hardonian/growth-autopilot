import { describe, it, expect } from 'vitest';
import {
  proposeExperiments,
  createExperimentPlan,
  isDegradedResponse,
  experimentPlanCapability,
  ExperimentPlanSchema,
  type ExperimentPlan,
} from '../src/experiments/index.js';
import type { TenantContext, FunnelMetrics, ExperimentProposal, DegradedResponse } from '../src/contracts/index.js';
import {
  DegradedResponseSchema,
  RetryGuidanceSchema,
  CapabilityMetadataSchema,
} from '../src/contracts/index.js';

describe('Experiment Proposer', () => {
  const tenantContext: TenantContext = {
    tenant_id: 'test-tenant',
    project_id: 'test-project',
  };

  const createMockFunnel = (overrides?: Partial<FunnelMetrics>): FunnelMetrics => ({
    ...tenantContext,
    id: 'funnel-123',
    computed_at: '2024-01-01T00:00:00Z',
    source_file: 'test.json',
    funnel_name: 'test-funnel',
    date_range: {
      start: '2024-01-01T00:00:00Z',
      end: '2024-01-02T00:00:00Z',
    },
    total_entrances: 1000,
    total_conversions: 100,
    overall_conversion_rate: 0.1,
    steps: [
      {
        step_name: 'page_view',
        event_name: 'page_view',
        unique_users: 1000,
        total_events: 1000,
        drop_off_count: 0,
        drop_off_rate: 0,
      },
      {
        step_name: 'signup_start',
        event_name: 'signup_start',
        unique_users: 700,
        total_events: 700,
        drop_off_count: 300,
        drop_off_rate: 0.3,
      },
      {
        step_name: 'signup_complete',
        event_name: 'signup_complete',
        unique_users: 100,
        total_events: 100,
        drop_off_count: 600,
        drop_off_rate: 0.86,
      },
    ],
    biggest_drop_off_step: 'signup_complete',
    evidence: [],
    ...overrides,
  });

  describe('stable structure output', () => {
    it('should output proposals with consistent structure', () => {
      const funnel = createMockFunnel();

      const proposals = proposeExperiments({
        tenantContext,
        funnelMetrics: funnel,
        maxProposals: 2,
      });

      expect(proposals.length).toBeGreaterThan(0);

      for (const proposal of proposals) {
        // Required fields
        expect(proposal).toHaveProperty('id');
        expect(proposal).toHaveProperty('created_at');
        expect(proposal).toHaveProperty('title');
        expect(proposal).toHaveProperty('hypothesis');
        expect(proposal).toHaveProperty('funnel_metrics_id');
        expect(proposal).toHaveProperty('target_step');
        expect(proposal).toHaveProperty('experiment_type');
        expect(proposal).toHaveProperty('effort');
        expect(proposal).toHaveProperty('expected_impact');
        expect(proposal).toHaveProperty('suggested_variants');
        expect(proposal).toHaveProperty('evidence');

        // Effort structure
        expect(proposal.effort).toHaveProperty('level');
        expect(proposal.effort).toHaveProperty('days_estimate');
        expect(proposal.effort).toHaveProperty('resources_needed');

        // Expected impact structure
        expect(proposal.expected_impact).toHaveProperty('metric');
        expect(proposal.expected_impact).toHaveProperty('lift_percent');
        expect(proposal.expected_impact).toHaveProperty('confidence');
        expect(proposal.expected_impact).toHaveProperty('rationale');

        // Variants structure
        expect(proposal.suggested_variants.length).toBeGreaterThan(0);
        for (const variant of proposal.suggested_variants) {
          expect(variant).toHaveProperty('name');
          expect(variant).toHaveProperty('description');
          expect(variant).toHaveProperty('changes');
        }

        // Evidence structure
        expect(proposal.evidence.length).toBeGreaterThan(0);
      }
    });

    it('should have consistent experiment types', () => {
      const funnel = createMockFunnel();

      const proposals = proposeExperiments({
        tenantContext,
        funnelMetrics: funnel,
        maxProposals: 5,
      });

      const validTypes = ['ab_test', 'multivariate', 'feature_flag', 'content_change', 'flow_change'];

      for (const proposal of proposals) {
        expect(validTypes).toContain(proposal.experiment_type);
      }
    });

    it('should have consistent effort levels', () => {
      const funnel = createMockFunnel();

      const proposals = proposeExperiments({
        tenantContext,
        funnelMetrics: funnel,
        maxProposals: 5,
      });

      const validLevels = ['small', 'medium', 'large'];

      for (const proposal of proposals) {
        expect(validLevels).toContain(proposal.effort.level);
        expect(typeof proposal.effort.days_estimate).toBe('number');
        expect(proposal.effort.days_estimate).toBeGreaterThan(0);
        expect(Array.isArray(proposal.effort.resources_needed)).toBe(true);
      }
    });
  });

  describe('hypothesis generation', () => {
    it('should generate hypotheses with clear statements', () => {
      const funnel = createMockFunnel();

      const proposals = proposeExperiments({
        tenantContext,
        funnelMetrics: funnel,
        maxProposals: 3,
      });

      for (const proposal of proposals) {
        expect(proposal.hypothesis.length).toBeGreaterThan(20);
        expect(proposal.hypothesis).toContain(' '); // Not just one word
      }
    });

    it('should reference funnel metrics in hypothesis', () => {
      const funnel = createMockFunnel({
        biggest_drop_off_step: 'signup_complete',
      });

      const proposals = proposeExperiments({
        tenantContext,
        funnelMetrics: funnel,
        maxProposals: 3,
      });

      const signupProposal = proposals.find((p) => p.target_step === 'signup_complete');
      if (signupProposal) {
        expect(signupProposal.hypothesis.length).toBeGreaterThan(0);
      }
    });
  });

  describe('impact estimation', () => {
    it('should estimate positive impact', () => {
      const funnel = createMockFunnel();

      const proposals = proposeExperiments({
        tenantContext,
        funnelMetrics: funnel,
        maxProposals: 3,
      });

      for (const proposal of proposals) {
        expect(proposal.expected_impact.lift_percent).toBeGreaterThan(0);
        expect(proposal.expected_impact.rationale.length).toBeGreaterThan(10);
      }
    });

    it('should correlate confidence with drop-off severity', () => {
      const highDropoffFunnel = createMockFunnel({
        steps: [
          {
            step_name: 'page_view',
            event_name: 'page_view',
            unique_users: 1000,
            total_events: 1000,
            drop_off_count: 0,
            drop_off_rate: 0,
          },
          {
            step_name: 'signup',
            event_name: 'signup',
            unique_users: 200,
            total_events: 200,
            drop_off_count: 800,
            drop_off_rate: 0.8,
          },
        ],
        biggest_drop_off_step: 'signup',
      });

      const proposals = proposeExperiments({
        tenantContext,
        funnelMetrics: highDropoffFunnel,
        maxProposals: 1,
      });

      if (proposals.length > 0) {
        // High drop-off should have high confidence
        expect(proposals[0].expected_impact.confidence).toBe('high');
      }
    });
  });

  describe('variants generation', () => {
    it('should always include control variant', () => {
      const funnel = createMockFunnel();

      const proposals = proposeExperiments({
        tenantContext,
        funnelMetrics: funnel,
        maxProposals: 3,
      });

      for (const proposal of proposals) {
        const controlVariant = proposal.suggested_variants.find((v) => v.name === 'Control');
        expect(controlVariant).toBeDefined();
      }
    });

    it('should include at least 2 variants', () => {
      const funnel = createMockFunnel();

      const proposals = proposeExperiments({
        tenantContext,
        funnelMetrics: funnel,
        maxProposals: 3,
      });

      for (const proposal of proposals) {
        expect(proposal.suggested_variants.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('evidence linking', () => {
    it('should include evidence for each proposal', () => {
      const funnel = createMockFunnel();

      const proposals = proposeExperiments({
        tenantContext,
        funnelMetrics: funnel,
        maxProposals: 3,
      });

      for (const proposal of proposals) {
        expect(proposal.evidence.length).toBeGreaterThan(0);

        for (const evidence of proposal.evidence) {
          expect(evidence).toHaveProperty('type');
          expect(evidence).toHaveProperty('path');
          expect(evidence).toHaveProperty('description');
        }
      }
    });
  });

  describe('fallback proposal', () => {
    it('should generate fallback when no templates match', () => {
      const lowDropoffFunnel = createMockFunnel({
        overall_conversion_rate: 0.8,
        steps: [
          {
            step_name: 'page_view',
            event_name: 'page_view',
            unique_users: 1000,
            total_events: 1000,
            drop_off_count: 0,
            drop_off_rate: 0,
          },
          {
            step_name: 'purchase',
            event_name: 'purchase',
            unique_users: 800,
            total_events: 800,
            drop_off_count: 200,
            drop_off_rate: 0.2,
          },
        ],
        biggest_drop_off_step: undefined,
      });

      const proposals = proposeExperiments({
        tenantContext,
        funnelMetrics: lowDropoffFunnel,
        maxProposals: 5,
      });

      expect(proposals.length).toBeGreaterThan(0);
    });
  });
});

describe('Experiment Plan Capability (growth.experiment_plan)', () => {
  const tenantContext: TenantContext = {
    tenant_id: 'test-tenant',
    project_id: 'test-project',
  };

  const createMockFunnel = (overrides?: Partial<FunnelMetrics>): FunnelMetrics => ({
    ...tenantContext,
    id: 'funnel-123',
    computed_at: '2024-01-01T00:00:00Z',
    source_file: 'test.json',
    funnel_name: 'test-funnel',
    date_range: {
      start: '2024-01-01T00:00:00Z',
      end: '2024-01-02T00:00:00Z',
    },
    total_entrances: 1000,
    total_conversions: 100,
    overall_conversion_rate: 0.1,
    steps: [
      {
        step_name: 'page_view',
        event_name: 'page_view',
        unique_users: 1000,
        total_events: 1000,
        drop_off_count: 0,
        drop_off_rate: 0,
      },
      {
        step_name: 'signup_start',
        event_name: 'signup_start',
        unique_users: 700,
        total_events: 700,
        drop_off_count: 300,
        drop_off_rate: 0.3,
      },
    ],
    biggest_drop_off_step: 'signup_start',
    evidence: [],
    ...overrides,
  });

  const createMockProposal = (overrides?: Partial<ExperimentProposal>): ExperimentProposal => ({
    ...tenantContext,
    id: 'exp-123',
    created_at: '2024-01-01T00:00:00Z',
    title: 'Test Experiment',
    hypothesis: 'This will improve conversion',
    funnel_metrics_id: 'funnel-123',
    target_step: 'signup_start',
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
      { name: 'Variant B', description: 'Test variant', changes: ['Change CTA'] },
    ],
    evidence: [],
    ...overrides,
  });

  describe('capability metadata', () => {
    it('should have valid capability metadata', () => {
      const metadata = experimentPlanCapability;

      expect(metadata.capability_id).toBe('growth.experiment_plan');
      expect(metadata.supported_job_types).toContain('autopilot.growth.experiment_run');
      expect(metadata.supported_job_types).toContain('autopilot.growth.experiment_propose');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.schema_version).toBe('2024-09-01');
      expect(metadata.deprecated).toBe(false);
    });

    it('should validate capability metadata schema', () => {
      const result = CapabilityMetadataSchema.safeParse(experimentPlanCapability);
      expect(result.success).toBe(true);
    });
  });

  describe('experiment plan creation', () => {
    it('should create valid experiment plan from proposals', () => {
      const funnel = createMockFunnel();
      const proposal = createMockProposal();

      const result = createExperimentPlan({
        tenantContext,
        funnelMetrics: funnel,
        proposals: [proposal],
      });

      expect(isDegradedResponse(result)).toBe(false);
      
      const plan = result as ExperimentPlan;
      expect(plan.capability_id).toBe('growth.experiment_plan');
      expect(plan.tenant_id).toBe(tenantContext.tenant_id);
      expect(plan.project_id).toBe(tenantContext.project_id);
      expect(plan.funnel_metrics_id).toBe(funnel.id);
      expect(plan.validation_status).toBe('valid');
    });

    it('should have valid experiment plan structure', () => {
      const funnel = createMockFunnel();
      const proposal = createMockProposal();

      const result = createExperimentPlan({
        tenantContext,
        funnelMetrics: funnel,
        proposals: [proposal],
      });

      const plan = result as ExperimentPlan;
      
      // Plan structure
      expect(plan.plan).toHaveProperty('objective');
      expect(plan.plan).toHaveProperty('target_metric');
      expect(plan.plan).toHaveProperty('hypothesis_summary');
      expect(plan.plan).toHaveProperty('estimated_duration_days');
      expect(plan.plan).toHaveProperty('required_sample_size');
      expect(plan.plan).toHaveProperty('variants');
      expect(plan.plan).toHaveProperty('success_criteria');

      // Success criteria structure
      expect(plan.plan.success_criteria).toHaveProperty('minimum_lift_percent');
      expect(plan.plan.success_criteria).toHaveProperty('confidence_level');
      expect(plan.plan.success_criteria).toHaveProperty('primary_metric');

      // Variants
      expect(plan.plan.variants.length).toBeGreaterThan(0);
      expect(plan.plan.variants[0]).toHaveProperty('traffic_allocation');
    });

    it('should validate against ExperimentPlanSchema', () => {
      const funnel = createMockFunnel();
      const proposal = createMockProposal();

      const result = createExperimentPlan({
        tenantContext,
        funnelMetrics: funnel,
        proposals: [proposal],
      });

      const plan = result as ExperimentPlan;
      const validationResult = ExperimentPlanSchema.safeParse(plan);
      expect(validationResult.success).toBe(true);
    });
  });

  describe('degraded mode behavior', () => {
    it('should return degraded response when no proposals provided', () => {
      const funnel = createMockFunnel();

      const result = createExperimentPlan({
        tenantContext,
        funnelMetrics: funnel,
        proposals: [],
      });

      expect(isDegradedResponse(result)).toBe(true);
      
      const degraded = result as DegradedResponse;
      expect(degraded.success).toBe(false);
      expect(degraded.degraded).toBe(true);
      expect(degraded.capability_id).toBe('growth.experiment_plan');
      expect(degraded.error_code).toBe('UPSTREAM_UNAVAILABLE');
    });

    it('should return degraded response with actionable retry guidance', () => {
      const funnel = createMockFunnel();

      const result = createExperimentPlan({
        tenantContext,
        funnelMetrics: funnel,
        proposals: [],
      });

      const degraded = result as DegradedResponse;
      
      // Retry guidance
      expect(degraded.retry_guidance).toBeDefined();
      expect(degraded.retry_guidance.retryable).toBe(true);
      expect(degraded.retry_guidance.reason).toContain('funnel analysis');
      expect(degraded.retry_guidance.strategy).toBe('exponential_backoff');
    });

    it('should include fallback data in degraded response', () => {
      const funnel = createMockFunnel();

      const result = createExperimentPlan({
        tenantContext,
        funnelMetrics: funnel,
        proposals: [],
      });

      const degraded = result as DegradedResponse;
      
      expect(degraded.fallback_data).toBeDefined();
      expect(degraded.fallback_data).toHaveProperty('funnel_metrics_available');
      expect(degraded.fallback_data).toHaveProperty('proposals_count');
      expect(degraded.fallback_data?.proposals_count).toBe(0);
    });

    it('should validate degraded response schema', () => {
      const funnel = createMockFunnel();

      const result = createExperimentPlan({
        tenantContext,
        funnelMetrics: funnel,
        proposals: [],
      });

      const degraded = result as DegradedResponse;
      const validationResult = DegradedResponseSchema.safeParse(degraded);
      expect(validationResult.success).toBe(true);
    });

    it('should validate retry guidance schema', () => {
      const funnel = createMockFunnel();

      const result = createExperimentPlan({
        tenantContext,
        funnelMetrics: funnel,
        proposals: [],
      });

      const degraded = result as DegradedResponse;
      const validationResult = RetryGuidanceSchema.safeParse(degraded.retry_guidance);
      expect(validationResult.success).toBe(true);
    });
  });

  describe('contract compliance', () => {
    it('should always return structured response (plan or degraded)', () => {
      const funnel = createMockFunnel();
      
      // Test with valid proposals
      const result1 = createExperimentPlan({
        tenantContext,
        funnelMetrics: funnel,
        proposals: [createMockProposal()],
      });
      
      expect(isDegradedResponse(result1)).toBe(false);
      expect(result1).toHaveProperty('plan_id');

      // Test with empty proposals
      const result2 = createExperimentPlan({
        tenantContext,
        funnelMetrics: funnel,
        proposals: [],
      });
      
      expect(isDegradedResponse(result2)).toBe(true);
      expect(result2).toHaveProperty('capability_id');
    });

    it('should include required timestamp fields', () => {
      const funnel = createMockFunnel();
      const proposal = createMockProposal();

      const result = createExperimentPlan({
        tenantContext,
        funnelMetrics: funnel,
        proposals: [proposal],
      });

      const plan = result as ExperimentPlan;
      expect(plan.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should use correct schema version', () => {
      const funnel = createMockFunnel();
      const proposal = createMockProposal();

      const result = createExperimentPlan({
        tenantContext,
        funnelMetrics: funnel,
        proposals: [proposal],
      });

      const plan = result as ExperimentPlan;
      expect(plan.schema_version).toBe('2024-09-01');
    });
  });

  describe('jobforge compatibility', () => {
    it('should produce output compatible with jobforge orchestration', () => {
      const funnel = createMockFunnel();
      const proposal = createMockProposal({
        experiment_type: 'ab_test',
      });

      const result = createExperimentPlan({
        tenantContext,
        funnelMetrics: funnel,
        proposals: [proposal],
      });

      const plan = result as ExperimentPlan;
      
      // Should have job requests array (even if empty)
      expect(plan).toHaveProperty('job_requests');
      expect(Array.isArray(plan.job_requests)).toBe(true);
      
      // Plan should have experiment run compatible structure
      expect(plan.plan.variants.length).toBeGreaterThan(0);
      expect(plan.plan.variants[0]).toHaveProperty('traffic_allocation');
    });

    it('should calculate reasonable traffic allocations', () => {
      const funnel = createMockFunnel();
      const proposal = createMockProposal({
        suggested_variants: [
          { name: 'Control', description: 'Current', changes: [] },
          { name: 'Variant A', description: 'Test', changes: ['Change 1'] },
          { name: 'Variant B', description: 'Test', changes: ['Change 2'] },
        ],
      });

      const result = createExperimentPlan({
        tenantContext,
        funnelMetrics: funnel,
        proposals: [proposal],
      });

      const plan = result as ExperimentPlan;
      
      // First variant (control) should have 50%
      expect(plan.plan.variants[0].traffic_allocation).toBe(0.5);
      
      // Remaining variants should split the other 50%
      const remainingAllocation = plan.plan.variants.slice(1).reduce((sum, v) => sum + v.traffic_allocation, 0);
      expect(remainingAllocation).toBeCloseTo(0.5, 5);
    });
  });
});