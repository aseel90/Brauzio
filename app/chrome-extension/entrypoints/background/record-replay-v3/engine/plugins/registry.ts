/**
  * Brauzio internal note.
  * Brauzio internal note.
 */

import type { NodeKind } from '../../domain/flow';
import type { TriggerKind } from '../../domain/triggers';
import { RR_ERROR_CODES, createRRError } from '../../domain/errors';
import type {
  NodeDefinition,
  TriggerDefinition,
  PluginRegistrationContext,
  RRPlugin,
} from './types';

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export class PluginRegistry implements PluginRegistrationContext {
  private nodes = new Map<NodeKind, NodeDefinition>();
  private triggers = new Map<TriggerKind, TriggerDefinition>();

  /**
    * Brauzio internal note.
    * Brauzio internal note.
   */
  registerNode(def: NodeDefinition): void {
    this.nodes.set(def.kind, def);
  }

  /**
    * Brauzio internal note.
    * Brauzio internal note.
   */
  registerTrigger(def: TriggerDefinition): void {
    this.triggers.set(def.kind, def);
  }

  /**
    * Brauzio internal note.
    * Brauzio internal note.
   */
  getNode(kind: NodeKind): NodeDefinition | undefined {
    return this.nodes.get(kind);
  }

  /**
    * Brauzio internal note.
    * Brauzio internal note.
   */
  getNodeOrThrow(kind: NodeKind): NodeDefinition {
    const def = this.nodes.get(kind);
    if (!def) {
      throw createRRError(RR_ERROR_CODES.UNSUPPORTED_NODE, `Node kind "${kind}" is not registered`);
    }
    return def;
  }

  /**
    * Brauzio internal note.
    * Brauzio internal note.
   */
  getTrigger(kind: TriggerKind): TriggerDefinition | undefined {
    return this.triggers.get(kind);
  }

  /**
    * Brauzio internal note.
    * Brauzio internal note.
   */
  getTriggerOrThrow(kind: TriggerKind): TriggerDefinition {
    const def = this.triggers.get(kind);
    if (!def) {
      throw createRRError(
        RR_ERROR_CODES.UNSUPPORTED_NODE,
        `Trigger kind "${kind}" is not registered`,
      );
    }
    return def;
  }

  /**
    * Brauzio internal note.
   */
  hasNode(kind: NodeKind): boolean {
    return this.nodes.has(kind);
  }

  /**
    * Brauzio internal note.
   */
  hasTrigger(kind: TriggerKind): boolean {
    return this.triggers.has(kind);
  }

  /**
    * Brauzio internal note.
   */
  listNodeKinds(): NodeKind[] {
    return Array.from(this.nodes.keys());
  }

  /**
    * Brauzio internal note.
   */
  listTriggerKinds(): TriggerKind[] {
    return Array.from(this.triggers.keys());
  }

  /**
    * Brauzio internal note.
    * Brauzio internal note.
   */
  registerPlugin(plugin: RRPlugin): void {
    plugin.register(this);
  }

  /**
    * Brauzio internal note.
   */
  registerPlugins(plugins: RRPlugin[]): void {
    for (const plugin of plugins) {
      this.registerPlugin(plugin);
    }
  }

  /**
    * Brauzio internal note.
    * Brauzio internal note.
   */
  clear(): void {
    this.nodes.clear();
    this.triggers.clear();
  }
}

/* Brauzio internal note. */
let globalRegistry: PluginRegistry | null = null;

/**
  * Brauzio internal note.
 */
export function getPluginRegistry(): PluginRegistry {
  if (!globalRegistry) {
    globalRegistry = new PluginRegistry();
  }
  return globalRegistry;
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export function resetPluginRegistry(): void {
  globalRegistry = null;
}
