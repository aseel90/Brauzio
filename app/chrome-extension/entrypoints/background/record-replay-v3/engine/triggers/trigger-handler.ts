/**
  * Brauzio internal note.
  * Brauzio internal note.
 */

import type { TriggerSpec, TriggerKind } from '../../domain/triggers';

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface TriggerHandler<K extends TriggerKind = TriggerKind> {
  /* Brauzio internal note. */
  readonly kind: K;

  /**
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
   */
  install(trigger: Extract<TriggerSpec, { kind: K }>): Promise<void>;

  /**
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
   */
  uninstall(triggerId: string): Promise<void>;

  /**
    * Brauzio internal note.
    * Brauzio internal note.
   */
  uninstallAll(): Promise<void>;

  /**
    * Brauzio internal note.
   */
  getInstalledIds(): string[];
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface TriggerFireCallback {
  /**
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
   */
  onFire(
    triggerId: string,
    context: {
      sourceTabId?: number;
      sourceUrl?: string;
    },
  ): Promise<void>;
}

/**
  * Brauzio internal note.
 */
export type TriggerHandlerFactory<K extends TriggerKind> = (
  fireCallback: TriggerFireCallback,
) => TriggerHandler<K>;
