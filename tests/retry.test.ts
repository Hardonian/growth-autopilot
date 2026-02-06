import { describe, it, expect } from 'vitest';
import { withRetry, idempotencyKey } from '../src/lib/retry.js';
import { DependencyError } from '../src/lib/exit-codes.js';

describe('withRetry', () => {
  it('returns value on first success', async () => {
    const result = await withRetry(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('retries and succeeds', async () => {
    let attempts = 0;
    const result = await withRetry(
      () => {
        attempts++;
        if (attempts < 3) throw new Error('not yet');
        return Promise.resolve('ok');
      },
      { maxRetries: 3, baseDelayMs: 10 }
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('throws DependencyError after exhausting retries', async () => {
    try {
      await withRetry(
        () => Promise.reject(new Error('always fail')),
        { maxRetries: 1, baseDelayMs: 10, label: 'test action' }
      );
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DependencyError);
      expect((err as DependencyError).message).toContain('test action');
      expect((err as DependencyError).message).toContain('2 attempts');
    }
  });
});

describe('idempotencyKey', () => {
  it('produces deterministic key for same payload', () => {
    const payload = { action: 'send_email', to: 'user@example.com' };
    const key1 = idempotencyKey(payload);
    const key2 = idempotencyKey(payload);
    expect(key1).toBe(key2);
  });

  it('produces different key for different payload', () => {
    const key1 = idempotencyKey({ a: 1 });
    const key2 = idempotencyKey({ a: 2 });
    expect(key1).not.toBe(key2);
  });

  it('is key-order independent', () => {
    const key1 = idempotencyKey({ b: 2, a: 1 });
    const key2 = idempotencyKey({ a: 1, b: 2 });
    expect(key1).toBe(key2);
  });

  it('returns a hex string', () => {
    const key = idempotencyKey({ test: true });
    expect(/^[a-f0-9]{64}$/.test(key)).toBe(true);
  });
});
