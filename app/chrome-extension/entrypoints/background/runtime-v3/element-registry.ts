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

  findHistoricalElement(tabId: number, eid: string, excludeSnapshotId?: string): V3Element | undefined {
    return [...this.snapshots.values()]
      .filter((snapshot) => snapshot.tabId === tabId && snapshot.snapshotId !== excludeSnapshotId)
      .sort((a, b) => b.capturedAt - a.capturedAt)
      .flatMap((snapshot) => snapshot.elements)
      .find((element) => element.eid === eid);
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

    const historical = requestedEid
      ? this.findHistoricalElement(tabId, requestedEid, snapshot.snapshotId)
      : undefined;
    const expandedTarget: V3ResolveTarget = historical
      ? {
          role: historical.fingerprint.role,
          name: historical.fingerprint.name,
          text: historical.fingerprint.text,
          tag: historical.fingerprint.tag,
          type: historical.fingerprint.type,
          id: historical.fingerprint.id,
          fieldName: historical.fingerprint.fieldName,
          placeholder: historical.fingerprint.placeholder,
          href: historical.fingerprint.href,
          frameId: historical.fingerprint.frameId,
          ...target,
          // backendNodeId is document-scoped and is never inherited from history.
          backendNodeId: target.backendNodeId,
        }
      : target;

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

      if (typeof expandedTarget.backendNodeId === 'number') {
        add(element.backendNodeId === expandedTarget.backendNodeId ? 1 : 0, 1, 'backendNodeId');
      }
      if (expandedTarget.frameId) add(element.frameId === expandedTarget.frameId ? 0.8 : 0, 0.8, 'frame');
      if (expandedTarget.role) {
        add(normalizeText(element.role) === normalizeText(expandedTarget.role) ? 1 : 0, 1, 'role');
      }
      if (expandedTarget.tag) add(normalizeText(element.tag) === normalizeText(expandedTarget.tag) ? 0.7 : 0, 0.7, 'tag');
      if (expandedTarget.type) add(attr(element, 'type') === normalizeText(expandedTarget.type) ? 0.7 : 0, 0.7, 'type');
      if (expandedTarget.id) add(attr(element, 'id') === normalizeText(expandedTarget.id) ? 1 : 0, 1, 'id');
      if (expandedTarget.fieldName) add(attr(element, 'name') === normalizeText(expandedTarget.fieldName) ? 0.8 : 0, 0.8, 'fieldName');
      if (expandedTarget.placeholder) {
        add(attr(element, 'placeholder') === normalizeText(expandedTarget.placeholder) ? 0.7 : 0, 0.7, 'placeholder');
      }
      if (expandedTarget.href) {
        const expected = normalizeText(expandedTarget.href);
        const actual = attr(element, 'href');
        const match = compareText(expected, actual);
        add(match.score * 0.8, 0.8, match.reason ? `href:${match.reason}` : undefined);
      }
      if (expandedTarget.name) {
        const match = compareText(normalizeText(expandedTarget.name), normalizeText(element.name));
        add(match.score * 1.4, 1.4, match.reason ? `name:${match.reason}` : undefined);
      }
      if (expandedTarget.text) {
        const match = compareText(normalizeText(expandedTarget.text), normalizeText(element.text || element.name));
        add(match.score, 1, match.reason ? `text:${match.reason}` : undefined);
      }

      if (weight === 0) continue;
      let normalizedScore = Math.max(0, Math.min(1, score / weight));

      // Prefer candidates that are mechanically usable without letting UI state
      // overpower the explicit target fields. These small bonuses make ties more
      // deterministic on dynamic pages with repeated labels.
      if (element.visible) {
        normalizedScore += 0.05;
        reasons.push('visible');
      } else {
        normalizedScore -= 0.08;
      }
      if (element.enabled) {
        normalizedScore += 0.025;
        reasons.push('enabled');
      } else {
        normalizedScore -= 0.08;
      }
      if (element.clickable) {
        normalizedScore += 0.025;
        reasons.push('clickable');
      }
      if (element.focusable) normalizedScore += 0.01;
      if (element.editable) normalizedScore += 0.01;

      if (historical) {
        reasons.unshift('historical-fingerprint');
        const historicalFingerprint = fingerprintSignature(historical.fingerprint);
        const candidateFingerprint = fingerprintSignature(element.fingerprint);
        if (historicalFingerprint === candidateFingerprint) {
          normalizedScore += 0.12;
          reasons.unshift('fingerprint-exact');
        }
        if (historical.signature === element.signature) {
          normalizedScore += 0.06;
          reasons.unshift('signature-stable');
        }
        if (historical.box && element.box) {
          const oldX = historical.box.x + historical.box.width / 2;
          const oldY = historical.box.y + historical.box.height / 2;
          const newX = element.box.x + element.box.width / 2;
          const newY = element.box.y + element.box.height / 2;
          const distance = Math.hypot(newX - oldX, newY - oldY);
          const proximityBonus = Math.max(0, 0.06 * (1 - Math.min(distance, 600) / 600));
          if (proximityBonus >= 0.01) reasons.push('historical-position');
          normalizedScore += proximityBonus;
        }
      }

      normalizedScore = Math.max(0, Math.min(1, normalizedScore));
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
    const recoveredFromStaleEid = stale && unique;
    if (recoveredFromStaleEid && sliced[0] && !sliced[0].reasons.includes('stale-eid-recovered')) {
      sliced[0].reasons.unshift('stale-eid-recovered');
    }

    return {
      status: sliced.length === 0
        ? (stale ? 'stale_target' : 'not_found')
        : unique
          ? 'matched'
          : stale
            ? 'stale_target'
            : 'ambiguous',
      snapshotId: snapshot.snapshotId,
      requested: target,
      candidates: sliced,
      recoveredFromStaleEid,
    };
  }
}

export const elementRegistry = new ElementRegistry();
