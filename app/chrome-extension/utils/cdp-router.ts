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
  private generation = 0;
  private subscriptionSerial = 0;
  private temporaryOwnerSerial = 0;

  constructor() {
    chrome.debugger.onDetach.addListener((source) => {
      if (typeof source.tabId === 'number') this.sessions.delete(source.tabId);
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      this.sessions.delete(tabId);
    });

    chrome.debugger.onEvent.addListener((source, method, params) => {
      if (typeof source.tabId !== 'number') return;
      const state = this.sessions.get(source.tabId);
      const envelope: CdpEventEnvelope = {
        tabId: source.tabId,
        sessionId: source.sessionId,
        method,
        params,
        receivedAt: Date.now(),
        generation: state?.generation || 0,
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

  hasSession(tabId: number): boolean {
    return Boolean(this.sessions.get(tabId)?.attachedByUs);
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

    // chrome.debugger.getTargets() tells us whether a target is attached, but
    // not which extension owns a page attachment. If our in-memory state is
    // gone we must not adopt or detach an unknown debugger session.
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

  async detach(tabId: number, owner: CdpOwnerTag = 'unknown'): Promise<boolean> {
    const state = this.sessions.get(tabId);
    if (!state) return false;

    // A caller can only release a reference it actually owns. This prevents one
    // tool from accidentally detaching CDP while another tool still depends on it.
    if (!this.removeOwner(state, owner)) return false;
    if (state.totalRefs > 0) return false;

    await this.forceDetach(tabId, 'last_owner_released');
    return true;
  }

  async forceDetach(tabId: number, reason = 'forced'): Promise<boolean> {
    const state = this.sessions.get(tabId);
    this.sessions.delete(tabId);
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
        // Chrome detached unexpectedly. Forget stale ownership and lazily recover
        // for this command instead of leaving the router in a poisoned state.
        this.sessions.delete(tabId);
      }
    }

    const temporaryOwner = `send:${method}:${++this.temporaryOwnerSerial}`;
    return await this.withSession<T>(tabId, temporaryOwner, async () => {
      return await this.sendAttached<T>(tabId, method, params);
    });
  }
}

export const cdpRouter = new CDPRouter();
