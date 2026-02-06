/**
 * Standardized exit codes for all runners.
 *
 * 0 - Success
 * 2 - Validation error (bad input, schema mismatch)
 * 3 - External dependency failure (network, upstream service)
 * 4 - Unexpected bug (should be rare)
 */

export const EXIT_SUCCESS = 0;
export const EXIT_VALIDATION = 2;
export const EXIT_DEPENDENCY = 3;
export const EXIT_BUG = 4;

export type ExitCode =
  | typeof EXIT_SUCCESS
  | typeof EXIT_VALIDATION
  | typeof EXIT_DEPENDENCY
  | typeof EXIT_BUG;

export function classifyError(error: unknown): ExitCode {
  if (error instanceof ValidationError) return EXIT_VALIDATION;
  if (error instanceof DependencyError) return EXIT_DEPENDENCY;

  // Zod errors are validation errors
  if (
    error !== null &&
    typeof error === 'object' &&
    'issues' in error &&
    Array.isArray((error as { issues: unknown }).issues)
  ) {
    return EXIT_VALIDATION;
  }

  return EXIT_BUG;
}

/**
 * Thrown when user input or data fails validation.
 */
export class ValidationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Thrown when an external dependency (API, filesystem, network) fails.
 */
export class DependencyError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'DependencyError';
  }
}
