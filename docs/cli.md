# CLI Reference

## Commands

| Command | Description |
| --- | --- |
| `growth seo-scan` | Scan site structure for SEO issues. |
| `growth funnel` | Analyze event funnel from JSON export. |
| `growth propose-experiments` | Generate experiment proposals from funnel metrics. |
| `growth draft-content` | Draft content using a profile (template-based). |
| `growth analyze` | Emit JobForge request bundle + report (dry-run). |

## Examples

```bash
# SEO scan
growth seo-scan --path ./site-export --type html_export --tenant acme --project website

# Funnel analysis
growth funnel --events ./events.json --steps "page_view,signup_start,signup_complete" --tenant acme --project app

# Experiment proposals
growth propose-experiments --funnel ./funnel-metrics.json --tenant acme --project app

# Content draft
growth draft-content --profile jobforge --type meta_description --goal "Improve signup conversion"

# JobForge analyze output
growth analyze \
  --inputs ./fixtures/jobforge/inputs.json \
  --tenant acme \
  --project growth \
  --trace trace-123 \
  --out ./jobforge-output \
  --stable-output
```
