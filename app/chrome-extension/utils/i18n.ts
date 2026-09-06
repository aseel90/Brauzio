const fallbackMessages: Record<string, string> = {
  bookmarksBarLabel: 'شريط الإشارات المرجعية',
};

/**
 * Return a Chrome-localized message when available, otherwise use Brauzio's
 * deliberately small Arabic fallback set for retained browser tools.
 */
export function getMessage(key: string, substitutions?: string[]): string {
  try {
    if (typeof chrome !== 'undefined' && chrome.i18n?.getMessage) {
      const message = chrome.i18n.getMessage(key, substitutions);
      if (message) return message;
    }
  } catch {
    // Fall back below.
  }

  let message = fallbackMessages[key] || key;
  if (substitutions?.length) {
    substitutions.forEach((value, index) => {
      message = message.replace(`{${index}}`, value);
    });
  }
  return message;
}
