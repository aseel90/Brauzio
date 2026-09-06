/**
  * Brauzio internal note.
  * Brauzio internal note.
 */

import type { JsonValue } from './json';
import type { NodeId, RunId } from './ids';
import type { PauseReason } from './events';

/**
  * Brauzio internal note.
 */
export interface Breakpoint {
  /* Brauzio internal note. */
  nodeId: NodeId;
  /* Brauzio internal note. */
  enabled: boolean;
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface DebuggerState {
  /* Brauzio internal note. */
  runId: RunId;
  /* Brauzio internal note. */
  status: 'attached' | 'detached';
  /* Brauzio internal note. */
  execution: 'running' | 'paused';
  /* Brauzio internal note. */
  pauseReason?: PauseReason;
  /* Brauzio internal note. */
  currentNodeId?: NodeId;
  /* Brauzio internal note. */
  breakpoints: Breakpoint[];
  /* Brauzio internal note. */
  stepMode?: 'none' | 'stepOver';
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export type DebuggerCommand =
  // Brauzio internal note.
  | { type: 'debug.attach'; runId: RunId }
  | { type: 'debug.detach'; runId: RunId }

  // Brauzio internal note.
  | { type: 'debug.pause'; runId: RunId }
  | { type: 'debug.resume'; runId: RunId }
  | { type: 'debug.stepOver'; runId: RunId }

  // Brauzio internal note.
  | { type: 'debug.setBreakpoints'; runId: RunId; nodeIds: NodeId[] }
  | { type: 'debug.addBreakpoint'; runId: RunId; nodeId: NodeId }
  | { type: 'debug.removeBreakpoint'; runId: RunId; nodeId: NodeId }

  // Brauzio internal note.
  | { type: 'debug.getState'; runId: RunId }

  // Brauzio internal note.
  | { type: 'debug.getVar'; runId: RunId; name: string }
  | { type: 'debug.setVar'; runId: RunId; name: string; value: JsonValue };

/* Brauzio internal note. */
export type DebuggerCommandType = DebuggerCommand['type'];

/**
  * Brauzio internal note.
 */
export type DebuggerResponse =
  | { ok: true; state?: DebuggerState; value?: JsonValue }
  | { ok: false; error: string };

/**
  * Brauzio internal note.
 */
export function createInitialDebuggerState(runId: RunId): DebuggerState {
  return {
    runId,
    status: 'detached',
    execution: 'running',
    breakpoints: [],
    stepMode: 'none',
  };
}
