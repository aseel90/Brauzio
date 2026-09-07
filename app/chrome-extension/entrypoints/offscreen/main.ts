import { MessageTarget } from '@/common/message-types';
import { handleGifMessage } from './gif-encoder';

interface ClipboardMessage {
  target?: unknown;
  type?: string;
  text?: string;
}

async function handleClipboard(message: ClipboardMessage): Promise<unknown> {
  if (message.type === 'BRAUZIO_CLIPBOARD_READ') {
    const text = await navigator.clipboard.readText();
    return { success: true, text };
  }
  if (message.type === 'BRAUZIO_CLIPBOARD_WRITE') {
    await navigator.clipboard.writeText(String(message.text ?? ''));
    return { success: true };
  }
  return null;
}

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => {
    if (!message || typeof message !== 'object') return false;

    const target = (message as ClipboardMessage).target;
    if (target !== MessageTarget.Offscreen) return false;

    if (handleGifMessage(message, sendResponse)) return true;

    const clipboardType = String((message as ClipboardMessage).type || '');
    if (clipboardType === 'BRAUZIO_CLIPBOARD_READ' || clipboardType === 'BRAUZIO_CLIPBOARD_WRITE') {
      void handleClipboard(message as ClipboardMessage)
        .then((response) => sendResponse(response))
        .catch((error) => sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }));
      return true;
    }

    sendResponse({ success: false, error: 'Unsupported offscreen message' });
    return true;
  },
);
