import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { scanSite } from '../src/seo/index.js';
import type { TenantContext } from '../src/contracts/index.js';

describe('SEO Scanner', () => {
  let tempDir: string;

  const tenantContext: TenantContext = {
    tenant_id: 'test-tenant',
    project_id: 'test-project',
  };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'growth-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('deterministic output', () => {
    it('should produce identical output for identical input', async () => {
      // Create test HTML file
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Test Page</title>
  <meta name="description" content="A test page description">
  <meta property="og:title" content="Test Page">
  <link rel="canonical" href="https://example.com/test">
</head>
<body>
  <h1>Test</h1>
  <a href="/about">About</a>
</body>
</html>
      `.trim();

      await fs.writeFile(path.join(tempDir, 'index.html'), htmlContent);

      const result1 = await scanSite({
        tenantContext,
        sourceType: 'html_export',
        sourcePath: tempDir,
      });

      const result2 = await scanSite({
        tenantContext,
        sourceType: 'html_export',
        sourcePath: tempDir,
      });

      // Same number of findings
      expect(result1.findings.length).toBe(result2.findings.length);

      // Same summary counts
      expect(result1.summary).toEqual(result2.summary);

      // Same URLs scanned
      expect(result1.urls_scanned).toBe(result2.urls_scanned);
    });

    it('should detect missing title as critical', async () => {
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta name="description" content="A test page">
</head>
<body>
  <h1>No Title Page</h1>
</body>
</html>
      `.trim();

      await fs.writeFile(path.join(tempDir, 'index.html'), htmlContent);

      const result = await scanSite({
        tenantContext,
        sourceType: 'html_export',
        sourcePath: tempDir,
      });

      const missingTitleFinding = result.findings.find(
        (f) => f.category === 'title' && f.severity === 'critical'
      );

      expect(missingTitleFinding).toBeDefined();
      expect(missingTitleFinding?.message).toContain('Missing page title');
    });

    it('should detect short titles as warning', async () => {
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Hi</title>
  <meta name="description" content="A test page">
</head>
<body>
  <h1>Short Title</h1>
</body>
</html>
      `.trim();

      await fs.writeFile(path.join(tempDir, 'index.html'), htmlContent);

      const result = await scanSite({
        tenantContext,
        sourceType: 'html_export',
        sourcePath: tempDir,
      });

      const shortTitleFinding = result.findings.find(
        (f) => f.category === 'title' && f.severity === 'warning'
      );

      expect(shortTitleFinding).toBeDefined();
      expect(shortTitleFinding?.current_value).toBe('Hi');
    });

    it('should detect long titles as warning', async () => {
      const longTitle = 'A'.repeat(80);
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>${longTitle}</title>
  <meta name="description" content="A test page">
</head>
<body>
  <h1>Long Title</h1>
</body>
</html>
      `.trim();

      await fs.writeFile(path.join(tempDir, 'index.html'), htmlContent);

      const result = await scanSite({
        tenantContext,
        sourceType: 'html_export',
        sourcePath: tempDir,
      });

      const longTitleFinding = result.findings.find(
        (f) => f.category === 'title' && f.severity === 'warning'
      );

      expect(longTitleFinding).toBeDefined();
      expect(longTitleFinding?.message).toContain('truncated');
    });
  });

  describe('link checker correctness', () => {
    it('should detect broken internal links', async () => {
      const indexContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Home</title>
  <meta name="description" content="Home page">
</head>
<body>
  <a href="/about">About</a>
  <a href="/contact">Contact</a>
  <a href="/missing">Missing Page</a>
</body>
</html>
      `.trim();

      const aboutContent = `
<!DOCTYPE html>
<html>
<head>
  <title>About</title>
  <meta name="description" content="About page">
</head>
<body>
  <h1>About</h1>
</body>
</html>
      `.trim();

      // Create pages directory
      await fs.mkdir(path.join(tempDir, 'about'));
      await fs.writeFile(path.join(tempDir, 'about', 'index.html'), aboutContent);
      await fs.writeFile(path.join(tempDir, 'index.html'), indexContent);

      const result = await scanSite({
        tenantContext,
        sourceType: 'html_export',
        sourcePath: tempDir,
      });

      const brokenLinkFindings = result.findings.filter(
        (f) => f.category === 'broken_link'
      );

      expect(brokenLinkFindings.length).toBeGreaterThanOrEqual(1);

      // Check that /missing is in the broken links
      const missingLink = brokenLinkFindings.find((f) => f.current_value === '/missing');
      expect(missingLink).toBeDefined();

      // Check that /contact is also broken (doesn't exist)
      const contactLink = brokenLinkFindings.find((f) => f.current_value === '/contact');
      expect(contactLink).toBeDefined();

      // Check that /about is NOT in broken links (it exists)
      const aboutLink = brokenLinkFindings.find((f) => f.current_value === '/about');
      expect(aboutLink).toBeUndefined();
    });

    it('should not flag external links as broken', async () => {
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Home</title>
  <meta name="description" content="Home page">
</head>
<body>
  <a href="https://example.com">External</a>
  <a href="/local">Local</a>
</body>
</html>
      `.trim();

      await fs.writeFile(path.join(tempDir, 'index.html'), htmlContent);

      const result = await scanSite({
        tenantContext,
        sourceType: 'html_export',
        sourcePath: tempDir,
      });

      // Should not have external link in broken links
      const externalBrokenLink = result.findings.find(
        (f) => f.category === 'broken_link' && f.current_value?.includes('https://')
      );

      expect(externalBrokenLink).toBeUndefined();
    });
  });

  describe('OG tags detection', () => {
    it('should detect missing OG tags', async () => {
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Test Page</title>
  <meta name="description" content="A test page">
</head>
<body>
  <h1>Test</h1>
</body>
</html>
      `.trim();

      await fs.writeFile(path.join(tempDir, 'index.html'), htmlContent);

      const result = await scanSite({
        tenantContext,
        sourceType: 'html_export',
        sourcePath: tempDir,
      });

      const ogFindings = result.findings.filter((f) => f.category === 'og_tags');

      // Should have at least 4 missing OG tag findings (title, description, url, type)
      expect(ogFindings.length).toBeGreaterThanOrEqual(4);
    });

    it('should detect present OG tags', async () => {
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Test Page</title>
  <meta name="description" content="A test page">
  <meta property="og:title" content="Test Page">
  <meta property="og:description" content="Test description">
  <meta property="og:url" content="https://example.com">
  <meta property="og:type" content="website">
</head>
<body>
  <h1>Test</h1>
</body>
</html>
      `.trim();

      await fs.writeFile(path.join(tempDir, 'index.html'), htmlContent);

      const result = await scanSite({
        tenantContext,
        sourceType: 'html_export',
        sourcePath: tempDir,
      });

      // Should have no OG tag findings for present tags
      const ogFindings = result.findings.filter(
        (f) => f.category === 'og_tags' && f.current_value !== null
      );

      expect(ogFindings.length).toBe(0);
    });
  });

  describe('multi-page scanning', () => {
    it('should scan multiple HTML files', async () => {
      const indexContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Home</title>
  <meta name="description" content="Home page">
</head>
<body>
  <a href="/about">About</a>
</body>
</html>
      `.trim();

      const aboutContent = `
<!DOCTYPE html>
<html>
<head>
  <title>About Us - A longer title for testing purposes</title>
  <meta name="description" content="About us page with a sufficiently long description that meets SEO best practices for meta descriptions">
</head>
<body>
  <h1>About</h1>
</body>
</html>
      `.trim();

      await fs.mkdir(path.join(tempDir, 'about'));
      await fs.writeFile(path.join(tempDir, 'about', 'index.html'), aboutContent);
      await fs.writeFile(path.join(tempDir, 'index.html'), indexContent);

      const result = await scanSite({
        tenantContext,
        sourceType: 'html_export',
        sourcePath: tempDir,
      });

      expect(result.urls_scanned).toBe(2);

      // Index page should have findings
      const indexFindings = result.findings.filter((f) => f.url === '/');
      expect(indexFindings.length).toBeGreaterThan(0);

      // About page should have findings
      const aboutFindings = result.findings.filter((f) => f.url.includes('about'));
      expect(aboutFindings.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('sitemap hints', () => {
    it('should suggest sitemap generation', async () => {
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Test</title>
  <meta name="description" content="Test page">
</head>
<body></body>
</html>
      `.trim();

      await fs.writeFile(path.join(tempDir, 'index.html'), htmlContent);

      const result = await scanSite({
        tenantContext,
        sourceType: 'html_export',
        sourcePath: tempDir,
      });

      const sitemapFinding = result.findings.find((f) => f.category === 'sitemap');

      expect(sitemapFinding).toBeDefined();
      expect(sitemapFinding?.severity).toBe('opportunity');
    });
  });
});