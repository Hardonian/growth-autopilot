import { describe, it, expect } from 'vitest';
import { redact, containsSecret, REDACTED } from '../src/lib/redact.js';

describe('redact', () => {
  it('redacts denied keys', () => {
    const input = {
      name: 'test',
      api_key: 'sk-1234567890abcdef',
      password: 'supersecret',
      token: 'bearer-abc',
    };
    const result = redact(input);

    expect(result.name).toBe('test');
    expect(result.api_key).toBe(REDACTED);
    expect(result.password).toBe(REDACTED);
    expect(result.token).toBe(REDACTED);
  });

  it('redacts nested objects', () => {
    const input = {
      config: {
        secret: 'hidden',
        host: 'localhost',
      },
    };
    const result = redact(input);

    expect(result.config.secret).toBe(REDACTED);
    expect(result.config.host).toBe('localhost');
  });

  it('redacts values matching secret patterns (GitHub PAT)', () => {
    const input = {
      someField: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij',
    };
    const result = redact(input);
    expect(result.someField).toBe(REDACTED);
  });

  it('redacts values matching secret patterns (OpenAI key)', () => {
    const input = {
      myKey: 'sk-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMN',
    };
    const result = redact(input);
    expect(result.myKey).toBe(REDACTED);
  });

  it('redacts values matching AWS access key', () => {
    const input = {
      awsKey: 'AKIAIOSFODNN7EXAMPLE',
    };
    const result = redact(input);
    expect(result.awsKey).toBe(REDACTED);
  });

  it('preserves safe values', () => {
    const input = {
      host: 'api.example.com',
      port: 443,
      enabled: true,
    };
    const result = redact(input);
    expect(result).toEqual(input);
  });

  it('handles arrays', () => {
    const input = [
      { name: 'a', secret: 'hidden' },
      { name: 'b', secret: 'hidden2' },
    ];
    const result = redact(input);
    expect(result[0].secret).toBe(REDACTED);
    expect(result[1].secret).toBe(REDACTED);
    expect(result[0].name).toBe('a');
  });

  it('handles null and undefined', () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });

  it('handles primitives', () => {
    expect(redact('hello')).toBe('hello');
    expect(redact(42)).toBe(42);
    expect(redact(true)).toBe(true);
  });

  it('does not mutate input', () => {
    const input = { api_key: 'secret123', name: 'test' };
    const original = { ...input };
    redact(input);
    expect(input).toEqual(original);
  });
});

describe('containsSecret', () => {
  it('detects GitHub PAT', () => {
    expect(containsSecret('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij')).toBe(true);
  });

  it('detects AWS access key', () => {
    expect(containsSecret('AKIAIOSFODNN7EXAMPLE')).toBe(true);
  });

  it('returns false for safe strings', () => {
    expect(containsSecret('hello world')).toBe(false);
    expect(containsSecret('api_key=...')).toBe(false);
  });
});
