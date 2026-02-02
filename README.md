# Growth Autopilot

A runnerless growth autopilot that scans site structure (routes or exported HTML), generates SEO audits, proposes experiments from event funnels, and drafts content. It never schedules or publishes; it outputs JobForge job requests for expensive verification/scans.

## Philosophy

**Draft and recommend only. Execute via JobForge if desired.**

This tool follows a strict "runnerless" philosophy:

1. **No auto-publishing** - Content is drafted, not deployed
2. **No scheduler/connector secrets** - No infrastructure to manage
3. **Multi-tenant by design** - All operations require tenant_id + project_id
4. **Evidence-linked** - Every recommendation traces back to source signals
5. **LLM optional** - SEO scanner and experiment proposer work without LLM

## Quick Start

```bash
# Install
npm install -g growth-autopilot

# Or with pnpm
pnpm add -g growth-autopilot

# Set your tenant/project context
export GROWTH_TENANT_ID="my-tenant"
export GROWTH_PROJECT_ID="my-project"

# Run SEO scan
growth seo-scan --path ./site-export --output ./audit.json

# Analyze funnel
growth funnel --events ./events.json --steps "page_view,signup_start,signup_complete"

# Propose experiments
growth propose-experiments --funnel ./funnel-metrics.json

# Draft content
growth draft-content --profile jobforge --type onboarding-email --goal "Welcome new users"
```

## Installation

### From NPM (when published)

```bash
npm install -g growth-autopilot
```

### From Source

```bash
git clone https://github.com/yourorg/growth-autopilot.git
cd growth-autopilot
pnpm install
pnpm run build
```

## Usage

### SEO Scan

Scan HTML exports or Next.js routes for SEO issues:

```bash
growth seo-scan \
  --path ./site-export \
  --type html_export \
  --tenant acme \
  --project website \
  --output ./seo-audit.json \
  --jobforge
```

Findings include:
- Missing/short/long titles
- Missing meta descriptions
- Missing OG tags
- Missing canonical links
- Broken internal links
- Sitemap opportunities
- Robots meta hints

### Funnel Analysis

Compute drop-offs from event exports:

```bash
growth funnel \
  --events ./events.json \
  --steps "page_view,signup_start,signup_complete,first_action" \
  --name "onboarding-funnel" \
  --tenant acme \
  --project app \
  --output ./funnel-metrics.json
```

Event JSON format:
```json
[
  { "user_id": "user1", "event_name": "page_view", "timestamp": "2024-01-01T00:00:00Z" },
  { "user_id": "user1", "event_name": "signup_start", "timestamp": "2024-01-01T00:01:00Z" }
]
```

### Experiment Proposals

Generate experiment proposals from funnel metrics:

```bash
growth propose-experiments \
  --funnel ./funnel-metrics.json \
  --max 3 \
  --tenant acme \
  --project app \
  --output ./experiment-proposals.json \
  --jobforge
```

Proposals include:
- Clear hypothesis
- Effort estimate (days, resources)
- Expected impact (lift %, confidence)
- Suggested variants
- Evidence links

### Content Drafting

Draft content using profiles (template-based, no LLM by default):

```bash
growth draft-content \
  --profile jobforge \
  --type onboarding-email \
  --goal "Welcome new users and get them to first workflow" \
  --keywords "automation,CI/CD,workflows" \
  --features "Visual designer,Runnerless,Observability" \
  --audience "Development teams" \
  --tenant acme \
  --project app \
  --output ./content-draft.json \
  --jobforge
```

Content types:
- `landing_page`
- `onboarding_email`
- `changelog_note`
- `blog_post`
- `meta_description`
- `title_tag`
- `og_copy`
- `ad_copy`

## Profiles

Profiles define voice, ICP, keywords, and features for content generation.

### Built-in Profiles

- `base` - Generic business profile
- `jobforge` - Workflow automation platform
- `readylayer` - Web3/AppChain infrastructure
- `settler` - Payment/settlement platform
- `aias` - AI inference optimization
- `keys` - Secret management

### Custom Profiles

Create a YAML file in `profiles/`:

```yaml
name: my-app
extends: base
icp:
  description: "target customers"
  pain_points:
    - "pain point 1"
  goals:
    - "goal 1"
voice:
  tone: professional
  style_guide: "How to write"
  vocabulary:
    - "key terms"
keywords:
  primary: ["main", "keywords"]
  secondary: ["supporting", "terms"]
  prohibited: ["banned", "words"]
features:
  - name: "Feature Name"
    description: "What it does"
    benefits:
      - "Benefit 1"
prohibited_claims:
  - "guaranteed results"
```

Set profiles directory:
```bash
export GROWTH_PROFILES_DIR="./profiles"
```

## JobForge Integration

Add `--jobforge` flag to any command to generate a JobForge job request:

```bash
growth seo-scan --path ./site --jobforge
# Generates: seo-audit-job.json
```

Job requests:
- Never auto-execute (`auto_execute: false`)
- Always require approval (`require_approval: true`)
- Include cost constraints for LLM operations
- Link back to source data

Submit to JobForge when ready to execute.

## Architecture

```
src/
├── contracts/    # Zod schemas for all data types
├── seo/          # HTML/Next.js route scanner
├── funnel/       # Event funnel analysis
├── experiments/  # Experiment proposal generation
├── content/      # Template-based content drafting
├── jobforge/     # Job request generation
├── cli.ts        # CLI entry point
└── index.ts      # Library exports
```

## Multi-Tenant Safety

All operations require:
- `tenant_id` - Organization identifier
- `project_id` - Project/application identifier

Set via:
- CLI flags: `--tenant`, `--project`
- Environment: `GROWTH_TENANT_ID`, `GROWTH_PROJECT_ID`

## Evidence Linking

Every output includes `evidence` arrays linking recommendations to source data:

```json
{
  "evidence": [
    {
      "type": "html_element",
      "path": "head > title",
      "description": "Title is only 5 characters",
      "value": 5
    }
  ]
}
```

Evidence types:
- `html_element` - Specific DOM element
- `json_path` - Path in JSON data
- `url` - Specific URL
- `event_count` - Count from event data
- `calculation` - Computed metric
- `assumption` - Documented assumption

## Configuration

Environment variables:
- `GROWTH_TENANT_ID` - Default tenant ID
- `GROWTH_PROJECT_ID` - Default project ID
- `GROWTH_PROFILES_DIR` - Path to profiles (default: `./profiles`)

## CLI Reference

```bash
growth --help                    # Show help
growth --version                 # Show version

growth seo-scan --help          # SEO scan help
growth funnel --help            # Funnel analysis help
growth propose-experiments --help # Experiments help
growth draft-content --help     # Content drafting help
```

## Development

```bash
# Install dependencies
pnpm install

# Run in dev mode
pnpm run dev

# Run linter
pnpm run lint

# Run typecheck
pnpm run typecheck

# Run tests
pnpm run test

# Run all checks
pnpm run ci
```

## Testing

Tests cover:
- SEO scanner determinism (stable output)
- Link checker correctness
- Funnel calculation accuracy
- Experiment proposer stable structure
- Content drafting output format
- Contract schema validation

```bash
pnpm run test
```

## Examples

See `examples/` directory:
- `site-export/` - Sample HTML files with intentional SEO issues
- `data/events.json` - Sample event stream
- `README.md` - Example commands and expected outputs

## Non-Negotiables

1. **No auto-publish/posting by default** - Everything is draft-only
2. **No runner/scheduler/connector secrets** - Completely runnerless
3. **Multi-tenant safe** - tenant_id + project_id required everywhere
4. **Evidence-linked** - Every recommendation traces to source signal
5. **LLM optional** - Core features work without LLM
6. **OSS ready** - Full docs, tests, CI, examples

## License

MIT

## Contributing

Contributions welcome! Please read our contributing guidelines and submit PRs.

## Support

- Issues: [GitHub Issues](https://github.com/yourorg/growth-autopilot/issues)
- Discussions: [GitHub Discussions](https://github.com/yourorg/growth-autopilot/discussions)