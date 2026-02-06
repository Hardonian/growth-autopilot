/**
 * Redaction utility for logs and evidence.
 * Denylist-based: any key matching a forbidden pattern gets its value replaced with "[REDACTED]".
 */

const REDACTED = '[REDACTED]';

/** Keys whose values must never appear in logs or evidence. */
const DENY_KEYS: ReadonlySet<string> = new Set([
  'api_key',
  'apikey',
  'api-key',
  'secret',
  'password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'private_key',
  'secret_key',
  'credentials',
  'cookie',
  'session_id',
  'ssn',
  'credit_card',
]);

/** Patterns that indicate a value is a secret (for value-level scanning). */
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /^ghp_[A-Za-z0-9]{36}$/,       // GitHub PAT
  /^sk-[A-Za-z0-9]{48}/,         // OpenAI key
  /^AKIA[0-9A-Z]{16}$/,          // AWS access key
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, // Private keys
];

function isSecretKey(key: string): boolean {
  return DENY_KEYS.has(key.toLowerCase());
}

function isSecretValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return SECRET_VALUE_PATTERNS.some((p) => p.test(value));
}

/**
 * Deep-redact an object, replacing values for any denied keys.
 * Returns a new object (never mutates input).
 */
export function redact<T>(input: T): T {
  if (input === null || input === undefined) return input;
  if (typeof input !== 'object') {
    if (isSecretValue(input)) return REDACTED as unknown as T;
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item: unknown) => redact(item)) as unknown as T;
  }

  const record = input as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (isSecretKey(key)) {
      result[key] = REDACTED;
    } else if (typeof value === 'string' && isSecretValue(value)) {
      result[key] = REDACTED;
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redact(value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Check if a string contains any forbidden secret patterns.
 * Used by security tests to validate output.
 */
export function containsSecret(text: string): boolean {
  return SECRET_VALUE_PATTERNS.some((p) => p.test(text));
}

/** Exported for testing */
export { DENY_KEYS, SECRET_VALUE_PATTERNS, REDACTED };
