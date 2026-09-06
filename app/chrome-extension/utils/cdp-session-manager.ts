import { cdpRouter } from './cdp-router';

// Compatibility export for the existing browser tools while Brauzio migrates
// incrementally to CDP Core V3. New code should import cdpRouter directly.
export const cdpSessionManager = cdpRouter;

export { CDPRouter, cdpRouter } from './cdp-router';
export type { CdpEventEnvelope, CdpOwnerTag, CdpSessionSnapshot } from './cdp-router';
