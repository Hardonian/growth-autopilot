#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { scanSite } from './seo/index.js';
import { analyzeFunnel } from './funnel/index.js';
import { proposeExperiments } from './experiments/index.js';
import { draftContent } from './content/index.js';
import {
  createSEOScanJob,
  createExperimentProposalJob,
  createContentDraftJob,
  serializeJobRequest,
} from './jobforge/index.js';
import { TenantContextSchema, serializeDeterministic } from './contracts/index.js';
import { analyze, parseAnalyzeInputs, renderReport, type AnalyzeInputs } from './jobforge/analyze.js';
import { Logger } from './lib/logger.js';
import { toErrorEnvelope } from './lib/error-envelope.js';
import { ArtifactWriter, generateRunId } from './lib/artifacts.js';
import {
  EXIT_SUCCESS,
  classifyError,
  ValidationError,
} from './lib/exit-codes.js';

const program = new Command();

program
  .name('growth')
  .description('Runnerless growth autopilot for SEO audits, funnel analysis, and content drafting')
  .version('0.1.0');

// ============================================================================
// Shared types
// ============================================================================

interface BaseOptions {
  tenant?: string;
  project?: string;
  json?: boolean;
  config?: string;
  dryRun?: boolean;
  out?: string;
}

// ============================================================================
// Shared helpers
// ============================================================================

function createLogger(options: { json?: boolean }): Logger {
  return new Logger({ json: options.json });
}

function validateTenantContext(options: BaseOptions): { tenant_id: string; project_id: string } {
  const tenantId = options.tenant ?? process.env.GROWTH_TENANT_ID;
  const projectId = options.project ?? process.env.GROWTH_PROJECT_ID;

  if (typeof tenantId !== 'string' || tenantId.length === 0 || typeof projectId !== 'string' || projectId.length === 0) {
    throw new ValidationError(
      'tenant_id and project_id are required. Provide via --tenant/--project flags or GROWTH_TENANT_ID/GROWTH_PROJECT_ID env vars.'
    );
  }

  const context = { tenant_id: tenantId, project_id: projectId };
  const result = TenantContextSchema.safeParse(context);

  if (!result.success) {
    throw new ValidationError(`Invalid tenant context: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }

  return context;
}

/**
 * Standard error handler for all commands.
 * Wraps errors in ErrorEnvelope, logs structured output, exits with correct code.
 */
function handleError(error: unknown, log: Logger): never {
  const envelope = toErrorEnvelope(error);
  const exitCode = classifyError(error);

  log.error(envelope.userMessage, {
    code: envelope.code,
    retryable: envelope.retryable,
    ...(process.env.DEBUG ? { cause: envelope.cause } : {}),
  });

  if (log['jsonMode']) {
    process.stderr.write(JSON.stringify(envelope) + '\n');
  }

  process.exit(exitCode);
}

// ============================================================================
// plan command — dry-run; no side effects
// ============================================================================

interface PlanOptions extends BaseOptions {
  inputs?: string;
  trace?: string;
  smoke?: boolean;
  stableOutput?: boolean;
}

program
  .command('plan')
  .description('Dry-run: generate plan + artifacts without network writes')
  .option('--config <path>', 'Path to config file')
  .option('--inputs <path>', 'Path to analysis input JSON')
  .option('--tenant <id>', 'Tenant ID (or GROWTH_TENANT_ID env var)')
  .option('--project <id>', 'Project ID (or GROWTH_PROJECT_ID env var)')
  .option('--trace <id>', 'Trace ID for correlation')
  .option('--out <dir>', 'Output directory', './artifacts')
  .option('--json', 'Output structured JSON logs', false)
  .option('--dry-run', 'Dry-run mode (always true for plan)', true)
  .option('--smoke', 'Use built-in smoke test data', false)
  .option('--stable-output', 'Remove nondeterministic fields', false)
  .action(async (options: PlanOptions) => {
    const log = createLogger(options);
    const startedAt = new Date().toISOString();

    try {
      const tenantContext = options.smoke
        ? { tenant_id: 'smoke-test', project_id: 'smoke' }
        : validateTenantContext(options);
      const traceId = options.trace ?? `plan-${Date.now()}`;

      const runId = generateRunId(`plan-${tenantContext.tenant_id}-${tenantContext.project_id}-${traceId}`);
      const artifacts = new ArtifactWriter(runId, options.out);
      await artifacts.init();

      log.info(`Plan started`, { runId, tenant: tenantContext.tenant_id, project: tenantContext.project_id });

      let inputsContent: string;
      if (options.smoke) {
        // Use built-in fixture for smoke test
        inputsContent = await fs.readFile(path.resolve('fixtures/jobforge/inputs.json'), 'utf-8');
        log.info('Using built-in smoke test inputs');
      } else if (options.inputs) {
        inputsContent = await fs.readFile(options.inputs, 'utf-8');
      } else {
        throw new ValidationError('Either --inputs <path> or --smoke is required for plan');
      }

      const parsedInputs = parseAnalyzeInputs(inputsContent);

      const result = await analyze(parsedInputs, {
        tenant_id: tenantContext.tenant_id,
        project_id: tenantContext.project_id,
        trace_id: traceId,
        stable_output: options.stableOutput ?? false,
      });

      // Write evidence artifacts
      await artifacts.writeEvidence('request-bundle', result.jobRequestBundle);
      await artifacts.writeEvidence('report', result.reportEnvelope);
      await artifacts.writeEvidence('runner-maturity', result.runnerMaturityReport);

      log.info('Plan complete', {
        jobRequests: result.jobRequestBundle.requests.length,
        findings: result.reportEnvelope.findings.length,
      });

      await artifacts.writeLogs(log.getEntries());
      await artifacts.writeSummary('plan', {
        inputs: options.inputs ?? 'smoke',
        smoke: options.smoke ?? false,
        dryRun: true,
      }, startedAt, 'success');

      log.info(`Artifacts written to ${artifacts.getDir()}`);
      process.exit(EXIT_SUCCESS);
    } catch (error) {
      handleError(error, log);
    }
  });

// ============================================================================
// run command — execute pipeline with optional --smoke
// ============================================================================

interface RunOptions extends BaseOptions {
  inputs?: string;
  trace?: string;
  smoke?: boolean;
  stableOutput?: boolean;
}

program
  .command('run')
  .description('Execute the growth pipeline and emit artifacts')
  .option('--config <path>', 'Path to config file')
  .option('--inputs <path>', 'Path to analysis input JSON')
  .option('--tenant <id>', 'Tenant ID (or GROWTH_TENANT_ID env var)')
  .option('--project <id>', 'Project ID (or GROWTH_PROJECT_ID env var)')
  .option('--trace <id>', 'Trace ID for correlation')
  .option('--out <dir>', 'Output directory', './artifacts')
  .option('--json', 'Output structured JSON logs', false)
  .option('--dry-run', 'Skip external writes', false)
  .option('--smoke', 'Run smoke test with built-in data', false)
  .option('--stable-output', 'Remove nondeterministic fields', false)
  .action(async (options: RunOptions) => {
    const log = createLogger(options);
    const startedAt = new Date().toISOString();

    try {
      const tenantContext = options.smoke
        ? { tenant_id: 'smoke-test', project_id: 'smoke' }
        : validateTenantContext(options);
      const traceId = options.trace ?? `run-${Date.now()}`;

      const runId = generateRunId(`run-${tenantContext.tenant_id}-${tenantContext.project_id}-${traceId}`);
      const artifacts = new ArtifactWriter(runId, options.out);
      await artifacts.init();

      log.info('Run started', { runId, tenant: tenantContext.tenant_id, project: tenantContext.project_id, smoke: options.smoke ?? false });

      let inputsContent: string;
      if (options.smoke) {
        inputsContent = await fs.readFile(path.resolve('fixtures/jobforge/inputs.json'), 'utf-8');
        log.info('Using built-in smoke test inputs');
      } else if (options.inputs) {
        inputsContent = await fs.readFile(options.inputs, 'utf-8');
      } else {
        throw new ValidationError('Either --inputs <path> or --smoke is required for run');
      }

      const parsedInputs = parseAnalyzeInputs(inputsContent);

      const result = await analyze(parsedInputs, {
        tenant_id: tenantContext.tenant_id,
        project_id: tenantContext.project_id,
        trace_id: traceId,
        stable_output: options.stableOutput ?? false,
      });

      // Write evidence artifacts
      await artifacts.writeEvidence('request-bundle', result.jobRequestBundle);
      await artifacts.writeEvidence('report', result.reportEnvelope);
      await artifacts.writeEvidence('runner-maturity', result.runnerMaturityReport);

      // Write human-readable report
      const reportMd = renderReport(result.reportEnvelope, 'md');
      await artifacts.writeEvidence('report-md', reportMd);

      log.info('Run complete', {
        jobRequests: result.jobRequestBundle.requests.length,
        findings: result.reportEnvelope.findings.length,
        dryRun: options.dryRun ?? false,
      });

      await artifacts.writeLogs(log.getEntries());
      await artifacts.writeSummary('run', {
        inputs: options.inputs ?? 'smoke',
        smoke: options.smoke ?? false,
        dryRun: options.dryRun ?? false,
      }, startedAt, 'success');

      log.info(`Artifacts written to ${artifacts.getDir()}`);
      process.exit(EXIT_SUCCESS);
    } catch (error) {
      handleError(error, log);
    }
  });

// ============================================================================
// seo-scan command
// ============================================================================

interface SEOScanOptions extends BaseOptions {
  path: string;
  type: 'html_export' | 'nextjs_routes';
  output: string;
  jobforge: boolean;
}

program
  .command('seo-scan')
  .description('Scan site structure for SEO issues')
  .requiredOption('--path <path>', 'Path to HTML export or Next.js routes')
  .option('--type <type>', 'Source type: html_export or nextjs_routes', 'html_export')
  .option('--tenant <id>', 'Tenant ID (or GROWTH_TENANT_ID env var)')
  .option('--project <id>', 'Project ID (or GROWTH_PROJECT_ID env var)')
  .option('--output <path>', 'Output file path', './seo-audit.json')
  .option('--json', 'Output structured JSON logs', false)
  .option('--dry-run', 'Dry-run mode', false)
  .option('--jobforge', 'Also generate JobForge job request', false)
  .action(async (options: SEOScanOptions) => {
    const log = createLogger(options);
    try {
      const tenantContext = validateTenantContext(options);

      log.info(`Scanning ${options.type} at ${options.path}...`);

      const audit = await scanSite({
        tenantContext,
        sourceType: options.type,
        sourcePath: options.path,
      });

      await fs.writeFile(options.output, JSON.stringify(audit, null, 2));
      log.info(`SEO audit written to ${options.output}`);
      log.info(`Summary: ${audit.urls_scanned} URLs, ${audit.summary.critical} critical, ${audit.summary.warning} warnings, ${audit.summary.info} info, ${audit.summary.opportunity} opportunities`);

      if (options.jobforge) {
        const job = createSEOScanJob(tenantContext, options.path, options.type, 'medium', {
          relatedAuditId: audit.id,
          notes: `SEO scan completed with ${audit.findings.length} findings`,
        });
        const jobPath = options.output.replace('.json', '-job.json');
        await fs.writeFile(jobPath, serializeJobRequest(job));
        log.info(`JobForge request written to ${jobPath}`);
      }

      process.exit(EXIT_SUCCESS);
    } catch (error) {
      handleError(error, log);
    }
  });

// ============================================================================
// funnel command
// ============================================================================

interface FunnelOptions extends BaseOptions {
  events: string;
  steps: string;
  name: string;
  output: string;
}

program
  .command('funnel')
  .description('Analyze event funnel from JSON export')
  .requiredOption('--events <path>', 'Path to events JSON file')
  .requiredOption('--steps <steps>', 'Comma-separated funnel step event names')
  .option('--name <name>', 'Funnel name', 'main-funnel')
  .option('--tenant <id>', 'Tenant ID (or GROWTH_TENANT_ID env var)')
  .option('--project <id>', 'Project ID (or GROWTH_PROJECT_ID env var)')
  .option('--output <path>', 'Output file path', './funnel-metrics.json')
  .option('--json', 'Output structured JSON logs', false)
  .option('--dry-run', 'Dry-run mode', false)
  .action(async (options: FunnelOptions) => {
    const log = createLogger(options);
    try {
      const tenantContext = validateTenantContext(options);
      const steps = options.steps.split(',').map((s: string) => s.trim());

      log.info(`Analyzing funnel: ${options.name}`);
      log.info(`Steps: ${steps.join(' → ')}`);

      const metrics = await analyzeFunnel({
        tenantContext,
        sourceFile: options.events,
        funnelName: options.name,
        steps,
      });

      await fs.writeFile(options.output, JSON.stringify(metrics, null, 2));
      log.info(`Funnel metrics written to ${options.output}`);
      log.info(`Results: ${metrics.total_entrances} entrances, ${metrics.total_conversions} conversions, ${(metrics.overall_conversion_rate * 100).toFixed(1)}% conversion`);

      if (metrics.biggest_drop_off_step) {
        const dropOffStep = metrics.steps.find((s) => s.step_name === metrics.biggest_drop_off_step);
        log.info(`Biggest drop-off: ${metrics.biggest_drop_off_step} (${(dropOffStep?.drop_off_rate ?? 0) * 100}%)`);
      }

      for (const step of metrics.steps) {
        log.info(`  ${step.step_name}: ${step.unique_users} users (${Math.round(step.drop_off_rate * 100)}% drop-off)`);
      }

      process.exit(EXIT_SUCCESS);
    } catch (error) {
      handleError(error, log);
    }
  });

// ============================================================================
// propose-experiments command
// ============================================================================

interface ProposeOptions extends BaseOptions {
  funnel: string;
  max: string;
  output: string;
  jobforge: boolean;
}

program
  .command('propose-experiments')
  .description('Generate experiment proposals from funnel metrics')
  .requiredOption('--funnel <path>', 'Path to funnel metrics JSON file')
  .option('--max <n>', 'Maximum number of proposals', '3')
  .option('--tenant <id>', 'Tenant ID (or GROWTH_TENANT_ID env var)')
  .option('--project <id>', 'Project ID (or GROWTH_PROJECT_ID env var)')
  .option('--output <path>', 'Output file path', './experiment-proposals.json')
  .option('--json', 'Output structured JSON logs', false)
  .option('--dry-run', 'Dry-run mode', false)
  .option('--jobforge', 'Also generate JobForge job request', false)
  .action(async (options: ProposeOptions) => {
    const log = createLogger(options);
    try {
      const tenantContext = validateTenantContext(options);

      const funnelData = await fs.readFile(options.funnel, 'utf-8');
      const funnelMetrics = JSON.parse(funnelData) as unknown;

      log.info(`Generating experiment proposals from ${options.funnel}...`);

      const proposals = proposeExperiments({
        tenantContext,
        funnelMetrics: funnelMetrics as Parameters<typeof proposeExperiments>[0]['funnelMetrics'],
        maxProposals: parseInt(options.max, 10),
      });

      await fs.writeFile(options.output, JSON.stringify(proposals, null, 2));
      log.info(`${proposals.length} experiment proposal(s) written to ${options.output}`);

      for (let i = 0; i < proposals.length; i++) {
        const p = proposals[i];
        log.info(`${i + 1}. ${p.title} — ${p.hypothesis} (effort: ${p.effort.level}, impact: +${p.expected_impact.lift_percent}%)`);
      }

      if (options.jobforge && proposals.length > 0) {
        const job = createExperimentProposalJob(tenantContext, funnelMetrics as Parameters<typeof proposeExperiments>[0]['funnelMetrics'], 'medium', {
          notes: `${proposals.length} experiment proposals generated`,
        });
        const jobPath = options.output.replace('.json', '-job.json');
        await fs.writeFile(jobPath, serializeJobRequest(job));
        log.info(`JobForge request written to ${jobPath}`);
      }

      process.exit(EXIT_SUCCESS);
    } catch (error) {
      handleError(error, log);
    }
  });

// ============================================================================
// draft-content command
// ============================================================================

interface DraftContentOptions extends BaseOptions {
  profile: string;
  type: string;
  goal: string;
  keywords?: string;
  features?: string;
  audience?: string;
  llm?: string;
  variants: string;
  output: string;
  jobforge: boolean;
}

program
  .command('draft-content')
  .description('Draft content using profile (template-based, no LLM by default)')
  .requiredOption('--profile <name>', 'Profile name (e.g., base, readylayer, jobforge)')
  .requiredOption('--type <type>', 'Content type: landing_page, onboarding_email, changelog_note, blog_post, meta_description, title_tag, og_copy, ad_copy')
  .requiredOption('--goal <goal>', 'Content goal/description')
  .option('--keywords <words>', 'Comma-separated keywords')
  .option('--features <list>', 'Comma-separated feature names')
  .option('--audience <desc>', 'Target audience description')
  .option('--llm <provider>', 'Use LLM for enhancement (optional)')
  .option('--variants <n>', 'Number of variants to generate', '1')
  .option('--tenant <id>', 'Tenant ID (or GROWTH_TENANT_ID env var)')
  .option('--project <id>', 'Project ID (or GROWTH_PROJECT_ID env var)')
  .option('--output <path>', 'Output file path', './content-draft.json')
  .option('--json', 'Output structured JSON logs', false)
  .option('--dry-run', 'Dry-run mode', false)
  .option('--jobforge', 'Also generate JobForge job request', false)
  .action(async (options: DraftContentOptions) => {
    const log = createLogger(options);
    try {
      const tenantContext = validateTenantContext(options);

      const keywords = options.keywords?.split(',').map((s: string) => s.trim()) ?? [];
      const features = options.features?.split(',').map((s: string) => s.trim()) ?? [];

      log.info(`Drafting ${options.type} using profile: ${options.profile}`);

      const draft = await draftContent({
        tenantContext,
        profileName: options.profile,
        contentType: options.type as Parameters<typeof draftContent>[0]['contentType'],
        goal: options.goal,
        keywords,
        features,
        targetAudience: options.audience,
        llmProvider: options.llm,
        variantCount: parseInt(options.variants, 10),
      });

      await fs.writeFile(options.output, JSON.stringify(draft, null, 2));
      log.info(`Content draft written to ${options.output}`);

      if (draft.draft.headline) {
        log.info(`Headline: ${draft.draft.headline}`);
      }
      if (draft.draft.subject_line) {
        log.info(`Subject: ${draft.draft.subject_line}`);
      }
      log.info(`Body length: ${draft.draft.body.length} characters`);
      if (draft.draft.cta) {
        log.info(`CTA: ${draft.draft.cta}`);
      }

      if (options.jobforge) {
        const job = createContentDraftJob(
          tenantContext,
          options.profile,
          options.type as Parameters<typeof draftContent>[0]['contentType'],
          options.goal,
          'medium',
          {
            keywords,
            features,
            targetAudience: options.audience,
            useLLM: typeof options.llm === 'string' && options.llm.length > 0,
            llmProvider: options.llm,
            notes: `Content draft for ${options.type}`,
          }
        );
        const jobPath = options.output.replace('.json', '-job.json');
        await fs.writeFile(jobPath, serializeJobRequest(job));
        log.info(`JobForge request written to ${jobPath}`);
      }

      process.exit(EXIT_SUCCESS);
    } catch (error) {
      handleError(error, log);
    }
  });

// ============================================================================
// analyze command (preserved for backwards compat)
// ============================================================================

interface AnalyzeOptions extends BaseOptions {
  inputs: string;
  trace: string;
  stableOutput: boolean;
  renderMd: boolean;
}

program
  .command('analyze')
  .description('Generate JobForge-compatible request bundle and report (dry-run)')
  .requiredOption('--inputs <path>', 'Path to analysis input JSON')
  .requiredOption('--tenant <id>', 'Tenant ID (or GROWTH_TENANT_ID env var)')
  .requiredOption('--project <id>', 'Project ID (or GROWTH_PROJECT_ID env var)')
  .requiredOption('--trace <id>', 'Trace ID for JobForge correlation')
  .option('--out <dir>', 'Output directory', './jobforge-output')
  .option('--json', 'Output structured JSON logs', false)
  .option('--dry-run', 'Dry-run mode', false)
  .option('--stable-output', 'Remove nondeterministic fields for fixtures/docs', false)
  .option('--no-render-md', 'Skip Markdown report rendering')
  .action(async (options: AnalyzeOptions) => {
    const log = createLogger(options);
    try {
      const tenantContext = validateTenantContext(options);
      const inputsContent = await fs.readFile(options.inputs, 'utf-8');
      const parsedInputs = parseAnalyzeInputs(inputsContent);

      const result = await analyze(parsedInputs, {
        tenant_id: tenantContext.tenant_id,
        project_id: tenantContext.project_id,
        trace_id: options.trace,
        stable_output: options.stableOutput,
      });

      const outDir = options.out ?? './jobforge-output';
      await fs.mkdir(outDir, { recursive: true });

      const requestBundlePath = path.join(outDir, 'request-bundle.json');
      const reportPath = path.join(outDir, 'report.json');
      const reportMdPath = path.join(outDir, 'report.md');
      const runnerMaturityPath = path.join(outDir, 'runner-maturity.json');

      await fs.writeFile(requestBundlePath, serializeDeterministic(result.jobRequestBundle));
      await fs.writeFile(reportPath, serializeDeterministic(result.reportEnvelope));
      await fs.writeFile(runnerMaturityPath, serializeDeterministic(result.runnerMaturityReport));

      if (options.renderMd) {
        await fs.writeFile(reportMdPath, renderReport(result.reportEnvelope, 'md'));
      }

      log.info(`JobForge request bundle written to ${requestBundlePath}`);
      log.info(`Report written to ${reportPath}`);
      log.info(`Runner maturity report written to ${runnerMaturityPath}`);
      if (options.renderMd) {
        log.info(`Markdown report written to ${reportMdPath}`);
      }

      process.exit(EXIT_SUCCESS);
    } catch (error) {
      handleError(error, log);
    }
  });

// ============================================================================
// demo command — deterministic demo run for ControlPlane integration
// ============================================================================

program
  .command('demo')
  .description('Run a deterministic demo of the growth autopilot runner')
  .option('--json', 'Output structured JSON logs', false)
  .action(async (options: { json?: boolean }) => {
    const log = createLogger(options);
    try {
      // Use fixed demo context (no external secrets required)
      const demoTenantId = 'demo-tenant';
      const demoProjectId = 'demo-project';
      const demoTraceId = 'demo-trace-123';

      log.info('Starting growth autopilot demo run...');

      // Create deterministic demo inputs
      const demoInputs: AnalyzeInputs = {
        content_draft: {
          profile: 'jobforge',
          content_type: 'onboarding_email',
          goal: 'Welcome new users to the platform',
          keywords: ['automation', 'workflows'],
          features: ['Visual designer', 'JobForge integration'],
          audience: 'Development teams',
        },
      };

      log.info('Running analysis with demo inputs...');

      const result = await analyze(demoInputs, {
        tenant_id: demoTenantId,
        project_id: demoProjectId,
        trace_id: demoTraceId,
        stable_output: true,
      });

      log.info('Demo analysis completed successfully');
      log.info(`Generated ${result.jobRequestBundle.requests.length} job requests`);
      log.info(`Found ${result.reportEnvelope.findings.length} findings`);
      log.info(`Created ${result.reportEnvelope.recommendations.length} recommendations`);

      // Output summary in JSON for ControlPlane consumption
      const summary = {
        status: 'success',
        demo_tenant_id: demoTenantId,
        demo_project_id: demoProjectId,
        demo_trace_id: demoTraceId,
        job_requests_count: result.jobRequestBundle.requests.length,
        findings_count: result.reportEnvelope.findings.length,
        recommendations_count: result.reportEnvelope.recommendations.length,
        capabilities_demonstrated: [
          'content_drafting',
        ],
        blast_radius: 'low',
        evidence_packet_available: true,
      };

      if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
      } else {
        console.log('Demo completed successfully!');
        console.log(`- Tenant: ${demoTenantId}`);
        console.log(`- Project: ${demoProjectId}`);
        console.log(`- Job Requests: ${result.jobRequestBundle.requests.length}`);
        console.log(`- Findings: ${result.reportEnvelope.findings.length}`);
        console.log(`- Recommendations: ${result.reportEnvelope.recommendations.length}`);
        console.log('\nCapabilities demonstrated:');
        summary.capabilities_demonstrated.forEach(cap => console.log(`- ${cap}`));
      }

      process.exit(EXIT_SUCCESS);
    } catch (error) {
      handleError(error, log);
    }
  });

// ============================================================================
// replay command — reuse artifacts for diagnosis
// ============================================================================

interface ReplayOptions extends BaseOptions {
  runDir: string;
}

program
  .command('replay')
  .description('Replay a previous run from its artifacts for diagnosis')
  .requiredOption('--run-dir <path>', 'Path to a previous run artifact directory')
  .option('--json', 'Output structured JSON logs', false)
  .action(async (options: ReplayOptions) => {
    const log = createLogger(options);
    try {
      const summaryPath = path.join(options.runDir, 'summary.json');
      const logsPath = path.join(options.runDir, 'logs.jsonl');

      const summaryRaw = await fs.readFile(summaryPath, 'utf-8');
      const summary = JSON.parse(summaryRaw) as Record<string, unknown>;

      log.info('Replaying run', { runId: summary['runId'], command: summary['command'] });
      log.info(`Status: ${String(summary['status'])}`);
      log.info(`Started: ${String(summary['startedAt'])}`);
      log.info(`Completed: ${String(summary['completedAt'])}`);

      const outputs = summary['outputs'];
      if (Array.isArray(outputs)) {
        log.info(`Outputs: ${outputs.length} files`);
        for (const o of outputs) {
          log.info(`  ${String(o)}`);
        }
      }

      const errors = summary['errors'];
      if (Array.isArray(errors) && errors.length > 0) {
        log.warn(`Errors: ${errors.length}`);
        for (const e of errors as Array<{ code: string; message: string }>) {
          log.warn(`  [${e.code}] ${e.message}`);
        }
      }

      // Replay logs
      try {
        const logsRaw = await fs.readFile(logsPath, 'utf-8');
        const logLines = logsRaw.trim().split('\n');
        log.info(`\nReplaying ${logLines.length} log entries:`);
        for (const line of logLines) {
          process.stdout.write(line + '\n');
        }
      } catch {
        log.warn('No logs.jsonl found in run directory');
      }

      process.exit(EXIT_SUCCESS);
    } catch (error) {
      handleError(error, log);
    }
  });

// ============================================================================
// Help examples
// ============================================================================

program.on('--help', () => {
  console.log('');
  console.log('Examples:');
  console.log('  $ growth plan --smoke                                          # Smoke-test plan');
  console.log('  $ growth run --smoke                                           # Smoke-test run');
  console.log('  $ growth plan --inputs ./data.json --tenant acme --project web # Plan with real data');
  console.log('  $ growth run --inputs ./data.json --tenant acme --project web  # Full run');
  console.log('  $ growth replay --run-dir ./artifacts/<runId>                  # Replay a run');
  console.log('  $ growth seo-scan --path ./site-export --tenant acme --project website');
  console.log('  $ growth funnel --events ./events.json --steps "page_view,signup_start,signup_complete"');
  console.log('  $ growth analyze --inputs ./fixtures/jobforge/inputs.json --tenant acme --project app --trace trace-123');
  console.log('');
  console.log('Unified flags (all commands):');
  console.log('  --config <path>   Path to config file');
  console.log('  --dry-run         Skip external writes');
  console.log('  --out <dir>       Output directory');
  console.log('  --json            Structured JSON log output');
  console.log('  --smoke           Use built-in smoke test data');
  console.log('');
  console.log('Exit codes:');
  console.log('  0  Success');
  console.log('  2  Validation error');
  console.log('  3  External dependency failure');
  console.log('  4  Unexpected bug');
  console.log('');
  console.log('Environment variables:');
  console.log('  GROWTH_TENANT_ID      Default tenant ID');
  console.log('  GROWTH_PROJECT_ID     Default project ID');
  console.log('  GROWTH_PROFILES_DIR   Path to profiles directory (default: ./profiles)');
});

program.parse();
