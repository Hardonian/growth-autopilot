# Support

## Getting Help

### Documentation

- [README.md](./README.md) - Main documentation
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Development setup and contribution guide
- [docs/cli.md](./docs/cli.md) - CLI reference
- [docs/jobforge-integration.md](./docs/jobforge-integration.md) - JobForge integration guide

### GitHub

- **Issues**: [github.com/yourorg/growth-autopilot/issues](https://github.com/yourorg/growth-autopilot/issues)
  - Bug reports
  - Feature requests
  - Documentation improvements

- **Discussions**: [github.com/yourorg/growth-autopilot/discussions](https://github.com/yourorg/growth-autopilot/discussions)
  - General questions
  - Usage help
  - Community support

## Troubleshooting

### Common Issues

**ESLint errors after upgrade to ESLint 9.x**

The project now uses the flat config format (`eslint.config.js`). If you're upgrading from an older version, remove any `.eslintrc.*` files.

**Tests fail with timeout**

SEO tests scan HTML files and may timeout on slow systems. Run with increased timeout:

```bash
pnpm test -- --timeout 30000
```

**Build fails with type errors**

Ensure TypeScript version matches the project:

```bash
pnpm install
pnpm run typecheck
```

## Commercial Support

For enterprise support, custom development, or training:

Email: support@yourorg.com (replace with actual contact)

## Security Issues

For security-related issues, see [SECURITY.md](./SECURITY.md).
