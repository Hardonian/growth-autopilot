import { describe, it, expect } from 'vitest';
import { ZodError, z } from 'zod';
import { toErrorEnvelope, ErrorEnvelopeSchema } from '../src/lib/error-envelope.js';
import {
  classifyError,
  ValidationError,
  DependencyError,
  EXIT_VALIDATION,
  EXIT_DEPENDENCY,
  EXIT_BUG,
} from '../src/lib/exit-codes.js';

describe('ErrorEnvelope', () => {
  it('wraps a ValidationError into an envelope', () => {
    const err = new ValidationError('bad input');
    const envelope = toErrorEnvelope(err);

    expect(envelope.code).toBe('VALIDATION_ERROR');
    expect(envelope.message).toBe('bad input');
    expect(envelope.retryable).toBe(false);
    expect(ErrorEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it('wraps a DependencyError into an envelope', () => {
    const err = new DependencyError('upstream timeout');
    const envelope = toErrorEnvelope(err);

    expect(envelope.code).toBe('DEPENDENCY_FAILURE');
    expect(envelope.message).toBe('upstream timeout');
    expect(envelope.retryable).toBe(true);
    expect(ErrorEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it('wraps a ZodError as validation', () => {
    const schema = z.object({ name: z.string() });
    const result = schema.safeParse({ name: 123 });
    if (result.success) throw new Error('expected failure');

    const envelope = toErrorEnvelope(result.error);
    expect(envelope.code).toBe('VALIDATION_ERROR');
    expect(envelope.retryable).toBe(false);
    expect(envelope.userMessage).toContain('Validation failed');
  });

  it('wraps an unknown error as unexpected', () => {
    const envelope = toErrorEnvelope('something went wrong');
    expect(envelope.code).toBe('UNEXPECTED_ERROR');
    expect(envelope.retryable).toBe(false);
  });

  it('includes context when provided', () => {
    const err = new Error('fail');
    const envelope = toErrorEnvelope(err, { command: 'plan', step: 'analyze' });
    expect(envelope.context).toEqual({ command: 'plan', step: 'analyze' });
  });
});

describe('classifyError', () => {
  it('classifies ValidationError as EXIT_VALIDATION', () => {
    expect(classifyError(new ValidationError('bad'))).toBe(EXIT_VALIDATION);
  });

  it('classifies DependencyError as EXIT_DEPENDENCY', () => {
    expect(classifyError(new DependencyError('timeout'))).toBe(EXIT_DEPENDENCY);
  });

  it('classifies ZodError as EXIT_VALIDATION', () => {
    const err = new ZodError([]);
    expect(classifyError(err)).toBe(EXIT_VALIDATION);
  });

  it('classifies generic Error as EXIT_BUG', () => {
    expect(classifyError(new Error('oops'))).toBe(EXIT_BUG);
  });

  it('classifies non-Error as EXIT_BUG', () => {
    expect(classifyError('string error')).toBe(EXIT_BUG);
  });
});
