import { z } from 'zod';
import { analyze, type AnalyzeInputs } from './jobforge/analyze.js';
import {
  type EvidenceLink,
  createCapabilityMetadata,
  stableHash,
  serializeDeterministic,
} from '../contracts/index.js';
import { toErrorEnvelope } from '../lib/error-envelope.js';

/**
 * Runner Contract for ControlPlane integration
 */
export interface RunnerContract {
  id: string;
  version: string;
  capabilities: string[];
  blastRadius: 'low' | 'medium' | 'high';
  execute(input: RunnerInput): Promise<RunnerResult>;
}

/**
 * Input schema for runner execution
 */
export const RunnerInputSchema = z.object({
  tenant_id: z.string().min(1),
  project_id: z.string().min(1),
  trace_id: z.string().min(1),
  inputs: z.record(z.unknown()),
  capabilities: z.array(z.string()).optional(),
});

export type RunnerInput = z.infer<typeof RunnerInputSchema>;

/**
 * Result schema for runner execution
 */
export const RunnerResultSchema = z.object({
  status: z.enum(['success', 'degraded', 'error']),
  output: z.record(z.unknown()).optional(),
  evidence: z.array(z.object({
    type: z.string(),
    path: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    description: z.string(),
    timestamp: z.string().datetime(),
  })),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  }).optional(),
});

export type RunnerResult = z.infer<typeof RunnerResultSchema>;

/**
 * Evidence packet for comprehensive tracking
 */
export interface EvidencePacket {
  schema_version: string;
  packet_id: string;
  runner_id: string;
  runner_version: string;
  tenant_id: string;
  project_id: string;
  trace_id: string;
  created_at: string;
  inputs: RunnerInput;
  decisions: Record<string, unknown>;
  outputs: Record<string, unknown>;
  evidence_links: EvidenceLink[];
  canonical_hash: string;
  canonical_hash_algorithm: 'sha256';
  canonicalization: 'sorted_keys';
}

/**
 * Growth Autopilot Runner Implementation
 */
export class GrowthAutopilotRunner implements RunnerContract {
  readonly id = 'growth-autopilot';
  readonly version = '0.1.0';
  readonly capabilities = [
    'seo_analysis',
    'funnel_analysis',
    'experiment_proposal',
    'content_drafting',
    'jobforge_integration'
  ];
  readonly blastRadius = 'low' as const;

  async execute(input: RunnerInput): Promise<RunnerResult> {
    const startTime = new Date().toISOString();
    const evidence: RunnerResult['evidence'] = [];
    const decisions: Record<string, unknown> = {};

    try {
      // Validate input
      const validatedInput = RunnerInputSchema.parse(input);
      evidence.push({
        type: 'validation',
        path: 'input',
        description: 'Input validation successful',
        timestamp: startTime,
      });

      // Convert to analyze inputs
      const analyzeInputs = this.convertToAnalyzeInputs(validatedInput.inputs);
      decisions['analyze_inputs'] = analyzeInputs;

      // Execute analysis
      const result = await analyze(analyzeInputs, {
        tenant_id: validatedInput.tenant_id,
        project_id: validatedInput.project_id,
        trace_id: validatedInput.trace_id,
        stable_output: true,
      });

      decisions['analysis_result'] = {
        report_generated: true,
        bundle_generated: true,
        maturity_report_generated: true,
      };

      evidence.push({
        type: 'execution',
        path: 'analyze',
        description: 'Executed growth analysis and generated reports and job bundles',
        timestamp: new Date().toISOString(),
      });

      // Generate evidence packet
      const evidencePacket = this.createEvidencePacket(validatedInput, decisions, result, evidence);

      return {
        status: 'success',
        output: {
          report: result.reportEnvelope,
          bundle: result.jobRequestBundle,
          maturity_report: result.runnerMaturityReport,
          evidence_packet: evidencePacket,
        },
        evidence,
      };

    } catch (error) {
      const errorEnvelope = toErrorEnvelope(error);
      evidence.push({
        type: 'error',
        path: 'execution',
        description: `Execution failed: ${errorEnvelope.code}`,
        timestamp: new Date().toISOString(),
      });



      return {
        status: 'error',
        evidence,
        error: {
          code: errorEnvelope.code,
          message: errorEnvelope.userMessage,
          retryable: errorEnvelope.retryable,
        },
      };
    }
  }

  private convertToAnalyzeInputs(inputs: Record<string, unknown>): AnalyzeInputs {
    // Convert generic inputs to typed analyze inputs
    // This is a simplified conversion - in practice would need more robust mapping
    return inputs as any;
  }

  private createEvidencePacket(
    input: RunnerInput,
    decisions: Record<string, unknown>,
    result: any,
    evidence: RunnerResult['evidence']
  ): EvidencePacket {
    const packet: Omit<EvidencePacket, 'canonical_hash'> = {
      schema_version: '2024-09-01',
      packet_id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      runner_id: this.id,
      runner_version: this.version,
      tenant_id: input.tenant_id,
      project_id: input.project_id,
      trace_id: input.trace_id,
      created_at: new Date().toISOString(),
      inputs: input,
      decisions,
      outputs: {
        report: result.reportEnvelope,
        bundle: result.jobRequestBundle,
        maturity_report: result.runnerMaturityReport,
      },
      evidence_links: evidence.map(e => ({
        type: e.type as any,
        path: e.path,
        value: e.value,
        description: e.description,
      })),
      canonical_hash_algorithm: 'sha256',
      canonicalization: 'sorted_keys',
    };

    // Calculate canonical hash
    const canonical = {
      ...packet,
      canonical_hash: '', // placeholder
    };
    const canonicalJson = serializeDeterministic(canonical);
    const hash = stableHash(canonicalJson);

    return {
      ...packet,
      canonical_hash: hash,
    };
  }
}

// Export singleton instance
export const growthAutopilotRunner = new GrowthAutopilotRunner();

// Export for ControlPlane consumption
export const runnerContract: RunnerContract = growthAutopilotRunner;
export const capabilityMetadata = createCapabilityMetadata(
  growthAutopilotRunner.id,
  [
    'autopilot.growth.seo_scan',
    'autopilot.growth.experiment_propose',
    'autopilot.growth.content_draft',
    'autopilot.growth.experiment_run',
    'autopilot.growth.publish_content',
  ],
  { version: growthAutopilotRunner.version }
);