import { MessageTarget } from '@/common/message-types';
import { handleGifMessage } from './gif-encoder';

/**
 * Brauzio V2 offscreen document.
 *
 * The offscreen context is intentionally limited to GIF encoding. Legacy
 * semantic-model execution and record/replay keepalive code was removed.
 */
chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => {
    if (!message || typeof message !== 'object') return false;

    const target = (message as { target?: unknown }).target;
    if (target !== MessageTarget.Offscreen) return false;

    if (handleGifMessage(message, sendResponse)) {
      return true;
    }

    sendResponse({ success: false, error: 'Unsupported offscreen message' });
    return true;
  },
);
