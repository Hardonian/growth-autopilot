# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Growth Autopilot, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email security concerns to: security@yourorg.com (replace with actual contact)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will:
- Acknowledge receipt within 48 hours
- Investigate and provide updates within 7 days
- Coordinate disclosure timeline with reporter
- Credit the reporter (with permission) in the security advisory

## Security Best Practices

When using Growth Autopilot:

1. **Never commit secrets** - No API keys, tokens, or passwords in code
2. **Validate inputs** - All inputs are validated via Zod schemas
3. **Tenant isolation** - Always specify tenant_id and project_id
4. **No auto-execution** - This module is runnerless and only emits dry-run job requests
5. **Log sanitization** - No secrets are logged; only structured output to files

## Security Features

- Input validation via Zod schemas
- No network calls (except local file system for HTML parsing)
- No secrets storage or transmission
- No auto-execution capability
- Deterministic output for audit trails

## Dependencies

We regularly audit dependencies for vulnerabilities:

```bash
pnpm audit
```

To update dependencies:

```bash
pnpm update
pnpm audit
```
