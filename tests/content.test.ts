import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { draftContent } from '../src/content/index.js';
import type { TenantContext, ContentDraft } from '../src/contracts/index.js';

describe('Content Drafting', () => {
  let tempDir: string;
  let originalEnv: string | undefined;

  const tenantContext: TenantContext = {
    tenant_id: 'test-tenant',
    project_id: 'test-project',
  };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'growth-test-'));
    originalEnv = process.env.GROWTH_PROFILES_DIR;
    process.env.GROWTH_PROFILES_DIR = tempDir;

    // Create a test profile
    const profileContent = `
name: test-profile
icp:
  description: "test users"
  pain_points:
    - "slow performance"
    - "high costs"
  goals:
    - "deploy faster"
    - "save money"
voice:
  tone: professional
  style_guide: "Clear and concise. Focus on benefits."
  vocabulary:
    - "optimize"
    - "scale"
    - "deploy"
keywords:
  primary:
    - "test"
    - "optimization"
  secondary:
    - "performance"
    - "scalability"
  prohibited:
    - "guaranteed"
    - "instant"
features:
  - name: "Feature A"
    description: "Does A"
    benefits:
      - "Benefit 1"
      - "Benefit 2"
  - name: "Feature B"
    description: "Does B"
    benefits:
      - "Benefit 3"
prohibited_claims:
  - "guaranteed results"
required_disclaimers: []
    `.trim();

    await fs.writeFile(path.join(tempDir, 'test-profile.yaml'), profileContent);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    process.env.GROWTH_PROFILES_DIR = originalEnv;
  });

  describe('deterministic output', () => {
    it('should produce same structure for same input', async () => {
      const result1 = await draftContent({
        tenantContext,
        profileName: 'test-profile',
        contentType: 'landing_page',
        goal: 'Convert visitors',
        keywords: ['test', 'optimization'],
        features: ['Feature A', 'Feature B'],
      });

      const result2 = await draftContent({
        tenantContext,
        profileName: 'test-profile',
        contentType: 'landing_page',
        goal: 'Convert visitors',
        keywords: ['test', 'optimization'],
        features: ['Feature A', 'Feature B'],
      });

      expect(result1.content_type).toBe(result2.content_type);
      expect(result1.profile_used).toBe(result2.profile_used);
      expect(result1.input_context.goal).toBe(result2.input_context.goal);
    });

    it('should not use LLM by default', async () => {
      const result = await draftContent({
        tenantContext,
        profileName: 'test-profile',
        contentType: 'landing_page',
        goal: 'Convert visitors',
      });

      expect(result.llm_used).toBe(false);
      expect(result.llm_provider).toBeUndefined();
    });
  });

  describe('content type generation', () => {
    it('should generate landing page content', async () => {
      const result = await draftContent({
        tenantContext,
        profileName: 'test-profile',
        contentType: 'landing_page',
        goal: 'Convert visitors to customers',
        keywords: ['optimization', 'performance'],
        features: ['Feature A', 'Feature B'],
      });

      expect(result.content_type).toBe('landing_page');
      expect(result.draft.headline).toBeDefined();
      expect(result.draft.body).toBeDefined();
      expect(result.draft.body.length).toBeGreaterThan(0);
      expect(result.draft.cta).toBeDefined();
    });

    it('should generate onboarding email content', async () => {
      const result = await draftContent({
        tenantContext,
        profileName: 'test-profile',
        contentType: 'onboarding_email',
        goal: 'Welcome new users',
        features: ['Feature A', 'Feature B'],
      });

      expect(result.content_type).toBe('onboarding_email');
      expect(result.draft.subject_line).toBeDefined();
      expect(result.draft.body).toBeDefined();
      expect(result.draft.cta).toBeDefined();
    });

    it('should generate changelog note', async () => {
      const result = await draftContent({
        tenantContext,
        profileName: 'test-profile',
        contentType: 'changelog_note',
        goal: 'Announce new features',
        features: ['Feature A', 'Feature B', 'Feature C'],
      });

      expect(result.content_type).toBe('changelog_note');
      expect(result.draft.headline).toBeDefined();
      expect(result.draft.body).toBeDefined();
    });

    it('should generate meta description', async () => {
      const result = await draftContent({
        tenantContext,
        profileName: 'test-profile',
        contentType: 'meta_description',
        goal: 'Improve SEO',
        keywords: ['optimization'],
      });

      expect(result.content_type).toBe('meta_description');
      expect(result.draft.body).toBeDefined();
      expect(result.draft.body.length).toBeLessThanOrEqual(160);
    });

    it('should generate title tag', async () => {
      const result = await draftContent({
        tenantContext,
        profileName: 'test-profile',
        contentType: 'title_tag',
        goal: 'Improve SEO',
        keywords: ['optimization'],
      });

      expect(result.content_type).toBe('title_tag');
      expect(result.draft.body).toBeDefined();
      expect(result.draft.body.length).toBeLessThanOrEqual(60);
    });

    it('should generate OG copy', async () => {
      const result = await draftContent({
        tenantContext,
        profileName: 'test-profile',
        contentType: 'og_copy',
        goal: 'Social sharing',
        keywords: ['optimization'],
      });

      expect(result.content_type).toBe('og_copy');
      expect(result.draft.headline).toBeDefined();
      expect(result.draft.body).toBeDefined();
    });

    it('should generate blog post content', async () => {
      const result = await draftContent({
        tenantContext,
        profileName: 'test-profile',
        contentType: 'blog_post',
        goal: 'Educate readers',
        features: ['Feature A', 'Feature B'],
      });

      expect(result.content_type).toBe('blog_post');
      expect(result.draft.headline).toBeDefined();
      expect(result.draft.body).toBeDefined();
      expect(result.draft.body).toContain('#');
    });

    it('should generate ad copy', async () => {
      const result = await draftContent({
        tenantContext,
        profileName: 'test-profile',
        contentType: 'ad_copy',
        goal: 'Drive clicks',
        keywords: ['optimization'],
        features: ['Feature A'],
      });

      expect(result.content_type).toBe('ad_copy');
      expect(result.draft.headline).toBeDefined();
      expect(result.draft.body).toBeDefined();
      expect(result.draft.cta).toBeDefined();
    });
  });

  describe('SEO metadata', () => {
    it('should include SEO metadata for landing pages', async () => {
      const result = await draftContent({
        tenantContext,
        profileName: 'test-profile',
        contentType: 'landing_page',
        goal: 'Convert visitors',
        keywords: ['optimization', 'performance'],
      });

      expect(result.seo_metadata).toBeDefined();
      expect(result.seo_metadata?.title).toBeDefined();
      expect(result.seo_metadata?.meta_description).toBeDefined();
      expect(result.seo_metadata?.keywords).toBeDefined();
      expect(result.seo_metadata?.keywords?.length).toBeGreaterThan(0);
    });

    it('should include profile keywords in metadata', async () => {
      const result = await draftContent({
        tenantContext,
        profileName: 'test-profile',
        contentType: 'landing_page',
        goal: 'Convert visitors',
        keywords: ['custom-keyword'],
      });

      const keywords = result.seo_metadata?.keywords ?? [];
      expect(keywords).toContain('custom-keyword');
      expect(keywords).toContain('test');
    });
  });

  describe('evidence tracking', () => {
    it('should include evidence for content generation', async () => {
      const result = await draftContent({
        tenantContext,
        profileName: 'test-profile',
        contentType: 'landing_page',
        goal: 'Convert visitors',
        keywords: ['optimization'],
        features: ['Feature A'],
      });

      expect(result.evidence.length).toBeGreaterThan(0);

      for (const evidence of result.evidence) {
        expect(evidence).toHaveProperty('type');
        expect(evidence).toHaveProperty('path');
        expect(evidence).toHaveProperty('description');
      }
    });
  });

  describe('profile loading', () => {
    it('should throw for missing profile', async () => {
      await expect(
        draftContent({
          tenantContext,
          profileName: 'nonexistent',
          contentType: 'landing_page',
          goal: 'Test',
        })
      ).rejects.toThrow('Profile not found');
    });
  });

  describe('tenant context', () => {
    it('should include tenant and project IDs', async () => {
      const result = await draftContent({
        tenantContext,
        profileName: 'test-profile',
        contentType: 'landing_page',
        goal: 'Test',
      });

      expect(result.tenant_id).toBe('test-tenant');
      expect(result.project_id).toBe('test-project');
    });
  });
});