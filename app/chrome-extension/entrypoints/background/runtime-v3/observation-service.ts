import { cdpRouter } from '@/utils/cdp-router';
import { elementRegistry, elementSignature } from './element-registry';
import { eventJournal } from './event-journal';
import { makeDocumentId, makeElementId, makeSnapshotId } from './ids';
import { runtimeState } from './runtime-state';
import { sessionGraph } from './session-graph';
import type {
  V3Element,
  V3Frame,
  V3ObservationSnapshot,
  V3Rect,
  V3SnapshotDelta,
  V3SnapshotMode,
} from './types';

interface ObserveOptions {
  mode?: V3SnapshotMode;
  sinceSnapshotId?: string;
  maxElements?: number;
  includeScreenshot?: boolean;
  screenshotQuality?: number;
}

interface ObservationResult {
  snapshot: V3ObservationSnapshot;
  screenshot?: { data: string; mimeType: 'image/jpeg' };
}

const INTERACTIVE_ROLES = new Set([
  'button', 'checkbox', 'combobox', 'gridcell', 'link', 'listbox', 'menuitem', 'menuitemcheckbox',
  'menuitemradio', 'option', 'radio', 'searchbox', 'slider', 'spinbutton', 'switch', 'tab', 'textbox',
  'treeitem',
]);
const INTERACTIVE_TAGS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'OPTION']);

function readString(strings: string[], index: unknown): string {
  return typeof index === 'number' && index >= 0 && index < strings.length ? String(strings[index] || '') : '';
}

function rareValue<T = unknown>(data: any, nodeIndex: number, strings?: string[]): T | undefined {
  if (!data || !Array.isArray(data.index)) return undefined;
  const at = data.index.indexOf(nodeIndex);
  if (at < 0) return undefined;
  if (!Array.isArray(data.value)) return true as T;
  const value = data.value[at];
  return (strings && typeof value === 'number' ? readString(strings, value) : value) as T;
}

function attributesAt(nodes: any, nodeIndex: number, strings: string[]): Record<string, string> {
  const flattened = Array.isArray(nodes?.attributes?.[nodeIndex]) ? nodes.attributes[nodeIndex] : [];
  const result: Record<string, string> = {};
  for (let i = 0; i < flattened.length; i += 2) {
    const name = readString(strings, flattened[i]);
    if (!name) continue;
    result[name.toLowerCase()] = readString(strings, flattened[i + 1]);
  }
  return result;
}

function layoutMap(document: any): Map<number, { box?: V3Rect }> {
  const result = new Map<number, { box?: V3Rect }>();
  const layout = document?.layout || {};
  const nodeIndexes = Array.isArray(layout.nodeIndex) ? layout.nodeIndex : [];
  for (let i = 0; i < nodeIndexes.length; i += 1) {
    const raw = Array.isArray(layout.bounds?.[i]) ? layout.bounds[i] : undefined;
    const box = raw && raw.length >= 4
      ? { x: Number(raw[0] || 0), y: Number(raw[1] || 0), width: Number(raw[2] || 0), height: Number(raw[3] || 0) }
      : undefined;
    result.set(Number(nodeIndexes[i]), { box });
  }
  return result;
}

function axProp(node: any, name: string): unknown {
  const prop = Array.isArray(node?.properties)
    ? node.properties.find((item: any) => item?.name === name)
    : undefined;
  return prop?.value?.value;
}

function boolish(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return Boolean(value);
}

function roleOf(ax: any): string {
  return String(ax?.role?.value || '').trim();
}

function nameOf(ax: any): string {
  return String(ax?.name?.value || '').trim();
}

function descriptionOf(ax: any): string {
  return String(ax?.description?.value || '').trim();
}

function makeDelta(current: V3Element[], base?: V3ObservationSnapshot): V3SnapshotDelta {
  const currentMap = new Map(current.map((element) => [element.eid, element]));
  const baseMap = new Map((base?.elements || []).map((element) => [element.eid, element]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [eid, element] of currentMap) {
    const previous = baseMap.get(eid);
    if (!previous) added.push(eid);
    else if (previous.signature !== element.signature) changed.push(eid);
  }
  for (const eid of baseMap.keys()) if (!currentMap.has(eid)) removed.push(eid);
  return { baseSnapshotId: base?.snapshotId, added, removed, changed };
}

function flattenFrameLoaders(frames: V3Frame[]): Map<string, { loaderId?: string; url?: string; sessionId?: string; targetId?: string }> {
  return new Map(frames.map((frame) => [frame.frameId, {
    loaderId: frame.loaderId,
    url: frame.url,
    sessionId: frame.sessionId,
    targetId: frame.targetId,
  }]));
}

class ObservationService {
  async observe(tab: chrome.tabs.Tab & { id: number }, options: ObserveOptions = {}): Promise<ObservationResult> {
    const startedAt = Date.now();
    const mode = options.mode || 'compact';
    const maxElements = Math.max(25, Math.min(Number(options.maxElements || (mode === 'full' ? 900 : 450)), 1500));
    await sessionGraph.ensure(tab.id);
    const frames = await sessionGraph.frames(tab.id);
    const frameInfo = flattenFrameLoaders(frames);
    const warnings: string[] = [];

    const contexts: Array<{ sessionId?: string; targetId?: string; snapshot: any; axNodes: any[] }> = [];
    try {
      contexts.push(await this.captureContext(tab.id, undefined, undefined, frames.map((frame) => frame.frameId)));
    } catch (error) {
      throw new Error(`V3 root observation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    for (const child of sessionGraph.childSessions(tab.id)) {
      if (child.targetType && !['iframe', 'page'].includes(child.targetType)) continue;
      try {
        contexts.push(await this.captureContext(tab.id, child.sessionId, child.targetId));
      } catch (error) {
        warnings.push(`child:${child.targetId}:${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const elements: V3Element[] = [];
    let focusedEid: string | undefined;
    let mainDocumentId = '';
    let mainUrl = String(tab.url || '');

    for (const context of contexts) {
      const strings: string[] = Array.isArray(context.snapshot?.strings) ? context.snapshot.strings : [];
      const axByBackend = new Map<number, any>();
      for (const ax of context.axNodes) {
        if (typeof ax?.backendDOMNodeId === 'number') axByBackend.set(ax.backendDOMNodeId, ax);
      }

      for (const document of context.snapshot?.documents || []) {
        const frameId = readString(strings, document.frameId) || context.targetId || frames[0]?.frameId || 'main';
        const loader = frameInfo.get(frameId);
        const documentUrl = readString(strings, document.documentURL) || loader?.url || mainUrl;
        const documentId = makeDocumentId(tab.id, frameId, loader?.loaderId, documentUrl);
        if (frameId === frames[0]?.frameId || !mainDocumentId) {
          mainDocumentId = documentId;
          mainUrl = documentUrl || mainUrl;
        }

        const nodes = document.nodes || {};
        const layout = layoutMap(document);
        const backendIds: number[] = Array.isArray(nodes.backendNodeId) ? nodes.backendNodeId : [];
        for (let nodeIndex = 0; nodeIndex < backendIds.length; nodeIndex += 1) {
          const backendNodeId = Number(backendIds[nodeIndex] || 0);
          if (!backendNodeId) continue;
          const tag = readString(strings, nodes.nodeName?.[nodeIndex]).toUpperCase();
          if (!tag || ['#TEXT', '#COMMENT', '#DOCUMENT', '#DOCUMENT-FRAGMENT'].includes(tag)) continue;
          const attributes = attributesAt(nodes, nodeIndex, strings);
          const ax = axByBackend.get(backendNodeId);
          const role = roleOf(ax);
          const name = nameOf(ax);
          const description = descriptionOf(ax);
          const nodeValue = readString(strings, nodes.nodeValue?.[nodeIndex]);
          const textValue = rareValue<string>(nodes.textValue, nodeIndex, strings);
          const inputValue = rareValue<string>(nodes.inputValue, nodeIndex, strings);
          const isClickable = Boolean(rareValue<boolean>(nodes.isClickable, nodeIndex));
          const box = layout.get(nodeIndex)?.box;
          const ignored = ax?.ignored === true;
          const hidden = attributes.hidden !== undefined || attributes['aria-hidden'] === 'true';
          const visible = Boolean(box && box.width > 0.5 && box.height > 0.5 && !ignored && !hidden);
          const disabled = boolish(axProp(ax, 'disabled')) === true || attributes.disabled !== undefined || attributes['aria-disabled'] === 'true';
          const editable = ['textbox', 'searchbox', 'combobox', 'spinbutton'].includes(role)
            || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)
            || attributes.contenteditable === 'true' || attributes.contenteditable === '';
          const focusable = boolish(axProp(ax, 'focusable')) === true || editable || INTERACTIVE_TAGS.has(tag) || attributes.tabindex !== undefined;
          const clickable = isClickable || INTERACTIVE_ROLES.has(role) || INTERACTIVE_TAGS.has(tag);
          const interactive = clickable || editable || focusable || INTERACTIVE_ROLES.has(role);
          if (mode !== 'full' && !interactive) continue;

          const effectiveSessionId = context.sessionId || loader?.sessionId;
          const effectiveTargetId = context.targetId || loader?.targetId;
          const eid = makeElementId(documentId, backendNodeId, effectiveSessionId);
          const text = name || String(textValue || nodeValue || '').trim();
          const fingerprint = {
            role: role || undefined,
            name: name || undefined,
            text: text || undefined,
            tag,
            type: attributes.type,
            id: attributes.id,
            fieldName: attributes.name,
            placeholder: attributes.placeholder,
            href: attributes.href,
            frameId,
            documentId,
          };
          const checkedRaw = axProp(ax, 'checked');
          const elementBase: Omit<V3Element, 'signature'> = {
            eid,
            backendNodeId,
            documentId,
            frameId,
            sessionId: effectiveSessionId,
            targetId: effectiveTargetId,
            role: role || undefined,
            name: name || undefined,
            description: description || undefined,
            text: text || undefined,
            tag,
            nodeName: tag,
            nodeValue: nodeValue || undefined,
            attributes,
            box,
            visible,
            enabled: !disabled,
            editable,
            clickable,
            focusable,
            checked: checkedRaw === 'mixed' ? 'mixed' : boolish(checkedRaw),
            selected: boolish(axProp(ax, 'selected')),
            expanded: boolish(axProp(ax, 'expanded')),
            required: boolish(axProp(ax, 'required')) || attributes.required !== undefined,
            value: attributes.type?.toLowerCase() === 'password' || /password/i.test(attributes.autocomplete || '')
              ? undefined
              : (inputValue ?? ax?.value?.value),
            fingerprint,
          };
          const element: V3Element = { ...elementBase, signature: elementSignature(elementBase) };
          elements.push(element);
          if (boolish(axProp(ax, 'focused')) === true) focusedEid = eid;
        }
      }
    }

    const deduped = [...new Map(elements.map((element) => [element.eid, element])).values()];
    deduped.sort((a, b) => {
      if (a.visible !== b.visible) return a.visible ? -1 : 1;
      const ay = a.box?.y ?? Number.MAX_SAFE_INTEGER;
      const by = b.box?.y ?? Number.MAX_SAFE_INTEGER;
      if (ay !== by) return ay - by;
      return (a.box?.x ?? 0) - (b.box?.x ?? 0);
    });
    const limited = deduped.slice(0, maxElements);

    const layoutMetrics = await cdpRouter.sendCommand<any>(tab.id, 'Page.getLayoutMetrics').catch(() => ({}));
    const visual = layoutMetrics.cssVisualViewport || layoutMetrics.visualViewport || {};
    const content = layoutMetrics.cssContentSize || layoutMetrics.contentSize || {};
    const dprResult = await cdpRouter.sendCommand<any>(tab.id, 'Runtime.evaluate', {
      expression: 'window.devicePixelRatio',
      returnByValue: true,
    }).catch(() => ({}));
    const dpr = Number(dprResult?.result?.value);
    const base = elementRegistry.get(options.sinceSnapshotId) || (mode === 'delta' ? elementRegistry.latest(tab.id) : undefined);
    const delta = makeDelta(limited, base);
    const tabs = await sessionGraph.tabs();
    const snapshotId = makeSnapshotId(tab.id);
    const eventCursor = eventJournal.cursor(tab.id);
    const storedSnapshot: V3ObservationSnapshot = {
      snapshotId,
      tabId: tab.id,
      windowId: tab.windowId,
      capturedAt: Date.now(),
      mode,
      url: mainUrl || String(tab.url || ''),
      title: String(tab.title || ''),
      documentId: mainDocumentId || makeDocumentId(tab.id, frames[0]?.frameId || 'main', frames[0]?.loaderId, mainUrl),
      viewport: {
        width: Number.isFinite(Number(visual.clientWidth)) ? Number(visual.clientWidth) : null,
        height: Number.isFinite(Number(visual.clientHeight)) ? Number(visual.clientHeight) : null,
        dpr: Number.isFinite(dpr) ? dpr : null,
        scrollX: Number(visual.pageX ?? 0),
        scrollY: Number(visual.pageY ?? 0),
        contentWidth: Number(content.width ?? 0),
        contentHeight: Number(content.height ?? 0),
      },
      tabs,
      frames,
      elements: limited,
      focusedEid,
      delta,
      eventCursor,
      warnings: warnings.length ? warnings : undefined,
    };
    elementRegistry.store(storedSnapshot);
    await runtimeState.patch(tab.id, {
      lastSnapshotId: snapshotId,
      lastDocumentId: storedSnapshot.documentId,
      lastUrl: storedSnapshot.url,
      eventCursor,
    });

    let returnedElements = limited;
    if (mode === 'delta' && base) {
      const interesting = new Set([...delta.added, ...delta.changed]);
      returnedElements = limited.filter((element) => interesting.has(element.eid));
    }
    const snapshot: V3ObservationSnapshot = { ...storedSnapshot, elements: returnedElements };
    const result: ObservationResult = { snapshot };

    if (options.includeScreenshot) {
      const quality = Math.max(35, Math.min(Number(options.screenshotQuality || 68), 90));
      const shot = await cdpRouter.sendCommand<any>(tab.id, 'Page.captureScreenshot', {
        format: 'jpeg',
        quality,
        fromSurface: true,
        captureBeyondViewport: false,
      }).catch((error) => {
        warnings.push(`screenshot:${error instanceof Error ? error.message : String(error)}`);
        return undefined;
      });
      if (shot?.data) result.screenshot = { data: shot.data, mimeType: 'image/jpeg' };
    }

    if (Date.now() - startedAt > 5000) warnings.push(`slow_observation:${Date.now() - startedAt}ms`);
    return result;
  }

  private async captureContext(
    tabId: number,
    sessionId?: string,
    targetId?: string,
    frameIds: string[] = [],
  ): Promise<{ sessionId?: string; targetId?: string; snapshot: any; axNodes: any[] }> {
    const send = async <T = any>(method: string, params?: object): Promise<T> => {
      if (sessionId) return await cdpRouter.sendToChild<T>(tabId, sessionId, method, params);
      return await cdpRouter.sendCommand<T>(tabId, method, params);
    };
    await send('DOM.enable').catch(() => undefined);
    const snapshot = await send<any>('DOMSnapshot.captureSnapshot', {
      computedStyles: [],
      includePaintOrder: true,
      includeDOMRects: true,
    });

    const axNodes: any[] = [];
    if (!sessionId && frameIds.length) {
      const seen = new Set<number>();
      for (const frameId of frameIds) {
        const response = await send<any>('Accessibility.getFullAXTree', { frameId }).catch(() => undefined);
        for (const node of response?.nodes || []) {
          if (typeof node?.backendDOMNodeId === 'number') {
            if (seen.has(node.backendDOMNodeId)) continue;
            seen.add(node.backendDOMNodeId);
          }
          axNodes.push(node);
        }
      }
    }
    if (!axNodes.length) {
      const response = await send<any>('Accessibility.getFullAXTree').catch(() => ({ nodes: [] }));
      axNodes.push(...(response?.nodes || []));
    }
    return { sessionId, targetId, snapshot, axNodes };
  }
}

export const observationService = new ObservationService();
