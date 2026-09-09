export interface RelayMetricsSnapshot {
  reconnectCount: number;
  reconnectAttempt: number;
  duplicateToolCalls: number;
  recoveredToolCalls: number;
  lastConnectedAt: number | null;
  lastAuthenticatedAt: number | null;
  lastDisconnectAt: number | null;
  lastPongAt: number | null;
  lastError: string | null;
  lastRequestId: string | null;
  lastToolName: string | null;
  pendingToolCalls: number;
  completedCacheEntries: number;
}

const state: RelayMetricsSnapshot = {
  reconnectCount: 0,
  reconnectAttempt: 0,
  duplicateToolCalls: 0,
  recoveredToolCalls: 0,
  lastConnectedAt: null,
  lastAuthenticatedAt: null,
  lastDisconnectAt: null,
  lastPongAt: null,
  lastError: null,
  lastRequestId: null,
  lastToolName: null,
  pendingToolCalls: 0,
  completedCacheEntries: 0,
};

function set<K extends keyof RelayMetricsSnapshot>(key: K, value: RelayMetricsSnapshot[K]): void {
  state[key] = value;
}

export const relayMetrics = {
  snapshot(): RelayMetricsSnapshot {
    return { ...state };
  },
  reconnectScheduled(attempt: number): void {
    state.reconnectCount += 1;
    set('reconnectAttempt', Math.max(0, Number(attempt || 0)));
  },
  connected(): void {
    set('lastConnectedAt', Date.now());
    set('lastError', null);
  },
  authenticated(): void {
    set('lastAuthenticatedAt', Date.now());
    set('reconnectAttempt', 0);
    set('lastError', null);
  },
  disconnected(error?: string): void {
    set('lastDisconnectAt', Date.now());
    if (error) set('lastError', String(error).slice(0, 2000));
  },
  pong(): void {
    set('lastPongAt', Date.now());
  },
  toolReceived(requestId: string, name: string): void {
    set('lastRequestId', String(requestId || ''));
    set('lastToolName', String(name || ''));
  },
  duplicate(): void {
    state.duplicateToolCalls += 1;
  },
  recovered(): void {
    state.recoveredToolCalls += 1;
  },
  pending(count: number): void {
    set('pendingToolCalls', Math.max(0, Number(count || 0)));
  },
  completedCache(count: number): void {
    set('completedCacheEntries', Math.max(0, Number(count || 0)));
  },
  error(error: unknown): void {
    set('lastError', error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000));
  },
};
