/**
  * Brauzio internal note.
  * Brauzio internal note.
 */

import type { JsonObject, JsonValue, UnixMillis } from './json';
import type { EdgeLabel, FlowId, NodeId, RunId } from './ids';
import type { RRError } from './errors';
import type { TriggerFireContext } from './triggers';

/* Brauzio internal note. */
export type Unsubscribe = () => void;

/* Brauzio internal note. */
export type RunStatus = 'queued' | 'running' | 'paused' | 'succeeded' | 'failed' | 'canceled';

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface EventBase {
  /* Brauzio internal note. */
  runId: RunId;
  /* Brauzio internal note. */
  ts: UnixMillis;
  /* Brauzio internal note. */
  seq: number;
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export type PauseReason =
  | { kind: 'breakpoint'; nodeId: NodeId }
  | { kind: 'step'; nodeId: NodeId }
  | { kind: 'command' }
  | { kind: 'policy'; nodeId: NodeId; reason: string };

/* Brauzio internal note. */
export type RecoveryReason = 'sw_restart' | 'lease_expired';

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export type RunEvent =
  // Brauzio internal note.
  | (EventBase & { type: 'run.queued'; flowId: FlowId })
  | (EventBase & { type: 'run.started'; flowId: FlowId; tabId: number })
  | (EventBase & { type: 'run.paused'; reason: PauseReason; nodeId?: NodeId })
  | (EventBase & { type: 'run.resumed' })
  | (EventBase & {
      type: 'run.recovered';
      /* Brauzio internal note. */
      reason: RecoveryReason;
      /* Brauzio internal note. */
      fromStatus: 'running' | 'paused';
      /* Brauzio internal note. */
      toStatus: 'queued';
      /* Brauzio internal note. */
      prevOwnerId?: string;
    })
  | (EventBase & { type: 'run.canceled'; reason?: string })
  | (EventBase & { type: 'run.succeeded'; tookMs: number; outputs?: JsonObject })
  | (EventBase & { type: 'run.failed'; error: RRError; nodeId?: NodeId })

  // Brauzio internal note.
  | (EventBase & { type: 'node.queued'; nodeId: NodeId })
  | (EventBase & { type: 'node.started'; nodeId: NodeId; attempt: number })
  | (EventBase & {
      type: 'node.succeeded';
      nodeId: NodeId;
      tookMs: number;
      next?: { kind: 'edgeLabel'; label: EdgeLabel } | { kind: 'end' };
    })
  | (EventBase & {
      type: 'node.failed';
      nodeId: NodeId;
      attempt: number;
      error: RRError;
      decision: 'retry' | 'continue' | 'stop' | 'goto';
    })
  | (EventBase & { type: 'node.skipped'; nodeId: NodeId; reason: 'disabled' | 'unreachable' })

  // Brauzio internal note.
  | (EventBase & {
      type: 'vars.patch';
      patch: Array<{ op: 'set' | 'delete'; name: string; value?: JsonValue }>;
    })
  | (EventBase & { type: 'artifact.screenshot'; nodeId: NodeId; data: string; savedAs?: string })
  | (EventBase & {
      type: 'log';
      level: 'debug' | 'info' | 'warn' | 'error';
      message: string;
      data?: JsonValue;
    });

/* Brauzio internal note. */
export type RunEventType = RunEvent['type'];

/**
  * Brauzio internal note.
 */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/**
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
 */
export type RunEventInput = DistributiveOmit<RunEvent, 'seq' | 'ts'> & {
  ts?: UnixMillis;
};

/* Brauzio internal note. */
export const RUN_SCHEMA_VERSION = 3 as const;

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface RunRecordV3 {
  /* Brauzio internal note. */
  schemaVersion: typeof RUN_SCHEMA_VERSION;
  /* Brauzio internal note. */
  id: RunId;
  /* Brauzio internal note. */
  flowId: FlowId;

  /* Brauzio internal note. */
  status: RunStatus;
  /* Brauzio internal note. */
  createdAt: UnixMillis;
  /* Brauzio internal note. */
  updatedAt: UnixMillis;

  /* Brauzio internal note. */
  startedAt?: UnixMillis;
  /* Brauzio internal note. */
  finishedAt?: UnixMillis;
  /* Brauzio internal note. */
  tookMs?: number;

  /* Brauzio internal note. */
  tabId?: number;
  /* Brauzio internal note. */
  startNodeId?: NodeId;
  /* Brauzio internal note. */
  currentNodeId?: NodeId;

  /* Brauzio internal note. */
  attempt: number;
  /* Brauzio internal note. */
  maxAttempts: number;

  /* Brauzio internal note. */
  args?: JsonObject;
  /* Brauzio internal note. */
  trigger?: TriggerFireContext;
  /* Brauzio internal note. */
  debug?: { breakpoints?: NodeId[]; pauseOnStart?: boolean };

  /* Brauzio internal note. */
  error?: RRError;
  /* Brauzio internal note. */
  outputs?: JsonObject;

  /* Brauzio internal note. */
  nextSeq: number;
}

/**
  * Brauzio internal note.
 */
export function isTerminalStatus(status: RunStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

/**
  * Brauzio internal note.
 */
export function isActiveStatus(status: RunStatus): boolean {
  return status === 'running' || status === 'paused';
}
