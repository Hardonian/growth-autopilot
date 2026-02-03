import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';
import {
  type ContentDraft,
  type TenantContext,
  type EvidenceLink,
  type GrowthProfile,
  GrowthProfileSchema,
} from '../contracts/index.js';
import { profileCache, createFileCacheKey } from '../cache.js';

/**
 * Content generation options
 */
export interface ContentOptions {
  tenantContext: TenantContext;
  profileName: string;
  contentType: ContentDraft['content_type'];
  goal: string;
  keywords?: string[];
  features?: string[];
  targetAudience?: string;
  llmProvider?: string;
  variantCount?: number;
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
 * Load a profile from the profiles directory with deterministic caching
 */
async function loadProfile(profileName: string, profilesDir: string): Promise<GrowthProfile> {
  const profilePath = path.join(profilesDir, `${profileName}.yaml`);

  // Check file stats for cache key
  let cacheKey: string;
  try {
    const stats = await fs.stat(profilePath);
    cacheKey = createFileCacheKey(profilePath, stats.mtimeMs, stats.size);
  } catch {
    // If stat fails, fall back to path-based key (file likely doesn't exist)
    cacheKey = profilePath;
  }

  // Try cache first
  const cached = profileCache.get(cacheKey);
  if (cached !== undefined) {
    return cached as GrowthProfile;
  }

  // Load and parse
  try {
    const content = await fs.readFile(profilePath, 'utf-8');
    const parsed: unknown = yaml.parse(content);
    const validated = GrowthProfileSchema.parse(parsed);

    // Cache the validated profile
    profileCache.set(cacheKey, validated);
    return validated;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Profile not found: ${profileName}.yaml`);
    }
    throw new Error(`Invalid profile ${profileName}: ${(error as Error).message}`);
  }
}

/**
 * Template-based content generator (no LLM)
 */
function generateTemplateContent(
  contentType: ContentDraft['content_type'],
  profile: GrowthProfile,
  options: ContentOptions
): { headline?: string; body: string; cta?: string; subject_line?: string } {
  const { goal, keywords = [], features = [] } = options;
  const primaryKeyword = keywords[0] ?? profile.keywords.primary[0] ?? 'solution';
  const icp = profile.icp;
  const voice = profile.voice;

  switch (contentType) {
    case 'landing_page': {
      const headline = `The ${primaryKeyword} That ${icp.goals[0] ?? 'Solves Your Problem'}`;
      const body = `
${icp.pain_points[0] ? `Tired of ${icp.pain_points[0].toLowerCase()}?` : 'Looking for a better solution?'}

${features.slice(0, 3).map((f) => `• ${f}`).join('\n')}

${voice.style_guide}

${goal}
      `.trim();
      const cta = `Start Your Free Trial`;
      return { headline, body, cta };
    }

    case 'onboarding_email': {
      const subject_line = `Welcome! Let's ${icp.goals[0]?.toLowerCase() ?? 'get you started'}`;
      const body = `
Hi there,

Welcome to ${profile.name}! We're excited to help you ${icp.goals[0]?.toLowerCase() ?? 'achieve your goals'}.

Here's what you can do first:

${features.slice(0, 3).map((f, i) => `${i + 1}. ${f}`).join('\n')}

${voice.style_guide}

${goal}

The ${profile.name} Team
      `.trim();
      const cta = `Get Started Now`;
      return { subject_line, body, cta };
    }

    case 'changelog_note': {
      const headline = `New: ${features[0] ?? 'Improvements'} Now Available`;
      const body = `
We've just shipped ${features[0] ?? 'exciting updates'} that help you ${icp.goals[0]?.toLowerCase() ?? 'work better'}.

**What's new:**

${features.map((f) => `• ${f}`).join('\n')}

${goal}
      `.trim();
      return { headline, body };
    }

    case 'meta_description': {
      const body = `${profile.name} helps ${icp.description} ${icp.goals[0]?.toLowerCase() ?? 'succeed'}. ${features[0] ?? ''} ${primaryKeyword}. ${voice.style_guide}`.slice(
        0,
        160
      );
      return { body };
    }

    case 'title_tag': {
      const headline = `${profile.name} | ${icp.goals[0] ?? primaryKeyword}`.slice(0, 60);
      return { body: headline };
    }

    case 'og_copy': {
      const headline = `${profile.name}: ${icp.goals[0] ?? 'Better Solutions'}`;
      const body = `${icp.pain_points[0] ? `Stop struggling with ${icp.pain_points[0].toLowerCase()}. ` : ''}${features[0] ?? ''} ${primaryKeyword}.`;
      return { headline, body };
    }

    case 'blog_post': {
      const headline = `How to ${icp.goals[0] ?? 'Improve'} with ${primaryKeyword}`;
      const body = `
# ${headline}

${icp.pain_points[0] ? `Many ${icp.description} struggle with ${icp.pain_points[0].toLowerCase()}.` : 'Finding the right approach matters.'}

## The Challenge

${icp.pain_points.slice(0, 2).join('\n\n')}

## The Solution

${features.slice(0, 3).map((f) => `### ${f}\n\n${voice.style_guide}`).join('\n\n')}

## ${goal}

Start using ${profile.name} today and see the difference.
      `.trim();
      return { headline, body };
    }

    case 'ad_copy': {
      const headline = `Stop ${icp.pain_points[0] ?? 'Wasting Time'}`;
      const body = `${icp.description} use ${profile.name} to ${icp.goals[0]?.toLowerCase() ?? 'succeed'}. ${features[0] ?? ''}`;
      const cta = `Try Free`;
      return { headline, body, cta };
    }

    default:
      return { body: `Content draft for ${String(contentType)}: ${goal}` };
  }
}

/**
 * Generate SEO metadata for content
 */
function generateSEOMetadata(
  contentType: ContentDraft['content_type'],
  profile: GrowthProfile,
  keywords: string[]
): { title?: string; meta_description?: string; keywords: string[] } {
  const allKeywords = [...profile.keywords.primary, ...keywords];

  if (contentType === 'landing_page' || contentType === 'blog_post') {
    return {
      title: `${profile.name} | ${profile.icp.goals[0] ?? allKeywords[0] ?? 'Solutions'}`,
      meta_description: `${profile.name} helps ${profile.icp.description} ${profile.icp.goals[0]?.toLowerCase() ?? 'achieve more'}. ${allKeywords.slice(0, 3).join(', ')}.`,
      keywords: allKeywords,
    };
  }

  return { keywords: allKeywords };
}

/**
 * Draft content without LLM (template-based)
 */
export async function draftContent(options: ContentOptions): Promise<ContentDraft> {
  const {
    tenantContext,
    profileName,
    contentType,
    goal,
    keywords = [],
    features = [],
    targetAudience,
    llmProvider,
    variantCount = 1,
  } = options;

  // Load profile
  const profilesDir = process.env.GROWTH_PROFILES_DIR ?? './profiles';
  const profile = await loadProfile(profileName, profilesDir);

  // Generate content using templates (no LLM required)
  const draft = generateTemplateContent(contentType, profile, options);

  // Generate SEO metadata
  const seoMetadata = generateSEOMetadata(contentType, profile, keywords);

  // Build evidence
  const evidence: EvidenceLink[] = [
    createEvidence('json_path', 'profile', `Profile: ${profile.name}`, profileName),
    createEvidence('json_path', 'content_type', `Content type: ${contentType}`, contentType),
    createEvidence('json_path', 'goal', `Goal: ${goal}`, goal),
  ];

  if (keywords.length > 0) {
    evidence.push(createEvidence('json_path', 'keywords', `Keywords: ${keywords.join(', ')}`, keywords.length));
  }

  if (features.length > 0) {
    evidence.push(createEvidence('json_path', 'features', `Features: ${features.join(', ')}`, features.length));
  }

  return {
    ...tenantContext,
    id: generateId(),
    created_at: new Date().toISOString(),
    content_type: contentType,
    profile_used: profileName,
    llm_used: false,
    llm_provider: llmProvider,
    input_context: {
      keywords,
      features,
      target_audience: targetAudience ?? profile.icp.description,
      goal,
    },
    draft,
    seo_metadata: seoMetadata,
    variant_count: variantCount,
    evidence,
  };
}

/**
 * Draft content with LLM (if provider is available)
 * This is a placeholder for LLM integration - actual implementation would call an LLM API
 */
export async function draftContentWithLLM(options: ContentOptions & { llmProvider: string }): Promise<ContentDraft> {
  // First get base draft
  const baseDraft = await draftContent(options);

  // Mark as LLM-enhanced
  return {
    ...baseDraft,
    llm_used: true,
    llm_provider: options.llmProvider,
  };
}