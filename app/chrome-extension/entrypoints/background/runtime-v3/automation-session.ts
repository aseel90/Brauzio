import type { V3ResolveTarget } from './types';

export interface AutomationWorkflowSession {
  workflowId: string;
  resumeKey?: string;
  tabId: number;
  startedAt: number;
  updatedAt: number;
  status: 'running' | 'completed' | 'failed';
  currentStepId?: string;
  completedSteps: string[];
  failedSteps: string[];
  lastAction?: string;
  lastSnapshotId?: string;
  lastTarget?: V3ResolveTarget;
  lastError?: string;
}

const PREFIX = 'brauzio:v3:workflow:';
const INDEX_KEY = 'brauzio:v3:workflow:index';
const MAX_SESSIONS = 20;
const SESSION_TTL_MS = 60 * 60_000;
const memory = new Map<string, AutomationWorkflowSession>();

function key(workflowId: string): string {
  return `${PREFIX}${workflowId}`;
}

function normalizeId(value: unknown): string {
  return String(value || '').trim().replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, 128);
}

async function persist(session: AutomationWorkflowSession): Promise<void> {
  memory.set(session.workflowId, session);
  try {
    const indexState = await chrome.storage.session.get(INDEX_KEY);
    const previous = Array.isArray(indexState[INDEX_KEY]) ? indexState[INDEX_KEY] as string[] : [];
    const next = [...previous.filter((id) => id !== session.workflowId), session.workflowId].slice(-MAX_SESSIONS);
    const removed = previous.filter((id) => !next.includes(id));
    await chrome.storage.session.set({ [key(session.workflowId)]: session, [INDEX_KEY]: next });
    if (removed.length) await chrome.storage.session.remove(removed.map(key));
  } catch {}
}

async function load(workflowId: string): Promise<AutomationWorkflowSession | undefined> {
  const id = normalizeId(workflowId);
  const cached = memory.get(id);
  if (cached) return cached;
  try {
    const stored = await chrome.storage.session.get(key(id));
    const session = stored[key(id)] as AutomationWorkflowSession | undefined;
    if (!session) return undefined;
    if (Date.now() - session.updatedAt > SESSION_TTL_MS) {
      await chrome.storage.session.remove(key(id));
      return undefined;
    }
    memory.set(id, session);
    return session;
  } catch {
    return undefined;
  }
}

async function listSessions(): Promise<AutomationWorkflowSession[]> {
  try {
    const indexState = await chrome.storage.session.get(INDEX_KEY);
    const ids = Array.isArray(indexState[INDEX_KEY]) ? indexState[INDEX_KEY] as string[] : [];
    const sessions = await Promise.all(ids.map(load));
    return sessions.filter((value): value is AutomationWorkflowSession => Boolean(value));
  } catch {
    return [...memory.values()];
  }
}

export const automationSessions = {
  async begin(
    workflowId: string,
    params: {
      resumeKey?: string;
      stepId?: string;
      tabId: number;
      action: string;
      target?: V3ResolveTarget;
    },
  ): Promise<AutomationWorkflowSession | undefined> {
    const id = normalizeId(workflowId);
    if (!id) return undefined;
    const existing = await load(id);
    const now = Date.now();
    const session: AutomationWorkflowSession = {
      workflowId: id,
      resumeKey: normalizeId(params.resumeKey) || existing?.resumeKey,
      tabId: params.tabId,
      startedAt: existing?.startedAt || now,
      updatedAt: now,
      status: 'running',
      currentStepId: normalizeId(params.stepId) || undefined,
      completedSteps: existing?.completedSteps || [],
      failedSteps: existing?.failedSteps || [],
      lastAction: String(params.action || '').slice(0, 64),
      lastSnapshotId: existing?.lastSnapshotId,
      lastTarget: params.target || existing?.lastTarget,
      lastError: undefined,
    };
    await persist(session);
    return session;
  },

  async finishStep(
    workflowId: string,
    params: {
      stepId?: string;
      success: boolean;
      afterSnapshotId?: string;
      error?: string;
      completeWorkflow?: boolean;
    },
  ): Promise<AutomationWorkflowSession | undefined> {
    const id = normalizeId(workflowId);
    const session = await load(id);
    if (!session) return undefined;
    const stepId = normalizeId(params.stepId || session.currentStepId);
    const completed = new Set(session.completedSteps);
    const failed = new Set(session.failedSteps);
    if (stepId) {
      if (params.success) {
        completed.add(stepId);
        failed.delete(stepId);
      } else {
        failed.add(stepId);
      }
    }
    session.completedSteps = [...completed].slice(-100);
    session.failedSteps = [...failed].slice(-100);
    session.lastSnapshotId = params.afterSnapshotId || session.lastSnapshotId;
    session.lastError = params.success ? undefined : String(params.error || 'action_failed').slice(0, 2000);
    session.status = params.completeWorkflow && params.success
      ? 'completed'
      : params.success
        ? 'running'
        : 'failed';
    session.updatedAt = Date.now();
    await persist(session);
    return session;
  },

  async get(workflowId: string): Promise<AutomationWorkflowSession | undefined> {
    return await load(workflowId);
  },

  async list(): Promise<AutomationWorkflowSession[]> {
    return (await listSessions()).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async clear(workflowId: string): Promise<void> {
    const id = normalizeId(workflowId);
    memory.delete(id);
    await chrome.storage.session.remove(key(id)).catch(() => undefined);
  },
};
