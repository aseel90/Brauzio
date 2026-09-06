/**
  * Brauzio internal note.
  * Brauzio internal note.
 *
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
 */

import type { Flow as FlowV2 } from '@/entrypoints/background/record-replay/types';
import type { FlowV3 } from '@/entrypoints/background/record-replay-v3/domain/flow';
import {
  convertFlowV2ToV3,
  convertFlowV3ToV2,
} from '@/entrypoints/background/record-replay-v3/storage/import/v2-to-v3';

// ==================== Types ====================

export interface FlowConversionResult<T> {
  flow: T;
  warnings: string[];
}

// ==================== V2 -> V3 (for RPC calls) ====================

/**
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
 */
export function flowV2ToV3ForRpc(flowV2: FlowV2): FlowConversionResult<FlowV3> {
  const result = convertFlowV2ToV3(flowV2 as unknown as Parameters<typeof convertFlowV2ToV3>[0]);

  if (!result.success || !result.data) {
    const errorMsg =
      result.errors.length > 0 ? result.errors.join('; ') : 'Unknown conversion error';
    throw new Error(`V2→V3 conversion failed: ${errorMsg}`);
  }

  return {
    flow: result.data,
    warnings: result.warnings,
  };
}

// ==================== V3 -> V2 (for Builder display) ====================

/**
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
 */
export function flowV3ToV2ForBuilder(flowV3: FlowV3): FlowConversionResult<FlowV2> {
  const result = convertFlowV3ToV2(flowV3);

  if (!result.success || !result.data) {
    const errorMsg =
      result.errors.length > 0 ? result.errors.join('; ') : 'Unknown conversion error';
    throw new Error(`V3→V2 conversion failed: ${errorMsg}`);
  }

  return {
    flow: result.data as unknown as FlowV2,
    warnings: result.warnings,
  };
}

// ==================== Type Guards ====================

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export function isFlowV3(value: unknown): value is FlowV3 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    obj.schemaVersion === 3 &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.entryNodeId === 'string' &&
    Array.isArray(obj.nodes)
  );
}

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export function isFlowV2(value: unknown): value is FlowV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    // Brauzio internal note.
    typeof obj.version === 'number' &&
    obj.schemaVersion === undefined &&
    // Brauzio internal note.
    (Array.isArray(obj.steps) || Array.isArray(obj.nodes))
  );
}

// ==================== Import Helpers ====================

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export function extractFlowCandidates(parsed: unknown): unknown[] {
  // Brauzio internal note.
  if (Array.isArray(parsed)) {
    return parsed;
  }

  // Brauzio internal note.
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;

    // Brauzio internal note.
    if (Array.isArray(obj.flows)) {
      return obj.flows;
    }

    // Brauzio internal note.
    if (obj.id && (Array.isArray(obj.steps) || Array.isArray(obj.nodes))) {
      return [obj];
    }
  }

  return [];
}
