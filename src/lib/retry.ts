import { createHash } from 'node:crypto';
import { DependencyError } from './exit-codes.js';

export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  strategy: 'exponential_backoff' | 'fixed_interval';
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  strategy: 'exponential_backoff',
};

function computeDelay(attempt: number, policy: RetryPolicy): number {
  if (policy.strategy === 'fixed_interval') {
    return Math.min(policy.baseDelayMs, policy.maxDelayMs);
  }
  // exponential backoff with jitter
  const base = policy.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * policy.baseDelayMs * 0.5;
  return Math.min(base + jitter, policy.maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an async action with retry/backoff.
 * Wraps failures in DependencyError for proper exit code classification.
 */
export async function withRetry<T>(
  action: () => Promise<T>,
  opts?: Partial<RetryPolicy> & { label?: string }
): Promise<T> {
  const policy = { ...DEFAULT_RETRY_POLICY, ...opts };
  let lastError: unknown;

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    try {
      return await action();
    } catch (err) {
      lastError = err;
      if (attempt < policy.maxRetries) {
        const delay = computeDelay(attempt, policy);
        await sleep(delay);
      }
    }
  }

  const label = opts?.label ?? 'external action';
  throw new DependencyError(
    `${label} failed after ${policy.maxRetries + 1} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    lastError
  );
}

/**
 * Generate a deterministic idempotency key from a payload.
 * Two calls with identical payloads produce the same key.
 */
export function idempotencyKey(payload: unknown): string {
  const canonical = JSON.stringify(sortKeysDeep(payload));
  return createHash('sha256').update(canonical).digest('hex');
}

function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const record = value as Record<string, unknown>;
  return Object.keys(record)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortKeysDeep(record[key]);
      return acc;
    }, {});
}
