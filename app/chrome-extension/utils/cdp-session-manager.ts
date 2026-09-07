import { cdpRouter } from './cdp-router';

// Compatibility alias for legacy tools. New V3 code imports cdpRouter directly.
// Do not re-export cdpRouter/types here: WXT auto-imports would see duplicate symbols.
export const cdpSessionManager = cdpRouter;
