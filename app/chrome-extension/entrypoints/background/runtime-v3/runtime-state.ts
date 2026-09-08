import type { V3RuntimeTabState } from './types';

const PREFIX = 'brauzio:v3:tab:';

function key(tabId: number): string {
  return `${PREFIX}${tabId}`;
}

class RuntimeStateStore {
  private memory = new Map<number, V3RuntimeTabState>();

  constructor() {
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.memory.delete(tabId);
      void chrome.storage.session.remove(key(tabId)).catch(() => undefined);
    });
  }

  async get(tabId: number): Promise<V3RuntimeTabState | undefined> {
    const cached = this.memory.get(tabId);
    if (cached) return cached;
    try {
      const result = await chrome.storage.session.get(key(tabId));
      const state = result[key(tabId)] as V3RuntimeTabState | undefined;
      if (state) this.memory.set(tabId, state);
      return state;
    } catch {
      return undefined;
    }
  }

  async patch(tabId: number, patch: Partial<V3RuntimeTabState>): Promise<V3RuntimeTabState> {
    const previous = (await this.get(tabId)) || {
      tabId,
      lastUpdatedAt: Date.now(),
    };
    const next: V3RuntimeTabState = {
      ...previous,
      ...patch,
      tabId,
      lastUpdatedAt: Date.now(),
    };
    this.memory.set(tabId, next);
    try {
      await chrome.storage.session.set({ [key(tabId)]: next });
    } catch {
      // Runtime state is an optimization. In-memory operation remains valid.
    }
    return next;
  }

  async clear(tabId: number): Promise<void> {
    this.memory.delete(tabId);
    await chrome.storage.session.remove(key(tabId)).catch(() => undefined);
  }
}

export const runtimeState = new RuntimeStateStore();
