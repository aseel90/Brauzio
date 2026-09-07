export * from './types';

import { TOOL_NAMES as BASE_TOOL_NAMES, TOOL_SCHEMAS as BASE_TOOL_SCHEMAS } from './tools';
import { WATCH_TOOL_NAMES, WATCH_TOOL_SCHEMAS } from './watch-tools';

export const TOOL_NAMES = {
  ...BASE_TOOL_NAMES,
  BROWSER: {
    ...BASE_TOOL_NAMES.BROWSER,
    ...WATCH_TOOL_NAMES,
  },
} as const;

export const TOOL_SCHEMAS = [...BASE_TOOL_SCHEMAS, ...WATCH_TOOL_SCHEMAS];

export { WATCH_TOOL_NAMES, WATCH_TOOL_SCHEMAS } from './watch-tools';

// Release trigger: Brauzio 2.9.1 Smart Wait + Device Mode
