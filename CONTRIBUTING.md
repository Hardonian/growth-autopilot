# Contributing to Growth Autopilot

Thank you for your interest in contributing to Growth Autopilot! This document provides guidelines for contributing.

## Development Setup

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Build: `pnpm run build`
4. Run tests: `pnpm run test`

## Code Style

- TypeScript with strict mode enabled
- ESLint with TypeScript rules
- Explicit function return types required
- No `any` types
- No console logs (except errors/warnings)

## Testing

All new code must include tests:
- Unit tests for individual functions
- Integration tests for CLI commands
- Determinism tests for scanner output

Run tests: `pnpm run test`

## Pull Request Process

1. Create a feature branch
2. Make your changes
3. Add/update tests
4. Run `pnpm run ci` to verify
5. Submit PR with clear description

## Non-Negotiables

Contributions must maintain:
- No auto-publishing capability
- No runner/scheduler secrets
- Multi-tenant safety (tenant_id + project_id)
- Evidence-linked outputs
- LLM-optional core features

## Commit Messages

Use conventional commits:
- `feat: add new feature`
- `fix: fix bug`
- `docs: update documentation`
- `test: add tests`
- `refactor: refactor code`

## Questions?

Open an issue or discussion on GitHub.