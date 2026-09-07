async function waitForDomCondition(
  tabId: number,
  options: SmartWaitOptions,
  timeoutMs: number,
): Promise<Omit<SmartWaitResult, 'condition' | 'elapsedMs'>> {
  const condition = options.condition as
    | 'selector_exists'
    | 'selector_hidden'
    | 'text_appears'
    | 'text_disappears';
  const selector = String(options.selector || '');
  const text = String(options.text || '');
  const startedAt = Date.now();
  let attempts = 0;
  let lastError = '';

  const checkOnce = async (): Promise<{ matched: boolean; error?: string }> => {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'ISOLATED',
        func: (
          conditionName: 'selector_exists' | 'selector_hidden' | 'text_appears' | 'text_disappears',
          selectorValue: string,
          textValue: string,
        ) => {
          const visible = (element: Element | null) => {
            if (!element) return false;
            if (!(element instanceof HTMLElement)) return true;
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return (
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              Number(style.opacity || 1) > 0 &&
              rect.width > 0 &&
              rect.height > 0
            );
          };

          try {
            if (conditionName === 'selector_exists') {
              return { matched: Boolean(selectorValue && document.querySelector(selectorValue)) };
            }
            if (conditionName === 'selector_hidden') {
              return { matched: !visible(document.querySelector(selectorValue)) };
            }
            const pageText =
              document.body?.innerText || document.documentElement?.innerText || '';
            const hasText = Boolean(textValue) && pageText.includes(textValue);
            return {
              matched: conditionName === 'text_appears' ? hasText : !hasText,
            };
          } catch (error) {
            return {
              matched: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        },
        args: [condition, selector, text],
      });
      const payload = result?.[0]?.result as { matched?: boolean; error?: string } | undefined;
      return {
        matched: Boolean(payload?.matched),
        error: payload?.error,
      };
    } catch (error) {
      return {
        matched: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  while (Date.now() - startedAt <= timeoutMs) {
    attempts += 1;
    const check = await checkOnce();
    if (check.matched) {
      return {
        ok: true,
        details: {
          immediate: attempts === 1,
          attempts,
        },
      };
    }
    if (check.error) lastError = check.error;

    const elapsed = Date.now() - startedAt;
    const remaining = timeoutMs - elapsed;
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(125, remaining)));
  }

  return {
    ok: false,
    timedOut: true,
    reason: 'timeout',
    details: {
      attempts,
      lastError: lastError || undefined,
    },
  };
}
