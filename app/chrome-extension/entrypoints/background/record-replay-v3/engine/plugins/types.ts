/**
  * Brauzio internal note.
  * Brauzio internal note.
 */

import { z } from 'zod';

import type { JsonObject, JsonValue } from '../../domain/json';
import type { FlowId, NodeId, RunId, TriggerId } from '../../domain/ids';
import type { NodeKind } from '../../domain/flow';
import type { RRError } from '../../domain/errors';
import type { NodePolicy } from '../../domain/policy';
import type { FlowV3, NodeV3 } from '../../domain/flow';
import type { TriggerKind } from '../../domain/triggers';

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export type Schema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface NodeExecutionContext {
  /** Run ID */
  runId: RunId;
  /* Brauzio internal note. */
  flow: FlowV3;
  /* Brauzio internal note. */
  nodeId: NodeId;

  /* Brauzio internal note. */
  tabId: number;
  /* Brauzio internal note. */
  frameId?: number;

  /* Brauzio internal note. */
  vars: Record<string, JsonValue>;

  /**
    * Brauzio internal note.
   */
  log: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: JsonValue) => void;

  /**
    * Brauzio internal note.
    * Brauzio internal note.
   */
  chooseNext: (label: string) => { kind: 'edgeLabel'; label: string };

  /**
    * Brauzio internal note.
   */
  artifacts: {
    /* Brauzio internal note. */
    screenshot: () => Promise<{ ok: true; base64: string } | { ok: false; error: RRError }>;
  };

  /**
    * Brauzio internal note.
   */
  persistent: {
    /* Brauzio internal note. */
    get: (name: `$${string}`) => Promise<JsonValue | undefined>;
    /* Brauzio internal note. */
    set: (name: `$${string}`, value: JsonValue) => Promise<void>;
    /* Brauzio internal note. */
    delete: (name: `$${string}`) => Promise<void>;
  };
}

/**
  * Brauzio internal note.
 */
export interface VarsPatchOp {
  op: 'set' | 'delete';
  name: string;
  value?: JsonValue;
}

/**
  * Brauzio internal note.
 */
export type NodeExecutionResult =
  | {
      status: 'succeeded';
      /* Brauzio internal note. */
      next?: { kind: 'edgeLabel'; label: string } | { kind: 'end' };
      /* Brauzio internal note. */
      outputs?: JsonObject;
      /* Brauzio internal note. */
      varsPatch?: VarsPatchOp[];
    }
  | { status: 'failed'; error: RRError };

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface NodeDefinition<
  TKind extends NodeKind = NodeKind,
  TConfig extends JsonObject = JsonObject,
> {
  /* Brauzio internal note. */
  kind: TKind;
  /* Brauzio internal note. */
  schema: Schema<TConfig>;
  /* Brauzio internal note. */
  defaultPolicy?: NodePolicy;
  /**
    * Brauzio internal note.
    * Brauzio internal note.
    * Brauzio internal note.
   */
  execute(
    ctx: NodeExecutionContext,
    node: NodeV3 & { kind: TKind; config: TConfig },
  ): Promise<NodeExecutionResult>;
}

/**
  * Brauzio internal note.
 */
export interface TriggerInstallContext<
  TKind extends TriggerKind = TriggerKind,
  TConfig extends JsonObject = JsonObject,
> {
  /* Brauzio internal note. */
  triggerId: TriggerId;
  /* Brauzio internal note. */
  kind: TKind;
  /* Brauzio internal note. */
  enabled: boolean;
  /* Brauzio internal note. */
  flowId: FlowId;
  /* Brauzio internal note. */
  config: TConfig;
  /* Brauzio internal note. */
  args?: JsonObject;
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface TriggerDefinition<
  TKind extends TriggerKind = TriggerKind,
  TConfig extends JsonObject = JsonObject,
> {
  /* Brauzio internal note. */
  kind: TKind;
  /* Brauzio internal note. */
  schema: Schema<TConfig>;
  /* Brauzio internal note. */
  install(ctx: TriggerInstallContext<TKind, TConfig>): Promise<void> | void;
  /* Brauzio internal note. */
  uninstall(ctx: TriggerInstallContext<TKind, TConfig>): Promise<void> | void;
}

/**
  * Brauzio internal note.
 */
export interface PluginRegistrationContext {
  /* Brauzio internal note. */
  registerNode(def: NodeDefinition): void;
  /* Brauzio internal note. */
  registerTrigger(def: TriggerDefinition): void;
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface RRPlugin {
  /* Brauzio internal note. */
  name: string;
  /* Brauzio internal note. */
  register(ctx: PluginRegistrationContext): void;
}
