/**
  * Brauzio internal note.
  * Brauzio internal note.
 */

import type { JsonValue } from './json';

/* Brauzio internal note. */
export const RR_ERROR_CODES = {
  // Brauzio internal note.
  /* Brauzio internal note. */
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  /* Brauzio internal note. */
  UNSUPPORTED_NODE: 'UNSUPPORTED_NODE',
  /* Brauzio internal note. */
  DAG_INVALID: 'DAG_INVALID',
  /* Brauzio internal note. */
  DAG_CYCLE: 'DAG_CYCLE',

  // Brauzio internal note.
  /* Brauzio internal note. */
  TIMEOUT: 'TIMEOUT',
  /* Brauzio internal note. */
  TAB_NOT_FOUND: 'TAB_NOT_FOUND',
  /* Brauzio internal note. */
  FRAME_NOT_FOUND: 'FRAME_NOT_FOUND',
  /* Brauzio internal note. */
  TARGET_NOT_FOUND: 'TARGET_NOT_FOUND',
  /* Brauzio internal note. */
  ELEMENT_NOT_VISIBLE: 'ELEMENT_NOT_VISIBLE',
  /* Brauzio internal note. */
  NAVIGATION_FAILED: 'NAVIGATION_FAILED',
  /* Brauzio internal note. */
  NETWORK_REQUEST_FAILED: 'NETWORK_REQUEST_FAILED',

  // Brauzio internal note.
  /* Brauzio internal note. */
  SCRIPT_FAILED: 'SCRIPT_FAILED',
  /* Brauzio internal note. */
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  /* Brauzio internal note. */
  TOOL_ERROR: 'TOOL_ERROR',

  // Brauzio internal note.
  /* Brauzio internal note. */
  RUN_CANCELED: 'RUN_CANCELED',
  /* Brauzio internal note. */
  RUN_PAUSED: 'RUN_PAUSED',

  // Brauzio internal note.
  /* Brauzio internal note. */
  INTERNAL: 'INTERNAL',
  /* Brauzio internal note. */
  INVARIANT_VIOLATION: 'INVARIANT_VIOLATION',
} as const;

/* Brauzio internal note. */
export type RRErrorCode = (typeof RR_ERROR_CODES)[keyof typeof RR_ERROR_CODES];

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface RRError {
  /* Brauzio internal note. */
  code: RRErrorCode;
  /* Brauzio internal note. */
  message: string;
  /* Brauzio internal note. */
  data?: JsonValue;
  /* Brauzio internal note. */
  retryable?: boolean;
  /* Brauzio internal note. */
  cause?: RRError;
}

/**
  * Brauzio internal note.
 */
export function createRRError(
  code: RRErrorCode,
  message: string,
  options?: { data?: JsonValue; retryable?: boolean; cause?: RRError },
): RRError {
  return {
    code,
    message,
    ...(options?.data !== undefined && { data: options.data }),
    ...(options?.retryable !== undefined && { retryable: options.retryable }),
    ...(options?.cause !== undefined && { cause: options.cause }),
  };
}
