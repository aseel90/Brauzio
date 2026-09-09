export interface ToolTraceStage {
  stage: string;
  at: number;
  elapsedMs: number;
  details?: Record<string, unknown>;
}

export interface ToolTraceRecord {
  requestId: string;
  name: string;
  startedAt: number;
  completedAt?: number;
  success?: boolean;
  error?: string;
  stages: ToolTraceStage[];
}

const MAX_TRACES = 80;

class ToolTraceStore {
  private traces = new Map<string, ToolTraceRecord>();
  private order: string[] = [];

  begin(requestId: string, name: string, details?: Record<string, unknown>): ToolTraceRecord {
    const id = String(requestId || crypto.randomUUID());
    const existing = this.traces.get(id);
    if (existing) {
      this.mark(id, 'received_again', details);
      return existing;
    }
    const startedAt = Date.now();
    const record: ToolTraceRecord = {
      requestId: id,
      name: String(name || 'unknown'),
      startedAt,
      stages: [{ stage: 'received', at: startedAt, elapsedMs: 0, details }],
    };
    this.traces.set(id, record);
    this.order.push(id);
    while (this.order.length > MAX_TRACES) {
      const oldest = this.order.shift();
      if (oldest) this.traces.delete(oldest);
    }
    return record;
  }

  mark(requestId: string, stage: string, details?: Record<string, unknown>): void {
    const record = this.traces.get(String(requestId));
    if (!record) return;
    const at = Date.now();
    record.stages.push({
      stage: String(stage || 'stage'),
      at,
      elapsedMs: Math.max(0, at - record.startedAt),
      details,
    });
  }

  finish(requestId: string, success: boolean, error?: string): void {
    const record = this.traces.get(String(requestId));
    if (!record) return;
    record.completedAt = Date.now();
    record.success = Boolean(success);
    if (error) record.error = String(error).slice(0, 2000);
    this.mark(requestId, 'response', error ? { error: record.error } : { success: record.success });
  }

  get(requestId: string): ToolTraceRecord | undefined {
    const record = this.traces.get(String(requestId));
    return record ? structuredClone(record) : undefined;
  }

  list(limit = 20): ToolTraceRecord[] {
    const count = Math.max(1, Math.min(Number(limit || 20), MAX_TRACES));
    return this.order
      .slice(-count)
      .reverse()
      .map((id) => this.traces.get(id))
      .filter((value): value is ToolTraceRecord => Boolean(value))
      .map((value) => structuredClone(value));
  }

  summary(): { stored: number; inflight: number; failed: number } {
    const records = [...this.traces.values()];
    return {
      stored: records.length,
      inflight: records.filter((record) => record.completedAt === undefined).length,
      failed: records.filter((record) => record.success === false).length,
    };
  }
}

export const toolTrace = new ToolTraceStore();
