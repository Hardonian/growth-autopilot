import { describe, it, expect } from 'vitest';
import {
  TenantContextSchema,
  SEOFindingSchema,
  SEOAuditSchema,
  FunnelStepSchema,
  FunnelMetricsSchema,
  ExperimentProposalSchema,
  ContentDraftSchema,
  JobRequestSchema,
  ProfileSchema,
  SeveritySchema,
} from '../src/contracts/index.js';

describe('Contract Schemas', () => {
  describe('TenantContextSchema', () => {
    it('should validate valid tenant context', () => {
      const valid = {
        tenant_id: 'tenant-123',
        project_id: 'project-456',
      };

      const result = TenantContextSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject missing tenant_id', () => {
      const invalid = {
        project_id: 'project-456',
      };

      const result = TenantContextSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject missing project_id', () => {
      const invalid = {
        tenant_id: 'tenant-123',
      };

      const result = TenantContextSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject empty strings', () => {
      const invalid = {
        tenant_id: '',
        project_id: 'project-456',
      };

      const result = TenantContextSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('SeveritySchema', () => {
    it('should accept valid severity levels', () => {
      expect(SeveritySchema.safeParse('critical').success).toBe(true);
      expect(SeveritySchema.safeParse('warning').success).toBe(true);
      expect(SeveritySchema.safeParse('info').success).toBe(true);
      expect(SeveritySchema.safeParse('opportunity').success).toBe(true);
    });

    it('should reject invalid severity', () => {
      expect(SeveritySchema.safeParse('error').success).toBe(false);
      expect(SeveritySchema.safeParse('').success).toBe(false);
    });
  });

  describe('SEOFindingSchema', () => {
    it('should validate complete SEO finding', () => {
      const finding = {
        id: 'finding-123',
        url: '/about',
        severity: 'warning',
        category: 'title',
        message: 'Title is too short',
        current_value: 'Hi',
        recommendation: 'Expand to 50-60 characters',
        evidence: [
          {
            type: 'html_element',
            path: 'head > title',
            description: 'Title element found',
            value: 2,
          },
        ],
      };

      const result = SEOFindingSchema.safeParse(finding);
      expect(result.success).toBe(true);
    });

    it('should accept null current_value', () => {
      const finding = {
        id: 'finding-123',
        url: '/',
        severity: 'critical',
        category: 'title',
        message: 'Missing title',
        current_value: null,
        recommendation: 'Add title tag',
        evidence: [],
      };

      const result = SEOFindingSchema.safeParse(finding);
      expect(result.success).toBe(true);
    });
  });

  describe('SEOAuditSchema', () => {
    it('should validate complete SEO audit', () => {
      const audit = {
        tenant_id: 'tenant-123',
        project_id: 'project-456',
        id: 'audit-123',
        scanned_at: '2024-01-01T00:00:00Z',
        source_type: 'html_export',
        source_path: '/path/to/site',
        urls_scanned: 10,
        findings: [],
        summary: {
          critical: 0,
          warning: 2,
          info: 5,
          opportunity: 1,
        },
      };

      const result = SEOAuditSchema.safeParse(audit);
      expect(result.success).toBe(true);
    });
  });

  describe('FunnelStepSchema', () => {
    it('should validate funnel step', () => {
      const step = {
        step_name: 'signup',
        event_name: 'signup_start',
        unique_users: 100,
        total_events: 150,
        drop_off_count: 50,
        drop_off_rate: 0.5,
        avg_time_to_next_seconds: 45.5,
      };

      const result = FunnelStepSchema.safeParse(step);
      expect(result.success).toBe(true);
    });

    it('should accept optional avg_time_to_next', () => {
      const step = {
        step_name: 'signup',
        event_name: 'signup_start',
        unique_users: 100,
        total_events: 150,
        drop_off_count: 50,
        drop_off_rate: 0.5,
      };

      const result = FunnelStepSchema.safeParse(step);
      expect(result.success).toBe(true);
    });
  });

  describe('FunnelMetricsSchema', () => {
    it('should validate complete funnel metrics', () => {
      const metrics = {
        tenant_id: 'tenant-123',
        project_id: 'project-456',
        id: 'funnel-123',
        computed_at: '2024-01-01T00:00:00Z',
        source_file: 'events.json',
        funnel_name: 'signup',
        date_range: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-02T00:00:00Z',
        },
        total_entrances: 1000,
        total_conversions: 100,
        overall_conversion_rate: 0.1,
        steps: [],
        biggest_drop_off_step: 'signup',
        evidence: [],
      };

      const result = FunnelMetricsSchema.safeParse(metrics);
      expect(result.success).toBe(true);
    });
  });

  describe('ExperimentProposalSchema', () => {
    it('should validate complete experiment proposal', () => {
      const proposal = {
        tenant_id: 'tenant-123',
        project_id: 'project-456',
        id: 'exp-123',
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
          {
            name: 'Control',
            description: 'Current',
            changes: [],
          },
        ],
        evidence: [],
      };

      const result = ExperimentProposalSchema.safeParse(proposal);
      expect(result.success).toBe(true);
    });

    it('should accept valid experiment types', () => {
      const types = ['ab_test', 'multivariate', 'feature_flag', 'content_change', 'flow_change'];

      for (const type of types) {
        const proposal = {
          tenant_id: 'tenant-123',
          project_id: 'project-456',
          id: 'exp-123',
          created_at: '2024-01-01T00:00:00Z',
          title: 'Test',
          hypothesis: 'Test',
          funnel_metrics_id: 'funnel-123',
          target_step: 'signup',
          experiment_type: type,
          effort: {
            level: 'small',
            days_estimate: 3,
            resources_needed: [],
          },
          expected_impact: {
            metric: 'conversion',
            lift_percent: 10,
            confidence: 'low',
            rationale: 'Test',
          },
          suggested_variants: [],
          evidence: [],
        };

        expect(ExperimentProposalSchema.safeParse(proposal).success).toBe(true);
      }
    });
  });

  describe('ContentDraftSchema', () => {
    it('should validate complete content draft', () => {
      const draft = {
        tenant_id: 'tenant-123',
        project_id: 'project-456',
        id: 'draft-123',
        created_at: '2024-01-01T00:00:00Z',
        content_type: 'landing_page',
        profile_used: 'test',
        llm_used: false,
        input_context: {
          goal: 'Convert visitors',
        },
        draft: {
          headline: 'Test',
          body: 'Test content',
          cta: 'Sign up',
        },
        seo_metadata: {
          title: 'Test Title',
          meta_description: 'Test description',
          keywords: ['test'],
        },
        variant_count: 1,
        evidence: [],
      };

      const result = ContentDraftSchema.safeParse(draft);
      expect(result.success).toBe(true);
    });

    it('should accept valid content types', () => {
      const types = [
        'landing_page',
        'onboarding_email',
        'changelog_note',
        'blog_post',
        'meta_description',
        'title_tag',
        'og_copy',
        'ad_copy',
      ];

      for (const type of types) {
        const draft = {
          tenant_id: 'tenant-123',
          project_id: 'project-456',
          id: 'draft-123',
          created_at: '2024-01-01T00:00:00Z',
          content_type: type,
          profile_used: 'test',
          llm_used: false,
          input_context: { goal: 'Test' },
          draft: { body: 'Test' },
          variant_count: 1,
          evidence: [],
        };

        expect(ContentDraftSchema.safeParse(draft).success).toBe(true);
      }
    });
  });

  describe('JobRequestSchema', () => {
    it('should validate complete job request', () => {
      const job = {
        tenant_id: 'tenant-123',
        project_id: 'project-456',
        id: 'job-123',
        created_at: '2024-01-01T00:00:00Z',
        job_type: 'autopilot.growth.seo_scan',
        payload: {
          source_path: '/path',
          source_type: 'html_export',
        },
        priority: 'medium',
        context: {
          triggered_by: 'growth-autopilot',
        },
        constraints: {
          auto_execute: false,
          require_approval: true,
        },
      };

      const result = JobRequestSchema.safeParse(job);
      expect(result.success).toBe(true);
    });

    it('should accept valid job types', () => {
      const types = [
        'autopilot.growth.seo_scan',
        'autopilot.growth.experiment_propose',
        'autopilot.growth.content_draft',
        'autopilot.growth.experiment_run',
        'autopilot.growth.publish_content',
      ];

      for (const type of types) {
        const job = {
          tenant_id: 'tenant-123',
          project_id: 'project-456',
          id: 'job-123',
          created_at: '2024-01-01T00:00:00Z',
          job_type: type,
          payload: {},
          context: { triggered_by: 'test' },
          constraints: { auto_execute: false, require_approval: true },
        };

        expect(JobRequestSchema.safeParse(job).success).toBe(true);
      }
    });

    it('should validate priority levels', () => {
      const priorities = ['low', 'medium', 'high', 'critical'];

      for (const priority of priorities) {
        const job = {
          tenant_id: 'tenant-123',
          project_id: 'project-456',
          id: 'job-123',
          created_at: '2024-01-01T00:00:00Z',
          job_type: 'autopilot.growth.seo_scan',
          payload: {},
          priority,
          context: { triggered_by: 'test' },
          constraints: { auto_execute: false, require_approval: true },
        };

        expect(JobRequestSchema.safeParse(job).success).toBe(true);
      }
    });
  });

  describe('ProfileSchema', () => {
    it('should validate complete profile', () => {
      const profile = {
        name: 'test-profile',
        icp: {
          description: 'Test users',
          pain_points: ['slow'],
          goals: ['fast'],
        },
        voice: {
          tone: 'professional',
          style_guide: 'Clear and concise',
          vocabulary: ['optimize'],
        },
        keywords: {
          primary: ['test'],
          secondary: ['example'],
          prohibited: ['bad'],
        },
        features: [
          {
            name: 'Feature A',
            description: 'Does A',
            benefits: ['Benefit 1'],
          },
        ],
        prohibited_claims: ['guaranteed'],
      };

      const result = ProfileSchema.safeParse(profile);
      expect(result.success).toBe(true);
    });

    it('should accept valid voice tones', () => {
      const tones = ['professional', 'casual', 'technical', 'playful', 'formal'];

      for (const tone of tones) {
        const profile = {
          name: 'test',
          icp: { description: 'Test', pain_points: [], goals: [] },
          voice: {
            tone,
            style_guide: 'Test',
            vocabulary: [],
          },
          keywords: { primary: [], secondary: [], prohibited: [] },
          features: [],
          prohibited_claims: [],
        };

        expect(ProfileSchema.safeParse(profile).success).toBe(true);
      }
    });

    it('should accept profile with extends field', () => {
      const profile = {
        name: 'child-profile',
        extends: 'base',
        icp: {
          description: 'Test users',
          pain_points: ['slow'],
          goals: ['fast'],
        },
        voice: {
          tone: 'professional',
          style_guide: 'Clear',
          vocabulary: [],
        },
        keywords: {
          primary: ['test'],
          secondary: [],
          prohibited: [],
        },
        features: [],
        prohibited_claims: [],
      };

      const result = ProfileSchema.safeParse(profile);
      expect(result.success).toBe(true);
    });
  });
});