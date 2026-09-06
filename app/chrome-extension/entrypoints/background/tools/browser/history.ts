import { createErrorResponse, type ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'brauzio-shared';

interface HistoryToolParams {
  text?: string;
  startTime?: string;
  endTime?: string;
  maxResults?: number;
  excludeCurrentTabs?: boolean;
}

class HistoryTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.HISTORY;
  private static readonly DAY_MS = 24 * 60 * 60 * 1000;

  private startOfDay(offsetDays = 0): number {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offsetDays);
    return d.getTime();
  }

  private parseDateString(value?: string): number | null {
    if (!value) return null;
    const input = value.trim();
    const lower = input.toLowerCase();
    if (lower === 'now') return Date.now();
    if (lower === 'today') return this.startOfDay(0);
    if (lower === 'yesterday') return this.startOfDay(-1);

    const relative = lower.match(/^(\d+)\s+(day|days|week|weeks|month|months|year|years)\s+ago$/);
    if (relative) {
      const amount = Number(relative[1]);
      const unit = relative[2];
      const d = new Date();
      if (unit.startsWith('day')) d.setDate(d.getDate() - amount);
      else if (unit.startsWith('week')) d.setDate(d.getDate() - amount * 7);
      else if (unit.startsWith('month')) d.setMonth(d.getMonth() - amount);
      else d.setFullYear(d.getFullYear() - amount);
      return d.getTime();
    }

    const parsed = new Date(input);
    const timestamp = parsed.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  private formatDate(timestamp: number): string {
    const d = new Date(timestamp);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  async execute(args: HistoryToolParams): Promise<ToolResult> {
    try {
      const text = args?.text ?? '';
      const maxResults = Math.max(1, Math.min(Number(args?.maxResults ?? 100), 1000));
      const now = Date.now();
      const parsedStart = args?.startTime ? this.parseDateString(args.startTime) : now - HistoryTool.DAY_MS;
      const parsedEnd = args?.endTime ? this.parseDateString(args.endTime) : now;

      if (parsedStart === null) return createErrorResponse(`Invalid startTime: ${args.startTime}`);
      if (parsedEnd === null) return createErrorResponse(`Invalid endTime: ${args.endTime}`);
      if (parsedStart > parsedEnd) return createErrorResponse('Start time cannot be after end time.');

      let items = await chrome.history.search({ text, startTime: parsedStart, endTime: parsedEnd, maxResults });

      if (args?.excludeCurrentTabs && items.length) {
        const openUrls = new Set((await chrome.tabs.query({})).map((tab) => tab.url).filter((url): url is string => !!url));
        items = items.filter((item) => !item.url || !openUrls.has(item.url));
      }

      const result = {
        items: items.map((item) => ({
          id: item.id,
          url: item.url,
          title: item.title,
          lastVisitTime: item.lastVisitTime,
          visitCount: item.visitCount,
          typedCount: item.typedCount,
        })),
        totalCount: items.length,
        timeRange: {
          startTime: parsedStart,
          endTime: parsedEnd,
          startTimeFormatted: this.formatDate(parsedStart),
          endTimeFormatted: this.formatDate(parsedEnd),
        },
        ...(text ? { query: text } : {}),
      };

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: false };
    } catch (error) {
      return createErrorResponse(`Error retrieving browsing history: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export const historyTool = new HistoryTool();
