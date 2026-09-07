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
import { sessionGraph } from './session-graph';
import type {
  V3ActionEvidence,
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
    const startedAt = Date.now();
    await sessionGraph.ensure(tab.id);
    let before = elementRegistry.get(request.snapshotId) || elementRegistry.latest(tab.id);
    if (!before) before = (await observationService.observe(tab, { mode: 'compact' })).snapshot;
    const beforeSnapshotId = before.snapshotId;
    const startCursor = eventJournal.cursor(tab.id);
    let verifier: PreparedActionVerification | undefined;
    let targetElement: V3Element | undefined;
    let resolution: V3ResolveResult | undefined;
    let actionability;

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

      if (targetElement && !['fill', 'clear', 'type', 'press', 'select', 'focus', 'upload'].includes(request.action)) {
        actionability = await actionabilityService.inspect(tab.id, targetElement, { scroll: true });
        if (!actionability.actionable) {
          throw this.error('NOT_ACTIONABLE', `Target is not actionable: ${actionability.reason || 'unknown'}`, actionability);
        }
      }

      await this.perform(tab, request, targetElement, before);
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
      const events = eventJournal.read(tab.id, { afterSequence: startCursor, since: startedAt, until: completedAt, limit: 180 });
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
      return {
        evidence,
        observation: observationResult?.snapshot,
        screenshot: observationResult?.screenshot,
        resolution,
      };
    } catch (error) {
      await verifier?.cancel().catch(() => undefined);
      const completedAt = Date.now();
      const normalized = this.normalizeError(error);
      const events = eventJournal.read(tab.id, { afterSequence: startCursor, since: startedAt, until: completedAt, limit: 180 });
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
      return {
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
        return await this.pointerAction(tab.id, element, request.action, request.button || 'left');
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

  private async pointerAction(tabId: number, element: V3Element, action: 'click' | 'double_click' | 'hover', button: 'left' | 'right' | 'middle'): Promise<void> {
    const state = await actionabilityService.inspect(tabId, element, { scroll: true });
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
    const a = await actionabilityService.inspect(tabId, sourceElement, { scroll: true });
    const b = await actionabilityService.inspect(tabId, targetElement, { scroll: true });
    if (!a.center || !b.center) throw this.error('NOT_ACTIONABLE', 'Drag source or target has no visible center');
    const send = (params: object) => this.send(tabId, sourceElement, 'Input.dispatchMouseEvent', params);
    await send({ type: 'mouseMoved', x: a.center.x, y: a.center.y });
    await send({ type: 'mousePressed', x: a.center.x, y: a.center.y, button: 'left', buttons: 1, clickCount: 1 });
    const steps = 8;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      await send({ type: 'mouseMoved', x: a.center.x + (b.center.x - a.center.x) * t, y: a.center.y + (b.center.y - a.center.y) * t, button: 'left', buttons: 1 });
    }
    await send({ type: 'mouseReleased', x: b.center.x, y: b.center.y, button: 'left', buttons: 0, clickCount: 1 });
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
