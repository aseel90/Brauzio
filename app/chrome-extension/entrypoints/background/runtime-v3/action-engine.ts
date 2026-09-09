import {
  hasActionVerification,
  prepareActionVerification,
  type ActionVerificationSpec,
  type PreparedActionVerification,
} from '@/utils/action-verification';
import { cdpRouter } from '@/utils/cdp-router';
import { actionabilityService } from './actionability';
import { elementRegistry } from './element-registry';
import { eventJournal } from './event-journal';
import { makeActionId } from './ids';
import { observationService } from './observation-service';
import { runtimeState } from './runtime-state';
import { sessionGraph } from './session-graph';
import type {
  V3ActionEvidence,
  V3Actionability,
  V3Element,
  V3ObservationSnapshot,
  V3ResolveResult,
  V3ResolveTarget,
} from './types';

export type V3ActionName =
  | 'click' | 'double_click' | 'hover' | 'focus'
  | 'fill' | 'clear' | 'type' | 'press' | 'select'
  | 'scroll' | 'drag' | 'upload'
  | 'navigate' | 'back' | 'forward' | 'reload';

export interface V3ActionRequest {
  action: V3ActionName;
  target?: V3ResolveTarget;
  source?: V3ResolveTarget;
  value?: unknown;
  text?: string;
  key?: string;
  url?: string;
  files?: string[];
  deltaX?: number;
  deltaY?: number;
  button?: 'left' | 'right' | 'middle';
  snapshotId?: string;
  observeAfter?: boolean;
  includeScreenshotAfter?: boolean;
  verification?: ActionVerificationSpec;
  timeoutMs?: number;
}

export interface V3ActionResult {
  evidence: V3ActionEvidence;
  observation?: V3ObservationSnapshot;
  screenshot?: { data: string; mimeType: 'image/jpeg' };
  resolution?: V3ResolveResult;
}

const TARGET_ACTIONS = new Set<V3ActionName>([
  'click', 'double_click', 'hover', 'focus', 'fill', 'clear', 'type', 'press', 'select', 'upload',
]);

const KEY_MAP: Record<string, { key: string; code: string; windowsVirtualKeyCode: number }> = {
  ENTER: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
  TAB: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  ESC: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  ESCAPE: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  BACKSPACE: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
  DELETE: { key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 },
  ARROWUP: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
  ARROWDOWN: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  ARROWLEFT: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
  ARROWRIGHT: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
  HOME: { key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 },
  END: { key: 'End', code: 'End', windowsVirtualKeyCode: 35 },
  PAGEUP: { key: 'PageUp', code: 'PageUp', windowsVirtualKeyCode: 33 },
  PAGEDOWN: { key: 'PageDown', code: 'PageDown', windowsVirtualKeyCode: 34 },
  SPACE: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32 },
};

class ActionEngine {
  async execute(tab: chrome.tabs.Tab & { id: number }, request: V3ActionRequest): Promise<V3ActionResult> {
    const actionId = makeActionId(tab.id);
    await sessionGraph.ensure(tab.id);
    // Always execute from a fresh mechanical snapshot. Drag needs the full DOM
    // because draggable/drop targets are frequently non-interactive and omitted
    // from compact observations. EIDs remain deterministic for the same document.
    const before = (await observationService.observe(tab, {
      mode: request.action === 'drag' ? 'full' : 'compact',
    })).snapshot;
    const beforeSnapshotId = before.snapshotId;
    const startedAt = Date.now();
    const startCursor = eventJournal.cursor(tab.id);
    const releaseActionScope = eventJournal.beginAction(tab.id, actionId);
    const timeoutMs = Math.max(250, Math.min(Number(request.timeoutMs || 5000), 30000));
    let verifier: PreparedActionVerification | undefined;
    let targetElement: V3Element | undefined;
    let resolution: V3ResolveResult | undefined;
    let actionability;
    let navigationWaiter: { promise: Promise<void>; cancel: () => void } | undefined;

    try {
      if (hasActionVerification(request.verification)) {
        verifier = await prepareActionVerification(tab.id, request.verification!);
      }

      if (TARGET_ACTIONS.has(request.action)) {
        if (!request.target) throw this.error('TARGET_REQUIRED', `Action ${request.action} requires target`);
        resolution = this.resolveTarget(tab.id, request.target, before.snapshotId);
        if (!['exact', 'matched'].includes(resolution.status) || !resolution.candidates[0]) {
          throw this.error(
            resolution.status === 'stale_target' ? 'STALE_TARGET' : 'TARGET_AMBIGUOUS',
            `Unable to resolve target safely (${resolution.status})`,
            resolution,
          );
        }
        targetElement = resolution.candidates[0].element;
      }

      if (request.action === 'drag') {
        if (!request.source || !request.target) throw this.error('TARGET_REQUIRED', 'drag requires source and target');
      }

      if (targetElement && request.action !== 'upload') {
        const mode = ['fill', 'clear', 'type', 'select'].includes(request.action)
          ? 'editable'
          : ['focus', 'press'].includes(request.action)
            ? 'focus'
            : 'pointer';
        actionability = await actionabilityService.waitFor(tab.id, targetElement, { mode, timeoutMs, scroll: true });
        if (!actionability.actionable) {
          throw this.error('NOT_ACTIONABLE', `Target is not actionable within ${timeoutMs}ms: ${actionability.reason || 'unknown'}`, actionability);
        }
      }

      navigationWaiter = ['navigate', 'back', 'forward', 'reload'].includes(request.action)
        ? this.prepareNavigationReady(tab.id, Math.min(Math.max(timeoutMs, 5000), 15000))
        : undefined;
      await this.perform(tab, request, targetElement, before, actionability);
      if (navigationWaiter) await navigationWaiter.promise;
      const verification = verifier ? await verifier.verify() : undefined;
      verifier = undefined;

      let observationResult;
      if (request.observeAfter !== false) {
        observationResult = await observationService.observe(tab, {
          mode: 'delta',
          sinceSnapshotId: beforeSnapshotId,
          includeScreenshot: request.includeScreenshotAfter === true,
        });
      }
      const completedAt = Date.now();
      const events = eventJournal.read(tab.id, { afterSequence: startCursor, since: startedAt, until: completedAt, actionId, limit: 180 });
      const evidence: V3ActionEvidence = {
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
        evidence,
        observation: observationResult?.snapshot,
        screenshot: observationResult?.screenshot,
        resolution,
      };
    } catch (error) {
      navigationWaiter?.cancel();
      await verifier?.cancel().catch(() => undefined);
      const completedAt = Date.now();
      const normalized = this.normalizeError(error);
      const events = eventJournal.read(tab.id, { afterSequence: startCursor, since: startedAt, until: completedAt, actionId, limit: 180 });
      let failureObservation;
      try {
        failureObservation = await observationService.observe(tab, {
          mode: 'delta',
          sinceSnapshotId: beforeSnapshotId,
          includeScreenshot: true,
          screenshotQuality: 60,
        });
      } catch {
        failureObservation = undefined;
      }
      const failureEvidence: V3ActionEvidence = {
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
    } finally {
      releaseActionScope();
    }
  }

  private resolveTarget(tabId: number, target: V3ResolveTarget, snapshotId: string): V3ResolveResult {
    return elementRegistry.resolve(tabId, target, { snapshotId, limit: 8, minScore: 0.3 });
  }

  private async send<T = any>(tabId: number, element: V3Element | undefined, method: string, params?: object): Promise<T> {
    if (element?.sessionId) return await cdpRouter.sendToChild<T>(tabId, element.sessionId, method, params);
    return await cdpRouter.sendCommand<T>(tabId, method, params);
  }

  private async perform(
    tab: chrome.tabs.Tab & { id: number },
    request: V3ActionRequest,
    element: V3Element | undefined,
    snapshot: V3ObservationSnapshot,
    actionability?: V3Actionability,
  ): Promise<void> {
    switch (request.action) {
      case 'navigate': {
        const url = String(request.url || '').trim();
        if (!url) throw this.error('URL_REQUIRED', 'navigate requires url');
        await chrome.tabs.update(tab.id, { url });
        return;
      }
      case 'back':
        await chrome.tabs.goBack(tab.id);
        return;
      case 'forward':
        await chrome.tabs.goForward(tab.id);
        return;
      case 'reload':
        await chrome.tabs.reload(tab.id);
        return;
      case 'scroll': {
        if (request.target) {
          const resolved = this.resolveTarget(tab.id, request.target, snapshot.snapshotId);
          if (!['exact', 'matched'].includes(resolved.status) || !resolved.candidates[0]) {
            throw this.error('TARGET_AMBIGUOUS', `Unable to resolve scroll target (${resolved.status})`, resolved);
          }
          await this.send(tab.id, resolved.candidates[0].element, 'DOM.scrollIntoViewIfNeeded', {
            backendNodeId: resolved.candidates[0].element.backendNodeId,
          });
          return;
        }
        const x = Math.max(1, Number(snapshot.viewport.width || 800) / 2);
        const y = Math.max(1, Number(snapshot.viewport.height || 600) / 2);
        await cdpRouter.sendCommand(tab.id, 'Input.dispatchMouseEvent', {
          type: 'mouseWheel', x, y,
          deltaX: Number(request.deltaX || 0),
          deltaY: Number(request.deltaY ?? 600),
        });
        return;
      }
      case 'drag':
        return await this.drag(tab.id, request, snapshot.snapshotId);
      default:
        break;
    }

    if (!element) throw this.error('TARGET_REQUIRED', `Action ${request.action} requires target`);
    switch (request.action) {
      case 'click':
      case 'double_click':
      case 'hover':
        return await this.pointerAction(tab.id, element, request.action, request.button || 'left', actionability);
      case 'focus':
        await this.send(tab.id, element, 'DOM.focus', { backendNodeId: element.backendNodeId });
        return;
      case 'fill':
        return await this.setElementValue(tab.id, element, request.value ?? request.text ?? '');
      case 'clear':
        return await this.setElementValue(tab.id, element, '');
      case 'type':
        await this.send(tab.id, element, 'DOM.focus', { backendNodeId: element.backendNodeId });
        await this.send(tab.id, element, 'Input.insertText', { text: String(request.text ?? request.value ?? '') });
        return;
      case 'press':
        await this.send(tab.id, element, 'DOM.focus', { backendNodeId: element.backendNodeId });
        return await this.pressKey(tab.id, element, String(request.key || request.text || ''));
      case 'select':
        return await this.setElementValue(tab.id, element, request.value);
      case 'upload': {
        const files = Array.isArray(request.files) ? request.files.map(String).filter(Boolean) : [];
        if (!files.length) throw this.error('FILES_REQUIRED', 'upload requires files[]');
        await this.send(tab.id, element, 'DOM.setFileInputFiles', { backendNodeId: element.backendNodeId, files });
        return;
      }
      default:
        throw this.error('UNSUPPORTED_ACTION', `Unsupported action ${request.action}`);
    }
  }

  private async pointerAction(
    tabId: number,
    element: V3Element,
    action: 'click' | 'double_click' | 'hover',
    button: 'left' | 'right' | 'middle',
    prepared?: V3Actionability,
  ): Promise<void> {
    const state = prepared || await actionabilityService.waitFor(tabId, element, { mode: 'pointer', timeoutMs: 5000, scroll: true });
    if (!state.center || !state.visible) throw this.error('NOT_VISIBLE', 'Target has no visible click point', state);
    const send = (method: string, params?: object) => this.send(tabId, element, method, params);
    const { x, y } = state.center;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    if (action === 'hover') return;
    const count = action === 'double_click' ? 2 : 1;
    for (let click = 1; click <= count; click += 1) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons: button === 'left' ? 1 : button === 'right' ? 2 : 4, clickCount: click });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: click });
    }
  }

  private async setElementValue(tabId: number, element: V3Element, value: unknown): Promise<void> {
    const resolved = await this.send<any>(tabId, element, 'DOM.resolveNode', {
      backendNodeId: element.backendNodeId,
      objectGroup: 'brauzio-v3-action',
    });
    if (!resolved?.object?.objectId) throw this.error('RESOLVE_FAILED', 'Unable to resolve target DOM object');
    const result = await this.send<any>(tabId, element, 'Runtime.callFunctionOn', {
      objectId: resolved.object.objectId,
      returnByValue: true,
      arguments: [{ value }],
      functionDeclaration: `function(value){
        const el=this;
        if(el.tagName==='INPUT' && ['checkbox','radio'].includes((el.type||'').toLowerCase())){
          const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'checked')?.set;
          if(setter) setter.call(el,!!value); else el.checked=!!value;
        } else if(el.tagName==='SELECT'){
          const values=Array.isArray(value)?value.map(String):[String(value??'')];
          for(const option of el.options||[]) option.selected=values.includes(String(option.value));
        } else if(el.isContentEditable){
          el.textContent=String(value??'');
        } else {
          const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
          const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
          if(setter) setter.call(el,String(value??'')); else el.value=String(value??'');
        }
        el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
        el.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
        return true;
      }`,
    });
    await this.send(tabId, element, 'Runtime.releaseObjectGroup', { objectGroup: 'brauzio-v3-action' }).catch(() => undefined);
    if (result?.exceptionDetails) throw this.error('FILL_FAILED', String(result.exceptionDetails.text || 'Runtime exception while setting value'));
  }

  private async pressKey(tabId: number, element: V3Element, raw: string): Promise<void> {
    const normalized = raw.trim();
    if (!normalized) throw this.error('KEY_REQUIRED', 'press requires key');
    const parts = normalized.split('+').map((part) => part.trim()).filter(Boolean);
    let modifiers = 0;
    const main = parts.pop() || '';
    for (const modifier of parts) {
      const upper = modifier.toUpperCase();
      if (upper === 'ALT') modifiers |= 1;
      else if (upper === 'CTRL' || upper === 'CONTROL') modifiers |= 2;
      else if (upper === 'META' || upper === 'CMD' || upper === 'COMMAND') modifiers |= 4;
      else if (upper === 'SHIFT') modifiers |= 8;
    }
    const mapped = KEY_MAP[main.toUpperCase()];
    const key = mapped?.key || main;
    const code = mapped?.code || (main.length === 1 ? `Key${main.toUpperCase()}` : main);
    const vk = mapped?.windowsVirtualKeyCode || (main.length === 1 ? main.toUpperCase().charCodeAt(0) : 0);
    await this.send(tabId, element, 'Input.dispatchKeyEvent', {
      type: 'rawKeyDown', key, code, modifiers, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
    });
    if (main.length === 1 && modifiers === 0) {
      await this.send(tabId, element, 'Input.dispatchKeyEvent', {
        type: 'char', key, code, text: main, unmodifiedText: main, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
      });
    }
    await this.send(tabId, element, 'Input.dispatchKeyEvent', {
      type: 'keyUp', key, code, modifiers, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
    });
  }

  private async drag(tabId: number, request: V3ActionRequest, snapshotId: string): Promise<void> {
    const source = elementRegistry.resolve(tabId, request.source!, { snapshotId, limit: 4 });
    const target = elementRegistry.resolve(tabId, request.target!, { snapshotId, limit: 4 });
    if (!['exact', 'matched'].includes(source.status) || !source.candidates[0]) throw this.error('SOURCE_AMBIGUOUS', `Unable to resolve drag source (${source.status})`, source);
    if (!['exact', 'matched'].includes(target.status) || !target.candidates[0]) throw this.error('TARGET_AMBIGUOUS', `Unable to resolve drag target (${target.status})`, target);
    const sourceElement = source.candidates[0].element;
    const targetElement = target.candidates[0].element;
    if ((sourceElement.sessionId || '') !== (targetElement.sessionId || '')) {
      throw this.error('CROSS_TARGET_DRAG_UNSUPPORTED', 'Drag source and target are in different CDP targets');
    }
    // Standards-based draggable elements use DragEvent/DataTransfer directly.
    // Keep physical pointer drag only for sliders, canvases and custom widgets.
    if (await this.isNativeHtml5Draggable(tabId, sourceElement)) {
      await this.dispatchHtml5Drag(tabId, sourceElement, targetElement);
      return;
    }
    const a = await actionabilityService.inspect(tabId, sourceElement, { scroll: true, stableMs: 40 });
    const b = await actionabilityService.inspect(tabId, targetElement, { scroll: true, stableMs: 40 });
    if (!a.center || !b.center) throw this.error('NOT_ACTIONABLE', 'Drag source or target has no visible center');
    const send = (params: object) => this.send(tabId, sourceElement, 'Input.dispatchMouseEvent', params);
    await send({ type: 'mouseMoved', x: a.center.x, y: a.center.y });
    await send({ type: 'mousePressed', x: a.center.x, y: a.center.y, button: 'left', buttons: 1, clickCount: 1 });
    const steps = 4;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      await send({ type: 'mouseMoved', x: a.center.x + (b.center.x - a.center.x) * t, y: a.center.y + (b.center.y - a.center.y) * t, button: 'left', buttons: 1 });
    }
    await send({ type: 'mouseReleased', x: b.center.x, y: b.center.y, button: 'left', buttons: 0, clickCount: 1 });
  }

  private async isNativeHtml5Draggable(tabId: number, sourceElement: V3Element): Promise<boolean> {
  const objectGroup = `brauzio-v3-drag-detect:${tabId}`;
  const resolved = await this.send<any>(tabId, sourceElement, 'DOM.resolveNode', {
    backendNodeId: sourceElement.backendNodeId,
    objectGroup,
  }).catch(() => undefined);
  const objectId = resolved?.object?.objectId;
  if (!objectId) return false;
  try {
    const result = await this.send<any>(tabId, sourceElement, 'Runtime.callFunctionOn', {
      objectId,
      returnByValue: true,
      functionDeclaration: `function(){
        const el=this;
        return Boolean(el && (el.draggable === true || el.getAttribute?.('draggable') === 'true'));
      }`,
    }).catch(() => undefined);
    return Boolean(result?.result?.value);
  } finally {
    await this.send(tabId, sourceElement, 'Runtime.releaseObjectGroup', { objectGroup }).catch(() => undefined);
  }
}

  private async dispatchHtml5Drag(tabId: number, sourceElement: V3Element, targetElement: V3Element): Promise<void> {
    const objectGroup = `brauzio-v3-html5-drag:${tabId}`;
    const sourceResolved = await this.send<any>(tabId, sourceElement, 'DOM.resolveNode', { backendNodeId: sourceElement.backendNodeId, objectGroup });
    const targetResolved = await this.send<any>(tabId, targetElement, 'DOM.resolveNode', { backendNodeId: targetElement.backendNodeId, objectGroup });
    const sourceObjectId = sourceResolved?.object?.objectId;
    const targetObjectId = targetResolved?.object?.objectId;
    if (!sourceObjectId || !targetObjectId) {
      await this.send(tabId, sourceElement, 'Runtime.releaseObjectGroup', { objectGroup }).catch(() => undefined);
      return;
    }
    try {
      const result = await this.send<any>(tabId, sourceElement, 'Runtime.callFunctionOn', {
        objectId: sourceObjectId,
        arguments: [{ objectId: targetObjectId }],
        returnByValue: true,
        functionDeclaration: `function(target){
          const source=this;
          let dataTransfer=null;
          try { dataTransfer=new DataTransfer(); } catch {}
          if(dataTransfer){
            try { dataTransfer.effectAllowed='all'; dataTransfer.dropEffect='move'; } catch {}
            try { dataTransfer.setData('text/plain', source.id || source.textContent || 'brauzio-drag'); } catch {}
          }
          const fire=(node,type)=>{
            let event;
            try { event=new DragEvent(type,{bubbles:true,cancelable:true,composed:true,dataTransfer}); }
            catch {
              event=new Event(type,{bubbles:true,cancelable:true,composed:true});
              try { Object.defineProperty(event,'dataTransfer',{value:dataTransfer}); } catch {}
            }
            node.dispatchEvent(event);
          };
          fire(source,'dragstart');
          fire(target,'dragenter');
          fire(target,'dragover');
          fire(target,'drop');
          fire(source,'dragend');
          return true;
        }`,
      });
      if (result?.exceptionDetails) throw this.error('HTML5_DRAG_FAILED', String(result.exceptionDetails.text || 'HTML5 drag dispatch failed'));
    } finally {
      await this.send(tabId, sourceElement, 'Runtime.releaseObjectGroup', { objectGroup }).catch(() => undefined);
    }
  }


  private prepareNavigationReady(tabId: number, timeoutMs: number): { promise: Promise<void>; cancel: () => void } {
    let settled = false;
    let transitionSeen = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resolvePromise: (() => void) | undefined;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      chrome.webNavigation.onCommitted.removeListener(onCommitted);
      chrome.webNavigation.onCompleted.removeListener(onCompleted);
      chrome.webNavigation.onHistoryStateUpdated.removeListener(onHistory);
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolvePromise?.();
    };
    const onCommitted = (details: any) => {
      if (details.tabId !== tabId || details.frameId !== 0 || settled) return;
      transitionSeen = true;
    };
    const onCompleted = (details: any) => {
      if (details.tabId !== tabId || details.frameId !== 0 || settled) return;
      transitionSeen = true;
      finish();
    };
    const onHistory = (details: any) => {
      if (details.tabId !== tabId || details.frameId !== 0 || settled) return;
      transitionSeen = true;
      void chrome.tabs.get(tabId).then((current) => {
        if (current.status === 'complete') finish();
      }).catch(() => undefined);
    };
    const onTabUpdated = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo, current: chrome.tabs.Tab) => {
      if (updatedTabId !== tabId || settled) return;
      if (changeInfo.url || changeInfo.status === 'loading') transitionSeen = true;
      if (transitionSeen && (changeInfo.status === 'complete' || current.status === 'complete')) finish();
    };
    const promise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      chrome.webNavigation.onCommitted.addListener(onCommitted);
      chrome.webNavigation.onCompleted.addListener(onCompleted);
      chrome.webNavigation.onHistoryStateUpdated.addListener(onHistory);
      chrome.tabs.onUpdated.addListener(onTabUpdated);
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`Navigation did not finish loading within ${timeoutMs}ms`));
      }, Math.max(500, timeoutMs));
    });
    return { promise, cancel: () => finish() };
  }

  private error(code: string, message: string, details?: unknown): Error & { code?: string; details?: unknown } {
    const error = new Error(message) as Error & { code?: string; details?: unknown };
    error.code = code;
    error.details = details;
    return error;
  }

  private normalizeError(error: unknown): { code: string; message: string; details?: unknown } {
    const value = error as Error & { code?: string; details?: unknown };
    return {
      code: String(value?.code || 'ACTION_FAILED'),
      message: value instanceof Error ? value.message : String(error),
      details: value?.details,
    };
  }
}

export const actionEngine = new ActionEngine();
