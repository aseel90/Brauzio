import {
  BACKGROUND_MESSAGE_TYPES,
  type QuickPanelCancelAIMessage,
  type QuickPanelCancelAIResponse,
  type QuickPanelSendToAIMessage,
  type QuickPanelSendToAIResponse,
} from '@/common/message-types';

const LOG_PREFIX = '[QuickPanelAgent]';

let initialized = false;

/**
 * Brauzio Cloud deliberately does not start the legacy localhost Agent API.
 * Browser automation is provided through ChatGPT -> Remote MCP -> Cloudflare -> Brauzio.
 *
 * The Quick Panel shell remains available for the rest of its browser helpers, but its
 * old embedded AI-chat transport is disabled instead of silently reconnecting to
 * 127.0.0.1 or requiring a local Node/native process.
 */
async function handleSendToAI(
  _message: QuickPanelSendToAIMessage,
  sender: chrome.runtime.MessageSender,
): Promise<QuickPanelSendToAIResponse> {
  if (typeof sender?.tab?.id !== 'number') {
    return {
      success: false,
      error: 'يجب فتح اللوحة السريعة من داخل تبويب Chrome.',
    };
  }

  return {
    success: false,
    error:
      'المحادثة المحلية داخل اللوحة السريعة غير مستخدمة في Brauzio Cloud. استخدم ChatGPT المتصل بـ Brauzio عبر MCP للتحكم في المتصفح.',
  };
}

async function handleCancelAI(
  _message: QuickPanelCancelAIMessage,
  sender: chrome.runtime.MessageSender,
): Promise<QuickPanelCancelAIResponse> {
  if (typeof sender?.tab?.id !== 'number') {
    return {
      success: false,
      error: 'يجب إرسال طلب الإلغاء من داخل تبويب Chrome.',
    };
  }

  // There is no localhost Agent request to cancel in the cloud-only build.
  return { success: true };
}

/**
 * Keep the message contract registered so the Quick Panel fails gracefully in the
 * cloud-only edition instead of leaving callers with an unhandled message channel.
 */
export function initQuickPanelAgentHandler(): void {
  if (initialized) return;
  initialized = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === BACKGROUND_MESSAGE_TYPES.QUICK_PANEL_SEND_TO_AI) {
      handleSendToAI(message as QuickPanelSendToAIMessage, sender)
        .then(sendResponse)
        .catch((error) => {
          const text = error instanceof Error ? error.message : String(error);
          sendResponse({ success: false, error: text || 'تعذر تنفيذ الطلب.' });
        });
      return true;
    }

    if (message?.type === BACKGROUND_MESSAGE_TYPES.QUICK_PANEL_CANCEL_AI) {
      handleCancelAI(message as QuickPanelCancelAIMessage, sender)
        .then(sendResponse)
        .catch((error) => {
          const text = error instanceof Error ? error.message : String(error);
          sendResponse({ success: false, error: text || 'تعذر إلغاء الطلب.' });
        });
      return true;
    }

    return false;
  });

  console.debug(`${LOG_PREFIX} Cloud-only handler initialized`);
}
