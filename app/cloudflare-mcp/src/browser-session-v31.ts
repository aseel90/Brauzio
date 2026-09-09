import { BrowserSession as BrowserSessionBase } from './browser-session';

interface RecoveryCall {
  requestId: string;
  name: string;
  args: Record<string, unknown>;
  createdAt: number;
  resendCount: number;
}

function sessionLog(event: string, details: Record<string, unknown> = {}) {
  console.log('[BrauzioSessionV31]', new Date().toISOString(), event, details);
}

/**
 * Reliability layer over the stable 3.0.x Durable Object implementation.
 *
 * The base object owns actor leases, watches and result settlement. This layer
 * only changes transient WebSocket failure semantics: pending HTTP calls remain
 * alive until their original timeout and are replayed with the same requestId
 * after the replacement browser socket authenticates. The extension executor
 * deduplicates that requestId, so a completed mutation is never repeated.
 */
export class BrowserSession extends BrowserSessionBase {
  private recoveryCalls = new Map<string, RecoveryCall>();

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    let recovery: RecoveryCall | undefined;

    if (url.pathname === '/call' && request.method === 'POST') {
      try {
        const body = await request.clone().json() as {
          name?: string;
          args?: Record<string, unknown>;
          traceId?: string;
        };
        const requestId = String(body.traceId || '');
        if (requestId) {
          recovery = {
            requestId,
            name: String(body.name || ''),
            args: body.args && typeof body.args === 'object' ? body.args : {},
            createdAt: Date.now(),
            resendCount: 0,
          };
          this.recoveryCalls.set(requestId, recovery);
        }
      } catch {
        // The base implementation owns request validation and error responses.
      }
    }

    const responsePromise = super.fetch(request);
    if (recovery) {
      void responsePromise.finally(() => {
        this.recoveryCalls.delete(recovery!.requestId);
      });
    }
    return await responsePromise;
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let isHello = false;
    if (typeof message === 'string') {
      try {
        isHello = (JSON.parse(message) as { type?: string }).type === 'hello';
      } catch {
        // The base implementation returns the malformed JSON error.
      }
    }

    await super.webSocketMessage(ws, message);

    if (!isHello) return;
    try {
      const attachment = ws.deserializeAttachment() as { authenticated?: boolean } | null;
      if (attachment?.authenticated !== true) return;
    } catch {
      return;
    }

    const pending = (this as unknown as { pending?: Map<string, unknown> }).pending;
    let resent = 0;
    for (const [requestId, call] of this.recoveryCalls) {
      if (pending && !pending.has(requestId)) continue;
      try {
        ws.send(JSON.stringify({
          type: 'tool_call',
          requestId,
          name: call.name,
          args: call.args,
        }));
        call.resendCount += 1;
        resent += 1;
        sessionLog('CALL_RESENT_AFTER_RECONNECT', {
          requestId,
          name: call.name,
          resendCount: call.resendCount,
          ageMs: Date.now() - call.createdAt,
        });
      } catch (error) {
        sessionLog('CALL_RESEND_FAILED', {
          requestId,
          name: call.name,
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }
    if (resent > 0) sessionLog('PENDING_RECOVERY_APPLIED', { resent, tracked: this.recoveryCalls.size });
  }

  override webSocketClose(): void {
    sessionLog('WS_CLOSE_RECOVERABLE', {
      trackedPending: this.recoveryCalls.size,
      action: this.recoveryCalls.size ? 'retain_until_timeout_or_reconnect' : 'none',
    });
    // Deliberately do not call super.webSocketClose(): the base implementation
    // fails every pending request immediately. The original per-call timer and
    // actor lease remain authoritative during this short recovery window.
  }

  override webSocketError(): void {
    sessionLog('WS_ERROR_RECOVERABLE', {
      trackedPending: this.recoveryCalls.size,
      action: this.recoveryCalls.size ? 'retain_until_timeout_or_reconnect' : 'none',
    });
  }
}
