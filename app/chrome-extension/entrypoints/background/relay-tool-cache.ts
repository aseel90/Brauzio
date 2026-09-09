export interface RelayToolResultPayload {
  type: 'tool_result';
  requestId: string;
  result?: unknown;
  error?: string;
}

const STORAGE_PREFIX = 'brauzio:relay:tool-result:';
const INDEX_KEY = 'brauzio:relay:tool-result:index';
const MAX_ENTRIES = 20;
const TTL_MS = 5 * 60_000;
const MAX_SERIALIZED_BYTES = 512_000;

interface CachedEntry {
  savedAt: number;
  payload: RelayToolResultPayload;
}

const completed = new Map<string, CachedEntry>();
const inflight = new Map<string, Promise<RelayToolResultPayload>>();

function key(requestId: string): string {
  return `${STORAGE_PREFIX}${requestId}`;
}

function fresh(entry?: CachedEntry): entry is CachedEntry {
  return Boolean(entry && Date.now() - entry.savedAt <= TTL_MS);
}

async function readStored(requestId: string): Promise<CachedEntry | undefined> {
  try {
    const result = await chrome.storage.session.get(key(requestId));
    const entry = result[key(requestId)] as CachedEntry | undefined;
    if (!fresh(entry)) {
      if (entry) await chrome.storage.session.remove(key(requestId));
      return undefined;
    }
    completed.set(requestId, entry);
    return entry;
  } catch {
    return undefined;
  }
}

async function persist(requestId: string, entry: CachedEntry): Promise<void> {
  let serialized = '';
  try {
    serialized = JSON.stringify(entry);
  } catch {
    return;
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_SERIALIZED_BYTES) return;

  try {
    const indexState = await chrome.storage.session.get(INDEX_KEY);
    const previous = Array.isArray(indexState[INDEX_KEY]) ? indexState[INDEX_KEY] as string[] : [];
    const next = [...previous.filter((id) => id !== requestId), requestId].slice(-MAX_ENTRIES);
    const removed = previous.filter((id) => !next.includes(id));
    await chrome.storage.session.set({ [key(requestId)]: entry, [INDEX_KEY]: next });
    if (removed.length) await chrome.storage.session.remove(removed.map(key));
  } catch {
    // In-memory dedupe remains valid for this service worker lifetime.
  }
}

export const relayToolCache = {
  async get(requestId: string): Promise<RelayToolResultPayload | undefined> {
    const id = String(requestId || '');
    const memory = completed.get(id);
    if (fresh(memory)) return structuredClone(memory.payload);
    if (memory) completed.delete(id);
    const stored = await readStored(id);
    return stored ? structuredClone(stored.payload) : undefined;
  },

  getInflight(requestId: string): Promise<RelayToolResultPayload> | undefined {
    return inflight.get(String(requestId || ''));
  },

  runOnce(
    requestId: string,
    runner: () => Promise<RelayToolResultPayload>,
  ): Promise<RelayToolResultPayload> {
    const id = String(requestId || '');
    const existing = inflight.get(id);
    if (existing) return existing;

    const promise = runner()
      .then(async (payload) => {
        const entry = { savedAt: Date.now(), payload } satisfies CachedEntry;
        completed.set(id, entry);
        while (completed.size > MAX_ENTRIES) {
          const oldest = completed.keys().next().value as string | undefined;
          if (!oldest) break;
          completed.delete(oldest);
        }
        await persist(id, entry);
        return payload;
      })
      .finally(() => inflight.delete(id));
    inflight.set(id, promise);
    return promise;
  },

  snapshot(): { inflight: number; completed: number; ttlMs: number } {
    return { inflight: inflight.size, completed: completed.size, ttlMs: TTL_MS };
  },
};
