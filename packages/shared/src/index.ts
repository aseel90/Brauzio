export * from './types';

import {
  TOOL_NAMES as BASE_TOOL_NAMES,
  TOOL_SCHEMAS as BASE_TOOL_SCHEMAS,
  type BrauzioToolSchema,
} from './tools';
import { WATCH_TOOL_NAMES, WATCH_TOOL_SCHEMAS } from './watch-tools';

const V3_EXTRA_TOOL_NAMES = {
  CLIPBOARD: 'chrome_clipboard',
  ARTIFACTS: 'chrome_artifacts',
} as const;

const V3_EXTRA_TOOL_SCHEMAS: BrauzioToolSchema[] = [
  {
    name: V3_EXTRA_TOOL_NAMES.CLIPBOARD,
    description: 'Read or write the system clipboard only when explicitly requested by the agent. Brauzio never infers clipboard operations.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['read', 'write'] },
        text: { type: 'string', description: 'Text to write when action=write.' },
      },
      required: ['action'],
    },
  },
  {
    name: V3_EXTRA_TOOL_NAMES.ARTIFACTS,
    description: 'Inspect browser download artifacts or wait for a known download to complete. Completed filenames can be passed explicitly to chrome_act upload.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'get', 'wait'] },
        downloadId: { type: 'number' },
        limit: { type: 'number' },
        timeoutMs: { type: 'number', description: 'For wait, maximum wait up to 120000 ms.' },
      },
      required: ['action'],
    },
  },
];

export const TOOL_NAMES = {
  ...BASE_TOOL_NAMES,
  BROWSER: {
    ...BASE_TOOL_NAMES.BROWSER,
    ...WATCH_TOOL_NAMES,
    ...V3_EXTRA_TOOL_NAMES,
  },
} as const;

export const TOOL_SCHEMAS: BrauzioToolSchema[] = [
  ...BASE_TOOL_SCHEMAS,
  ...WATCH_TOOL_SCHEMAS,
  ...V3_EXTRA_TOOL_SCHEMAS,
];

export { WATCH_TOOL_NAMES, WATCH_TOOL_SCHEMAS } from './watch-tools';
