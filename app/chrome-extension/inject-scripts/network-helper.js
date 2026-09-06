/* eslint-disable */
/** Brauzio network request helper. Runs requests in the current page context. */
if (!window.__BRAUZIO_NETWORK_HELPER_INITIALIZED__) {
  window.__BRAUZIO_NETWORK_HELPER_INITIALIZED__ = true;

  async function sendNetworkRequest(url, method, headers, body, timeout = 30000) {
    try {
      const options = {
        method,
        headers: headers || {},
        credentials: 'include',
        mode: 'cors',
        cache: 'no-cache',
      };
      if (method !== 'GET' && method !== 'HEAD' && body !== undefined) {
        options.body = body;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      let response;
      try {
        response = await fetch(url, { ...options, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }

      const responseData = {
        status: response.status,
        statusText: response.statusText,
        headers: {},
      };
      response.headers.forEach((value, key) => {
        responseData.headers[key] = value;
      });

      const contentType = response.headers.get('content-type') || '';
      try {
        if (contentType.includes('application/json')) {
          responseData.body = await response.json();
        } else if (
          contentType.includes('text/') ||
          contentType.includes('application/xml') ||
          contentType.includes('application/javascript')
        ) {
          responseData.body = await response.text();
        } else {
          responseData.body = '[Binary data not displayed]';
        }
      } catch (error) {
        responseData.body = `[Error parsing response body: ${error.message}]`;
      }
      return { success: true, response: responseData };
    } catch (error) {
      return { success: false, error: `Error sending request: ${error.message}` };
    }
  }

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'chrome_network_request_ping') {
      sendResponse({ status: 'pong' });
      return false;
    }
    if (request.action === 'sendPureNetworkRequest') {
      sendNetworkRequest(
        request.url,
        request.method,
        request.headers,
        request.body,
        request.timeout,
      )
        .then(sendResponse)
        .catch((error) => sendResponse({ success: false, error: String(error?.message || error) }));
      return true;
    }
  });
}
