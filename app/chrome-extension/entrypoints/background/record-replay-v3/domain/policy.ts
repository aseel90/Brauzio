/**
  * Brauzio internal note.
  * Brauzio internal note.
 */

import type { EdgeLabel, NodeId } from './ids';
import type { RRErrorCode } from './errors';
import type { UnixMillis } from './json';

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface TimeoutPolicy {
  /* Brauzio internal note. */
  ms: UnixMillis;
  /* Brauzio internal note. */
  scope?: 'attempt' | 'node';
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface RetryPolicy {
  /* Brauzio internal note. */
  retries: number;
  /* Brauzio internal note. */
  intervalMs: UnixMillis;
  /* Brauzio internal note. */
  backoff?: 'none' | 'exp' | 'linear';
  /* Brauzio internal note. */
  maxIntervalMs?: UnixMillis;
  /* Brauzio internal note. */
  jitter?: 'none' | 'full';
  /* Brauzio internal note. */
  retryOn?: ReadonlyArray<RRErrorCode>;
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export type OnErrorPolicy =
  | { kind: 'stop' }
  | { kind: 'continue'; as?: 'warning' | 'error' }
  | {
      kind: 'goto';
      target: { kind: 'edgeLabel'; label: EdgeLabel } | { kind: 'node'; nodeId: NodeId };
    }
  | { kind: 'retry'; override?: Partial<RetryPolicy> };

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface ArtifactPolicy {
  /* Brauzio internal note. */
  screenshot?: 'never' | 'onFailure' | 'always';
  /* Brauzio internal note. */
  saveScreenshotAs?: string;
  /* Brauzio internal note. */
  includeConsole?: boolean;
  /* Brauzio internal note. */
  includeNetwork?: boolean;
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface NodePolicy {
  /* Brauzio internal note. */
  timeout?: TimeoutPolicy;
  /* Brauzio internal note. */
  retry?: RetryPolicy;
  /* Brauzio internal note. */
  onError?: OnErrorPolicy;
  /* Brauzio internal note. */
  artifacts?: ArtifactPolicy;
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface FlowPolicy {
  /* Brauzio internal note. */
  defaultNodePolicy?: NodePolicy;
  /* Brauzio internal note. */
  unsupportedNodePolicy?: OnErrorPolicy;
  /* Brauzio internal note. */
  runTimeoutMs?: UnixMillis;
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export function mergeNodePolicy(
  flowDefault: NodePolicy | undefined,
  nodePolicy: NodePolicy | undefined,
): NodePolicy {
  if (!flowDefault) return nodePolicy ?? {};
  if (!nodePolicy) return flowDefault;

  return {
    timeout: nodePolicy.timeout ?? flowDefault.timeout,
    retry: nodePolicy.retry ?? flowDefault.retry,
    onError: nodePolicy.onError ?? flowDefault.onError,
    artifacts: nodePolicy.artifacts
      ? { ...flowDefault.artifacts, ...nodePolicy.artifacts }
      : flowDefault.artifacts,
  };
}
