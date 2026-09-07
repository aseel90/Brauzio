export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function makeDocumentId(
  tabId: number,
  frameId: string,
  loaderId?: string,
  url?: string,
): string {
  return `d_${fnv1a(`${tabId}|${frameId}|${loaderId || ''}|${url || ''}`)}`;
}

export function makeElementId(
  documentId: string,
  backendNodeId: number,
  sessionId?: string,
): string {
  return `e_${fnv1a(`${documentId}|${sessionId || 'root'}|${backendNodeId}`)}`;
}

export function makeSnapshotId(tabId: number): string {
  return `snap_${tabId}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

export function makeActionId(tabId: number): string {
  return `act_${tabId}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}
