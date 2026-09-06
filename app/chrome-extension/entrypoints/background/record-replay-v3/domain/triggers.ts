/**
  * Brauzio internal note.
  * Brauzio internal note.
 */

import type { JsonObject, UnixMillis } from './json';
import type { FlowId, TriggerId } from './ids';

/* Brauzio internal note. */
export type TriggerKind =
  | 'manual'
  | 'url'
  | 'cron'
  | 'interval'
  | 'once'
  | 'command'
  | 'contextMenu'
  | 'dom';

/**
  * Brauzio internal note.
 */
export interface TriggerSpecBase {
  /* Brauzio internal note. */
  id: TriggerId;
  /* Brauzio internal note. */
  kind: TriggerKind;
  /* Brauzio internal note. */
  enabled: boolean;
  /* Brauzio internal note. */
  flowId: FlowId;
  /* Brauzio internal note. */
  args?: JsonObject;
}

/**
  * Brauzio internal note.
 */
export interface UrlMatchRule {
  kind: 'url' | 'domain' | 'path';
  value: string;
}

/**
  * Brauzio internal note.
 */
export type TriggerSpec =
  // Brauzio internal note.
  | (TriggerSpecBase & { kind: 'manual' })

  // Brauzio internal note.
  | (TriggerSpecBase & {
      kind: 'url';
      match: UrlMatchRule[];
    })

  // Brauzio internal note.
  | (TriggerSpecBase & {
      kind: 'cron';
      cron: string;
      timezone?: string;
    })

  // Brauzio internal note.
  | (TriggerSpecBase & {
      kind: 'interval';
      /* Brauzio internal note. */
      periodMinutes: number;
    })

  // Brauzio internal note.
  | (TriggerSpecBase & {
      kind: 'once';
      /* Brauzio internal note. */
      whenMs: UnixMillis;
    })

  // Brauzio internal note.
  | (TriggerSpecBase & {
      kind: 'command';
      commandKey: string;
    })

  // Brauzio internal note.
  | (TriggerSpecBase & {
      kind: 'contextMenu';
      title: string;
      contexts?: ReadonlyArray<string>;
    })

  // Brauzio internal note.
  | (TriggerSpecBase & {
      kind: 'dom';
      selector: string;
      appear?: boolean;
      once?: boolean;
      debounceMs?: UnixMillis;
    });

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface TriggerFireContext {
  /* Brauzio internal note. */
  triggerId: TriggerId;
  /* Brauzio internal note. */
  kind: TriggerKind;
  /* Brauzio internal note. */
  firedAt: UnixMillis;
  /* Brauzio internal note. */
  sourceTabId?: number;
  /* Brauzio internal note. */
  sourceUrl?: string;
}

/**
  * Brauzio internal note.
 */
export type TriggerSpecByKind<K extends TriggerKind> = Extract<TriggerSpec, { kind: K }>;

/**
  * Brauzio internal note.
 */
export function isTriggerEnabled(trigger: TriggerSpec): boolean {
  return trigger.enabled;
}

/**
  * Brauzio internal note.
 */
export function createTriggerFireContext(
  trigger: TriggerSpec,
  options?: { sourceTabId?: number; sourceUrl?: string },
): TriggerFireContext {
  return {
    triggerId: trigger.id,
    kind: trigger.kind,
    firedAt: Date.now(),
    sourceTabId: options?.sourceTabId,
    sourceUrl: options?.sourceUrl,
  };
}
