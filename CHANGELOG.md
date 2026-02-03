# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial implementation of runnerless growth autopilot
- SEO scanning for HTML exports and Next.js routes
- Funnel analysis from event exports
- Experiment proposal generation
- Template-based content drafting
- JobForge integration with dry-run job request bundles
- Multi-tenant safety with required tenant_id and project_id
- Evidence-linked outputs
- CLI interface with 5 commands: seo-scan, funnel, propose-experiments, draft-content, analyze
- Full test coverage (83 tests across 7 test files)
- TypeScript strict mode
- ESLint 9.x flat config
- CI/CD with GitHub Actions

### Security

- No auto-execution capability
- No secrets storage or transmission
- Input validation via Zod schemas
- Runnerless architecture

## [0.1.0] - 2024-01-XX

### Added

- Initial release
- Core modules: seo, funnel, experiments, content, jobforge
- CLI with commander
- Zod schema validation
- Vitest testing framework
- tsup build system

[unreleased]: https://github.com/yourorg/growth-autopilot/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yourorg/growth-autopilot/releases/tag/v0.1.0
