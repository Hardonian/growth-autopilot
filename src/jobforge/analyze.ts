import * as fs from 'fs/promises';
import { z } from 'zod';
import { scanSite } from '../seo/index.js';
import { analyzeFunnel } from '../funnel/index.js';
import { proposeExperiments } from '../experiments/index.js';
import { draftContent } from '../content/index.js';
import {
  DEFAULT_SCHEMA_VERSION,
  EventEnvelopeSchema,
  RunManifestSchema,
  SEOAuditSchema,
  type FunnelMetrics,
  FunnelMetricsSchema,
  type ContentDraft,
  type ExperimentProposal,
  type Finding,
  type ReportEnvelope,
  ReportEnvelopeSchema,
  type JobRequestBundle,
  JobRequestBundleSchema,
  type JobRequest,
  type TenantContext,
  TenantContextSchema,
  SeveritySchema,
  stableHash,
  serializeDeterministic,
} from '../contracts/index.js';
import {
  createSEOScanJob,
  createExperimentProposalJob,
  createContentDraftJob,
} from './index.js';

const MODULE_ID = 'growth' as const;
const REPORT_TYPE = 'growth.analysis';
const STABLE_TIME = '2024-01-01T00:00:00.000Z';
const KNOWN_JOB_TYPES = new Set([
  'autopilot.growth.seo_scan',
  'autopilot.growth.experiment_propose',
  'autopilot.growth.content_draft',
  'autopilot.growth.experiment_run',
  'autopilot.growth.publish_content',
]);
const ACTION_JOB_TYPES = new Set([
  'autopilot.growth.experiment_run',
  'autopilot.growth.publish_content',
]);

const AnalyzeInputsSchema = z.object({
  events: z.array(EventEnvelopeSchema).optional(),
  run_manifests: z.array(RunManifestSchema).optional(),
  seo_audit: SEOAuditSchema.optional(),
  seo_scan: z
    .object({
      source_path: z.string().min(1),
      source_type: z.enum(['html_export', 'nextjs_routes']),
    })
    .optional(),
  funnel_metrics: FunnelMetricsSchema.optional(),
  funnel_analysis: z
    .object({
      events_path: z.string().min(1),
      steps: z.array(z.string().min(1)).min(1),
      funnel_name: z.string().min(1).optional(),
    })
    .optional(),
  experiment_proposals: z
    .object({
      funnel_metrics_path: z.string().min(1).optional(),
      max_proposals: z.number().int().positive().optional(),
    })
    .optional(),
  content_draft: z
    .object({
      profile: z.string().min(1),
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
      goal: z.string().min(1),
      keywords: z.array(z.string()).optional(),
      features: z.array(z.string()).optional(),
      audience: z.string().optional(),
      llm_provider: z.string().optional(),
      variants: z.number().int().positive().optional(),
    })
    .optional(),
});

export type AnalyzeInputs = z.infer<typeof AnalyzeInputsSchema>;

export interface AnalyzeOptions {
  tenant_id: string;
  project_id: string;
  trace_id: string;
  stable_output?: boolean;
}

export interface AnalyzeResult {
  reportEnvelope: ReportEnvelope;
  jobRequestBundle: JobRequestBundle;
}

function ensureTenantContext(options: AnalyzeOptions): TenantContext {
  return TenantContextSchema.parse({
    tenant_id: options.tenant_id,
    project_id: options.project_id,
  });
}

function buildFinding(params: Omit<Finding, 'id'> & { id?: string }, stableOutput: boolean, index: number): Finding {
  return {
    id: stableOutput ? `finding-${index + 1}` : params.id ?? `finding-${Date.now()}-${index}`,
    title: params.title,
    description: params.description,
    severity: params.severity,
    evidence: params.evidence,
    related_job_types: params.related_job_types,
  };
}

function buildRecommendation(
  title: string,
  description: string,
  jobType: string | undefined,
  stableOutput: boolean,
  index: number,
  requiresPolicyToken?: boolean
): ReportEnvelope['recommendations'][number] {
  return {
    id: stableOutput ? `recommendation-${index + 1}` : `recommendation-${Date.now()}-${index}`,
    title,
    description,
    job_type: jobType,
    requires_policy_token: requiresPolicyToken,
  };
}

function normalizeJobRequest(job: JobRequest, traceId: string, stableOutput: boolean, index: number): JobRequest {
  const createdAt = stableOutput ? STABLE_TIME : job.created_at;
  const id = stableOutput ? `job-${index + 1}` : job.id;
  const context = {
    ...job.context,
    trace_id: traceId,
  };

  if (stableOutput && context.correlation_id) {
    context.correlation_id = `correlation-${index + 1}`;
  }

  return {
    ...job,
    id,
    created_at: createdAt,
    context,
  };
}

function buildIdempotencyKey(job: JobRequest): string {
  return stableHash({
    tenant_id: job.tenant_id,
    project_id: job.project_id,
    job_type: job.job_type,
    payload: job.payload,
  });
}

function withCanonicalHash<T extends { canonical_hash?: string; canonical_hash_algorithm?: string; canonicalization?: string }>(
  value: Omit<T, 'canonical_hash' | 'canonical_hash_algorithm' | 'canonicalization'>
): T {
  const base = {
    ...value,
    canonicalization: 'sorted_keys' as const,
  };
  const canonical_hash = stableHash(base);
  return {
    ...base,
    canonical_hash,
    canonical_hash_algorithm: 'sha256' as const,
  } as T;
}

function stableSortRequests(requests: JobRequestBundle['requests']): JobRequestBundle['requests'] {
  return [...requests].sort((a, b) => {
    if (a.request.job_type !== b.request.job_type) {
      return a.request.job_type.localeCompare(b.request.job_type);
    }
    return a.idempotency_key.localeCompare(b.idempotency_key);
  });
}

function buildReportSummary(
  seoFindings: number,
  funnelDropOff: string | undefined,
  experimentCount: number,
  contentDrafts: number
): Record<string, unknown> {
  return {
    seo_findings: seoFindings,
    funnel_biggest_drop_off_step: funnelDropOff ?? null,
    experiment_proposals: experimentCount,
    content_drafts: contentDrafts,
  };
}

export async function analyze(inputs: AnalyzeInputs, options: AnalyzeOptions): Promise<AnalyzeResult> {
  const parsedInputs = AnalyzeInputsSchema.parse(inputs);
  const tenantContext = ensureTenantContext(options);
  const stableOutput = options.stable_output ?? false;

  let seoAuditFindings = 0;
  let funnelDropOff: string | undefined;
  let experimentCount = 0;
  let contentDrafts = 0;

  const findings: Finding[] = [];
  const recommendations: ReportEnvelope['recommendations'] = [];
  const jobRequests: JobRequest[] = [];

  let funnelMetricsFromAnalysis: FunnelMetrics | undefined;

  if (parsedInputs.seo_audit || parsedInputs.seo_scan) {
    const audit = parsedInputs.seo_audit
      ?? (await scanSite({
        tenantContext,
        sourceType: parsedInputs.seo_scan?.source_type ?? 'html_export',
        sourcePath: parsedInputs.seo_scan?.source_path ?? './',
      }));
    seoAuditFindings = audit.findings.length;

    findings.push(
      buildFinding(
        {
          title: 'SEO scan findings detected',
          description: `Detected ${audit.findings.length} SEO findings across ${audit.urls_scanned} URLs.`,
          severity: audit.summary.critical > 0 ? SeveritySchema.Enum.critical : SeveritySchema.Enum.warning,
          evidence: audit.findings.slice(0, 3).map((finding) => ({
            type: 'url',
            path: finding.url,
            description: finding.message,
          })),
          related_job_types: ['autopilot.growth.seo_scan'],
        },
        stableOutput,
        findings.length
      )
    );

    if (parsedInputs.seo_scan) {
      jobRequests.push(
        createSEOScanJob(tenantContext, parsedInputs.seo_scan.source_path, parsedInputs.seo_scan.source_type, 'medium', {
          relatedAuditId: stableOutput ? 'audit-stable' : audit.id,
          notes: `SEO scan identified ${audit.findings.length} findings`,
        })
      );
    }
  }

  if (parsedInputs.funnel_metrics || parsedInputs.funnel_analysis) {
    const funnel = parsedInputs.funnel_metrics
      ?? (await analyzeFunnel({
        tenantContext,
        sourceFile: parsedInputs.funnel_analysis?.events_path ?? './',
        funnelName: parsedInputs.funnel_analysis?.funnel_name ?? 'main-funnel',
        steps: parsedInputs.funnel_analysis?.steps ?? [],
      }));

    funnelMetricsFromAnalysis = funnel;
    funnelDropOff = funnel.biggest_drop_off_step;

    findings.push(
      buildFinding(
        {
          title: 'Funnel drop-off identified',
          description: funnel.biggest_drop_off_step
            ? `Biggest drop-off at ${funnel.biggest_drop_off_step} with ${(funnel.steps.find((s) => s.step_name === funnel.biggest_drop_off_step)?.drop_off_rate ?? 0) * 100}% drop-off.`
            : 'No significant drop-off detected in the funnel steps.',
          severity: funnel.biggest_drop_off_step ? SeveritySchema.Enum.warning : SeveritySchema.Enum.info,
          evidence: funnel.evidence.slice(0, 2),
          related_job_types: ['autopilot.growth.experiment_propose'],
        },
        stableOutput,
        findings.length
      )
    );

    if (parsedInputs.funnel_analysis || parsedInputs.funnel_metrics) {
      jobRequests.push(
        createExperimentProposalJob(tenantContext, funnel, 'medium', {
          notes: 'Generate experiment proposals from funnel analysis',
        })
      );
    }
  }

  if (parsedInputs.experiment_proposals) {
    let funnelMetrics: FunnelMetrics | undefined;

    if (parsedInputs.experiment_proposals.funnel_metrics_path) {
      const content = await fs.readFile(parsedInputs.experiment_proposals.funnel_metrics_path, 'utf-8');
      funnelMetrics = FunnelMetricsSchema.parse(JSON.parse(content));
    } else if (funnelMetricsFromAnalysis) {
      funnelMetrics = funnelMetricsFromAnalysis;
    }

    if (funnelMetrics) {
      const proposals: ExperimentProposal[] = proposeExperiments({
        tenantContext,
        funnelMetrics,
        maxProposals: parsedInputs.experiment_proposals.max_proposals,
      });

      experimentCount = proposals.length;

      if (proposals.length > 0) {
        findings.push(
          buildFinding(
            {
              title: 'Experiment proposals generated',
              description: `Generated ${proposals.length} experiment proposal(s) targeting ${funnelMetrics.funnel_name}.`,
              severity: SeveritySchema.Enum.opportunity,
              evidence: proposals.slice(0, 2).map((proposal) => ({
                type: 'json_path',
                path: `proposal:${proposal.id}`,
                description: proposal.title,
              })),
              related_job_types: ['autopilot.growth.experiment_propose'],
            },
            stableOutput,
            findings.length
          )
        );
      }
    }
  }

  if (parsedInputs.content_draft) {
    const draft: ContentDraft = await draftContent({
      tenantContext,
      profileName: parsedInputs.content_draft.profile,
      contentType: parsedInputs.content_draft.content_type,
      goal: parsedInputs.content_draft.goal,
      keywords: parsedInputs.content_draft.keywords ?? [],
      features: parsedInputs.content_draft.features ?? [],
      targetAudience: parsedInputs.content_draft.audience,
      llmProvider: parsedInputs.content_draft.llm_provider,
      variantCount: parsedInputs.content_draft.variants ?? 1,
    });

    contentDrafts = draft.variant_count;

    findings.push(
      buildFinding(
        {
          title: 'Content draft prepared',
          description: `Drafted ${draft.content_type} content using ${draft.profile_used} profile.`,
          severity: SeveritySchema.Enum.info,
          evidence: draft.evidence.slice(0, 2),
          related_job_types: ['autopilot.growth.content_draft'],
        },
        stableOutput,
        findings.length
      )
    );

    jobRequests.push(
      createContentDraftJob(
        tenantContext,
        parsedInputs.content_draft.profile,
        parsedInputs.content_draft.content_type,
        parsedInputs.content_draft.goal,
        'medium',
        {
          keywords: parsedInputs.content_draft.keywords,
          features: parsedInputs.content_draft.features,
          targetAudience: parsedInputs.content_draft.audience,
          useLLM: Boolean(parsedInputs.content_draft.llm_provider),
          llmProvider: parsedInputs.content_draft.llm_provider,
          notes: `Draft ${parsedInputs.content_draft.content_type} content`,
        }
      )
    );
  }

  let recommendationIndex = 0;
  for (const job of jobRequests) {
    const requiresPolicyToken = ACTION_JOB_TYPES.has(job.job_type);
    recommendations.push(
      buildRecommendation(
        `Queue ${job.job_type} request`,
        `Submit JobForge request for ${job.job_type}.`,
        job.job_type,
        stableOutput,
        recommendationIndex,
        requiresPolicyToken
      )
    );
    recommendationIndex += 1;
  }

  const reportEnvelope = withCanonicalHash<ReportEnvelope>({
    schema_version: DEFAULT_SCHEMA_VERSION,
    module_id: MODULE_ID,
    report_id: stableOutput ? 'report-stable' : `report-${Date.now()}`,
    tenant_id: tenantContext.tenant_id,
    project_id: tenantContext.project_id,
    trace_id: options.trace_id,
    created_at: stableOutput ? STABLE_TIME : new Date().toISOString(),
    report_type: REPORT_TYPE,
    summary: buildReportSummary(seoAuditFindings, funnelDropOff, experimentCount, contentDrafts),
    findings,
    recommendations,
    inputs: {
      event_count: parsedInputs.events?.length ?? 0,
      run_manifest_count: parsedInputs.run_manifests?.length ?? 0,
      notes: [
        parsedInputs.seo_scan ? 'seo_scan' : undefined,
        parsedInputs.funnel_analysis ? 'funnel_analysis' : undefined,
        parsedInputs.experiment_proposals ? 'experiment_proposals' : undefined,
        parsedInputs.content_draft ? 'content_draft' : undefined,
      ].filter((note): note is string => Boolean(note)),
    },
  });

  const normalizedJobs = jobRequests.map((job, index) => normalizeJobRequest(job, options.trace_id, stableOutput, index));
  const requestItems: JobRequestBundle['requests'] = normalizedJobs.map((job) => ({
    idempotency_key: buildIdempotencyKey(job),
    request: job,
    job_type_status: (KNOWN_JOB_TYPES.has(job.job_type) ? 'available' : 'unavailable'),
    requires_policy_token: ACTION_JOB_TYPES.has(job.job_type),
  }));

  const jobRequestBundle = withCanonicalHash<JobRequestBundle>({
    schema_version: DEFAULT_SCHEMA_VERSION,
    module_id: MODULE_ID,
    bundle_id: stableOutput ? 'bundle-stable' : `bundle-${Date.now()}`,
    tenant_id: tenantContext.tenant_id,
    project_id: tenantContext.project_id,
    trace_id: options.trace_id,
    created_at: stableOutput ? STABLE_TIME : new Date().toISOString(),
    requests: stableSortRequests(requestItems),
  });

  ReportEnvelopeSchema.parse(reportEnvelope);
  JobRequestBundleSchema.parse(jobRequestBundle);

  return {
    reportEnvelope,
    jobRequestBundle,
  };
}

export function validateBundle(bundle: unknown): { success: boolean; errors?: string[] } {
  const parsed = JobRequestBundleSchema.safeParse(bundle);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.errors.map((err) => err.message) };
  }

  const errors: string[] = [];
  const { tenant_id, project_id, requests, schema_version } = parsed.data;

  if (schema_version !== DEFAULT_SCHEMA_VERSION) {
    errors.push(`Unsupported schema_version: ${schema_version}`);
  }

  for (const request of requests) {
    if (request.request.tenant_id !== tenant_id || request.request.project_id !== project_id) {
      errors.push('Request tenant_id/project_id must match bundle.');
    }
    if (!request.idempotency_key) {
      errors.push('Request idempotency_key is required.');
    }
    if (!KNOWN_JOB_TYPES.has(request.request.job_type) && request.job_type_status !== 'unavailable') {
      errors.push('Unknown job_type must be marked as unavailable.');
    }
    if (ACTION_JOB_TYPES.has(request.request.job_type) && request.requires_policy_token !== true) {
      errors.push('Action job_type requires_policy_token=true.');
    }
  }

  return errors.length > 0 ? { success: false, errors } : { success: true };
}

export function renderReport(report: ReportEnvelope, format: 'md' | 'json' = 'md'): string {
  if (format === 'json') {
    return serializeDeterministic(report);
  }

  const lines: string[] = [];
  lines.push(`# Growth Autopilot Report`);
  lines.push('');
  lines.push(`- Report ID: ${report.report_id}`);
  lines.push(`- Tenant: ${report.tenant_id}`);
  lines.push(`- Project: ${report.project_id}`);
  lines.push(`- Trace: ${report.trace_id}`);
  lines.push(`- Created At: ${report.created_at}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  const summaryEntries = Object.entries(report.summary);
  for (const [key, value] of summaryEntries) {
    let displayValue: string;
    if (value === null || value === undefined) {
      displayValue = 'n/a';
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      displayValue = String(value);
    } else {
      displayValue = JSON.stringify(value);
    }
    lines.push(`- ${key}: ${displayValue}`);
  }
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  if (report.findings.length === 0) {
    lines.push('- No findings reported.');
  } else {
    for (const finding of report.findings) {
      lines.push(`- **${finding.title}** (${finding.severity})`);
      lines.push(`  - ${finding.description}`);
    }
  }
  lines.push('');
  lines.push('## Recommendations');
  lines.push('');
  if (report.recommendations.length === 0) {
    lines.push('- No recommendations generated.');
  } else {
    for (const recommendation of report.recommendations) {
      const policyNote = recommendation.requires_policy_token ? ' (requires policy token)' : '';
      lines.push(`- **${recommendation.title}**${policyNote}`);
      lines.push(`  - ${recommendation.description}`);
    }
  }

  lines.push('');
  lines.push('## Safety');
  lines.push('');
  lines.push('- Runnerless module: emits dry-run job requests only.');
  lines.push('- JobForge policy tokens required for action jobs.');

  return lines.join('\n');
}

export function parseAnalyzeInputs(raw: string): AnalyzeInputs {
  return AnalyzeInputsSchema.parse(JSON.parse(raw));
}

export function toCanonicalJson(value: unknown): string {
  return serializeDeterministic(value);
}

export function analyzeInputsSchema(): typeof AnalyzeInputsSchema {
  return AnalyzeInputsSchema;
}
