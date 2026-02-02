import * as cheerio from 'cheerio';
import { glob } from 'glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  type SEOFinding,
  type SEOAudit,
  type TenantContext,
  type EvidenceLink,
  SeveritySchema,
} from '../contracts/index.js';

/**
 * Options for scanning a site
 */
export interface ScanOptions {
  tenantContext: TenantContext;
  sourceType: 'nextjs_routes' | 'html_export';
  sourcePath: string;
  checkExternalLinks?: boolean;
}

/**
 * ScanResult from a single HTML file
 */
interface PageScanResult {
  url: string;
  filePath: string;
  title: string | null;
  metaDescription: string | null;
  ogTags: Record<string, string>;
  canonical: string | null;
  links: Array<{ href: string; text: string; isExternal: boolean }>;
  hasRobotsMeta: boolean;
  robotsContent: string | null;
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create an evidence link
 */
function createEvidence(
  type: EvidenceLink['type'],
  path: string,
  description: string,
  value?: string | number | boolean
): EvidenceLink {
  return { type, path, description, value };
}

/**
 * Scan a single HTML file and extract SEO-relevant data
 */
async function scanHtmlFile(filePath: string, baseUrl: string): Promise<PageScanResult> {
  const content = await fs.readFile(filePath, 'utf-8');
  const $ = cheerio.load(content);

  // Extract title
  const title = $('title').text() || null;

  // Extract meta description
  const metaDescription =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    null;

  // Extract OG tags
  const ogTags: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const property = $(el).attr('property');
    const content = $(el).attr('content');
    if (property && content) {
      ogTags[property] = content;
    }
  });

  // Extract canonical
  const canonical = $('link[rel="canonical"]').attr('href') || null;

  // Extract robots meta
  const robotsMeta = $('meta[name="robots"]').attr('content') || null;

  // Extract all links
  const links: Array<{ href: string; text: string; isExternal: boolean }> = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    const isExternal = href.startsWith('http') && !href.startsWith(baseUrl);
    links.push({ href, text, isExternal });
  });

  // Determine URL from file path
  // Normalize to forward slashes for cross-platform compatibility
  const relativePath = path.relative(baseUrl, filePath).replace(/\\/g, '/');
  const urlPath = relativePath.replace(/index\.html$/, '').replace(/\.html$/, '');
  const url = urlPath === '' ? '/' : `/${urlPath}`;

  return {
    url,
    filePath,
    title,
    metaDescription,
    ogTags,
    canonical,
    links,
    hasRobotsMeta: !!robotsMeta,
    robotsContent: robotsMeta,
  };
}

/**
 * Validate a page and generate findings
 */
function validatePage(page: PageScanResult): SEOFinding[] {
  const findings: SEOFinding[] = [];

  // Check title
  if (!page.title) {
    findings.push({
      id: generateId(),
      url: page.url,
      severity: SeveritySchema.Enum.critical,
      category: 'title',
      message: 'Missing page title',
      current_value: null,
      recommendation: 'Add a descriptive <title> tag (50-60 characters)',
      evidence: [createEvidence('html_element', 'head > title', 'No title element found')],
    });
  } else if (page.title.length < 10) {
    findings.push({
      id: generateId(),
      url: page.url,
      severity: SeveritySchema.Enum.warning,
      category: 'title',
      message: 'Title is too short',
      current_value: page.title,
      recommendation: 'Expand title to 50-60 characters for better SEO',
      evidence: [
        createEvidence('html_element', 'head > title', `Title is only ${page.title.length} characters`, page.title.length),
      ],
    });
  } else if (page.title.length > 70) {
    findings.push({
      id: generateId(),
      url: page.url,
      severity: SeveritySchema.Enum.warning,
      category: 'title',
      message: 'Title may be truncated in search results',
      current_value: page.title,
      recommendation: 'Shorten title to 50-60 characters',
      evidence: [
        createEvidence('html_element', 'head > title', `Title is ${page.title.length} characters`, page.title.length),
      ],
    });
  }

  // Check meta description
  if (!page.metaDescription) {
    findings.push({
      id: generateId(),
      url: page.url,
      severity: SeveritySchema.Enum.warning,
      category: 'meta_description',
      message: 'Missing meta description',
      current_value: null,
      recommendation: 'Add a meta description tag (150-160 characters)',
      evidence: [createEvidence('html_element', 'meta[name="description"]', 'No description meta tag found')],
    });
  } else if (page.metaDescription.length < 50) {
    findings.push({
      id: generateId(),
      url: page.url,
      severity: SeveritySchema.Enum.info,
      category: 'meta_description',
      message: 'Meta description is short',
      current_value: page.metaDescription,
      recommendation: 'Consider expanding to 150-160 characters',
      evidence: [
        createEvidence(
          'html_element',
          'meta[name="description"]',
          `Description is ${page.metaDescription.length} characters`,
          page.metaDescription.length
        ),
      ],
    });
  }

  // Check OG tags
  const requiredOgTags = ['og:title', 'og:description', 'og:url', 'og:type'];
  for (const tag of requiredOgTags) {
    if (!page.ogTags[tag]) {
      findings.push({
        id: generateId(),
        url: page.url,
        severity: SeveritySchema.Enum.info,
        category: 'og_tags',
        message: `Missing ${tag} tag`,
        current_value: null,
        recommendation: `Add <meta property="${tag}" content="..."> for social sharing`,
        evidence: [createEvidence('html_element', `meta[property="${tag}"]`, 'OG tag not found')],
      });
    }
  }

  // Check canonical
  if (!page.canonical) {
    findings.push({
      id: generateId(),
      url: page.url,
      severity: SeveritySchema.Enum.info,
      category: 'canonical',
      message: 'Missing canonical tag',
      current_value: null,
      recommendation: 'Add <link rel="canonical" href="..."> to prevent duplicate content issues',
      evidence: [createEvidence('html_element', 'link[rel="canonical"]', 'Canonical link not found')],
    });
  }

  return findings;
}

/**
 * Check for broken internal links across all pages
 */
function checkBrokenLinks(pages: PageScanResult[]): SEOFinding[] {
  const findings: SEOFinding[] = [];
  // Normalize URLs by removing trailing slashes for consistent comparison
  const allUrls = new Set(pages.map((p) => p.url.replace(/\/$/, '') || '/'));

  for (const page of pages) {
    for (const link of page.links) {
      // Skip external links for now (would need HTTP check)
      if (link.isExternal) continue;

      // Skip anchors and javascript
      if (link.href.startsWith('#') || link.href.startsWith('javascript:')) continue;

      // Normalize the link URL (remove trailing slash)
      const normalizedUrl = link.href.replace(/\/$/, '') || '/';

      // Check if URL exists in our scanned pages
      const exists = allUrls.has(normalizedUrl);

      if (!exists) {
        findings.push({
          id: generateId(),
          url: page.url,
          severity: SeveritySchema.Enum.warning,
          category: 'broken_link',
          message: `Broken internal link: ${link.href}`,
          current_value: link.href,
          recommendation: 'Fix or remove the broken link',
          evidence: [
            createEvidence('html_element', `a[href="${link.href}"]`, `Link text: "${link.text}"`, link.href),
          ],
        });
      }
    }
  }

  return findings;
}

/**
 * Check for sitemap and robots.txt hints
 */
function checkSitemapAndRobots(pages: PageScanResult[], _sourcePath: string): SEOFinding[] {
  const findings: SEOFinding[] = [];

  // Check if any pages have noindex
  const noindexPages = pages.filter((p) => p.robotsContent?.includes('noindex'));

  if (noindexPages.length > 0) {
    findings.push({
      id: generateId(),
      url: '/',
      severity: SeveritySchema.Enum.info,
      category: 'robots',
      message: `${noindexPages.length} pages have noindex directive`,
      current_value: noindexPages.map((p) => p.url).join(', '),
      recommendation: 'Verify these pages should be excluded from search engines',
      evidence: [
        createEvidence(
          'calculation',
          'robots:noindex',
          'Pages with noindex meta tag',
          noindexPages.length
        ),
      ],
    });
  }

  // Sitemap hint
  findings.push({
    id: generateId(),
    url: '/',
    severity: SeveritySchema.Enum.opportunity,
    category: 'sitemap',
    message: 'Consider generating a sitemap.xml',
    current_value: null,
    recommendation: `Submit sitemap to search engines with ${pages.length} pages`,
    evidence: [
      createEvidence('calculation', 'pages:count', 'Total pages scanned', pages.length),
    ],
  });

  return findings;
}

/**
 * Main SEO scan function
 */
export async function scanSite(options: ScanOptions): Promise<SEOAudit> {
  const { tenantContext, sourceType, sourcePath } = options;

  // Find all HTML files
  const htmlFiles = await glob('**/*.html', {
    cwd: sourcePath,
    absolute: true,
  });

  if (htmlFiles.length === 0) {
    throw new Error(`No HTML files found in ${sourcePath}`);
  }

  // Scan each page
  const pages: PageScanResult[] = [];
  for (const file of htmlFiles) {
    const page = await scanHtmlFile(file, sourcePath);
    pages.push(page);
  }

  // Generate findings
  let allFindings: SEOFinding[] = [];

  for (const page of pages) {
    const pageFindings = validatePage(page);
    allFindings = allFindings.concat(pageFindings);
  }

  // Check for broken links
  const linkFindings = checkBrokenLinks(pages);
  allFindings = allFindings.concat(linkFindings);

  // Check sitemap/robots hints
  const sitemapFindings = checkSitemapAndRobots(pages, sourcePath);
  allFindings = allFindings.concat(sitemapFindings);

  // Calculate summary
  const summary = {
    critical: allFindings.filter((f) => f.severity === 'critical').length,
    warning: allFindings.filter((f) => f.severity === 'warning').length,
    info: allFindings.filter((f) => f.severity === 'info').length,
    opportunity: allFindings.filter((f) => f.severity === 'opportunity').length,
  };

  return {
    ...tenantContext,
    id: generateId(),
    scanned_at: new Date().toISOString(),
    source_type: sourceType,
    source_path: sourcePath,
    urls_scanned: pages.length,
    findings: allFindings,
    summary,
  };
}

export { generateId };