from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected source block not found in {path}: {old[:120]!r}")
    text = text.replace(old, new, 1)
    p.write_text(text, encoding="utf-8")


# 1) Historical EID fingerprint recovery. It only proposes candidates; stale status remains.
path = "app/chrome-extension/entrypoints/background/runtime-v3/element-registry.ts"
replace_once(path, """  findElement(tabId: number, eid: string, snapshotId?: string): V3Element | undefined {
    const snapshot = this.get(snapshotId) || this.latest(tabId);
    return snapshot?.elements.find((element) => element.eid === eid);
  }

  resolve(
""", """  findElement(tabId: number, eid: string, snapshotId?: string): V3Element | undefined {
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
""")
replace_once(path, """    const candidates: V3ResolveCandidate[] = [];
    for (const element of snapshot.elements) {
""", """    const historical = requestedEid
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
""")
p = Path(path)
t = p.read_text(encoding="utf-8")
score_replacements = {
    "if (typeof target.backendNodeId === 'number') {": "if (typeof expandedTarget.backendNodeId === 'number') {",
    "element.backendNodeId === target.backendNodeId": "element.backendNodeId === expandedTarget.backendNodeId",
    "if (target.frameId) add(element.frameId === target.frameId ? 0.8 : 0, 0.8, 'frame');":
        "if (expandedTarget.frameId) add(element.frameId === expandedTarget.frameId ? 0.8 : 0, 0.8, 'frame');",
    "if (target.role) {": "if (expandedTarget.role) {",
    "normalizeText(target.role)": "normalizeText(expandedTarget.role)",
    "if (target.tag) add(normalizeText(element.tag) === normalizeText(target.tag) ? 0.7 : 0, 0.7, 'tag');":
        "if (expandedTarget.tag) add(normalizeText(element.tag) === normalizeText(expandedTarget.tag) ? 0.7 : 0, 0.7, 'tag');",
    "if (target.type) add(attr(element, 'type') === normalizeText(target.type) ? 0.7 : 0, 0.7, 'type');":
        "if (expandedTarget.type) add(attr(element, 'type') === normalizeText(expandedTarget.type) ? 0.7 : 0, 0.7, 'type');",
    "if (target.id) add(attr(element, 'id') === normalizeText(target.id) ? 1 : 0, 1, 'id');":
        "if (expandedTarget.id) add(attr(element, 'id') === normalizeText(expandedTarget.id) ? 1 : 0, 1, 'id');",
    "if (target.fieldName) add(attr(element, 'name') === normalizeText(target.fieldName) ? 0.8 : 0, 0.8, 'fieldName');":
        "if (expandedTarget.fieldName) add(attr(element, 'name') === normalizeText(expandedTarget.fieldName) ? 0.8 : 0, 0.8, 'fieldName');",
    "if (target.placeholder) {": "if (expandedTarget.placeholder) {",
    "normalizeText(target.placeholder)": "normalizeText(expandedTarget.placeholder)",
    "if (target.href) {": "if (expandedTarget.href) {",
    "normalizeText(target.href)": "normalizeText(expandedTarget.href)",
    "if (target.name) {": "if (expandedTarget.name) {",
    "normalizeText(target.name)": "normalizeText(expandedTarget.name)",
    "if (target.text) {": "if (expandedTarget.text) {",
    "normalizeText(target.text)": "normalizeText(expandedTarget.text)",
}
for old, new in score_replacements.items():
    if old not in t:
        raise SystemExit(f"Expected scoring block not found in {path}: {old}")
    t = t.replace(old, new, 1)
p.write_text(t, encoding="utf-8")
replace_once(path, """      if (normalizedScore >= (options.minScore ?? 0.32)) {
        candidates.push({ eid: element.eid, score: Number(normalizedScore.toFixed(4)), reasons, element });
""", """      if (normalizedScore >= (options.minScore ?? 0.32)) {
        if (historical) reasons.unshift('historical-fingerprint');
        candidates.push({ eid: element.eid, score: Number(normalizedScore.toFixed(4)), reasons, element });
""")

# 2) Observation: full mode includes static text, password attributes are sanitized, last action is exposed.
path = "app/chrome-extension/entrypoints/background/runtime-v3/observation-service.ts"
replace_once(path, """          const tag = readString(strings, nodes.nodeName?.[nodeIndex]).toUpperCase();
          if (!tag || ['#TEXT', '#COMMENT', '#DOCUMENT', '#DOCUMENT-FRAGMENT'].includes(tag)) continue;
          const attributes = attributesAt(nodes, nodeIndex, strings);
          const ax = axByBackend.get(backendNodeId);
""", """          const tag = readString(strings, nodes.nodeName?.[nodeIndex]).toUpperCase();
          if (!tag || ['#COMMENT', '#DOCUMENT', '#DOCUMENT-FRAGMENT'].includes(tag)) continue;
          const isTextNode = tag === '#TEXT';
          if (isTextNode && mode !== 'full') continue;
          const attributes = attributesAt(nodes, nodeIndex, strings);
          const passwordLike = !isTextNode
            && tag === 'INPUT'
            && (String(attributes.type || '').toLowerCase() === 'password'
              || /(?:^|[-_ ])password(?:$|[-_ ])/i.test(String(attributes.autocomplete || '')));
          if (passwordLike) delete attributes.value;
          const ax = axByBackend.get(backendNodeId);
""")
replace_once(path, """          const interactive = clickable || editable || focusable || INTERACTIVE_ROLES.has(role);
          if (mode !== 'full' && !interactive) continue;

          const effectiveSessionId = context.sessionId || loader?.sessionId;
""", """          const interactive = clickable || editable || focusable || INTERACTIVE_ROLES.has(role);
          if (mode !== 'full' && !interactive) continue;
          if (isTextNode && !String(name || textValue || nodeValue || '').trim()) continue;

          const effectiveSessionId = context.sessionId || loader?.sessionId;
""")
replace_once(path, """            value: attributes.type?.toLowerCase() === 'password' || /password/i.test(attributes.autocomplete || '')
              ? undefined
              : (inputValue ?? ax?.value?.value),
""", """            value: passwordLike ? undefined : (inputValue ?? ax?.value?.value),
""")
replace_once(path, """    const tabs = await sessionGraph.tabs();
    const snapshotId = makeSnapshotId(tab.id);
    const eventCursor = eventJournal.cursor(tab.id);
    const storedSnapshot: V3ObservationSnapshot = {
""", """    const tabs = await sessionGraph.tabs();
    const snapshotId = makeSnapshotId(tab.id);
    const eventCursor = eventJournal.cursor(tab.id);
    const previousRuntimeState = await runtimeState.get(tab.id);
    const storedSnapshot: V3ObservationSnapshot = {
""")
replace_once(path, """      delta,
      eventCursor,
      warnings: warnings.length ? warnings : undefined,
""", """      delta,
      eventCursor,
      lastAction: previousRuntimeState?.lastAction,
      warnings: warnings.length ? warnings : undefined,
""")

# 3) Runtime state shape exposes a minimal last-action checkpoint.
path = "app/chrome-extension/entrypoints/background/runtime-v3/types.ts"
replace_once(path, """  delta?: V3SnapshotDelta;
  eventCursor?: number;
  warnings?: string[];
}
""", """  delta?: V3SnapshotDelta;
  eventCursor?: number;
  lastAction?: V3RuntimeTabState['lastAction'];
  warnings?: string[];
}
""")
replace_once(path, """  eventCursor?: number;
  sessionGraphEnabled?: boolean;
}
""", """  eventCursor?: number;
  sessionGraphEnabled?: boolean;
  lastAction?: {
    actionId: string;
    action: string;
    success: boolean;
    completedAt: number;
    targetEid?: string;
    afterSnapshotId?: string;
    errorCode?: string;
  };
}
""")

# 4) Action engine always acts on a fresh snapshot and persists a minimal mechanical checkpoint.
path = "app/chrome-extension/entrypoints/background/runtime-v3/action-engine.ts"
replace_once(path, """import { observationService } from './observation-service';
import { sessionGraph } from './session-graph';
""", """import { observationService } from './observation-service';
import { runtimeState } from './runtime-state';
import { sessionGraph } from './session-graph';
""")
replace_once(path, """    const actionId = makeActionId(tab.id);
    const startedAt = Date.now();
    await sessionGraph.ensure(tab.id);
    let before = elementRegistry.get(request.snapshotId) || elementRegistry.latest(tab.id);
    if (!before) before = (await observationService.observe(tab, { mode: 'compact' })).snapshot;
    const beforeSnapshotId = before.snapshotId;
    const startCursor = eventJournal.cursor(tab.id);
""", """    const actionId = makeActionId(tab.id);
    await sessionGraph.ensure(tab.id);
    // Always execute from a fresh mechanical snapshot. Historical snapshots stay
    // in the registry only to explain stale EIDs to the agent.
    const before = (await observationService.observe(tab, { mode: 'compact' })).snapshot;
    const beforeSnapshotId = before.snapshotId;
    const startedAt = Date.now();
    const startCursor = eventJournal.cursor(tab.id);
""")
replace_once(path, """      const evidence: V3ActionEvidence = {
        actionId,
        action: request.action,
        tabId: tab.id,
        startedAt,
        completedAt,
        elapsedMs: completedAt - startedAt,
        success: verification ? verification.verified : true,
        beforeSnapshotId,
        afterSnapshotId: observationResult?.snapshot.snapshotId,
        targetEid: targetElement?.eid,
        actionability,
        events,
        verification,
      };
      return {
""", """      const evidence: V3ActionEvidence = {
        actionId,
        action: request.action,
        tabId: tab.id,
        startedAt,
        completedAt,
        elapsedMs: completedAt - startedAt,
        success: verification ? verification.verified : true,
        beforeSnapshotId,
        afterSnapshotId: observationResult?.snapshot.snapshotId,
        targetEid: targetElement?.eid,
        actionability,
        events,
        verification,
      };
      await runtimeState.patch(tab.id, {
        lastAction: {
          actionId,
          action: request.action,
          success: evidence.success,
          completedAt,
          targetEid: targetElement?.eid,
          afterSnapshotId: observationResult?.snapshot.snapshotId,
        },
      });
      return {
""")
replace_once(path, """      return {
        evidence: {
          actionId,
          action: request.action,
          tabId: tab.id,
          startedAt,
          completedAt,
          elapsedMs: completedAt - startedAt,
          success: false,
          beforeSnapshotId,
          afterSnapshotId: failureObservation?.snapshot.snapshotId,
          targetEid: targetElement?.eid,
          actionability,
          events,
          error: normalized,
        },
        observation: failureObservation?.snapshot,
        screenshot: failureObservation?.screenshot,
        resolution,
      };
""", """      const failureEvidence: V3ActionEvidence = {
        actionId,
        action: request.action,
        tabId: tab.id,
        startedAt,
        completedAt,
        elapsedMs: completedAt - startedAt,
        success: false,
        beforeSnapshotId,
        afterSnapshotId: failureObservation?.snapshot.snapshotId,
        targetEid: targetElement?.eid,
        actionability,
        events,
        error: normalized,
      };
      await runtimeState.patch(tab.id, {
        lastAction: {
          actionId,
          action: request.action,
          success: false,
          completedAt,
          targetEid: targetElement?.eid,
          afterSnapshotId: failureObservation?.snapshot.snapshotId,
          errorCode: normalized.code,
        },
      });
      return {
        evidence: failureEvidence,
        observation: failureObservation?.snapshot,
        screenshot: failureObservation?.screenshot,
        resolution,
      };
""")

# 5) Live View survives same-tab navigation; old pixels are discarded.
path = "app/chrome-extension/entrypoints/background/tools/browser/live-view.ts"
replace_once(path, "const IDLE_STOP_MS = 15_000;", "const IDLE_STOP_MS = 120_000;")
replace_once(path, """chrome.tabs.onRemoved.addListener((tabId) => stopSession(tabId, 'tab_closed'));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' || typeof changeInfo.url === 'string') stopSession(tabId, 'navigation');
});
""", """chrome.tabs.onRemoved.addListener((tabId) => stopSession(tabId, 'tab_closed'));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'loading' && typeof changeInfo.url !== 'string') return;
  const session = sessions.get(tabId);
  if (!session?.running) return;
  // Keep the stream bound to this tab across navigation, but discard pixels from
  // the previous document so the agent cannot mistake an old frame for the new page.
  session.frames.length = 0;
  session.lastFrameAt = undefined;
  session.lastError = 'navigation_in_progress';
  session.lastClientTouchAt = Date.now();
});
""")

print("second hardening source transforms applied")
