# Examples

This directory contains example data and outputs to help you understand how Growth Autopilot works.

## Directory Structure

```
examples/
├── site-export/        # Sample HTML export for SEO scanning
├── data/              # Sample event data for funnel analysis
├── outputs/           # Sample outputs from running the tool
└── jobforge/          # JobForge analyze inputs + stable outputs
```

## Running Examples

### SEO Scan

Scan the sample site export:

```bash
# Set environment variables
export GROWTH_TENANT_ID="demo-tenant"
export GROWTH_PROJECT_ID="demo-project"

# Run SEO scan
growth seo-scan \
  --path ./examples/site-export \
  --type html_export \
  --output ./examples/outputs/seo-audit.json \
  --jobforge
```

### Funnel Analysis

Analyze the sample event data:

```bash
growth funnel \
  --events ./examples/data/events.json \
  --steps "page_view,signup_start,signup_complete,first_workflow_created" \
  --name "onboarding-funnel" \
  --output ./examples/outputs/funnel-metrics.json
```

### Experiment Proposals

Generate experiment proposals from funnel metrics:

```bash
growth propose-experiments \
  --funnel ./examples/outputs/funnel-metrics.json \
  --max 3 \
  --output ./examples/outputs/experiment-proposals.json \
  --jobforge
```

### Content Drafting

Draft content using a profile:

```bash
# Set profiles directory
export GROWTH_PROFILES_DIR="./profiles"

# Draft onboarding email
growth draft-content \
  --profile jobforge \
  --type onboarding_email \
  --goal "Welcome new users and guide them to first workflow" \
  --keywords "automation,workflow,CI/CD" \
  --features "Workflow Designer,Runnerless Execution,Built-in Observability" \
  --output ./examples/outputs/content-draft.json \
  --jobforge
```

### JobForge Analyze (Bundle + Report)

Generate a JobForge request bundle + report in deterministic mode:

```bash
growth analyze \
  --inputs ./examples/jobforge/inputs.json \
  --tenant acme \
  --project growth \
  --trace trace-123 \
  --out ./examples/jobforge/output \
  --stable-output
```

## Sample Data Details

### Site Export (`site-export/`)

Contains intentionally imperfect HTML files to demonstrate SEO finding detection:

- **index.html**: Well-optimized homepage
- **features/index.html**: Missing OG tags
- **pricing/index.html**: Complete but basic
- **about/index.html**: Long title, short description, broken link
- **docs/index.html**: Has `noindex` robots meta tag

### Events Data (`data/events.json`)

Sample event stream with intentional drop-offs at each funnel step:

- **10 users** viewed a page
- **6 users** started signup (40% drop-off at landing)
- **5 users** completed signup (17% drop-off at signup form)
- **3 users** created their first workflow (40% drop-off at activation)

This creates opportunities for experiment proposals targeting each drop-off point.

## Expected Outputs

After running the examples, you'll find:

- `outputs/seo-audit.json`: Complete SEO audit with findings
- `outputs/seo-audit-job.json`: JobForge job request for SEO scan
- `outputs/funnel-metrics.json`: Computed funnel metrics
- `outputs/experiment-proposals.json`: Generated experiment proposals
- `outputs/experiment-proposals-job.json`: JobForge job request for experiments
- `outputs/content-draft.json`: Drafted content
- `outputs/content-draft-job.json`: JobForge job request for content

## JobForge Integration

All examples can optionally generate JobForge job requests. These requests:

1. Are **never** auto-executed (`auto_execute: false`)
2. **Always** require approval (`require_approval: true`)
3. Include tenant/project context for multi-tenant safety
4. Link back to source data (audits, funnels, etc.)

Submit these to your JobForge instance when you're ready to execute.
