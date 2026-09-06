export type CdpOwnerTag = string;

export interface CdpSessionSnapshot {
  tabId: number;
  attachedByUs: boolean;
  attachedAt: number;
  lastCommandAt: number | null;
  commandCount: number;
  totalRefs: number;
  owners: Record<string, number>;
  generation: number;
}

export interface CdpChildSessionSnapshot {
  tabId: number;
  sessionId: string;
  targetId: string;
  targetType?: string;
  url?: string;
  attachedAt: number;
  lastCommandAt: number | null;
  commandCount: number;
  totalRefs: number;
  owners: Record<string, number>;
  generation: number;
}

export interface CdpEventEnvelope {
  tabId: number;
  sessionId?: string;
  method: string;
  params?: object;
  receivedAt: number;
  generation: number;
}

type CdpEventListener = (event: CdpEventEnvelope) => void;

interface RootSessionState {
  tabId: number;
  attachedByUs: boolean;
  attachedAt: number;
  lastCommandAt: number | null;
  commandCount: number;
  totalRefs: number;
  owners: Map<CdpOwnerTag, number>;
  generation: number;
}

interface ChildSessionState {
  tabId: number;
  sessionId: string;
  targetId: string;
  targetType?: string;
  url?: string;
  attachedAt: number;
  lastCommandAt: number | null;
  commandCount: number;
  totalRefs: number;
  owners: Map<CdpOwnerTag, number>;
  rootOwner?: CdpOwnerTag;
  generation: number;
}

interface EventSubscription {
  owner: CdpOwnerTag;
  tabId?: number;
  listener: CdpEventListener;
}

const DEBUGGER_PROTOCOL_VERSION = '1.3';
const DETACHED_ERROR_RE = /debugger is not attached|not attached to the tab/i;

function normalizeOwner(owner: CdpOwnerTag): CdpOwnerTag {
  const value = String(owner || '').trim();
  return value || 'unknown';
}

export class CDPRouter {
  private sessions = new Map<number, RootSessionState>();
  private subscriptions = new Map<string, EventSubscription>();
  private childSessions = new Map<string, ChildSessionState>();
  private generation = 0;
  private subscriptionSerial = 0;
  private temporaryOwnerSerial = 0;
  private childOwnerSerial = 0;

  constructor() {
    chrome.debugger.onDetach.addListener((source) => {
      if (typeof source.tabId === 'number') this.clearTabState(source.tabId);
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      this.clearTabState(tabId);
    });

    chrome.debugger.onEvent.addListener((source, method, params) => {
      if (typeof source.tabId !== 'number') return;
      if (method === 'Target.attachedToTarget') {
        this.registerAttachedChild(source.tabId, source.sessionId, params);
      } else if (method === 'Target.detachedFromTarget') {
        this.registerDetachedChild(source.tabId, params);
      }

      const state = this.sessions.get(source.tabId);
      const child = source.sessionId
        ? this.childSessions.get(this.childKey(source.tabId, source.sessionId))
        : undefined;
      const envelope: CdpEventEnvelope = {
        tabId: source.tabId,
        sessionId: source.sessionId,
        method,
        params,
        receivedAt: Date.now(),
        generation: child?.generation || state?.generation || 0,
      };

      for (const subscription of this.subscriptions.values()) {
        if (typeof subscription.tabId === 'number' && subscription.tabId !== source.tabId) continue;
        try {
          subscription.listener(envelope);
        } catch (error) {
          console.warn('[BrauzioCDP] Event subscriber failed', {
            owner: subscription.owner,
            method,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });
  }

  private childKey(tabId: number, sessionId: string): string {
    return `${tabId}:${sessionId}`;
  }

  private clearTabState(tabId: number): void {
    this.sessions.delete(tabId);
    for (const [key, child] of this.childSessions) {
      if (child.tabId === tabId) this.childSessions.delete(key);
    }
  }

  private registerAttachedChild(tabId: number, _parentSessionId: string | undefined, params?: object): void {
    const data = (params || {}) as Record<string, any>;
    const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
    if (!sessionId) return;
    const info = (data.targetInfo || {}) as Record<string, any>;
    const key = this.childKey(tabId, sessionId);
    const existing = this.childSessions.get(key);
    if (existing) {
      if (typeof info.targetId === 'string') existing.targetId = info.targetId;
      if (typeof info.type === 'string') existing.targetType = info.type;
      if (typeof info.url === 'string') existing.url = info.url;
      return;
    }

    this.childSessions.set(key, {
      tabId,
      sessionId,
      targetId: typeof info.targetId === 'string' ? info.targetId : '',
      targetType: typeof info.type === 'string' ? info.type : undefined,
      url: typeof info.url === 'string' ? info.url : undefined,
      attachedAt: Date.now(),
      lastCommandAt: null,
      commandCount: 0,
      totalRefs: 0,
      owners: new Map(),
      generation: ++this.generation,
    });
  }

  private registerDetachedChild(tabId: number, params?: object): void {
    const data = (params || {}) as Record<string, any>;
    const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
    if (!sessionId) return;
    const key = this.childKey(tabId, sessionId);
    const child = this.childSessions.get(key);
    this.childSessions.delete(key);
    if (child?.rootOwner) void this.detach(tabId, child.rootOwner);
  }

  private addChildOwner(state: ChildSessionState, owner: CdpOwnerTag): void {
    const normalized = normalizeOwner(owner);
    state.owners.set(normalized, (state.owners.get(normalized) || 0) + 1);
    state.totalRefs += 1;
  }

  private removeChildOwner(state: ChildSessionState, owner: CdpOwnerTag): boolean {
    const normalized = normalizeOwner(owner);
    const count = state.owners.get(normalized) || 0;
    if (count <= 0) return false;
    if (count === 1) state.owners.delete(normalized);
    else state.owners.set(normalized, count - 1);
    state.totalRefs = Math.max(0, state.totalRefs - 1);
    return true;
  }

  private childSnapshot(state: ChildSessionState): CdpChildSessionSnapshot {
    return {
      tabId: state.tabId,
      sessionId: state.sessionId,
      targetId: state.targetId,
      targetType: state.targetType,
      url: state.url,
      attachedAt: state.attachedAt,
      lastCommandAt: state.lastCommandAt,
      commandCount: state.commandCount,
      totalRefs: state.totalRefs,
      owners: Object.fromEntries(state.owners),
      generation: state.generation,
    };
  }

  private createState(tabId: number): RootSessionState {
    return {
      tabId,
      attachedByUs: true,
      attachedAt: Date.now(),
      lastCommandAt: null,
      commandCount: 0,
      totalRefs: 0,
      owners: new Map(),
      generation: ++this.generation,
    };
  }

  private addOwner(state: RootSessionState, owner: CdpOwnerTag): void {
    const normalized = normalizeOwner(owner);
    state.owners.set(normalized, (state.owners.get(normalized) || 0) + 1);
    state.totalRefs += 1;
  }

  private removeOwner(state: RootSessionState, owner: CdpOwnerTag): boolean {
    const normalized = normalizeOwner(owner);
    const count = state.owners.get(normalized) || 0;
    if (count <= 0) return false;

    if (count === 1) state.owners.delete(normalized);
    else state.owners.set(normalized, count - 1);

    state.totalRefs = Math.max(0, state.totalRefs - 1);
    return true;
  }

  private snapshot(state: RootSessionState): CdpSessionSnapshot {
    return {
      tabId: state.tabId,
      attachedByUs: state.attachedByUs,
      attachedAt: state.attachedAt,
      lastCommandAt: state.lastCommandAt,
      commandCount: state.commandCount,
      totalRefs: state.totalRefs,
      owners: Object.fromEntries(state.owners),
      generation: state.generation,
    };
  }

  getSessionSnapshot(tabId?: number): CdpSessionSnapshot[] {
    if (typeof tabId === 'number') {
      const state = this.sessions.get(tabId);
      return state ? [this.snapshot(state)] : [];
    }
    return [...this.sessions.values()].map((state) => this.snapshot(state));
  }

  getChildSessionSnapshot(tabId?: number): CdpChildSessionSnapshot[] {
    const states = [...this.childSessions.values()];
    return states
      .filter((state) => typeof tabId !== 'number' || state.tabId === tabId)
      .map((state) => this.childSnapshot(state));
  }

  hasSession(tabId: number): boolean {
    return Boolean(this.sessions.get(tabId)?.attachedByUs);
  }

  hasChildSession(tabId: number, sessionId: string): boolean {
    return this.childSessions.has(this.childKey(tabId, sessionId));
  }

  subscribeEvents(
    owner: CdpOwnerTag,
    listener: CdpEventListener,
    options: { tabId?: number } = {},
  ): () => void {
    const id = `${normalizeOwner(owner)}:${++this.subscriptionSerial}`;
    this.subscriptions.set(id, {
      owner: normalizeOwner(owner),
      tabId: options.tabId,
      listener,
    });
    return () => this.subscriptions.delete(id);
  }

  async attach(tabId: number, owner: CdpOwnerTag = 'unknown'): Promise<CdpSessionSnapshot> {
    const current = this.sessions.get(tabId);
    if (current?.attachedByUs) {
      this.addOwner(current, owner);
      return this.snapshot(current);
    }

    const targets = await chrome.debugger.getTargets();
    const existing = targets.find((target) => target.tabId === tabId && target.attached);

    if (existing) {
      throw new Error(
        `Debugger is already attached to tab ${tabId} by another client or a stale session`,
      );
    }

    await chrome.debugger.attach({ tabId }, DEBUGGER_PROTOCOL_VERSION);

    const state = this.createState(tabId);
    this.addOwner(state, owner);
    this.sessions.set(tabId, state);
    return this.snapshot(state);
  }

  async createChildSession(
    tabId: number,
    targetId: string,
    owner: CdpOwnerTag = 'unknown',
  ): Promise<CdpChildSessionSnapshot> {
    const normalizedOwner = normalizeOwner(owner);
    const normalizedTargetId = String(targetId || '').trim();
    if (!normalizedTargetId) throw new Error('targetId is required for a child CDP session');

    const rootOwner = `child-root:${normalizedOwner}:${++this.childOwnerSerial}`;
    await this.attach(tabId, rootOwner);
    try {
      const result = await this.sendAttached<{ sessionId?: string }>(tabId, 'Target.attachToTarget', {
        targetId: normalizedTargetId,
        flatten: true,
      });
      const sessionId = String(result?.sessionId || '');
      if (!sessionId) throw new Error(`Chrome did not return a child sessionId for target ${normalizedTargetId}`);

      const key = this.childKey(tabId, sessionId);
      let child = this.childSessions.get(key);
      if (!child) {
        child = {
          tabId,
          sessionId,
          targetId: normalizedTargetId,
          attachedAt: Date.now(),
          lastCommandAt: null,
          commandCount: 0,
          totalRefs: 0,
          owners: new Map(),
          generation: ++this.generation,
        };
        this.childSessions.set(key, child);
      }
      child.rootOwner = rootOwner;
      if (!child.targetId) child.targetId = normalizedTargetId;
      this.addChildOwner(child, normalizedOwner);
      return this.childSnapshot(child);
    } catch (error) {
      await this.detach(tabId, rootOwner);
      throw error;
    }
  }

  async detachChildSession(
    tabId: number,
    sessionId: string,
    owner: CdpOwnerTag = 'unknown',
  ): Promise<boolean> {
    const key = this.childKey(tabId, sessionId);
    const child = this.childSessions.get(key);
    if (!child) return false;
    if (!this.removeChildOwner(child, owner)) return false;
    if (child.totalRefs > 0) return false;

    this.childSessions.delete(key);
    try {
      if (this.sessions.get(tabId)?.attachedByUs) {
        await this.sendAttached(tabId, 'Target.detachFromTarget', { sessionId });
      }
    } catch {
      // The child may already have closed. Ownership cleanup is still complete.
    } finally {
      if (child.rootOwner) await this.detach(tabId, child.rootOwner);
    }
    return true;
  }

  async sendToChild<T = any>(
    tabId: number,
    sessionId: string,
    method: string,
    params?: object,
  ): Promise<T> {
    const child = this.childSessions.get(this.childKey(tabId, sessionId));
    if (!child) throw new Error(`Unknown child CDP session ${sessionId} for tab ${tabId}`);
    if (!this.sessions.get(tabId)?.attachedByUs) {
      this.childSessions.delete(this.childKey(tabId, sessionId));
      throw new Error(`CDP root session is not attached for tab ${tabId}`);
    }

    child.lastCommandAt = Date.now();
    child.commandCount += 1;
    try {
      return (await chrome.debugger.sendCommand({ tabId, sessionId }, method, params)) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (DETACHED_ERROR_RE.test(message)) this.childSessions.delete(this.childKey(tabId, sessionId));
      throw error;
    }
  }

  async detach(tabId: number, owner: CdpOwnerTag = 'unknown'): Promise<boolean> {
    const state = this.sessions.get(tabId);
    if (!state) return false;

    if (!this.removeOwner(state, owner)) return false;
    if (state.totalRefs > 0) return false;

    await this.forceDetach(tabId, 'last_owner_released');
    return true;
  }

  async forceDetach(tabId: number, reason = 'forced'): Promise<boolean> {
    const state = this.sessions.get(tabId);
    this.clearTabState(tabId);
    if (!state?.attachedByUs) return false;

    try {
      await chrome.debugger.detach({ tabId });
      return true;
    } catch (error) {
      console.warn('[BrauzioCDP] Force detach failed', {
        tabId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async withSession<T>(tabId: number, owner: CdpOwnerTag, fn: () => Promise<T>): Promise<T> {
    const normalizedOwner = normalizeOwner(owner);
    await this.attach(tabId, normalizedOwner);
    try {
      return await fn();
    } finally {
      await this.detach(tabId, normalizedOwner);
    }
  }

  private async sendAttached<T>(tabId: number, method: string, params?: object): Promise<T> {
    const state = this.sessions.get(tabId);
    if (!state?.attachedByUs) throw new Error(`CDP root session is not attached for tab ${tabId}`);

    state.lastCommandAt = Date.now();
    state.commandCount += 1;
    return (await chrome.debugger.sendCommand({ tabId }, method, params)) as T;
  }

  async sendCommand<T = any>(tabId: number, method: string, params?: object): Promise<T> {
    const state = this.sessions.get(tabId);
    if (state?.attachedByUs) {
      try {
        return await this.sendAttached<T>(tabId, method, params);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!DETACHED_ERROR_RE.test(message)) throw error;
        this.clearTabState(tabId);
      }
    }

    const temporaryOwner = `send:${method}:${++this.temporaryOwnerSerial}`;
    return await this.withSession<T>(tabId, temporaryOwner, async () => {
      return await this.sendAttached<T>(tabId, method, params);
    });
  }
}

export const cdpRouter = new CDPRouter();
