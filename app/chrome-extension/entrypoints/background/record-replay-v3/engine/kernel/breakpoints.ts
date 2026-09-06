/**
  * Brauzio internal note.
  * Brauzio internal note.
 */

import type { NodeId, RunId } from '../../domain/ids';
import type { Breakpoint, DebuggerState } from '../../domain/debug';

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export class BreakpointManager {
  private breakpoints = new Map<NodeId, Breakpoint>();
  private stepMode: 'none' | 'stepOver' = 'none';

  constructor(initialBreakpoints?: NodeId[]) {
    if (initialBreakpoints) {
      for (const nodeId of initialBreakpoints) {
        this.add(nodeId);
      }
    }
  }

  /**
    * Brauzio internal note.
   */
  add(nodeId: NodeId): void {
    this.breakpoints.set(nodeId, { nodeId, enabled: true });
  }

  /**
    * Brauzio internal note.
   */
  remove(nodeId: NodeId): void {
    this.breakpoints.delete(nodeId);
  }

  /**
    * Brauzio internal note.
   */
  setAll(nodeIds: NodeId[]): void {
    this.breakpoints.clear();
    for (const nodeId of nodeIds) {
      this.add(nodeId);
    }
  }

  /**
    * Brauzio internal note.
   */
  enable(nodeId: NodeId): void {
    const bp = this.breakpoints.get(nodeId);
    if (bp) {
      bp.enabled = true;
    }
  }

  /**
    * Brauzio internal note.
   */
  disable(nodeId: NodeId): void {
    const bp = this.breakpoints.get(nodeId);
    if (bp) {
      bp.enabled = false;
    }
  }

  /**
    * Brauzio internal note.
   */
  hasBreakpoint(nodeId: NodeId): boolean {
    const bp = this.breakpoints.get(nodeId);
    return bp?.enabled ?? false;
  }

  /**
    * Brauzio internal note.
    * Brauzio internal note.
   */
  shouldPauseAt(nodeId: NodeId): boolean {
    // Brauzio internal note.
    if (this.stepMode === 'stepOver') {
      return true;
    }
    // Brauzio internal note.
    return this.hasBreakpoint(nodeId);
  }

  /**
    * Brauzio internal note.
   */
  getAll(): Breakpoint[] {
    return Array.from(this.breakpoints.values());
  }

  /**
    * Brauzio internal note.
   */
  getEnabled(): Breakpoint[] {
    return this.getAll().filter((bp) => bp.enabled);
  }

  /**
    * Brauzio internal note.
   */
  setStepMode(mode: 'none' | 'stepOver'): void {
    this.stepMode = mode;
  }

  /**
    * Brauzio internal note.
   */
  getStepMode(): 'none' | 'stepOver' {
    return this.stepMode;
  }

  /**
    * Brauzio internal note.
   */
  clear(): void {
    this.breakpoints.clear();
    this.stepMode = 'none';
  }
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export class BreakpointRegistry {
  private managers = new Map<RunId, BreakpointManager>();

  /**
    * Brauzio internal note.
   */
  getOrCreate(runId: RunId, initialBreakpoints?: NodeId[]): BreakpointManager {
    let manager = this.managers.get(runId);
    if (!manager) {
      manager = new BreakpointManager(initialBreakpoints);
      this.managers.set(runId, manager);
    }
    return manager;
  }

  /**
    * Brauzio internal note.
   */
  get(runId: RunId): BreakpointManager | undefined {
    return this.managers.get(runId);
  }

  /**
    * Brauzio internal note.
   */
  remove(runId: RunId): void {
    this.managers.delete(runId);
  }

  /**
    * Brauzio internal note.
   */
  clear(): void {
    this.managers.clear();
  }
}

/* Brauzio internal note. */
let globalBreakpointRegistry: BreakpointRegistry | null = null;

/**
  * Brauzio internal note.
 */
export function getBreakpointRegistry(): BreakpointRegistry {
  if (!globalBreakpointRegistry) {
    globalBreakpointRegistry = new BreakpointRegistry();
  }
  return globalBreakpointRegistry;
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export function resetBreakpointRegistry(): void {
  globalBreakpointRegistry = null;
}
