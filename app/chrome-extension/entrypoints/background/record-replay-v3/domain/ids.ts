/**
  * Brauzio internal note.
  * Brauzio internal note.
 */

/* Brauzio internal note. */
export type FlowId = string;

/* Brauzio internal note. */
export type NodeId = string;

/* Brauzio internal note. */
export type EdgeId = string;

/* Brauzio internal note. */
export type RunId = string;

/* Brauzio internal note. */
export type TriggerId = string;

/* Brauzio internal note. */
export type EdgeLabel = string;

/* Brauzio internal note. */
export const EDGE_LABELS = {
  /* Brauzio internal note. */
  DEFAULT: 'default',
  /* Brauzio internal note. */
  ON_ERROR: 'onError',
  /* Brauzio internal note. */
  TRUE: 'true',
  /* Brauzio internal note. */
  FALSE: 'false',
} as const;

/* Brauzio internal note. */
export type EdgeLabelValue = (typeof EDGE_LABELS)[keyof typeof EDGE_LABELS];
