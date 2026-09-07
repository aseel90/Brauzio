import { MessageTarget } from '@/common/message-types';
import { handleGifMessage } from './gif-encoder';

interface ClipboardMessage {
  target?: unknown;
  type?: string;
  text?: string;
}

function clipboardTextarea(value = ''): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-10000px';
  textarea.style.top = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  return textarea;
}

function execClipboardWrite(text: string): void {
  const textarea = clipboardTextarea(text);
  try {
    if (!document.execCommand('copy')) throw new Error('execCommand(copy) returned false');
  } finally {
    textarea.remove();
  }
}

function execClipboardRead(): string {
  const textarea = clipboardTextarea();
  try {
    if (!document.execCommand('paste')) throw new Error('execCommand(paste) returned false');
    return textarea.value;
  } finally {
    textarea.remove();
  }
}

async function handleClipboard(message: ClipboardMessage): Promise<unknown> {
  if (message.type === 'BRAUZIO_CLIPBOARD_READ') {
    try {
      return { success: true, text: execClipboardRead(), method: 'execCommand' };
    } catch {
      const text = await navigator.clipboard.readText();
      return { success: true, text, method: 'navigator.clipboard' };
    }
  }
  if (message.type === 'BRAUZIO_CLIPBOARD_WRITE') {
    const text = String(message.text ?? '');
    try {
      execClipboardWrite(text);
      return { success: true, method: 'execCommand' };
    } catch {
      await navigator.clipboard.writeText(text);
      return { success: true, method: 'navigator.clipboard' };
    }
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
