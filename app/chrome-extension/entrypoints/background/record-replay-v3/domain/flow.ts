/**
  * Brauzio internal note.
  * Brauzio internal note.
 */

import type { ISODateTimeString, JsonObject } from './json';
import type { EdgeId, EdgeLabel, FlowId, NodeId } from './ids';
import type { FlowPolicy, NodePolicy } from './policy';
import type { VariableDefinition } from './variables';

/* Brauzio internal note. */
export const FLOW_SCHEMA_VERSION = 3 as const;

/**
 * Edge V3
  * Brauzio internal note.
 */
export interface EdgeV3 {
  /* Brauzio internal note. */
  id: EdgeId;
  /* Brauzio internal note. */
  from: NodeId;
  /* Brauzio internal note. */
  to: NodeId;
  /* Brauzio internal note. */
  label?: EdgeLabel;
}

/* Brauzio internal note. */
export type NodeKind = string;

/**
 * Node V3
  * Brauzio internal note.
 */
export interface NodeV3 {
  /* Brauzio internal note. */
  id: NodeId;
  /* Brauzio internal note. */
  kind: NodeKind;
  /* Brauzio internal note. */
  name?: string;
  /* Brauzio internal note. */
  disabled?: boolean;
  /* Brauzio internal note. */
  policy?: NodePolicy;
  /* Brauzio internal note. */
  config: JsonObject;
  /* Brauzio internal note. */
  ui?: { x: number; y: number };
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface FlowBinding {
  kind: 'domain' | 'path' | 'url';
  value: string;
}

/**
 * Flow V3
  * Brauzio internal note.
 */
export interface FlowV3 {
  /* Brauzio internal note. */
  schemaVersion: typeof FLOW_SCHEMA_VERSION;
  /* Brauzio internal note. */
  id: FlowId;
  /* Brauzio internal note. */
  name: string;
  /* Brauzio internal note. */
  description?: string;
  /* Brauzio internal note. */
  createdAt: ISODateTimeString;
  /* Brauzio internal note. */
  updatedAt: ISODateTimeString;

  /* Brauzio internal note. */
  entryNodeId: NodeId;
  /* Brauzio internal note. */
  nodes: NodeV3[];
  /* Brauzio internal note. */
  edges: EdgeV3[];

  /* Brauzio internal note. */
  variables?: VariableDefinition[];
  /* Brauzio internal note. */
  policy?: FlowPolicy;
  /* Brauzio internal note. */
  meta?: {
    /* Brauzio internal note. */
    tags?: string[];
    /* Brauzio internal note. */
    bindings?: FlowBinding[];
  };
}

/**
  * Brauzio internal note.
 */
export function findNodeById(flow: FlowV3, nodeId: NodeId): NodeV3 | undefined {
  return flow.nodes.find((n) => n.id === nodeId);
}

/**
  * Brauzio internal note.
 */
export function findEdgesFrom(flow: FlowV3, nodeId: NodeId): EdgeV3[] {
  return flow.edges.filter((e) => e.from === nodeId);
}

/**
  * Brauzio internal note.
 */
export function findEdgesTo(flow: FlowV3, nodeId: NodeId): EdgeV3[] {
  return flow.edges.filter((e) => e.to === nodeId);
}
