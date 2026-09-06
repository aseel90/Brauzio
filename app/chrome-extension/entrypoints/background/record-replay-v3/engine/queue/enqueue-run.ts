/**
  * Brauzio internal note.
 * @description
  * Brauzio internal note.
 *
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
 */

import type { JsonObject, UnixMillis } from '../../domain/json';
import type { FlowId, NodeId, RunId } from '../../domain/ids';
import type { TriggerFireContext } from '../../domain/triggers';
import { RUN_SCHEMA_VERSION, type RunRecordV3 } from '../../domain/events';
import type { StoragePort } from '../storage/storage-port';
import type { EventsBus } from '../transport/events-bus';
import type { RunScheduler } from './scheduler';

// ==================== Types ====================

/**
  * Brauzio internal note.
 */
export interface EnqueueRunDeps {
  /* Brauzio internal note. */
  storage: Pick<StoragePort, 'flows' | 'runs' | 'queue'>;
  /* Brauzio internal note. */
  events: Pick<EventsBus, 'append'>;
  /* Brauzio internal note. */
  scheduler?: Pick<RunScheduler, 'kick'>;
  /* Brauzio internal note. */
  generateRunId?: () => RunId;
  /* Brauzio internal note. */
  now?: () => UnixMillis;
}

/**
  * Brauzio internal note.
 */
export interface EnqueueRunInput {
  /* Brauzio internal note. */
  flowId: FlowId;
  /* Brauzio internal note. */
  startNodeId?: NodeId;
  /* Brauzio internal note. */
  priority?: number;
  /* Brauzio internal note. */
  maxAttempts?: number;
  /* Brauzio internal note. */
  args?: JsonObject;
  /* Brauzio internal note. */
  trigger?: TriggerFireContext;
  /* Brauzio internal note. */
  debug?: {
    breakpoints?: NodeId[];
    pauseOnStart?: boolean;
  };
}

/**
  * Brauzio internal note.
 */
export interface EnqueueRunResult {
  /* Brauzio internal note. */
  runId: RunId;
  /* Brauzio internal note. */
  position: number;
}

// ==================== Utilities ====================

/**
  * Brauzio internal note.
 */
function defaultGenerateRunId(): RunId {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
  * Brauzio internal note.
 */
function validateInt(
  value: unknown,
  defaultValue: number,
  fieldName: string,
  opts?: { min?: number; max?: number },
): number {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
  const intValue = Math.floor(value);
  if (opts?.min !== undefined && intValue < opts.min) {
    throw new Error(`${fieldName} must be >= ${opts.min}`);
  }
  if (opts?.max !== undefined && intValue > opts.max) {
    throw new Error(`${fieldName} must be <= ${opts.max}`);
  }
  return intValue;
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 * @returns 1-based position, or -1 if run not found in queued items
 *
 * Note: Due to race conditions (scheduler may claim the run before this is called),
 * position may be -1. Callers should handle this gracefully.
 */
async function computeQueuePosition(
  storage: Pick<StoragePort, 'queue'>,
  runId: RunId,
): Promise<number> {
  const queueItems = await storage.queue.list('queued');
  queueItems.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.createdAt - b.createdAt;
  });
  const index = queueItems.findIndex((item) => item.id === runId);
  // Return -1 if not found (run may have been claimed already)
  return index === -1 ? -1 : index + 1;
}

// ==================== Main Function ====================

/**
  * Brauzio internal note.
 * @description
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
 */
export async function enqueueRun(
  deps: EnqueueRunDeps,
  input: EnqueueRunInput,
): Promise<EnqueueRunResult> {
  const { flowId } = input;
  if (!flowId) {
    throw new Error('flowId is required');
  }

  const now = deps.now ?? (() => Date.now());
  const generateRunId = deps.generateRunId ?? defaultGenerateRunId;

  // Brauzio internal note.
  const priority = validateInt(input.priority, 0, 'priority');
  const maxAttempts = validateInt(input.maxAttempts, 1, 'maxAttempts', { min: 1 });

  // Brauzio internal note.
  const flow = await deps.storage.flows.get(flowId);
  if (!flow) {
    throw new Error(`Flow "${flowId}" not found`);
  }

  // Brauzio internal note.
  if (input.startNodeId) {
    const nodeExists = flow.nodes.some((n) => n.id === input.startNodeId);
    if (!nodeExists) {
      throw new Error(`startNodeId "${input.startNodeId}" not found in flow "${flowId}"`);
    }
  }

  const ts = now();
  const runId = generateRunId();

  // Brauzio internal note.
  const runRecord: RunRecordV3 = {
    schemaVersion: RUN_SCHEMA_VERSION,
    id: runId,
    flowId,
    status: 'queued',
    createdAt: ts,
    updatedAt: ts,
    attempt: 0,
    maxAttempts,
    args: input.args,
    trigger: input.trigger,
    debug: input.debug,
    startNodeId: input.startNodeId,
    nextSeq: 0,
  };
  await deps.storage.runs.save(runRecord);

  // Brauzio internal note.
  await deps.storage.queue.enqueue({
    id: runId,
    flowId,
    priority,
    maxAttempts,
    args: input.args,
    trigger: input.trigger,
    debug: input.debug,
  });

  // Brauzio internal note.
  await deps.events.append({
    runId,
    type: 'run.queued',
    flowId,
  });

  // Brauzio internal note.
  const position = await computeQueuePosition(deps.storage, runId);

  // Brauzio internal note.
  if (deps.scheduler) {
    void deps.scheduler.kick();
  }

  return { runId, position };
}
