export type BrauzioJsonValue =
  | string
  | number
  | boolean
  | null
  | BrauzioJsonValue[]
  | { [key: string]: BrauzioJsonValue };

export interface BrauzioToolSchema {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, BrauzioJsonValue>;
    required?: string[];
    [key: string]: unknown;
  };
}

export const TOOL_NAMES = {
  BROWSER: {
    GET_WINDOWS_AND_TABS: 'get_windows_and_tabs',
    NAVIGATE: 'chrome_navigate',
    SCREENSHOT: 'chrome_screenshot',
    CLOSE_TABS: 'chrome_close_tabs',
    SWITCH_TAB: 'chrome_switch_tab',
    WEB_FETCHER: 'chrome_get_web_content',
    CLICK: 'chrome_click_element',
    FILL: 'chrome_fill_or_select',
    REQUEST_ELEMENT_SELECTION: 'chrome_request_element_selection',
    GET_INTERACTIVE_ELEMENTS: 'chrome_get_interactive_elements',
    NETWORK_CAPTURE: 'chrome_network_capture',
    NETWORK_CAPTURE_START: 'chrome_network_capture_start',
    NETWORK_CAPTURE_STOP: 'chrome_network_capture_stop',
    NETWORK_REQUEST: 'chrome_network_request',
    NETWORK_DEBUGGER_START: 'chrome_network_debugger_start',
    NETWORK_DEBUGGER_STOP: 'chrome_network_debugger_stop',
    KEYBOARD: 'chrome_keyboard',
    HISTORY: 'chrome_history',
    BOOKMARK_SEARCH: 'chrome_bookmark_search',
    BOOKMARK_ADD: 'chrome_bookmark_add',
    BOOKMARK_DELETE: 'chrome_bookmark_delete',
    INJECT_SCRIPT: 'chrome_inject_script',
    SEND_COMMAND_TO_INJECT_SCRIPT: 'chrome_send_command_to_inject_script',
    JAVASCRIPT: 'chrome_javascript',
    CDP: 'chrome_cdp',
    CONSOLE: 'chrome_console',
    FILE_UPLOAD: 'chrome_upload_file',
    READ_PAGE: 'chrome_read_page',
    COMPUTER: 'chrome_computer',
    HANDLE_DIALOG: 'chrome_handle_dialog',
    HANDLE_DOWNLOAD: 'chrome_handle_download',
    USERSCRIPT: 'chrome_userscript',
    PERFORMANCE_START_TRACE: 'performance_start_trace',
    PERFORMANCE_STOP_TRACE: 'performance_stop_trace',
    PERFORMANCE_ANALYZE_INSIGHT: 'performance_analyze_insight',
    GIF_RECORDER: 'chrome_gif_recorder',
    LIVE_VIEW: 'chrome_live_view',
    DEVICE_MODE: 'chrome_device_mode',
  },
} as const;

const tabTarget = {
  tabId: { type: 'number', description: 'Target tab ID. Defaults to the active tab.' },
  windowId: { type: 'number', description: 'Target window ID when tabId is omitted.' },
};

const point = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' } },
  required: ['x', 'y'],
};

const actionVerification = {
  type: 'object',
  description:
    'Optional Sense → Act → Verify postconditions. When provided, Brauzio returns action evidence and marks the tool call as failed when any requested check does not pass.',
  properties: {
    urlIncludes: { type: 'string', description: 'Expected URL substring after the action.' },
    selector: { type: 'string', description: 'CSS selector to verify after the action.' },
    selectorState: {
      type: 'string',
      enum: ['exists', 'hidden'],
      description: 'Expected selector state. Defaults to exists.',
    },
    text: { type: 'string', description: 'Visible page text to verify after the action.' },
    textState: {
      type: 'string',
      enum: ['appears', 'disappears'],
      description: 'Expected text state. Defaults to appears.',
    },
    requestUrlIncludes: {
      type: 'string',
      description:
        'Expected network request URL substring. Armed before the action so fast requests are not missed.',
    },
    consoleIncludes: {
      type: 'string',
      description: 'Expected console/log/exception text substring. Armed before the action.',
    },
    pageLoaded: { type: 'boolean', description: 'Require the target document to reach loaded state.' },
    networkIdle: { type: 'boolean', description: 'Require a quiet network period after the action.' },
    timeoutMs: { type: 'number', description: 'Verification timeout in milliseconds, up to 120000.' },
    quietMs: { type: 'number', description: 'Quiet period for networkIdle, 100-5000 ms.' },
  },
};

export const TOOL_SCHEMAS: BrauzioToolSchema[] = [
  { name: TOOL_NAMES.BROWSER.GET_WINDOWS_AND_TABS, description: 'Get all currently open Chrome windows and tabs.', inputSchema: { type: 'object', properties: {}, required: [] } },
  { name: TOOL_NAMES.BROWSER.NAVIGATE, description: 'Navigate, refresh, go back/forward, or open a URL in Chrome. Can optionally verify URL, DOM/text, network, console, page load, and network-idle evidence.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, refresh: { type: 'boolean' }, newWindow: { type: 'boolean' }, background: { type: 'boolean' }, verify: actionVerification, ...tabTarget }, required: [] } },
  { name: TOOL_NAMES.BROWSER.READ_PAGE, description: 'Read visible page content as an accessibility tree with stable element refs.', inputSchema: { type: 'object', properties: { filter: { type: 'string' }, depth: { type: 'number' }, refId: { type: 'string' }, ...tabTarget }, required: [] } },
  { name: TOOL_NAMES.BROWSER.COMPUTER, description: 'Control Chrome with visible Brauzio mouse feedback. Supports true press/move/release state for canvases, games, sliders and virtual joysticks.', inputSchema: { type: 'object', properties: { ...tabTarget, action: { type: 'string', description: 'left_click | right_click | double_click | triple_click | left_click_drag | drag_hold | mouse_move | mouse_down | mouse_up | scroll | scroll_to | type | key | fill | fill_form | hover | wait | wait_for | resize_page | zoom | screenshot' }, coordinates: { ...point, description: 'Target/end viewport coordinates.' }, startCoordinates: { ...point, description: 'Drag start viewport coordinates.' }, ref: { type: 'string' }, startRef: { type: 'string' }, selector: { type: 'string' }, selectorType: { type: 'string', enum: ['css', 'xpath'] }, frameId: { type: 'number' }, scrollDirection: { type: 'string', enum: ['up', 'down', 'left', 'right'] }, scrollAmount: { type: 'number' }, text: { type: 'string' }, repeat: { type: 'number' }, value: {}, elements: { type: 'array', items: { type: 'object', properties: { ref: { type: 'string' }, value: {} }, required: ['ref', 'value'] } }, duration: { type: 'number', description: 'Seconds. For drag_hold this is the hold time at the destination (max 15).' }, appear: { type: 'boolean' }, condition: { type: 'string', enum: ['selector_exists', 'selector_hidden', 'text_appears', 'text_disappears', 'url_matches', 'network_idle', 'request_finished', 'page_loaded'], description: 'Smart wait condition used with action=wait_for.' }, urlIncludes: { type: 'string', description: 'URL substring for url_matches or request filtering.' }, requestUrlIncludes: { type: 'string', description: 'Request URL substring for request_finished.' }, timeoutMs: { type: 'number', description: 'Smart wait timeout in milliseconds, up to 120000.' }, quietMs: { type: 'number', description: 'Required network quiet period for network_idle, 100-5000 ms.' }, width: { type: 'number' }, height: { type: 'number' }, region: { type: 'object', properties: { x0: { type: 'number' }, y0: { type: 'number' }, x1: { type: 'number' }, y1: { type: 'number' } } } }, required: ['action'] } },
  { name: TOOL_NAMES.BROWSER.CLICK, description: 'Click a page element by ref, selector or coordinates. Can pre-arm and verify URL, DOM/text, network, console, page-load, and network-idle postconditions.', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, selectorType: { type: 'string', enum: ['css', 'xpath'] }, ref: { type: 'string' }, coordinates: point, double: { type: 'boolean' }, button: { type: 'string', enum: ['left', 'right', 'middle'] }, waitForNavigation: { type: 'boolean' }, timeout: { type: 'number' }, verify: actionVerification, ...tabTarget }, required: [] } },
  { name: TOOL_NAMES.BROWSER.FILL, description: 'Fill an input, textarea, checkbox, radio or select element.', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, selectorType: { type: 'string', enum: ['css', 'xpath'] }, ref: { type: 'string' }, value: {}, frameId: { type: 'number' }, ...tabTarget }, required: ['value'] } },
  { name: TOOL_NAMES.BROWSER.SCREENSHOT, description: 'Capture the current page or a page element.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, selector: { type: 'string' }, fullPage: { type: 'boolean' }, storeBase64: { type: 'boolean' }, savePng: { type: 'boolean' }, width: { type: 'number' }, height: { type: 'number' }, background: { type: 'boolean' }, ...tabTarget }, required: [] } },
  { name: TOOL_NAMES.BROWSER.LIVE_VIEW, description: 'Start a lightweight memory-only Live View of the active tab, inspect status, fetch the latest one to three frames as MCP images, or stop it. Frames are compressed, duplicate frames are dropped, and nothing is saved to disk.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['start', 'status', 'latest', 'stop'] }, intervalMs: { type: 'number', description: 'Capture interval in milliseconds, clamped to 550-5000. Default 900.' }, scale: { type: 'number', description: 'Frame scale 0.35-1. Default 0.65.' }, quality: { type: 'number', description: 'JPEG quality 0.4-0.92. Default 0.72.' }, maxFrames: { type: 'number', description: 'In-memory ring buffer size, 1-3. Default 2.' }, count: { type: 'number', description: 'For latest, return 1-3 newest frames.' }, ...tabTarget }, required: ['action'] } },
  { name: TOOL_NAMES.BROWSER.DEVICE_MODE, description: 'Emulate common phone, tablet, laptop, or custom viewport sizes in the current tab. Supports portrait/landscape orientation, DPR, mobile layout, touch input, status inspection, presets, and reset.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['list_presets', 'apply', 'custom', 'status', 'reset'] }, preset: { type: 'string', description: 'Preset device name for action=apply.' }, orientation: { type: 'string', enum: ['portrait', 'landscape'], description: 'Optional orientation override.' }, width: { type: 'number', description: 'CSS viewport width for action=custom.' }, height: { type: 'number', description: 'CSS viewport height for action=custom.' }, deviceScaleFactor: { type: 'number', description: 'Device pixel ratio for custom mode.' }, mobile: { type: 'boolean', description: 'Use mobile layout metrics for custom mode.' }, touch: { type: 'boolean', description: 'Enable touch emulation for custom mode.' }, ...tabTarget }, required: ['action'] } },
];
