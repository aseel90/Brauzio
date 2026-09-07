import { cdpRouter } from '@/utils/cdp-router';
import type { V3Actionability, V3Element, V3Rect } from './types';

function quadRect(quad: number[] | undefined): V3Rect | undefined {
  if (!Array.isArray(quad) || quad.length < 8) return undefined;
  const xs = [quad[0], quad[2], quad[4], quad[6]].map(Number);
  const ys = [quad[1], quad[3], quad[5], quad[7]].map(Number);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function closeEnough(a?: V3Rect, b?: V3Rect): boolean {
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) <= 1
    && Math.abs(a.y - b.y) <= 1
    && Math.abs(a.width - b.width) <= 1
    && Math.abs(a.height - b.height) <= 1;
}

class ActionabilityService {
  private async send<T = any>(tabId: number, sessionId: string | undefined, method: string, params?: object): Promise<T> {
    if (sessionId) return await cdpRouter.sendToChild<T>(tabId, sessionId, method, params);
    return await cdpRouter.sendCommand<T>(tabId, method, params);
  }

  async inspect(tabId: number, element: V3Element, options: { scroll?: boolean; stableMs?: number } = {}): Promise<V3Actionability> {
    const sessionId = element.sessionId;
    if (options.scroll !== false) {
      await this.send(tabId, sessionId, 'DOM.scrollIntoViewIfNeeded', { backendNodeId: element.backendNodeId }).catch(() => undefined);
    }

    const first = await this.send<any>(tabId, sessionId, 'DOM.getBoxModel', { backendNodeId: element.backendNodeId }).catch(() => undefined);
    const firstBox = quadRect(first?.model?.border);
    const stableMs = Math.max(30, Math.min(Number(options.stableMs || 80), 500));
    await new Promise((resolve) => setTimeout(resolve, stableMs));
    const second = await this.send<any>(tabId, sessionId, 'DOM.getBoxModel', { backendNodeId: element.backendNodeId }).catch(() => undefined);
    const box = quadRect(second?.model?.border) || firstBox;
    const stable = closeEnough(firstBox, box);

    const resolved = await this.send<any>(tabId, sessionId, 'DOM.resolveNode', {
      backendNodeId: element.backendNodeId,
      objectGroup: 'brauzio-v3-actionability',
    }).catch(() => undefined);
    let runtime: any = {};
    if (resolved?.object?.objectId) {
      runtime = await this.send<any>(tabId, sessionId, 'Runtime.callFunctionOn', {
        objectId: resolved.object.objectId,
        returnByValue: true,
        awaitPromise: false,
        functionDeclaration: `function(){
          const el=this;
          const r=el.getBoundingClientRect ? el.getBoundingClientRect() : null;
          const style=el.ownerDocument && el.ownerDocument.defaultView && el.ownerDocument.defaultView.getComputedStyle
            ? el.ownerDocument.defaultView.getComputedStyle(el) : null;
          const visible=!!r && r.width>0.5 && r.height>0.5 && (!style || (style.visibility!=='hidden' && style.display!=='none' && Number(style.opacity||1)>0));
          const disabled=!!(el.disabled || el.getAttribute?.('aria-disabled')==='true');
          const editable=!!(el.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(el.tagName));
          let receivesEvents=false;
          if(visible && el.ownerDocument && el.ownerDocument.elementFromPoint){
            const x=r.left+r.width/2, y=r.top+r.height/2;
            const hit=el.ownerDocument.elementFromPoint(x,y);
            receivesEvents=!!hit && (hit===el || el.contains?.(hit));
          }
          return {visible,disabled,editable,receivesEvents};
        }`,
      }).catch(() => ({}));
      await this.send(tabId, sessionId, 'Runtime.releaseObjectGroup', { objectGroup: 'brauzio-v3-actionability' }).catch(() => undefined);
    }
    const value = runtime?.result?.value || {};
    const visible = value.visible !== undefined ? Boolean(value.visible) : Boolean(box && box.width > 0.5 && box.height > 0.5 && element.visible);
    const enabled = value.disabled !== undefined ? !Boolean(value.disabled) : element.enabled;
    const receivesEvents = value.receivesEvents !== undefined ? Boolean(value.receivesEvents) : visible;
    const editable = value.editable !== undefined ? Boolean(value.editable) : element.editable;
    const center = box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : undefined;
    const actionable = visible && stable && enabled && receivesEvents;
    const reason = !visible
      ? 'not_visible'
      : !stable
        ? 'not_stable'
        : !enabled
          ? 'disabled'
          : !receivesEvents
            ? 'covered_or_no_pointer_events'
            : undefined;
    return { actionable, visible, stable, enabled, receivesEvents, editable, reason, center, box };
  }
}

export const actionabilityService = new ActionabilityService();
