import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const WATCH_TOOL_NAMES = {
  WATCH_START: 'chrome_watch_start',
  WATCH_WAIT: 'chrome_watch_wait',
  WATCH_READ: 'chrome_watch_read',
  WATCH_STOP: 'chrome_watch_stop',
} as const;

const tabTarget = {
  tabId: { type: 'number', description: 'Target tab ID. Defaults to the active tab.' },
  windowId: { type: 'number', description: 'Target window ID when tabId is omitted.' },
};

export const WATCH_TOOL_SCHEMAS: Tool[] = [
  {
    name: WATCH_TOOL_NAMES.WATCH_START,
    description:
      'Start an event-driven Chrome watch before an action. Buffers navigation, network, runtime error, dialog, or lifecycle events so events are not lost before the next tool call.',
    inputSchema: {
      type: 'object',
      properties: {
        ...tabTarget,
        categories: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['navigation', 'network', 'errors', 'dialogs', 'lifecycle'],
          },
          description: 'Event groups. Defaults to navigation, network, and errors.',
        },
        methods: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional exact CDP event method names to add to the watch.',
        },
        urlIncludes: {
          type: 'string',
          description: 'Optional URL substring filter applied before buffering events.',
        },
        maxEvents: {
          type: 'number',
          description: 'Ring buffer size, 10-500. Defaults to 100.',
        },
        ttlMs: {
          type: 'number',
          description: 'Watch lifetime in milliseconds, up to 10 minutes.',
        },
      },
      required: [],
    },
  },
  {
    name: WATCH_TOOL_NAMES.WATCH_WAIT,
    description:
      'Wait for the next buffered or future event from an existing Brauzio watch, without fixed sleep. If the event already happened it is returned immediately.',
    inputSchema: {
      type: 'object',
      properties: {
        watchId: { type: 'string' },
        afterSequence: { type: 'number', description: 'Only return events after this sequence number.' },
        timeoutMs: { type: 'number', description: 'Maximum wait, up to 120000 ms.' },
        method: { type: 'string', description: 'Optional exact CDP event method filter.' },
      },
      required: ['watchId'],
    },
  },
  {
    name: WATCH_TOOL_NAMES.WATCH_READ,
    description: 'Read events already buffered by a Brauzio watch using sequence numbers.',
    inputSchema: {
      type: 'object',
      properties: {
        watchId: { type: 'string' },
        afterSequence: { type: 'number' },
        limit: { type: 'number', description: 'Maximum events to return, up to 200.' },
        method: { type: 'string' },
      },
      required: ['watchId'],
    },
  },
  {
    name: WATCH_TOOL_NAMES.WATCH_STOP,
    description: 'Stop a Brauzio event watch and release its persistent CDP ownership.',
    inputSchema: {
      type: 'object',
      properties: { watchId: { type: 'string' } },
      required: ['watchId'],
    },
  },
];
