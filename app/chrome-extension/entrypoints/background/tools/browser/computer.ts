import { createErrorResponse, type ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'brauzio-shared';
import { TOOL_MESSAGE_TYPES } from '@/common/message-types';
import { clickTool, fillTool } from './interaction';
import { keyboardTool } from './keyboard';
import { screenshotTool } from './screenshot';
import { screenshotContextManager, scaleCoordinates } from '@/utils/screenshot-context';
import { cdpSessionManager } from '@/utils/cdp-session-manager';
import {
  beginMouseHold,
  isMouseHeld,
  releaseMouseHold,
  updateMouseHoldPoint,
} from '@/utils/mouse-hold-safety';

type Point = { x: number; y: number };
type MouseState = 'move' | 'down' | 'up';

type ComputerParams = {
  action: string;
  tabId?: number;
  windowId?: number;
  coordinates?: Point;
  startCoordinates?: Point;
  ref?: string;
  startRef?: string;
  selector?: string;
  selectorType?: 'css' | 'xpath';
  frameId?: number;
  text?: string;
  value?: any;
  elements?: Array<{ ref: string; value: any }>;
  repeat?: number;
  scrollDirection?: 'up' | 'down' | 'left' | 'right';
  scrollAmount?: number;
  duration?: number;
  appear?: boolean;
  width?: number;
  height?: number;
  region?: { x0: number; y0: number; x1: number; y1: number };
};

function ok(payload: Record<string, unknown>): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...payload }) }], isError: false };
}

async function send(tabId: number, method: string, params?: object) {
  return await cdpSessionManager.sendCommand<any>(tabId, method, params);
}

async function showCursor(tabId: number, point: Point, state: MouseState = 'move') {
  const payload = JSON.stringify({ x: Math.round(point.x), y: Math.round(point.y), state });
  const expression = `(() => {
    try {
      const d=${payload}; const id='__brauzio_virtual_cursor__';
      let e=document.getElementById(id);
      if(!e){
        e=document.createElement('div'); e.id=id; e.setAttribute('aria-hidden','true');
        e.style.cssText='position:fixed;left:0;top:0;width:34px;height:42px;pointer-events:none;z-index:2147483647;transform:translate3d(-80px,-80px,0);transition:transform 360ms cubic-bezier(.22,.61,.36,1),opacity 120ms ease;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));opacity:1';
        e.innerHTML='<svg width="34" height="42" viewBox="0 0 34 42" xmlns="http://www.w3.org/2000/svg"><path d="M3 2L3 31L10.8 23.4L16.3 37L22.4 34.4L16.9 21.5L28 21.2L3 2Z" fill="#fff" stroke="#111827" stroke-width="2" stroke-linejoin="round"/><circle cx="25" cy="8" r="7" fill="#5B5BD6" stroke="#fff" stroke-width="2"/><text x="25" y="11" text-anchor="middle" font-family="Arial" font-size="8" font-weight="700" fill="#fff">B</text></svg>';
        (document.documentElement||document.body).appendChild(e);
      }
      e.style.opacity='1';
      e.style.transform='translate3d('+d.x+'px,'+d.y+'px,0) scale('+(d.state==='down'?.9:1)+')';
      e.style.filter=d.state==='down'?'drop-shadow(0 0 6px rgba(91,91,214,.8)) drop-shadow(0 2px 4px rgba(0,0,0,.35))':'drop-shadow(0 2px 4px rgba(0,0,0,.35))';
      clearTimeout(window.__brauzioCursorTimer);
      if(d.state==='up') window.__brauzioCursorTimer=setTimeout(()=>{const c=document.getElementById(id);if(c)c.style.opacity='.55'},900);
    } catch(_) {}
  })()`;
  try { await send(tabId, 'Runtime.evaluate', { expression, returnByValue: false }); } catch {}
}

class ComputerTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.COMPUTER;

  async execute(args: ComputerParams): Promise<ToolResult> {
    if (!args?.action) return createErrorResponse('Action parameter is required');
    try {
      const tab = (await this.tryGetTab(args.tabId)) || (await this.getActiveTabOrThrowInWindow(args.windowId));
      if (!tab.id) return createErrorResponse('Active tab has no ID');
      return await this.run(tab, args);
    } catch (error) {
      return createErrorResponse(error instanceof Error ? error.message : String(error));
    }
  }

  private project(tabId: number, point?: Point): Point | undefined {
    if (!point) return undefined;
    const context = screenshotContextManager.getContext(tabId);
    if (!context) return point;
    const scaled = scaleCoordinates(point.x, point.y, context);
    return { x: scaled.x, y: scaled.y };
  }

  private async resolvePoint(tabId: number, args: ComputerParams, which: 'start' | 'end' = 'end'): Promise<Point | undefined> {
    const direct = which === 'start' ? args.startCoordinates : args.coordinates;
    if (direct) return this.project(tabId, direct);
    const ref = which === 'start' ? args.startRef : args.ref;
    if (!ref && !args.selector) return undefined;
    await this.injectContentScript(tabId, ['inject-scripts/accessibility-tree-helper.js']);
    let targetRef = ref;
    if (!targetRef && args.selector) {
      const ensured = await this.sendMessageToTab(tabId, { action: TOOL_MESSAGE_TYPES.ENSURE_REF_FOR_SELECTOR, selector: args.selector, isXPath: args.selectorType === 'xpath' }, args.frameId);
      if (ensured?.success) targetRef = ensured.ref;
    }
    if (!targetRef) return undefined;
    try { await this.sendMessageToTab(tabId, { action: 'focusByRef', ref: targetRef }, args.frameId); } catch {}
    const resolved = await this.sendMessageToTab(tabId, { action: TOOL_MESSAGE_TYPES.RESOLVE_REF, ref: targetRef }, args.frameId);
    return resolved?.success ? this.project(tabId, { x: resolved.center.x, y: resolved.center.y }) : undefined;
  }

  private async mouse(tabId: number, type: 'mouseMoved' | 'mousePressed' | 'mouseReleased' | 'mouseWheel', point: Point, extras: Record<string, unknown> = {}) {
    await send(tabId, 'Input.dispatchMouseEvent', { type, x: Math.round(point.x), y: Math.round(point.y), ...extras });
  }

  private async click(tabId: number, point: Point, button: 'left' | 'right' = 'left', count = 1) {
    await this.mouse(tabId, 'mouseMoved', point, { button: 'none', buttons: 0 });
    await showCursor(tabId, point, 'move');
    for (let i = 1; i <= count; i++) {
      await this.mouse(tabId, 'mousePressed', point, { button, buttons: button === 'left' ? 1 : 2, clickCount: i });
      await showCursor(tabId, point, 'down');
      await this.mouse(tabId, 'mouseReleased', point, { button, buttons: 0, clickCount: i });
    }
    await showCursor(tabId, point, 'up');
  }

  private async drag(tabId: number, start: Point, end: Point, holdMs: number) {
    await cdpSessionManager.attach(tabId, 'brauzio-drag');
    let pressed = false;
    let lastPoint = start;
    try {
      await this.mouse(tabId, 'mouseMoved', start, { button: 'none', buttons: 0 });
      await showCursor(tabId, start, 'move');
      await this.mouse(tabId, 'mousePressed', start, { button: 'left', buttons: 1, clickCount: 1 });
      pressed = true;
      await showCursor(tabId, start, 'down');
      const steps = 16;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const p = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
        lastPoint = p;
        await this.mouse(tabId, 'mouseMoved', p, { button: 'left', buttons: 1 });
        await showCursor(tabId, p, 'down');
        await new Promise((r) => setTimeout(r, 18));
      }
      if (holdMs > 0) await new Promise((r) => setTimeout(r, holdMs));
      await this.mouse(tabId, 'mouseReleased', end, { button: 'left', buttons: 0, clickCount: 1 });
      pressed = false;
      await showCursor(tabId, end, 'up');
    } finally {
      if (pressed) {
        try {
          await this.mouse(tabId, 'mouseReleased', lastPoint, { button: 'left', buttons: 0, clickCount: 1 });
          await showCursor(tabId, lastPoint, 'up');
        } catch {}
      }
      await cdpSessionManager.detach(tabId, 'brauzio-drag');
    }
  }

  private async run(tab: chrome.tabs.Tab, args: ComputerParams): Promise<ToolResult> {
    const tabId = tab.id!;
    switch (args.action) {
      case 'mouse_move': {
        const point = await this.resolvePoint(tabId, args);
        if (!point) return createErrorResponse('Provide coordinates/ref/selector for mouse_move');
        const held = isMouseHeld(tabId);
        if (held) updateMouseHoldPoint(tabId, point);
        await this.mouse(tabId, 'mouseMoved', point, { button: held ? 'left' : 'none', buttons: held ? 1 : 0 });
        await showCursor(tabId, point, held ? 'down' : 'move');
        return ok({ action: 'mouse_move', coordinates: point, held });
      }
      case 'mouse_down': {
        const point = await this.resolvePoint(tabId, args);
        if (!point) return createErrorResponse('Provide coordinates/ref/selector for mouse_down');
        if (isMouseHeld(tabId)) {
          updateMouseHoldPoint(tabId, point);
          await this.mouse(tabId, 'mouseMoved', point, { button: 'left', buttons: 1 });
          await showCursor(tabId, point, 'down');
          return ok({ action: 'mouse_down', coordinates: point, held: true, alreadyHeld: true });
        }
        await beginMouseHold(tabId, point);
        try {
          await this.mouse(tabId, 'mouseMoved', point, { button: 'none', buttons: 0 });
          await this.mouse(tabId, 'mousePressed', point, { button: 'left', buttons: 1, clickCount: 1 });
          await showCursor(tabId, point, 'down');
        } catch (error) {
          await releaseMouseHold(tabId, { point, reason: 'mouse_down_failed', force: true });
          throw error;
        }
        return ok({ action: 'mouse_down', coordinates: point, held: true, alreadyHeld: false });
      }
      case 'mouse_up': {
        const point = await this.resolvePoint(tabId, args);
        if (!point) return createErrorResponse('Provide coordinates/ref/selector for mouse_up');
        const release = await releaseMouseHold(tabId, { point, reason: 'explicit_mouse_up', force: true });
        await showCursor(tabId, point, 'up');
        return ok({ action: 'mouse_up', coordinates: point, held: false, releaseDispatched: release.dispatched });
      }
      case 'left_click': case 'right_click': case 'double_click': case 'triple_click': {
        const point = await this.resolvePoint(tabId, args);
        if (!point) return createErrorResponse('Provide coordinates/ref/selector for click');
        const button = args.action === 'right_click' ? 'right' : 'left';
        const count = args.action === 'double_click' ? 2 : args.action === 'triple_click' ? 3 : 1;
        await cdpSessionManager.attach(tabId, 'brauzio-click');
        try { await this.click(tabId, point, button, count); } finally { await cdpSessionManager.detach(tabId, 'brauzio-click'); }
        return ok({ action: args.action, coordinates: point });
      }
      case 'left_click_drag': case 'drag_hold': {
        const start = await this.resolvePoint(tabId, args, 'start');
        const end = await this.resolvePoint(tabId, args, 'end');
        if (!start || !end) return createErrorResponse('Provide drag start and end coordinates/refs');
        const holdMs = args.action === 'drag_hold' ? Math.max(0, Math.min((args.duration ?? 1) * 1000, 15000)) : 0;
        await this.drag(tabId, start, end, holdMs);
        return ok({ action: args.action, start, end, holdMs });
      }
      case 'hover': {
        const point = await this.resolvePoint(tabId, args);
        if (!point) return createErrorResponse('Provide coordinates/ref/selector for hover');
        await this.mouse(tabId, 'mouseMoved', point, { button: 'none', buttons: 0 });
        await showCursor(tabId, point, 'move');
        const ms = Math.max(0, Math.min((args.duration ?? .4) * 1000, 5000));
        if (ms) await new Promise((r) => setTimeout(r, ms));
        return ok({ action: 'hover', coordinates: point });
      }
      case 'scroll': {
        const point = (await this.resolvePoint(tabId, args)) || { x: 400, y: 300 };
        const amount = Math.max(1, Math.min(args.scrollAmount ?? 3, 10)) * 160;
        let deltaX = 0, deltaY = 0;
        if (args.scrollDirection === 'up') deltaY = -amount; else if (args.scrollDirection === 'left') deltaX = -amount; else if (args.scrollDirection === 'right') deltaX = amount; else deltaY = amount;
        await this.mouse(tabId, 'mouseWheel', point, { deltaX, deltaY }); await showCursor(tabId, point, 'move');
        return ok({ action: 'scroll', coordinates: point, deltaX, deltaY });
      }
      case 'scroll_to': {
        if (!args.ref) return createErrorResponse('ref is required for scroll_to');
        await this.injectContentScript(tabId, ['inject-scripts/accessibility-tree-helper.js']);
        const result = await this.sendMessageToTab(tabId, { action: 'focusByRef', ref: args.ref });
        if (!result?.success) return createErrorResponse(result?.error || 'scroll_to failed');
        return ok({ action: 'scroll_to', ref: args.ref });
      }
      case 'type': {
        if (typeof args.text !== 'string') return createErrorResponse('text is required for type');
        if (args.ref || args.selector) await clickTool.execute({ ref: args.ref, selector: args.selector, selectorType: args.selectorType, tabId } as any);
        await cdpSessionManager.attach(tabId, 'brauzio-type');
        try { await send(tabId, 'Input.insertText', { text: args.text }); } finally { await cdpSessionManager.detach(tabId, 'brauzio-type'); }
        return ok({ action: 'type', length: args.text.length });
      }
      case 'key': {
        if (!args.text) return createErrorResponse('text is required for key');
        if (args.ref || args.selector) await clickTool.execute({ ref: args.ref, selector: args.selector, selectorType: args.selectorType, tabId } as any);
        const repeat = Math.max(1, Math.min(args.repeat ?? 1, 100));
        const keys = Array.from({ length: repeat }, () => args.text).join(' ');
        return await keyboardTool.execute({ keys, tabId } as any);
      }
      case 'fill': return await fillTool.execute({ ref: args.ref, selector: args.selector, selectorType: args.selectorType, frameId: args.frameId, value: args.value, tabId } as any);
      case 'fill_form': {
        if (!Array.isArray(args.elements) || !args.elements.length) return createErrorResponse('elements must be a non-empty array');
        const results = [];
        for (const item of args.elements) { const r = await fillTool.execute({ ref: item.ref, value: item.value, tabId } as any); results.push({ ref: item.ref, ok: !r.isError }); }
        return ok({ action: 'fill_form', results });
      }
      case 'wait': {
        const seconds = Math.max(0, Math.min(args.duration ?? 0, 30));
        if (args.text) {
          const expected = args.text, appear = args.appear !== false;
          const timeout = Math.max(100, Math.min(seconds > 0 ? seconds * 1000 : 10000, 120000));
          const result = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: async (text: string, shouldAppear: boolean, timeoutMs: number) => { const deadline = Date.now() + timeoutMs; while (Date.now() < deadline) { const has = (document.body?.innerText || '').includes(text); if (has === shouldAppear) return { ok: true, found: has }; await new Promise((r) => setTimeout(r, 100)); } return { ok: false }; }, args: [expected, appear, timeout] });
          return result?.[0]?.result?.ok ? ok({ action: 'wait', text: expected, appear }) : createErrorResponse(`Timed out waiting for text: ${expected}`);
        }
        if (!seconds) return createErrorResponse('duration is required for wait without text');
        await new Promise((r) => setTimeout(r, seconds * 1000)); return ok({ action: 'wait', duration: seconds });
      }
      case 'resize_page': {
        const width = Number(args.width), height = Number(args.height);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return createErrorResponse('width and height must be positive numbers');
        await cdpSessionManager.attach(tabId, 'brauzio-resize');
        try { await send(tabId, 'Emulation.setDeviceMetricsOverride', { width: Math.round(width), height: Math.round(height), deviceScaleFactor: 0, mobile: false }); } finally { await cdpSessionManager.detach(tabId, 'brauzio-resize'); }
        return ok({ action: 'resize_page', width, height });
      }
      case 'zoom': {
        const r = args.region;
        if (!r || ![r.x0, r.y0, r.x1, r.y1].every(Number.isFinite) || r.x1 <= r.x0 || r.y1 <= r.y0) return createErrorResponse('Valid region is required for zoom');
        await cdpSessionManager.attach(tabId, 'brauzio-zoom');
        try { const shot = await send(tabId, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true, clip: { x: r.x0, y: r.y0, width: r.x1 - r.x0, height: r.y1 - r.y0, scale: 1 } }); return { content: [{ type: 'text', text: JSON.stringify({ success: true, action: 'zoom', mimeType: 'image/png', base64Data: shot?.data || '', region: r }) }], isError: false }; } finally { await cdpSessionManager.detach(tabId, 'brauzio-zoom'); }
      }
      case 'screenshot': return await screenshotTool.execute({ tabId, name: 'computer', storeBase64: true, fullPage: false } as any);
      default: return createErrorResponse(`Unsupported action: ${args.action}`);
    }
  }
}

export const computerTool = new ComputerTool();
