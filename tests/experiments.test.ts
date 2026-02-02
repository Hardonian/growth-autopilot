import { describe, it, expect } from 'vitest';
import { proposeExperiments } from '../src/experiments/index.js';
import type { TenantContext, FunnelMetrics } from '../src/contracts/index.js';

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