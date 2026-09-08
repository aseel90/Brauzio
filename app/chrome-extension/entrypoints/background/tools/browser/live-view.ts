import { createErrorResponse, type ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'brauzio-shared';
import { compressImage } from '../../../../utils/image-utils';

const MIN_INTERVAL_MS = 550;
const MAX_INTERVAL_MS = 5000;
const DEFAULT_INTERVAL_MS = 900;
const DEFAULT_SCALE = 0.65;
const DEFAULT_QUALITY = 0.72;
const MAX_BUFFERED_FRAMES = 3;
const IDLE_STOP_MS = 15_000;

type LiveViewAction = 'start' | 'status' | 'latest' | 'stop';

interface LiveViewArgs {
  action: LiveViewAction;
  tabId?: number;
  windowId?: number;
  intervalMs?: number;
  scale?: number;
  quality?: number;
  maxFrames?: number;
  count?: number;
}

interface LiveFrame {
  seq: number;
  capturedAt: number;
  data: string;
  mimeType: string;
  fingerprint: string;
  bytes: number;
}

interface LiveViewSession {
  tabId: number;
  windowId: number;
  startedAt: number;
  lastClientTouchAt: number;
  intervalMs: number;
  scale: number;
  quality: number;
  maxFrames: number;
  captured: number;
  droppedDuplicates: number;
  lastFrameAt?: number;
  lastError?: string;
  running: boolean;
  timer?: ReturnType<typeof setTimeout>;
  capturing: boolean;
  frames: LiveFrame[];
}

const sessions = new Map<number, LiveViewSession>();
let nextSeq = 1;

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function frameFingerprint(base64: string): string {
  if (!base64) return 'empty';
  const step = Math.max(1, Math.floor(base64.length / 24));
  let sample = '';
  for (let i = 0; i < base64.length && sample.length < 24; i += step) sample += base64[i];
  return `${base64.length}:${sample}`;
}

function sessionStatus(session?: LiveViewSession) {
  if (!session) return { running: false, storage: 'memory-only', fileSaved: false };
  return {
    running: session.running,
    tabId: session.tabId,
    windowId: session.windowId,
    startedAt: session.startedAt,
    intervalMs: session.intervalMs,
    scale: session.scale,
    quality: session.quality,
    maxFrames: session.maxFrames,
    bufferedFrames: session.frames.length,
    captured: session.captured,
    droppedDuplicates: session.droppedDuplicates,
    lastFrameAt: session.lastFrameAt ?? null,
    lastError: session.lastError ?? null,
    storage: 'memory-only',
    fileSaved: false,
  };
}

function stopSession(tabId: number, reason = 'stopped'): boolean {
  const session = sessions.get(tabId);
  if (!session) return false;
  session.running = false;
  if (session.timer) clearTimeout(session.timer);
  session.timer = undefined;
  session.frames.length = 0;
  sessions.delete(tabId);
  console.log('[BrauzioLiveView]', new Date().toISOString(), 'STOP', { tabId, reason });
  return true;
}

export function stopAllLiveViews(reason = 'stopped'): number {
  const tabIds = [...sessions.keys()];
  for (const tabId of tabIds) stopSession(tabId, reason);
  return tabIds.length;
}

async function captureOne(session: LiveViewSession): Promise<void> {
  if (!session.running || session.capturing) return;
  session.capturing = true;
  try {
    const tab = await chrome.tabs.get(session.tabId);
    if (!tab.active || tab.windowId !== session.windowId) {
      session.lastError = 'Live View paused: target tab is no longer active in its window';
      return;
    }
    if (!tab.url || /^(chrome|edge|about|chrome-extension):/i.test(tab.url)) {
      session.lastError = 'Live View cannot capture protected browser or extension pages';
      stopSession(session.tabId, 'protected_page');
      return;
    }

    const sourceDataUrl = await chrome.tabs.captureVisibleTab(session.windowId, {
      format: 'jpeg',
      quality: 85,
    });
    if (!sourceDataUrl) throw new Error('captureVisibleTab returned empty data');

    let frameDataUrl = sourceDataUrl;
    let mimeType = 'image/jpeg';
    try {
      const compressed = await compressImage(sourceDataUrl, {
        scale: session.scale,
        quality: session.quality,
        format: 'image/jpeg',
      });
      frameDataUrl = compressed.dataUrl;
      mimeType = compressed.mimeType;
    } catch (compressionError) {
      console.warn('[BrauzioLiveView] JPEG compression failed; using original frame', compressionError);
      session.lastError = undefined;
    }

    const base64 = frameDataUrl.replace(/^data:image\/[^;]+;base64,/, '');
    const fingerprint = frameFingerprint(base64);
    const previous = session.frames[session.frames.length - 1];
    if (previous?.fingerprint === fingerprint) {
      session.droppedDuplicates += 1;
      session.lastFrameAt = Date.now();
      return;
    }

    const frame: LiveFrame = {
      seq: nextSeq++,
      capturedAt: Date.now(),
      data: base64,
      mimeType,
      fingerprint,
      bytes: Math.ceil((base64.length * 3) / 4),
    };
    session.frames.push(frame);
    while (session.frames.length > session.maxFrames) session.frames.shift();
    session.captured += 1;
    session.lastFrameAt = frame.capturedAt;
    session.lastError = undefined;
  } catch (error) {
    session.lastError = error instanceof Error ? error.message : String(error);
  } finally {
    session.capturing = false;
  }
}

function schedule(session: LiveViewSession): void {
  if (!session.running) return;
  session.timer = setTimeout(async () => {
    if (!session.running) return;
    if (Date.now() - session.lastClientTouchAt > IDLE_STOP_MS) {
      stopSession(session.tabId, 'agent_idle_timeout');
      return;
    }
    await captureOne(session);
    schedule(session);
  }, session.intervalMs);
}

class LiveViewTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.LIVE_VIEW;

  async execute(args: LiveViewArgs): Promise<ToolResult> {
    const action = args.action;
    if (!['start', 'status', 'latest', 'stop'].includes(action)) {
      return createErrorResponse('action must be start, status, latest, or stop');
    }

    if (action === 'status' && typeof args.tabId !== 'number') {
      for (const session of sessions.values()) session.lastClientTouchAt = Date.now();
      return {
        content: [{ type: 'text', text: JSON.stringify({ sessions: [...sessions.values()].map(sessionStatus), storage: 'memory-only', fileSaved: false }) }],
        isError: false,
      };
    }

    const explicit = await this.tryGetTab(args.tabId);
    const tab = explicit || (await this.getActiveTabOrThrowInWindow(args.windowId));
    if (!tab.id) return createErrorResponse('Target tab not found');

    if (action === 'status') {
      const session = sessions.get(tab.id);
      if (session) session.lastClientTouchAt = Date.now();
      return { content: [{ type: 'text', text: JSON.stringify(sessionStatus(session)) }], isError: false };
    }

    if (action === 'stop') {
      const stopped = stopSession(tab.id, 'tool_stop');
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, stopped, tabId: tab.id, storage: 'memory-only', fileSaved: false }) }], isError: false };
    }

    if (action === 'start') {
      if (!tab.active) return createErrorResponse('Live View requires the target tab to be active. Switch to it first.');
      if (!tab.url || /^(chrome|edge|about|chrome-extension):/i.test(tab.url)) {
        return createErrorResponse('Live View cannot capture protected browser or extension pages.');
      }
      stopSession(tab.id, 'restart');
      const session: LiveViewSession = {
        tabId: tab.id,
        windowId: tab.windowId,
        startedAt: Date.now(),
        lastClientTouchAt: Date.now(),
        intervalMs: Math.round(clamp(args.intervalMs, DEFAULT_INTERVAL_MS, MIN_INTERVAL_MS, MAX_INTERVAL_MS)),
        scale: clamp(args.scale, DEFAULT_SCALE, 0.35, 1),
        quality: clamp(args.quality, DEFAULT_QUALITY, 0.4, 0.92),
        maxFrames: Math.round(clamp(args.maxFrames, 2, 1, MAX_BUFFERED_FRAMES)),
        captured: 0,
        droppedDuplicates: 0,
        running: true,
        capturing: false,
        frames: [],
      };
      sessions.set(tab.id, session);
      await captureOne(session);
      schedule(session);
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, ...sessionStatus(session), note: 'Frames stay in extension memory only and are never downloaded. Poll latest/status while observing; idle sessions auto-stop.' }) }],
        isError: false,
      };
    }

    const session = sessions.get(tab.id);
    if (!session || !session.running) return createErrorResponse('Live View is not running for this tab. Call action=start first.');
    session.lastClientTouchAt = Date.now();
    if (session.frames.length === 0) await captureOne(session);
    const count = Math.round(clamp(args.count, 1, 1, session.maxFrames));
    const frames = session.frames.slice(-count);
    if (frames.length === 0) return createErrorResponse(session.lastError || 'No Live View frame is available yet');

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            ...sessionStatus(session),
            returnedFrames: frames.map((frame) => ({ seq: frame.seq, capturedAt: frame.capturedAt, bytes: frame.bytes, mimeType: frame.mimeType })),
          }),
        },
        ...frames.map((frame) => ({ type: 'image' as const, data: frame.data, mimeType: frame.mimeType })),
      ],
      isError: false,
    };
  }
}

chrome.tabs.onRemoved.addListener((tabId) => stopSession(tabId, 'tab_closed'));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' || typeof changeInfo.url === 'string') stopSession(tabId, 'navigation');
});

export const liveViewTool = new LiveViewTool();
