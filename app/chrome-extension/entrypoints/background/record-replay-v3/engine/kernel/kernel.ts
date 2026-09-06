/**
  * Brauzio internal note.
  * Brauzio internal note.
 */

import type { JsonObject } from '../../domain/json';
import type { FlowId, NodeId, RunId } from '../../domain/ids';
import type { RRError } from '../../domain/errors';
import type { FlowV3 } from '../../domain/flow';
import type { DebuggerCommand, DebuggerState } from '../../domain/debug';
import type { RunEvent, RunStatus, Unsubscribe } from '../../domain/events';

/**
  * Brauzio internal note.
 */
export interface RunStartRequest {
  /* Brauzio internal note. */
  runId: RunId;
  /** Flow ID */
  flowId: FlowId;
  /* Brauzio internal note. */
  flowSnapshot: FlowV3;
  /* Brauzio internal note. */
  args?: JsonObject;
  /* Brauzio internal note. */
  startNodeId?: NodeId;
  /* Brauzio internal note. */
  tabId: number;
  /* Brauzio internal note. */
  debug?: { breakpoints?: NodeId[]; pauseOnStart?: boolean };
}

/**
  * Brauzio internal note.
 */
export interface RunResult {
  /** Run ID */
  runId: RunId;
  /* Brauzio internal note. */
  status: Extract<RunStatus, 'succeeded' | 'failed' | 'canceled'>;
  /* Brauzio internal note. */
  tookMs: number;
  /* Brauzio internal note. */
  error?: RRError;
  /* Brauzio internal note. */
  outputs?: JsonObject;
}

/**
  * Brauzio internal note.
 */
export interface RunStatusInfo {
  /* Brauzio internal note. */
  status: RunStatus;
  /* Brauzio internal note. */
  currentNodeId?: NodeId;
  /* Brauzio internal note. */
  startedAt?: number;
  /* Brauzio internal note. */
  updatedAt: number;
  /** Tab ID */
  tabId?: number;
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface ExecutionKernel {
  /**
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
   */
  onEvent(listener: (event: RunEvent) => void): Unsubscribe;

  /**
    * Brauzio internal note.
    * Brauzio internal note.
   */
  startRun(req: RunStartRequest): Promise<void>;

  /**
    * Brauzio internal note.
   * @param runId Run ID
    * Brauzio internal note.
   */
  pauseRun(runId: RunId, reason?: { kind: 'command' }): Promise<void>;

  /**
    * Brauzio internal note.
   * @param runId Run ID
   */
  resumeRun(runId: RunId): Promise<void>;

  /**
    * Brauzio internal note.
   * @param runId Run ID
    * Brauzio internal note.
   */
  cancelRun(runId: RunId, reason?: string): Promise<void>;

  /**
    * Brauzio internal note.
   * @param runId Run ID
    * Brauzio internal note.
   */
  debug(
    runId: RunId,
    cmd: DebuggerCommand,
  ): Promise<{ ok: true; state?: DebuggerState } | { ok: false; error: string }>;

  /**
    * Brauzio internal note.
   * @param runId Run ID
    * Brauzio internal note.
   */
  getRunStatus(runId: RunId): Promise<RunStatusInfo | null>;

  /**
    * Brauzio internal note.
    * Brauzio internal note.
   */
  recover(): Promise<void>;
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export function createNotImplementedKernel(): ExecutionKernel {
  const notImplemented = () => {
    throw new Error('ExecutionKernel not implemented');
  };

  return {
    onEvent: () => {
      notImplemented();
      return () => {};
    },
    startRun: async () => notImplemented(),
    pauseRun: async () => notImplemented(),
    resumeRun: async () => notImplemented(),
    cancelRun: async () => notImplemented(),
    debug: async () => notImplemented(),
    getRunStatus: async () => notImplemented(),
    recover: async () => notImplemented(),
  };
}
