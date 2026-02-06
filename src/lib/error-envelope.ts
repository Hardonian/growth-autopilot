import { z } from 'zod';
import { classifyError, EXIT_BUG, EXIT_DEPENDENCY, EXIT_VALIDATION, type ExitCode } from './exit-codes.js';

/**
 * Shared error envelope schema.
 * Never throw raw errors to users — wrap in this envelope.
 */
export const ErrorEnvelopeSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  userMessage: z.string(),
  retryable: z.boolean(),
  cause: z.unknown().optional(),
  context: z.record(z.unknown()).optional(),
});

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

function exitCodeToErrorCode(exitCode: ExitCode): string {
  switch (exitCode) {
    case EXIT_VALIDATION:
      return 'VALIDATION_ERROR';
    case EXIT_DEPENDENCY:
      return 'DEPENDENCY_FAILURE';
    case EXIT_BUG:
      return 'UNEXPECTED_ERROR';
    default:
      return 'UNKNOWN_ERROR';
  }
}

function isRetryable(exitCode: ExitCode): boolean {
  return exitCode === EXIT_DEPENDENCY;
}

function formatUserMessage(error: unknown, exitCode: ExitCode): string {
  if (exitCode === EXIT_VALIDATION) {
    // Zod errors get formatted nicely
    if (
      error !== null &&
      typeof error === 'object' &&
      'issues' in error &&
      Array.isArray((error as { issues: Array<{ path: string[]; message: string }> }).issues)
    ) {
      const issues = (error as { issues: Array<{ path: string[]; message: string }> }).issues;
      return `Validation failed: ${issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
    }
    if (error instanceof Error) return error.message;
    return 'Input validation failed. Check your configuration and try again.';
  }

  if (exitCode === EXIT_DEPENDENCY) {
    return 'An external dependency is unavailable. The operation can be retried.';
  }

  return 'An unexpected error occurred. Please report this issue.';
}

/**
 * Wrap any thrown error into a structured ErrorEnvelope.
 */
export function toErrorEnvelope(
  error: unknown,
  context?: Record<string, unknown>
): ErrorEnvelope {
  const exitCode = classifyError(error);
  const technicalMessage =
    error instanceof Error ? error.message : String(error);

  return {
    code: exitCodeToErrorCode(exitCode),
    message: technicalMessage,
    userMessage: formatUserMessage(error, exitCode),
    retryable: isRetryable(exitCode),
    cause: error instanceof Error ? error.stack : undefined,
    context,
  };
}
