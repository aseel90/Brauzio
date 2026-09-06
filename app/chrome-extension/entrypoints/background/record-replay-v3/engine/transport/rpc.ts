/**
  * Brauzio internal note.
  * Brauzio internal note.
 */

import type { JsonObject, JsonValue } from '../../domain/json';
import type { RunId } from '../../domain/ids';
import type { RunEvent } from '../../domain/events';

/* Brauzio internal note. */
export const RR_V3_PORT_NAME = 'rr_v3' as const;

/**
  * Brauzio internal note.
 */
export type RpcMethod =
  // Brauzio internal note.
  | 'rr_v3.listRuns'
  | 'rr_v3.getRun'
  | 'rr_v3.getEvents'
  // Brauzio internal note.
  | 'rr_v3.getFlow'
  | 'rr_v3.listFlows'
  | 'rr_v3.saveFlow'
  | 'rr_v3.deleteFlow'
  // Brauzio internal note.
  | 'rr_v3.createTrigger'
  | 'rr_v3.updateTrigger'
  | 'rr_v3.deleteTrigger'
  | 'rr_v3.getTrigger'
  | 'rr_v3.listTriggers'
  | 'rr_v3.enableTrigger'
  | 'rr_v3.disableTrigger'
  | 'rr_v3.fireTrigger'
  // Brauzio internal note.
  | 'rr_v3.enqueueRun'
  | 'rr_v3.listQueue'
  | 'rr_v3.cancelQueueItem'
  // Brauzio internal note.
  | 'rr_v3.startRun'
  | 'rr_v3.cancelRun'
  | 'rr_v3.pauseRun'
  | 'rr_v3.resumeRun'
  // Brauzio internal note.
  | 'rr_v3.debug'
  // Brauzio internal note.
  | 'rr_v3.subscribe'
  | 'rr_v3.unsubscribe';

/**
  * Brauzio internal note.
 */
export interface RpcRequest {
  type: 'rr_v3.request';
  /* Brauzio internal note. */
  requestId: string;
  /* Brauzio internal note. */
  method: RpcMethod;
  /* Brauzio internal note. */
  params?: JsonObject;
}

/**
  * Brauzio internal note.
 */
export interface RpcResponseOk {
  type: 'rr_v3.response';
  /* Brauzio internal note. */
  requestId: string;
  ok: true;
  /* Brauzio internal note. */
  result: JsonValue;
}

/**
  * Brauzio internal note.
 */
export interface RpcResponseErr {
  type: 'rr_v3.response';
  /* Brauzio internal note. */
  requestId: string;
  ok: false;
  /* Brauzio internal note. */
  error: string;
}

/**
  * Brauzio internal note.
 */
export type RpcResponse = RpcResponseOk | RpcResponseErr;

/**
  * Brauzio internal note.
 */
export interface RpcEventMessage {
  type: 'rr_v3.event';
  /* Brauzio internal note. */
  event: RunEvent;
}

/**
  * Brauzio internal note.
 */
export interface RpcSubscribeAck {
  type: 'rr_v3.subscribeAck';
  /* Brauzio internal note. */
  runId: RunId | null;
}

/**
  * Brauzio internal note.
 */
export type RpcMessage =
  | RpcRequest
  | RpcResponseOk
  | RpcResponseErr
  | RpcEventMessage
  | RpcSubscribeAck;

/**
  * Brauzio internal note.
 */
export function generateRequestId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
  * Brauzio internal note.
 */
export function isRpcRequest(msg: unknown): msg is RpcRequest {
  return typeof msg === 'object' && msg !== null && (msg as RpcRequest).type === 'rr_v3.request';
}

/**
  * Brauzio internal note.
 */
export function isRpcResponse(msg: unknown): msg is RpcResponse {
  return typeof msg === 'object' && msg !== null && (msg as RpcResponse).type === 'rr_v3.response';
}

/**
  * Brauzio internal note.
 */
export function isRpcEvent(msg: unknown): msg is RpcEventMessage {
  return typeof msg === 'object' && msg !== null && (msg as RpcEventMessage).type === 'rr_v3.event';
}

/**
  * Brauzio internal note.
 */
export function createRpcRequest(method: RpcMethod, params?: JsonObject): RpcRequest {
  return {
    type: 'rr_v3.request',
    requestId: generateRequestId(),
    method,
    params,
  };
}

/**
  * Brauzio internal note.
 */
export function createRpcResponseOk(requestId: string, result: JsonValue): RpcResponseOk {
  return {
    type: 'rr_v3.response',
    requestId,
    ok: true,
    result,
  };
}

/**
  * Brauzio internal note.
 */
export function createRpcResponseErr(requestId: string, error: string): RpcResponseErr {
  return {
    type: 'rr_v3.response',
    requestId,
    ok: false,
    error,
  };
}

/**
  * Brauzio internal note.
 */
export function createRpcEventMessage(event: RunEvent): RpcEventMessage {
  return {
    type: 'rr_v3.event',
    event,
  };
}
