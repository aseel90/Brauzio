import { fnv1a, normalizeText } from './ids';
import type {
  V3Element,
  V3ElementFingerprint,
  V3ObservationSnapshot,
  V3ResolveCandidate,
  V3ResolveResult,
  V3ResolveTarget,
} from './types';

function attr(element: V3Element, name: string): string {
  return normalizeText(element.attributes[name]);
}

function compareText(expected: string, actual: string): { score: number; reason?: string } {
  if (!expected || !actual) return { score: 0 };
  if (expected === actual) return { score: 1, reason: 'exact' };
  if (actual.includes(expected) || expected.includes(actual)) return { score: 0.65, reason: 'contains' };
  return { score: 0 };
}

function fingerprintSignature(fp: V3ElementFingerprint): string {
  return fnv1a(
    [
      fp.documentId,
      fp.frameId,
      normalizeText(fp.role),
      normalizeText(fp.name),
      normalizeText(fp.text),
      normalizeText(fp.tag),
      normalizeText(fp.type),
      normalizeText(fp.id),
      normalizeText(fp.fieldName),
      normalizeText(fp.placeholder),
      normalizeText(fp.href),
    ].join('|'),
  );
}

export function elementSignature(element: Omit<V3Element, 'signature'>): string {
  const box = element.box
    ? `${Math.round(element.box.x)},${Math.round(element.box.y)},${Math.round(element.box.width)},${Math.round(element.box.height)}`
    : '';
  return fnv1a(
    [
      fingerprintSignature(element.fingerprint),
      element.visible ? '1' : '0',
      element.enabled ? '1' : '0',
      element.editable ? '1' : '0',
      element.clickable ? '1' : '0',
      String(element.checked ?? ''),
      String(element.selected ?? ''),
      String(element.expanded ?? ''),
      normalizeText(element.value),
      box,
    ].join('|'),
  );
}

class ElementRegistry {
  private snapshots = new Map<string, V3ObservationSnapshot>();
  private latestByTab = new Map<number, string>();
  private maxSnapshots = 12;

  store(snapshot: V3ObservationSnapshot): void {
    this.snapshots.set(snapshot.snapshotId, snapshot);
    this.latestByTab.set(snapshot.tabId, snapshot.snapshotId);
    const ids = [...this.snapshots.values()]
      .sort((a, b) => b.capturedAt - a.capturedAt)
      .map((item) => item.snapshotId);
    for (const stale of ids.slice(this.maxSnapshots)) this.snapshots.delete(stale);
  }

  get(snapshotId?: string): V3ObservationSnapshot | undefined {
    if (!snapshotId) return undefined;
    return this.snapshots.get(snapshotId);
  }

  latest(tabId: number): V3ObservationSnapshot | undefined {
    return this.get(this.latestByTab.get(tabId));
  }

  findElement(tabId: number, eid: string, snapshotId?: string): V3Element | undefined {
    const snapshot = this.get(snapshotId) || this.latest(tabId);
    return snapshot?.elements.find((element) => element.eid === eid);
  }

  resolve(
    tabId: number,
    target: V3ResolveTarget,
    options: { snapshotId?: string; limit?: number; minScore?: number } = {},
  ): V3ResolveResult {
    const snapshot = this.get(options.snapshotId) || this.latest(tabId);
    if (!snapshot) {
      return {
        status: 'not_found',
        snapshotId: options.snapshotId || '',
        requested: target,
        candidates: [],
      };
    }

    const requestedEid = String(target.eid || '').trim();
    if (requestedEid) {
      const exact = snapshot.elements.find((element) => element.eid === requestedEid);
      if (exact) {
        return {
          status: 'exact',
          snapshotId: snapshot.snapshotId,
          requested: target,
          candidates: [{ eid: exact.eid, score: 1, reasons: ['eid'], element: exact }],
        };
      }
    }

    const candidates: V3ResolveCandidate[] = [];
    for (const element of snapshot.elements) {
      let score = 0;
      let weight = 0;
      const reasons: string[] = [];
      const add = (matched: number, possible: number, reason?: string) => {
        if (possible <= 0) return;
        score += matched;
        weight += possible;
        if (reason && matched > 0) reasons.push(reason);
      };

      if (typeof target.backendNodeId === 'number') {
        add(element.backendNodeId === target.backendNodeId ? 1 : 0, 1, 'backendNodeId');
      }
      if (target.frameId) add(element.frameId === target.frameId ? 0.8 : 0, 0.8, 'frame');
      if (target.role) {
        add(normalizeText(element.role) === normalizeText(target.role) ? 1 : 0, 1, 'role');
      }
      if (target.tag) add(normalizeText(element.tag) === normalizeText(target.tag) ? 0.7 : 0, 0.7, 'tag');
      if (target.type) add(attr(element, 'type') === normalizeText(target.type) ? 0.7 : 0, 0.7, 'type');
      if (target.id) add(attr(element, 'id') === normalizeText(target.id) ? 1 : 0, 1, 'id');
      if (target.fieldName) add(attr(element, 'name') === normalizeText(target.fieldName) ? 0.8 : 0, 0.8, 'fieldName');
      if (target.placeholder) {
        add(attr(element, 'placeholder') === normalizeText(target.placeholder) ? 0.7 : 0, 0.7, 'placeholder');
      }
      if (target.href) {
        const expected = normalizeText(target.href);
        const actual = attr(element, 'href');
        const match = compareText(expected, actual);
        add(match.score * 0.8, 0.8, match.reason ? `href:${match.reason}` : undefined);
      }
      if (target.name) {
        const match = compareText(normalizeText(target.name), normalizeText(element.name));
        add(match.score * 1.4, 1.4, match.reason ? `name:${match.reason}` : undefined);
      }
      if (target.text) {
        const match = compareText(normalizeText(target.text), normalizeText(element.text || element.name));
        add(match.score, 1, match.reason ? `text:${match.reason}` : undefined);
      }

      if (weight === 0) continue;
      const normalizedScore = Math.max(0, Math.min(1, score / weight));
      if (normalizedScore >= (options.minScore ?? 0.32)) {
        candidates.push({ eid: element.eid, score: Number(normalizedScore.toFixed(4)), reasons, element });
      }
    }

    candidates.sort((a, b) => b.score - a.score || Number(b.element.visible) - Number(a.element.visible));
    const sliced = candidates.slice(0, Math.max(1, Math.min(options.limit ?? 8, 25)));
    const stale = Boolean(requestedEid);
    const best = sliced[0]?.score || 0;
    const second = sliced[1]?.score || 0;
    const unique = sliced.length > 0 && best >= 0.78 && best - second >= 0.12;

    return {
      status: stale
        ? 'stale_target'
        : sliced.length === 0
          ? 'not_found'
          : unique
            ? 'matched'
            : 'ambiguous',
      snapshotId: snapshot.snapshotId,
      requested: target,
      candidates: sliced,
    };
  }
}

export const elementRegistry = new ElementRegistry();
