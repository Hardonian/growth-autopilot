# Growth Autopilot Report

- Report ID: report-stable
- Tenant: acme
- Project: growth
- Trace: trace-123
- Created At: 2024-01-01T00:00:00.000Z

## Summary

- seo_findings: 1
- funnel_biggest_drop_off_step: signup_complete
- experiment_proposals: 0
- content_drafts: 1

## Findings

- **SEO scan findings detected** (warning)
  - Detected 1 SEO findings across 5 URLs.
- **Funnel drop-off identified** (warning)
  - Biggest drop-off at signup_complete with 50% drop-off.
- **Content draft prepared** (info)
  - Drafted meta_description content using jobforge profile.

## Recommendations

- **Queue autopilot.growth.seo_scan request**
  - Submit JobForge request for autopilot.growth.seo_scan.
- **Queue autopilot.growth.experiment_propose request**
  - Submit JobForge request for autopilot.growth.experiment_propose.
- **Queue autopilot.growth.content_draft request**
  - Submit JobForge request for autopilot.growth.content_draft.

## Safety

- Runnerless module: emits dry-run job requests only.
- JobForge policy tokens required for action jobs.