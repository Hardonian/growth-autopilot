/**
 * Simple in-memory cache with TTL support for deterministic caching
 * Used to reduce redundant I/O and computation
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class DeterministicCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private defaultTtlMs: number;

  constructor(defaultTtlMs = 60000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Get value from cache if exists and not expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Set value in cache with optional custom TTL
   */
  set(key: string, value: T, ttlMs?: number): void {
    const expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);
    this.cache.set(key, { value, expiresAt });
  }

  /**
   * Get or compute value - fetches from cache or executes factory
   */
  async getOrCompute(key: string, factory: () => Promise<T>, ttlMs?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size for monitoring
   */
  size(): number {
    // Clean expired entries first
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
    return this.cache.size;
  }
}

/**
 * Create a cache key from file path and stats (mtime + size)
 * Ensures cache invalidation when file changes
 */
export function createFileCacheKey(filePath: string, mtimeMs: number, size: number): string {
  return `${filePath}:${mtimeMs}:${size}`;
}

/**
 * Global cache instances for different use cases
 */
export const profileCache = new DeterministicCache<unknown>(300000); // 5 minutes
export const fileCache = new DeterministicCache<string>(60000); // 1 minute
export const parsedYamlCache = new DeterministicCache<unknown>(300000); // 5 minutes
