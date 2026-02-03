#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ZodError } from 'zod';
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
import { analyze, parseAnalyzeInputs, renderReport } from './jobforge/analyze.js';

const program = new Command();

program
  .name('growth')
  .description('Runnerless growth autopilot for SEO audits, funnel analysis, and content drafting')
  .version('0.1.0');

// Base options interface
interface BaseOptions {
  tenant?: string;
  project?: string;
}

// Helper to validate tenant context
function validateTenantContext(options: BaseOptions): { tenant_id: string; project_id: string } {
  const tenantId = options.tenant ?? process.env.GROWTH_TENANT_ID;
  const projectId = options.project ?? process.env.GROWTH_PROJECT_ID;

  if (typeof tenantId !== 'string' || tenantId.length === 0 || typeof projectId !== 'string' || projectId.length === 0) {
    // eslint-disable-next-line no-console
    console.error('Error: tenant_id and project_id are required.');
    // eslint-disable-next-line no-console
    console.error('Provide via --tenant and --project flags or GROWTH_TENANT_ID and GROWTH_PROJECT_ID env vars.');
    process.exit(1);
  }

  const context = { tenant_id: tenantId, project_id: projectId };
  const result = TenantContextSchema.safeParse(context);

  if (!result.success) {
    // eslint-disable-next-line no-console
    console.error('Error: Invalid tenant context:', result.error.format());
    process.exit(1);
  }

  return context;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return `Validation error: ${error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

function logError(error: unknown): void {
  const message = formatErrorMessage(error);
  // eslint-disable-next-line no-console
  console.error('Error:', message);

  if (process.env.DEBUG) {
    // eslint-disable-next-line no-console
    console.error(error);
  }
}

// SEO Scan command
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
  .option('--jobforge', 'Also generate JobForge job request', false)
  .action(async (options: SEOScanOptions) => {
    try {
      const tenantContext = validateTenantContext(options);

      // eslint-disable-next-line no-console
      console.log(`Scanning ${options.type} at ${options.path}...`);

      const audit = await scanSite({
        tenantContext,
        sourceType: options.type,
        sourcePath: options.path,
      });

      // Write audit result
      await fs.writeFile(options.output, JSON.stringify(audit, null, 2));
      // eslint-disable-next-line no-console
      console.log(`SEO audit written to ${options.output}`);
      // eslint-disable-next-line no-console
      console.log(`\nSummary:`);
      // eslint-disable-next-line no-console
      console.log(`  URLs scanned: ${audit.urls_scanned}`);
      // eslint-disable-next-line no-console
      console.log(`  Critical: ${audit.summary.critical}`);
      // eslint-disable-next-line no-console
      console.log(`  Warnings: ${audit.summary.warning}`);
      // eslint-disable-next-line no-console
      console.log(`  Info: ${audit.summary.info}`);
      // eslint-disable-next-line no-console
      console.log(`  Opportunities: ${audit.summary.opportunity}`);

      // Generate job request if requested
      if (options.jobforge) {
        const job = createSEOScanJob(tenantContext, options.path, options.type, 'medium', {
          relatedAuditId: audit.id,
          notes: `SEO scan completed with ${audit.findings.length} findings`,
        });
        const jobPath = options.output.replace('.json', '-job.json');
        await fs.writeFile(jobPath, serializeJobRequest(job));
        // eslint-disable-next-line no-console
        console.log(`\nJobForge request written to ${jobPath}`);
      }
    } catch (error) {
      logError(error);
      process.exit(1);
    }
  });

// Funnel analysis command
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
  .action(async (options: FunnelOptions) => {
    try {
      const tenantContext = validateTenantContext(options);
      const steps = options.steps.split(',').map((s: string) => s.trim());

      // eslint-disable-next-line no-console
      console.log(`Analyzing funnel: ${options.name}`);
      // eslint-disable-next-line no-console
      console.log(`Steps: ${steps.join(' → ')}`);

      const metrics = await analyzeFunnel({
        tenantContext,
        sourceFile: options.events,
        funnelName: options.name,
        steps,
      });

      await fs.writeFile(options.output, JSON.stringify(metrics, null, 2));
      // eslint-disable-next-line no-console
      console.log(`\nFunnel metrics written to ${options.output}`);
      // eslint-disable-next-line no-console
      console.log(`\nResults:`);
      // eslint-disable-next-line no-console
      console.log(`  Total entrances: ${metrics.total_entrances}`);
      // eslint-disable-next-line no-console
      console.log(`  Total conversions: ${metrics.total_conversions}`);
      // eslint-disable-next-line no-console
      console.log(`  Overall conversion: ${(metrics.overall_conversion_rate * 100).toFixed(1)}%`);

      if (metrics.biggest_drop_off_step) {
        const dropOffStep = metrics.steps.find((s) => s.step_name === metrics.biggest_drop_off_step);
        // eslint-disable-next-line no-console
        console.log(`  Biggest drop-off: ${metrics.biggest_drop_off_step} (${(dropOffStep?.drop_off_rate ?? 0) * 100}%)`);
      }

      // eslint-disable-next-line no-console
      console.log(`\nStep breakdown:`);
      for (const step of metrics.steps) {
        // eslint-disable-next-line no-console
        console.log(`  ${step.step_name}: ${step.unique_users} users (${Math.round(step.drop_off_rate * 100)}% drop-off)`);
      }
    } catch (error) {
      logError(error);
      process.exit(1);
    }
  });

// Propose experiments command
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
  .option('--jobforge', 'Also generate JobForge job request', false)
  .action(async (options: ProposeOptions) => {
    try {
      const tenantContext = validateTenantContext(options);

      // Load funnel metrics
      const funnelData = await fs.readFile(options.funnel, 'utf-8');
      const funnelMetrics = JSON.parse(funnelData) as unknown;

      // eslint-disable-next-line no-console
      console.log(`Generating experiment proposals from ${options.funnel}...`);

      const proposals = proposeExperiments({
        tenantContext,
        funnelMetrics: funnelMetrics as Parameters<typeof proposeExperiments>[0]['funnelMetrics'],
        maxProposals: parseInt(options.max, 10),
      });

      await fs.writeFile(options.output, JSON.stringify(proposals, null, 2));
      // eslint-disable-next-line no-console
      console.log(`\n${proposals.length} experiment proposal(s) written to ${options.output}`);

      for (let i = 0; i < proposals.length; i++) {
        const p = proposals[i];
        // eslint-disable-next-line no-console
        console.log(`\n${i + 1}. ${p.title}`);
        // eslint-disable-next-line no-console
        console.log(`   Hypothesis: ${p.hypothesis}`);
        // eslint-disable-next-line no-console
        console.log(`   Effort: ${p.effort.level} (~${p.effort.days_estimate} days)`);
        // eslint-disable-next-line no-console
        console.log(`   Expected impact: +${p.expected_impact.lift_percent}% (${p.expected_impact.confidence} confidence)`);
        // eslint-disable-next-line no-console
        console.log(`   Variants: ${p.suggested_variants.length}`);
      }

      // Generate job request if requested
      if (options.jobforge && proposals.length > 0) {
        const job = createExperimentProposalJob(tenantContext, funnelMetrics as Parameters<typeof proposeExperiments>[0]['funnelMetrics'], 'medium', {
          notes: `${proposals.length} experiment proposals generated`,
        });
        const jobPath = options.output.replace('.json', '-job.json');
        await fs.writeFile(jobPath, serializeJobRequest(job));
        // eslint-disable-next-line no-console
        console.log(`\nJobForge request written to ${jobPath}`);
      }
    } catch (error) {
      logError(error);
      process.exit(1);
    }
  });

// Draft content command
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
  .option('--jobforge', 'Also generate JobForge job request', false)
  .action(async (options: DraftContentOptions) => {
    try {
      const tenantContext = validateTenantContext(options);

      const keywords = options.keywords?.split(',').map((s: string) => s.trim()) ?? [];
      const features = options.features?.split(',').map((s: string) => s.trim()) ?? [];

      // eslint-disable-next-line no-console
      console.log(`Drafting ${options.type} using profile: ${options.profile}`);

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
      // eslint-disable-next-line no-console
      console.log(`\nContent draft written to ${options.output}`);
      // eslint-disable-next-line no-console
      console.log(`\nDraft preview:`);
      if (draft.draft.headline) {
        // eslint-disable-next-line no-console
        console.log(`  Headline: ${draft.draft.headline}`);
      }
      if (draft.draft.subject_line) {
        // eslint-disable-next-line no-console
        console.log(`  Subject: ${draft.draft.subject_line}`);
      }
      // eslint-disable-next-line no-console
      console.log(`  Body length: ${draft.draft.body.length} characters`);
      if (draft.draft.cta) {
        // eslint-disable-next-line no-console
        console.log(`  CTA: ${draft.draft.cta}`);
      }

      // Generate job request if requested
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
        // eslint-disable-next-line no-console
        console.log(`\nJobForge request written to ${jobPath}`);
      }
    } catch (error) {
      logError(error);
      process.exit(1);
    }
  });

interface AnalyzeOptions extends BaseOptions {
  inputs: string;
  trace: string;
  out: string;
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
  .option('--stable-output', 'Remove nondeterministic fields for fixtures/docs', false)
  .option('--no-render-md', 'Skip Markdown report rendering')
  .action(async (options: AnalyzeOptions) => {
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

      await fs.mkdir(options.out, { recursive: true });

      const requestBundlePath = path.join(options.out, 'request-bundle.json');
      const reportPath = path.join(options.out, 'report.json');
      const reportMdPath = path.join(options.out, 'report.md');

      await fs.writeFile(requestBundlePath, serializeDeterministic(result.jobRequestBundle));
      await fs.writeFile(reportPath, serializeDeterministic(result.reportEnvelope));

      if (options.renderMd) {
        await fs.writeFile(reportMdPath, renderReport(result.reportEnvelope, 'md'));
      }

      // eslint-disable-next-line no-console
      console.log(`JobForge request bundle written to ${requestBundlePath}`);
      // eslint-disable-next-line no-console
      console.log(`Report written to ${reportPath}`);
      if (options.renderMd) {
        // eslint-disable-next-line no-console
        console.log(`Markdown report written to ${reportMdPath}`);
      }
    } catch (error) {
      logError(error);
      process.exit(error instanceof ZodError ? 2 : 1);
    }
  });

// Show help examples
program.on('--help', () => {
  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log('Examples:');
  // eslint-disable-next-line no-console
  console.log('  $ growth seo-scan --path ./site-export --tenant acme --project website');
  // eslint-disable-next-line no-console
  console.log('  $ growth funnel --events ./events.json --steps "page_view,signup_start,signup_complete,first_action"');
  // eslint-disable-next-line no-console
  console.log('  $ growth propose-experiments --funnel ./funnel-metrics.json --tenant acme --project app');
  // eslint-disable-next-line no-console
  console.log('  $ growth draft-content --profile readylayer --type onboarding_email --goal "Welcome new users"');
  // eslint-disable-next-line no-console
  console.log('  $ growth analyze --inputs ./fixtures/jobforge/inputs.json --tenant acme --project app --trace trace-123 --out ./out');
  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log('Environment variables:');
  // eslint-disable-next-line no-console
  console.log('  GROWTH_TENANT_ID      Default tenant ID');
  // eslint-disable-next-line no-console
  console.log('  GROWTH_PROJECT_ID     Default project ID');
  // eslint-disable-next-line no-console
  console.log('  GROWTH_PROFILES_DIR   Path to profiles directory (default: ./profiles)');
});

program.parse();
