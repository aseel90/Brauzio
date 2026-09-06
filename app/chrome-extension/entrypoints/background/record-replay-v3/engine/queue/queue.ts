/**
  * Brauzio internal note.
  * Brauzio internal note.
 */

import type { JsonObject, UnixMillis } from '../../domain/json';
import type { FlowId, NodeId, RunId } from '../../domain/ids';
import type { TriggerFireContext } from '../../domain/triggers';

/**
  * Brauzio internal note.
 */
export interface RunQueueConfig {
  /* Brauzio internal note. */
  maxParallelRuns: number;
  /* Brauzio internal note. */
  leaseTtlMs: number;
  /* Brauzio internal note. */
  heartbeatIntervalMs: number;
}

/**
  * Brauzio internal note.
 */
export const DEFAULT_QUEUE_CONFIG: RunQueueConfig = {
  maxParallelRuns: 3,
  leaseTtlMs: 15_000,
  heartbeatIntervalMs: 5_000,
};

/**
  * Brauzio internal note.
 */
export type QueueItemStatus = 'queued' | 'running' | 'paused';

/**
  * Brauzio internal note.
 */
export interface Lease {
  /* Brauzio internal note. */
  ownerId: string;
  /* Brauzio internal note. */
  expiresAt: UnixMillis;
}

/**
  * Brauzio internal note.
 */
export interface RunQueueItem {
  /** Run ID */
  id: RunId;
  /** Flow ID */
  flowId: FlowId;
  /* Brauzio internal note. */
  status: QueueItemStatus;
  /* Brauzio internal note. */
  createdAt: UnixMillis;
  /* Brauzio internal note. */
  updatedAt: UnixMillis;
  /* Brauzio internal note. */
  priority: number;
  /* Brauzio internal note. */
  attempt: number;
  /* Brauzio internal note. */
  maxAttempts: number;
  /** Tab ID */
  tabId?: number;
  /* Brauzio internal note. */
  args?: JsonObject;
  /* Brauzio internal note. */
  trigger?: TriggerFireContext;
  /* Brauzio internal note. */
  lease?: Lease;
  /* Brauzio internal note. */
  debug?: { breakpoints?: NodeId[]; pauseOnStart?: boolean };
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
 */
export type EnqueueInput = Omit<
  RunQueueItem,
  'status' | 'createdAt' | 'updatedAt' | 'attempt' | 'lease' | 'priority' | 'maxAttempts'
> & {
  id: RunId;
  /* Brauzio internal note. */
  priority?: number;
  /* Brauzio internal note. */
  maxAttempts?: number;
};

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface RunQueue {
  /**
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
   */
  enqueue(input: EnqueueInput): Promise<RunQueueItem>;

  /**
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
   */
  claimNext(ownerId: string, now: UnixMillis): Promise<RunQueueItem | null>;

  /**
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
   */
  heartbeat(ownerId: string, now: UnixMillis): Promise<void>;

  /**
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
   */
  reclaimExpiredLeases(now: UnixMillis): Promise<RunId[]>;

  /**
    * Brauzio internal note.
   * @description
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
   */
  recoverOrphanLeases(
    ownerId: string,
    now: UnixMillis,
  ): Promise<{
    requeuedRunning: Array<{ runId: RunId; prevOwnerId?: string }>;
    adoptedPaused: Array<{ runId: RunId; prevOwnerId?: string }>;
  }>;

  /**
    * Brauzio internal note.
   */
  markRunning(runId: RunId, ownerId: string, now: UnixMillis): Promise<void>;

  /**
    * Brauzio internal note.
   */
  markPaused(runId: RunId, ownerId: string, now: UnixMillis): Promise<void>;

  /**
    * Brauzio internal note.
   */
  markDone(runId: RunId, now: UnixMillis): Promise<void>;

  /**
    * Brauzio internal note.
   */
  cancel(runId: RunId, now: UnixMillis, reason?: string): Promise<void>;

  /**
    * Brauzio internal note.
   */
  get(runId: RunId): Promise<RunQueueItem | null>;

  /**
    * Brauzio internal note.
   */
  list(status?: QueueItemStatus): Promise<RunQueueItem[]>;
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export function createNotImplementedQueue(): RunQueue {
  const notImplemented = () => {
    throw new Error('RunQueue not implemented');
  };

  return {
    enqueue: async () => notImplemented(),
    claimNext: async () => notImplemented(),
    heartbeat: async () => notImplemented(),
    reclaimExpiredLeases: async () => notImplemented(),
    recoverOrphanLeases: async () => notImplemented(),
    markRunning: async () => notImplemented(),
    markPaused: async () => notImplemented(),
    markDone: async () => notImplemented(),
    cancel: async () => notImplemented(),
    get: async () => notImplemented(),
    list: async () => notImplemented(),
  };
}
