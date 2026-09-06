/**
  * Brauzio internal note.
 * @description
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
 *
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
 */

import type { UnixMillis } from '../../domain/json';
import type { RunId, TriggerId } from '../../domain/ids';
import type { TriggerFireContext, TriggerKind, TriggerSpec } from '../../domain/triggers';
import type { StoragePort } from '../storage/storage-port';
import type { EventsBus } from '../transport/events-bus';
import type { RunScheduler } from '../queue/scheduler';
import { enqueueRun, type EnqueueRunResult } from '../queue/enqueue-run';
import type { TriggerFireCallback, TriggerHandler, TriggerHandlerFactory } from './trigger-handler';

// ==================== Types ====================

/**
  * Brauzio internal note.
 */
export type TriggerHandlerFactories = Partial<{
  [K in TriggerKind]: TriggerHandlerFactory<K>;
}>;

/**
  * Brauzio internal note.
 */
export interface TriggerManagerStormControl {
  /**
    * Brauzio internal note.
    * Brauzio internal note.
   */
  cooldownMs?: number;

  /**
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
   */
  maxQueued?: number;
}

/**
  * Brauzio internal note.
 */
export interface TriggerManagerDeps {
  /* Brauzio internal note. */
  storage: Pick<StoragePort, 'triggers' | 'flows' | 'runs' | 'queue'>;
  /* Brauzio internal note. */
  events: Pick<EventsBus, 'append'>;
  /* Brauzio internal note. */
  scheduler?: Pick<RunScheduler, 'kick'>;
  /* Brauzio internal note. */
  handlerFactories: TriggerHandlerFactories;
  /* Brauzio internal note. */
  storm?: TriggerManagerStormControl;
  /* Brauzio internal note. */
  generateRunId?: () => RunId;
  /* Brauzio internal note. */
  now?: () => UnixMillis;
  /* Brauzio internal note. */
  logger?: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;
}

/**
  * Brauzio internal note.
 */
export interface TriggerManagerState {
  /* Brauzio internal note. */
  started: boolean;
  /* Brauzio internal note. */
  installedTriggerIds: TriggerId[];
}

/**
  * Brauzio internal note.
 */
export interface TriggerManager {
  /* Brauzio internal note. */
  start(): Promise<void>;
  /* Brauzio internal note. */
  stop(): Promise<void>;
  /* Brauzio internal note. */
  refresh(): Promise<void>;
  /**
    * Brauzio internal note.
    * Brauzio internal note.
   */
  fire(
    triggerId: TriggerId,
    context?: { sourceTabId?: number; sourceUrl?: string },
  ): Promise<EnqueueRunResult>;
  /* Brauzio internal note. */
  dispose(): Promise<void>;
  /* Brauzio internal note. */
  getState(): TriggerManagerState;
}

// ==================== Utilities ====================

/**
  * Brauzio internal note.
 */
function normalizeNonNegativeInt(value: unknown, fallback: number, fieldName: string): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
  return Math.max(0, Math.floor(value));
}

/**
  * Brauzio internal note.
 */
function normalizePositiveInt(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
  const intValue = Math.floor(value);
  if (intValue < 1) {
    throw new Error(`${fieldName} must be >= 1`);
  }
  return intValue;
}

// ==================== Implementation ====================

/**
  * Brauzio internal note.
 */
export function createTriggerManager(deps: TriggerManagerDeps): TriggerManager {
  const logger = deps.logger ?? console;
  const now = deps.now ?? (() => Date.now());

  // Brauzio internal note.
  const cooldownMs = normalizeNonNegativeInt(deps.storm?.cooldownMs, 0, 'storm.cooldownMs');
  const maxQueued =
    deps.storm?.maxQueued === undefined || deps.storm?.maxQueued === null
      ? undefined
      : normalizePositiveInt(deps.storm.maxQueued, 'storm.maxQueued');

  // Brauzio internal note.
  const installed = new Map<TriggerId, TriggerSpec>();
  const lastFireAt = new Map<TriggerId, UnixMillis>();
  let started = false;
  let inFlightEnqueues = 0;

  // Brauzio internal note.
  let refreshPromise: Promise<void> | null = null;
  let pendingRefresh = false;

  // Brauzio internal note.
  const handlers = new Map<TriggerKind, TriggerHandler<TriggerKind>>();

  // Brauzio internal note.
  const fireCallback: TriggerFireCallback = {
    onFire: async (triggerId, context) => {
      // Brauzio internal note.
      try {
        await handleFire(triggerId as TriggerId, context);
      } catch (e) {
        logger.error('[TriggerManager] onFire failed:', e);
      }
    },
  };

  // Brauzio internal note.
  for (const [kind, factory] of Object.entries(deps.handlerFactories) as Array<
    [TriggerKind, TriggerHandlerFactory<TriggerKind> | undefined]
  >) {
    if (!factory) continue; // Skip undefined factory values

    const handler = factory(fireCallback) as TriggerHandler<TriggerKind>;
    if (handler.kind !== kind) {
      throw new Error(
        `[TriggerManager] Handler kind mismatch: factory key is "${kind}", but handler.kind is "${handler.kind}"`,
      );
    }
    handlers.set(kind, handler);
  }

  /**
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
   */
  async function handleFire(
    triggerId: TriggerId,
    context: { sourceTabId?: number; sourceUrl?: string },
    options?: { throwOnDrop?: boolean },
  ): Promise<EnqueueRunResult | null> {
    if (!started) {
      if (options?.throwOnDrop) {
        throw new Error('TriggerManager is not started');
      }
      return null;
    }

    const trigger = installed.get(triggerId);
    if (!trigger) {
      if (options?.throwOnDrop) {
        throw new Error(`Trigger "${triggerId}" is not installed`);
      }
      return null;
    }

    const t = now();

    // Brauzio internal note.
    const prevLastFireAt = lastFireAt.get(triggerId);
    if (cooldownMs > 0 && prevLastFireAt !== undefined && t - prevLastFireAt < cooldownMs) {
      logger.debug(`[TriggerManager] Dropping trigger "${triggerId}" (cooldown ${cooldownMs}ms)`);
      if (options?.throwOnDrop) {
        throw new Error(`Trigger "${triggerId}" dropped (cooldown ${cooldownMs}ms)`);
      }
      return null;
    }

    // Brauzio internal note.
    // Brauzio internal note.
    if (maxQueued !== undefined) {
      const queued = await deps.storage.queue.list('queued');
      if (queued.length + inFlightEnqueues >= maxQueued) {
        logger.warn(
          `[TriggerManager] Dropping trigger "${triggerId}" (queued=${queued.length}, inFlight=${inFlightEnqueues}, maxQueued=${maxQueued})`,
        );
        if (options?.throwOnDrop) {
          throw new Error(`Trigger "${triggerId}" dropped (maxQueued=${maxQueued})`);
        }
        return null;
      }
    }

    // Brauzio internal note.
    if (cooldownMs > 0) {
      lastFireAt.set(triggerId, t);
    }

    // Brauzio internal note.
    const triggerContext: TriggerFireContext = {
      triggerId: trigger.id,
      kind: trigger.kind,
      firedAt: t,
      sourceTabId: context.sourceTabId,
      sourceUrl: context.sourceUrl,
    };

    inFlightEnqueues += 1;
    try {
      const result = await enqueueRun(
        {
          storage: deps.storage,
          events: deps.events,
          scheduler: deps.scheduler,
          generateRunId: deps.generateRunId,
          now,
        },
        {
          flowId: trigger.flowId,
          args: trigger.args,
          trigger: triggerContext,
        },
      );
      return result;
    } catch (e) {
      // Brauzio internal note.
      if (cooldownMs > 0) {
        if (prevLastFireAt === undefined) {
          lastFireAt.delete(triggerId);
        } else {
          lastFireAt.set(triggerId, prevLastFireAt);
        }
      }
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`[TriggerManager] enqueueRun failed for trigger "${triggerId}":`, e);
      if (options?.throwOnDrop) {
        throw new Error(`enqueueRun failed for trigger "${triggerId}": ${msg}`);
      }
      return null;
    } finally {
      inFlightEnqueues -= 1;
    }
  }

  /**
    * Brauzio internal note.
    * Brauzio internal note.
   */
  async function fire(
    triggerId: TriggerId,
    context: { sourceTabId?: number; sourceUrl?: string } = {},
  ): Promise<EnqueueRunResult> {
    const result = await handleFire(triggerId, context, { throwOnDrop: true });
    if (!result) {
      throw new Error(`Trigger "${triggerId}" did not enqueue a run`);
    }
    return result;
  }

  /**
    * Brauzio internal note.
   */
  async function doRefresh(): Promise<void> {
    const triggers = await deps.storage.triggers.list();
    if (!started) return;

    // Brauzio internal note.
    // Brauzio internal note.
    for (const handler of handlers.values()) {
      try {
        await handler.uninstallAll();
      } catch (e) {
        logger.warn(`[TriggerManager] Error during uninstallAll for kind "${handler.kind}":`, e);
      }
    }
    installed.clear();

    // Brauzio internal note.
    for (const trigger of triggers) {
      if (!started) return;
      if (!trigger.enabled) continue;

      const handler = handlers.get(trigger.kind);
      if (!handler) {
        logger.warn(`[TriggerManager] No handler registered for kind "${trigger.kind}"`);
        continue;
      }

      try {
        await handler.install(trigger as Parameters<typeof handler.install>[0]);
        installed.set(trigger.id, trigger);
      } catch (e) {
        logger.error(`[TriggerManager] Failed to install trigger "${trigger.id}":`, e);
      }
    }
  }

  /**
    * Brauzio internal note.
   */
  async function refresh(): Promise<void> {
    if (!started) {
      throw new Error('TriggerManager is not started');
    }

    pendingRefresh = true;
    if (!refreshPromise) {
      refreshPromise = (async () => {
        while (started && pendingRefresh) {
          pendingRefresh = false;
          await doRefresh();
        }
      })().finally(() => {
        refreshPromise = null;
      });
    }

    return refreshPromise;
  }

  /**
    * Brauzio internal note.
   */
  async function start(): Promise<void> {
    if (started) return;
    started = true;
    await refresh();
  }

  /**
    * Brauzio internal note.
   */
  async function stop(): Promise<void> {
    if (!started) return;

    started = false;
    pendingRefresh = false;

    // Brauzio internal note.
    if (refreshPromise) {
      try {
        await refreshPromise;
      } catch {
        // Brauzio internal note.
      }
    }

    // Brauzio internal note.
    for (const handler of handlers.values()) {
      try {
        await handler.uninstallAll();
      } catch (e) {
        logger.warn('[TriggerManager] Error uninstalling handler:', e);
      }
    }
    installed.clear();
    lastFireAt.clear();
  }

  /**
    * Brauzio internal note.
   */
  async function dispose(): Promise<void> {
    await stop();
  }

  /**
    * Brauzio internal note.
   */
  function getState(): TriggerManagerState {
    return {
      started,
      installedTriggerIds: Array.from(installed.keys()),
    };
  }

  return { start, stop, refresh, fire, dispose, getState };
}
