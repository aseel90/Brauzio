/**
  * Brauzio internal note.
  * Brauzio internal note.
 */

import type { FlowId, RunId, TriggerId } from '../../domain/ids';
import type { FlowV3 } from '../../domain/flow';
import type { RunEvent, RunEventInput, RunRecordV3 } from '../../domain/events';
import type { PersistentVarRecord, PersistentVariableName } from '../../domain/variables';
import type { TriggerSpec } from '../../domain/triggers';
import type { RunQueue } from '../queue/queue';

/**
  * Brauzio internal note.
 */
export interface FlowsStore {
  /* Brauzio internal note. */
  list(): Promise<FlowV3[]>;
  /* Brauzio internal note. */
  get(id: FlowId): Promise<FlowV3 | null>;
  /* Brauzio internal note. */
  save(flow: FlowV3): Promise<void>;
  /* Brauzio internal note. */
  delete(id: FlowId): Promise<void>;
}

/**
  * Brauzio internal note.
 */
export interface RunsStore {
  /* Brauzio internal note. */
  list(): Promise<RunRecordV3[]>;
  /* Brauzio internal note. */
  get(id: RunId): Promise<RunRecordV3 | null>;
  /* Brauzio internal note. */
  save(record: RunRecordV3): Promise<void>;
  /* Brauzio internal note. */
  patch(id: RunId, patch: Partial<RunRecordV3>): Promise<void>;
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface EventsStore {
  /**
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
   */
  append(event: RunEventInput): Promise<RunEvent>;

  /**
    * Brauzio internal note.
   * @param runId Run ID
    * Brauzio internal note.
   */
  list(runId: RunId, opts?: { fromSeq?: number; limit?: number }): Promise<RunEvent[]>;
}

/**
  * Brauzio internal note.
 */
export interface PersistentVarsStore {
  /* Brauzio internal note. */
  get(key: PersistentVariableName): Promise<PersistentVarRecord | undefined>;
  /* Brauzio internal note. */
  set(
    key: PersistentVariableName,
    value: PersistentVarRecord['value'],
  ): Promise<PersistentVarRecord>;
  /* Brauzio internal note. */
  delete(key: PersistentVariableName): Promise<void>;
  /* Brauzio internal note. */
  list(prefix?: PersistentVariableName): Promise<PersistentVarRecord[]>;
}

/**
  * Brauzio internal note.
 */
export interface TriggersStore {
  /* Brauzio internal note. */
  list(): Promise<TriggerSpec[]>;
  /* Brauzio internal note. */
  get(id: TriggerId): Promise<TriggerSpec | null>;
  /* Brauzio internal note. */
  save(spec: TriggerSpec): Promise<void>;
  /* Brauzio internal note. */
  delete(id: TriggerId): Promise<void>;
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface StoragePort {
  /* Brauzio internal note. */
  flows: FlowsStore;
  /* Brauzio internal note. */
  runs: RunsStore;
  /* Brauzio internal note. */
  events: EventsStore;
  /* Brauzio internal note. */
  queue: RunQueue;
  /* Brauzio internal note. */
  persistentVars: PersistentVarsStore;
  /* Brauzio internal note. */
  triggers: TriggersStore;
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
function createNotImplementedStore<T extends object>(name: string): T {
  const target = {} as T;
  return new Proxy(target, {
    get(_, prop) {
      // Avoid thenable behavior by returning undefined for 'then'
      if (prop === 'then') {
        return undefined;
      }
      return async () => {
        throw new Error(`${name}.${String(prop)} not implemented`);
      };
    },
  });
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export function createNotImplementedStoragePort(): StoragePort {
  return {
    flows: createNotImplementedStore<FlowsStore>('FlowsStore'),
    runs: createNotImplementedStore<RunsStore>('RunsStore'),
    events: createNotImplementedStore<EventsStore>('EventsStore'),
    queue: createNotImplementedStore<RunQueue>('RunQueue'),
    persistentVars: createNotImplementedStore<PersistentVarsStore>('PersistentVarsStore'),
    triggers: createNotImplementedStore<TriggersStore>('TriggersStore'),
  };
}
