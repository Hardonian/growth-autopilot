import {
  type ExperimentProposal,
  type FunnelMetrics,
  type TenantContext,
  type EvidenceLink,
} from '../contracts/index.js';

/**
 * Options for experiment proposal generation
 */
export interface ProposalOptions {
  tenantContext: TenantContext;
  funnelMetrics: FunnelMetrics;
  maxProposals?: number;
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create an evidence link
 */
function createEvidence(
  type: EvidenceLink['type'],
  path: string,
  description: string,
  value?: string | number | boolean
): EvidenceLink {
  return { type, path, description, value };
}

/**
 * Template for experiment proposals based on common drop-off patterns
 */
interface ExperimentTemplate {
  name: string;
  experimentType: 'ab_test' | 'multivariate' | 'feature_flag' | 'content_change' | 'flow_change';
  effortLevel: 'small' | 'medium' | 'large';
  daysEstimate: number;
  resourcesNeeded: string[];
  appliesTo: (metrics: FunnelMetrics) => boolean;
  generateHypothesis: (metrics: FunnelMetrics) => string;
  generateVariants: (metrics: FunnelMetrics) => Array<{ name: string; description: string; changes: string[] }>;
}

type Variant = { name: string; description: string; changes: string[] };

/**
 * Experiment templates library
 */
const experimentTemplates: ExperimentTemplate[] = [
  {
    name: 'Landing Page Value Prop Test',
    experimentType: 'content_change',
    effortLevel: 'small',
    daysEstimate: 3,
    resourcesNeeded: ['copywriter', 'designer'],
    appliesTo: (metrics): boolean => {
      const firstStep = metrics.steps[0];
      return firstStep !== undefined && firstStep.drop_off_rate > 0.3;
    },
    generateHypothesis: (metrics): string =>
      `Testing clearer value proposition on landing page will reduce ${Math.round(
        (metrics.steps[0]?.drop_off_rate ?? 0) * 100
      )}% drop-off to signup`,
    generateVariants: (): Variant[] => [
      {
        name: 'Control',
        description: 'Current landing page',
        changes: ['No changes'],
      },
      {
        name: 'Value-First Headline',
        description: 'Lead with primary benefit instead of feature',
        changes: ['Rewrite H1 to focus on outcome', 'Move social proof above fold'],
      },
      {
        name: 'Problem-Agitation',
        description: 'Highlight pain point before solution',
        changes: ['Add pain point header', 'Contrast with solution'],
      },
    ],
  },
  {
    name: 'Signup Form Optimization',
    experimentType: 'flow_change',
    effortLevel: 'medium',
    daysEstimate: 5,
    resourcesNeeded: ['frontend_dev', 'ux_designer'],
    appliesTo: (metrics): boolean => {
      const signupStep = metrics.steps.find((s) => s.step_name.includes('signup'));
      return signupStep !== undefined && signupStep.drop_off_rate > 0.4;
    },
    generateHypothesis: (metrics): string => {
      const signupStep = metrics.steps.find((s) => s.step_name.includes('signup'));
      return `Reducing signup form fields will decrease ${Math.round(
        (signupStep?.drop_off_rate ?? 0) * 100
      )}% abandonment at signup step`;
    },
    generateVariants: (): Variant[] => [
      {
        name: 'Control',
        description: 'Current multi-field signup form',
        changes: ['No changes'],
      },
      {
        name: 'Email-Only First Step',
        description: 'Single field to start, collect rest later',
        changes: ['Reduce initial fields to email only', 'Progressive profiling'],
      },
      {
        name: 'Social Login Prominent',
        description: 'Prioritize OAuth over email signup',
        changes: ['Move Google/GitHub buttons above email form', 'One-click signup CTA'],
      },
    ],
  },
  {
    name: 'Onboarding Progress Indicator',
    experimentType: 'feature_flag',
    effortLevel: 'small',
    daysEstimate: 2,
    resourcesNeeded: ['frontend_dev'],
    appliesTo: (metrics): boolean => {
      const onboardingStep = metrics.steps.find(
        (s) => s.step_name.includes('onboard') || s.step_name.includes('setup')
      );
      return onboardingStep !== undefined && onboardingStep.drop_off_rate > 0.2;
    },
    generateHypothesis: (metrics): string => {
      const onboardingStep = metrics.steps.find(
        (s) => s.step_name.includes('onboard') || s.step_name.includes('setup')
      );
      return `Adding progress indicator during onboarding will reduce ${Math.round(
        (onboardingStep?.drop_off_rate ?? 0) * 100
      )}% drop-off by setting clear expectations`;
    },
    generateVariants: (): Variant[] => [
      {
        name: 'Control',
        description: 'Current onboarding without progress indicator',
        changes: ['No changes'],
      },
      {
        name: 'Step Counter',
        description: 'Show "Step 1 of 3" style indicator',
        changes: ['Add step counter UI', 'Highlight current step'],
      },
      {
        name: 'Progress Bar',
        description: 'Visual progress bar showing completion %',
        changes: ['Add progress bar component', 'Animate transitions'],
      },
    ],
  },
  {
    name: 'Activation Email Sequence',
    experimentType: 'content_change',
    effortLevel: 'medium',
    daysEstimate: 4,
    resourcesNeeded: ['copywriter', 'email_specialist'],
    appliesTo: (metrics): boolean => {
      const activationStep = metrics.steps.find(
        (s) => s.step_name.includes('activate') || s.step_name.includes('first_action')
      );
      return activationStep !== undefined && activationStep.drop_off_rate > 0.5;
    },
    generateHypothesis: (metrics): string => {
      const activationStep = metrics.steps.find(
        (s) => s.step_name.includes('activate') || s.step_name.includes('first_action')
      );
      return `Targeted activation email sequence will re-engage ${Math.round(
        (activationStep?.drop_off_rate ?? 0) * 100
      )}% of users who drop off before activation`;
    },
    generateVariants: (): Variant[] => [
      {
        name: 'Control',
        description: 'Current single welcome email',
        changes: ['No changes'],
      },
      {
        name: '3-Day Activation Series',
        description: 'Timed emails to drive first key action',
        changes: ['Day 0: Welcome + quick win', 'Day 1: Feature highlight', 'Day 2: Social proof'],
      },
      {
        name: 'Personalized Outreach',
        description: 'Segmented emails based on signup source',
        changes: ['Custom content per acquisition channel', 'Dynamic product tips'],
      },
    ],
  },
  {
    name: 'Checkout Flow Simplification',
    experimentType: 'flow_change',
    effortLevel: 'large',
    daysEstimate: 10,
    resourcesNeeded: ['frontend_dev', 'backend_dev', 'ux_designer', 'qa'],
    appliesTo: (metrics): boolean => {
      const conversionStep = metrics.steps[metrics.steps.length - 1];
      return metrics.overall_conversion_rate < 0.1 && conversionStep !== undefined;
    },
    generateHypothesis: (metrics): string =>
      `Streamlined checkout flow will increase overall conversion from ${Math.round(
        metrics.overall_conversion_rate * 100
      )}% to target 15%`,
    generateVariants: (): Variant[] => [
      {
        name: 'Control',
        description: 'Current multi-step checkout',
        changes: ['No changes'],
      },
      {
        name: 'Single-Page Checkout',
        description: 'All checkout steps on one page',
        changes: ['Collapse steps into accordion', 'Inline validation', 'Sticky CTA'],
      },
      {
        name: 'Express Checkout',
        description: 'Apple Pay / Google Pay as primary options',
        changes: ['Prominently display express checkout', 'Defer account creation'],
      },
    ],
  },
];

/**
 * Calculate expected impact based on drop-off rate
 */
function calculateExpectedImpact(
  metrics: FunnelMetrics,
  targetStep: string
): { liftPercent: number; confidence: 'low' | 'medium' | 'high'; rationale: string } {
  const step = metrics.steps.find((s) => s.step_name === targetStep);
  if (!step) {
    return { liftPercent: 10, confidence: 'low', rationale: 'Insufficient data for this step' };
  }

  const dropOffRate = step.drop_off_rate;

  if (dropOffRate > 0.6) {
    return {
      liftPercent: 25,
      confidence: 'high',
      rationale: `Severe drop-off (${Math.round(dropOffRate * 100)}%) indicates clear optimization opportunity with high potential impact`,
    };
  } else if (dropOffRate > 0.3) {
    return {
      liftPercent: 15,
      confidence: 'medium',
      rationale: `Moderate drop-off (${Math.round(dropOffRate * 100)}%) suggests room for improvement with moderate confidence`,
    };
  } else {
    return {
      liftPercent: 8,
      confidence: 'low',
      rationale: `Low drop-off (${Math.round(dropOffRate * 100)}%) - gains possible but marginal`,
    };
  }
}

/**
 * Generate experiment proposals from funnel metrics
 */
export function proposeExperiments(options: ProposalOptions): ExperimentProposal[] {
  const { tenantContext, funnelMetrics, maxProposals = 3 } = options;

  const proposals: ExperimentProposal[] = [];

  // Find applicable templates
  for (const template of experimentTemplates) {
    if (template.appliesTo(funnelMetrics)) {
      // Determine target step
      let targetStep = funnelMetrics.biggest_drop_off_step;
      if (!targetStep) {
        // Find the step with highest drop-off
        let maxDropOff = 0;
        for (const step of funnelMetrics.steps) {
          if (step.drop_off_rate > maxDropOff && step.drop_off_rate < 1) {
            maxDropOff = step.drop_off_rate;
            targetStep = step.step_name;
          }
        }
      }

      if (!targetStep) continue;

      const impact = calculateExpectedImpact(funnelMetrics, targetStep);

      const proposal: ExperimentProposal = {
        ...tenantContext,
        id: generateId(),
        created_at: new Date().toISOString(),
        title: template.name,
        hypothesis: template.generateHypothesis(funnelMetrics),
        funnel_metrics_id: funnelMetrics.id,
        target_step: targetStep,
        experiment_type: template.experimentType,
        effort: {
          level: template.effortLevel,
          days_estimate: template.daysEstimate,
          resources_needed: template.resourcesNeeded,
        },
        expected_impact: {
          metric: 'conversion_rate',
          lift_percent: impact.liftPercent,
          confidence: impact.confidence,
          rationale: impact.rationale,
        },
        suggested_variants: template.generateVariants(funnelMetrics),
        evidence: [
          createEvidence(
            'calculation',
            'funnel_metrics.overall_conversion_rate',
            'Current overall conversion rate',
            Math.round(funnelMetrics.overall_conversion_rate * 100)
          ),
          createEvidence(
            'json_path',
            'steps',
            'Based on funnel step analysis',
            funnelMetrics.steps.length
          ),
          createEvidence(
            'assumption',
            'industry_benchmarks',
            'Expected impact based on industry benchmarks for similar experiments',
            true
          ),
        ],
      };

      proposals.push(proposal);

      if (proposals.length >= maxProposals) {
        break;
      }
    }
  }

  // If no templates matched, create a generic proposal
  if (proposals.length === 0) {
    const targetStep =
      funnelMetrics.biggest_drop_off_step ?? funnelMetrics.steps[0]?.step_name ?? 'unknown';
    const impact = calculateExpectedImpact(funnelMetrics, targetStep);

    proposals.push({
      ...tenantContext,
      id: generateId(),
      created_at: new Date().toISOString(),
      title: 'Funnel Optimization - General Analysis',
      hypothesis: `Analyzing user behavior at ${targetStep} step will reveal optimization opportunities`,
      funnel_metrics_id: funnelMetrics.id,
      target_step: targetStep,
      experiment_type: 'ab_test',
      effort: {
        level: 'medium',
        days_estimate: 7,
        resources_needed: ['analyst', 'product_manager'],
      },
      expected_impact: {
        metric: 'conversion_rate',
        lift_percent: impact.liftPercent,
        confidence: impact.confidence,
        rationale: impact.rationale,
      },
      suggested_variants: [
        {
          name: 'Control',
          description: 'Current experience',
          changes: ['No changes'],
        },
        {
          name: 'To Be Defined',
          description: 'Requires further user research',
          changes: ['Conduct user interviews', 'Analyze session recordings', 'Define testable hypothesis'],
        },
      ],
      evidence: [
        createEvidence(
          'calculation',
          'funnel_metrics.steps',
          'Analysis of all funnel steps',
          funnelMetrics.steps.length
        ),
      ],
    });
  }

  return proposals;
}