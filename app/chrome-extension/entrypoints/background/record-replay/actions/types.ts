/**
 * Action Type System for Record & Replay
  * Brauzio internal note.
 *
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
  * Brauzio internal note.
 */

// ================================
// Brauzio internal note.
// ================================

export type Milliseconds = number;
export type ISODateTimeString = string;
export type NonEmptyArray<T> = [T, ...T[]];

// Brauzio internal note.
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonArray = JsonValue[];

// Brauzio internal note.
export type FlowId = string;
export type ActionId = string;
export type SubflowId = string;
export type EdgeId = string;
export type VariableName = string;

// ================================
// Edge Labels
// ================================

export const EDGE_LABELS = {
  DEFAULT: 'default',
  TRUE: 'true',
  FALSE: 'false',
  ON_ERROR: 'onError',
} as const;

export type BuiltinEdgeLabel = (typeof EDGE_LABELS)[keyof typeof EDGE_LABELS];
export type EdgeLabel = string;

// ================================
// Brauzio internal note.
// ================================

export type ActionErrorCode =
  | 'VALIDATION_ERROR'
  | 'TIMEOUT'
  | 'TAB_NOT_FOUND'
  | 'FRAME_NOT_FOUND'
  | 'TARGET_NOT_FOUND'
  | 'ELEMENT_NOT_VISIBLE'
  | 'NAVIGATION_FAILED'
  | 'NETWORK_REQUEST_FAILED'
  | 'DOWNLOAD_FAILED'
  | 'ASSERTION_FAILED'
  | 'SCRIPT_FAILED'
  | 'UNKNOWN';

export interface ActionError {
  code: ActionErrorCode;
  message: string;
  data?: JsonValue;
}

// ================================
// Brauzio internal note.
// ================================

export interface TimeoutPolicy {
  ms: Milliseconds;
  /* Brauzio internal note. */
  scope?: 'attempt' | 'action';
}

export type BackoffKind = 'none' | 'exp' | 'linear';

export interface RetryPolicy {
  /* Brauzio internal note. */
  retries: number;
  /* Brauzio internal note. */
  intervalMs: Milliseconds;
  /* Brauzio internal note. */
  backoff?: BackoffKind;
  /* Brauzio internal note. */
  maxIntervalMs?: Milliseconds;
  /* Brauzio internal note. */
  jitter?: 'none' | 'full';
  /* Brauzio internal note. */
  retryOn?: ReadonlyArray<ActionErrorCode>;
}

export type ErrorHandlingStrategy =
  | { kind: 'stop' }
  | { kind: 'continue'; level?: 'warning' | 'error' }
  | { kind: 'goto'; label: EdgeLabel };

export interface ArtifactCapturePolicy {
  screenshot?: 'never' | 'onFailure' | 'always';
  saveScreenshotAs?: VariableName;
  includeConsole?: boolean;
  includeNetwork?: boolean;
}

export interface ActionPolicy {
  timeout?: TimeoutPolicy;
  retry?: RetryPolicy;
  onError?: ErrorHandlingStrategy;
  artifacts?: ArtifactCapturePolicy;
}

// ================================
// Brauzio internal note.
// ================================

export interface VariableDefinitionBase {
  name: VariableName;
  label?: string;
  description?: string;
  sensitive?: boolean;
  required?: boolean;
}

export interface VariableStringRules {
  pattern?: string;
  minLength?: number;
  maxLength?: number;
}

export interface VariableNumberRules {
  min?: number;
  max?: number;
  integer?: boolean;
}

export type VariableDefinition =
  | (VariableDefinitionBase & {
      kind: 'string';
      default?: string;
      rules?: VariableStringRules;
    })
  | (VariableDefinitionBase & {
      kind: 'number';
      default?: number;
      rules?: VariableNumberRules;
    })
  | (VariableDefinitionBase & {
      kind: 'boolean';
      default?: boolean;
    })
  | (VariableDefinitionBase & {
      kind: 'enum';
      options: NonEmptyArray<string>;
      default?: string;
    })
  | (VariableDefinitionBase & {
      kind: 'array';
      item: 'string' | 'number' | 'boolean' | 'json';
      default?: JsonValue[];
    })
  | (VariableDefinitionBase & {
      kind: 'json';
      default?: JsonValue;
    });

export type VariableStore = Record<VariableName, JsonValue>;

export type VariableScope = 'flow' | 'run' | 'env' | 'secret';
export type VariablePathSegment = string | number;

export interface VariablePointer {
  scope?: VariableScope;
  name: VariableName;
  path?: ReadonlyArray<VariablePathSegment>;
}

// ================================
// Brauzio internal note.
// ================================

export type ExpressionLanguage = 'js' | 'rr';

export interface Expression<_T = JsonValue> {
  language: ExpressionLanguage;
  code: string;
}

export interface VariableValue<T> {
  kind: 'var';
  ref: VariablePointer;
  default?: T;
}

export interface ExpressionValue<T> {
  kind: 'expr';
  expr: Expression<T>;
  default?: T;
}

export type TemplateFormat = 'text' | 'json' | 'urlEncoded';

export type TemplatePart =
  | { kind: 'text'; value: string }
  | { kind: 'insert'; value: Resolvable<JsonValue>; format?: TemplateFormat };

export interface StringTemplate {
  kind: 'template';
  parts: NonEmptyArray<TemplatePart>;
}

export type Resolvable<T> =
  | T
  | VariableValue<T>
  | ExpressionValue<T>
  | ([T] extends [string] ? StringTemplate : never);

export type DataPath = string; // dot/bracket path: e.g. "data.items[0].id"
export type Assignments = Record<VariableName, DataPath>;

// ================================
// Brauzio internal note.
// ================================

export type CompareOp =
  | 'eq'
  | 'eqi'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'containsI'
  | 'notContains'
  | 'notContainsI'
  | 'startsWith'
  | 'endsWith'
  | 'regex';

export type Condition =
  | { kind: 'expr'; expr: Expression<boolean> }
  | {
      kind: 'compare';
      left: Resolvable<JsonValue>;
      op: CompareOp;
      right: Resolvable<JsonValue>;
    }
  | { kind: 'truthy'; value: Resolvable<JsonValue> }
  | { kind: 'falsy'; value: Resolvable<JsonValue> }
  | { kind: 'not'; condition: Condition }
  | { kind: 'and'; conditions: NonEmptyArray<Condition> }
  | { kind: 'or'; conditions: NonEmptyArray<Condition> };

// ================================
// Brauzio internal note.
// ================================

export type SelectorCandidateSource = 'recorded' | 'user' | 'generated';

export interface SelectorStability {
  /* Brauzio internal note. */
  score: number;
  signals?: {
    usesId?: boolean;
    usesAria?: boolean;
    usesText?: boolean;
    usesNthOfType?: boolean;
    usesAttributes?: boolean;
    usesClass?: boolean;
  };
  note?: string;
}

export interface SelectorCandidateBase {
  weight?: number;
  stability?: SelectorStability;
  source?: SelectorCandidateSource;
}

export type SelectorCandidate =
  | (SelectorCandidateBase & { type: 'css'; selector: Resolvable<string> })
  | (SelectorCandidateBase & { type: 'xpath'; xpath: Resolvable<string> })
  | (SelectorCandidateBase & { type: 'attr'; selector: Resolvable<string> })
  | (SelectorCandidateBase & {
      type: 'aria';
      role?: Resolvable<string>;
      name?: Resolvable<string>;
    })
  | (SelectorCandidateBase & {
      type: 'text';
      text: Resolvable<string>;
      tagNameHint?: string;
      match?: 'exact' | 'contains';
    });

export type FrameTarget =
  | { kind: 'top' }
  | { kind: 'index'; index: Resolvable<number> }
  | { kind: 'urlContains'; value: Resolvable<string> };

export interface TargetHint {
  tagName?: string;
  role?: string;
  name?: string;
  text?: string;
}

export interface ElementTargetBase {
  frame?: FrameTarget;
  hint?: TargetHint;
}

export type ElementTarget =
  | (ElementTargetBase & {
      /* Brauzio internal note. */
      ref: string;
      candidates?: ReadonlyArray<SelectorCandidate>;
    })
  | (ElementTargetBase & {
      ref?: string;
      candidates: NonEmptyArray<SelectorCandidate>;
    });

// ================================
// Brauzio internal note.
// ================================

export type BrowserWorld = 'MAIN' | 'ISOLATED';

// Brauzio internal note.

export interface ClickParams {
  target: ElementTarget;
  button?: 'left' | 'middle' | 'right';
  before?: { scrollIntoView?: boolean; waitForSelector?: boolean };
  after?: { waitForNavigation?: boolean; waitForNetworkIdle?: boolean };
}

export interface FillParams {
  target: ElementTarget;
  value: Resolvable<string>;
  clearFirst?: boolean;
  mode?: 'replace' | 'append';
}

export interface KeyParams {
  keys: Resolvable<string>; // e.g. "Backspace Enter" or "cmd+a"
  target?: ElementTarget;
}

export type ScrollMode = 'element' | 'offset' | 'container';

export interface ScrollOffset {
  x?: Resolvable<number>;
  y?: Resolvable<number>;
}

export interface ScrollParams {
  mode: ScrollMode;
  target?: ElementTarget;
  offset?: ScrollOffset;
}

export interface Point {
  x: number;
  y: number;
}

export interface DragParams {
  start: ElementTarget;
  end: ElementTarget;
  path?: ReadonlyArray<Point>;
}

// Brauzio internal note.

export interface NavigateParams {
  url: Resolvable<string>;
  refresh?: boolean;
}

// Brauzio internal note.

export type WaitCondition =
  | { kind: 'sleep'; sleep: Resolvable<Milliseconds> }
  | { kind: 'navigation' }
  | { kind: 'networkIdle'; idleMs?: Resolvable<Milliseconds> }
  | { kind: 'text'; text: Resolvable<string>; appear?: boolean }
  | { kind: 'selector'; selector: Resolvable<string>; visible?: boolean };

export interface WaitParams {
  condition: WaitCondition;
}

export type Assertion =
  | { kind: 'exists'; selector: Resolvable<string> }
  | { kind: 'visible'; selector: Resolvable<string> }
  | { kind: 'textPresent'; text: Resolvable<string> }
  | {
      kind: 'attribute';
      selector: Resolvable<string>;
      name: Resolvable<string>;
      equals?: Resolvable<string>;
      matches?: Resolvable<string>;
    };

export type AssertFailStrategy = 'stop' | 'warn' | 'retry';

export interface AssertParams {
  assert: Assertion;
  failStrategy?: AssertFailStrategy;
}

// Brauzio internal note.

export type ExtractParams =
  | {
      mode: 'selector';
      selector: Resolvable<string>;
      attr?: Resolvable<string>; // "text" | "textContent" | attribute name
      saveAs: VariableName;
    }
  | {
      mode: 'js';
      code: string;
      world?: BrowserWorld;
      saveAs: VariableName;
    };

export type ScriptTiming = 'before' | 'after';

export interface ScriptParams {
  world?: BrowserWorld;
  code: string;
  when?: ScriptTiming;
  args?: Record<string, Resolvable<JsonValue>>;
  saveAs?: VariableName;
  assign?: Assignments;
}

export interface ScreenshotParams {
  selector?: Resolvable<string>;
  fullPage?: boolean;
  saveAs?: VariableName;
}

// --- HTTP ---

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type HttpHeaders = Record<string, Resolvable<string>>;
export type HttpFormData = Record<string, Resolvable<string>>;

export type HttpBody =
  | { kind: 'none' }
  | { kind: 'text'; text: Resolvable<string>; contentType?: Resolvable<string> }
  | { kind: 'json'; json: Resolvable<JsonValue> };

export type HttpOkStatus =
  | { kind: 'range'; min: number; max: number }
  | { kind: 'list'; statuses: NonEmptyArray<number> };

export interface HttpParams {
  method?: HttpMethod;
  url: Resolvable<string>;
  headers?: HttpHeaders;
  body?: HttpBody;
  formData?: HttpFormData;
  okStatus?: HttpOkStatus;
  saveAs?: VariableName;
  assign?: Assignments;
}

// Brauzio internal note.

export interface TriggerEventParams {
  target: ElementTarget;
  event: Resolvable<string>;
  bubbles?: boolean;
  cancelable?: boolean;
}

export interface SetAttributeParams {
  target: ElementTarget;
  name: Resolvable<string>;
  value?: Resolvable<JsonValue>;
  remove?: boolean;
}

export interface SwitchFrameParams {
  target: FrameTarget;
}

export interface LoopElementsParams {
  selector: Resolvable<string>;
  saveAs?: VariableName;
  itemVar?: VariableName;
  subflowId: SubflowId;
}

// Brauzio internal note.

export interface OpenTabParams {
  url?: Resolvable<string>;
  newWindow?: boolean;
}

export interface SwitchTabParams {
  tabId?: number;
  urlContains?: Resolvable<string>;
  titleContains?: Resolvable<string>;
}

export interface CloseTabParams {
  tabIds?: ReadonlyArray<number>;
  url?: Resolvable<string>;
}

export interface HandleDownloadParams {
  filenameContains?: Resolvable<string>;
  waitForComplete?: boolean;
  saveAs?: VariableName;
}

// Brauzio internal note.

export interface ExecuteFlowParams {
  flowId: FlowId;
  inline?: boolean;
  args?: Record<string, Resolvable<JsonValue>>;
}

export interface ForeachParams {
  listVar: VariableName;
  itemVar?: VariableName;
  subflowId: SubflowId;
  concurrency?: number;
}

export interface WhileParams {
  condition: Condition;
  subflowId: SubflowId;
  maxIterations?: number;
}

export interface IfBranch {
  id: string;
  label: EdgeLabel;
  condition: Condition;
}

export type IfParams =
  | {
      mode: 'binary';
      condition: Condition;
      trueLabel?: EdgeLabel;
      falseLabel?: EdgeLabel;
    }
  | {
      mode: 'branches';
      branches: NonEmptyArray<IfBranch>;
      elseLabel?: EdgeLabel;
    };

export interface DelayParams {
  sleep: Resolvable<Milliseconds>;
}

// Brauzio internal note.

export type TriggerUrlRuleKind = 'url' | 'domain' | 'path';

export interface TriggerUrlRule {
  kind: TriggerUrlRuleKind;
  value: Resolvable<string>;
}

export interface TriggerUrlConfig {
  rules?: ReadonlyArray<TriggerUrlRule>;
}

export interface TriggerModeConfig {
  manual?: boolean;
  url?: boolean;
  contextMenu?: boolean;
  command?: boolean;
  dom?: boolean;
  schedule?: boolean;
}

export interface TriggerContextMenuConfig {
  title?: Resolvable<string>;
  enabled?: boolean;
}

export interface TriggerCommandConfig {
  commandKey?: Resolvable<string>;
  enabled?: boolean;
}

export interface TriggerDomConfig {
  selector?: Resolvable<string>;
  appear?: boolean;
  once?: boolean;
  debounceMs?: Milliseconds;
  enabled?: boolean;
}

export type TriggerScheduleType = 'once' | 'interval' | 'daily';

export interface TriggerSchedule {
  id: string;
  type: TriggerScheduleType;
  when: Resolvable<string>; // ISO/cron-like string
  enabled?: boolean;
}

export interface TriggerParams {
  enabled?: boolean;
  description?: Resolvable<string>;
  modes?: TriggerModeConfig;
  url?: TriggerUrlConfig;
  contextMenu?: TriggerContextMenuConfig;
  command?: TriggerCommandConfig;
  dom?: TriggerDomConfig;
  schedules?: ReadonlyArray<TriggerSchedule>;
}

// ================================
// Brauzio internal note.
// ================================

/**
  * Brauzio internal note.
  * Brauzio internal note.
 */
export interface ActionParamsByType {
  // Brauzio internal note.
  trigger: TriggerParams;
  delay: DelayParams;

  // Brauzio internal note.
  click: ClickParams;
  dblclick: ClickParams;
  fill: FillParams;
  key: KeyParams;
  scroll: ScrollParams;
  drag: DragParams;

  // Brauzio internal note.
  wait: WaitParams;
  assert: AssertParams;

  // Brauzio internal note.
  extract: ExtractParams;
  script: ScriptParams;
  http: HttpParams;
  screenshot: ScreenshotParams;

  // Brauzio internal note.
  triggerEvent: TriggerEventParams;
  setAttribute: SetAttributeParams;

  // Brauzio internal note.
  switchFrame: SwitchFrameParams;
  loopElements: LoopElementsParams;

  // Brauzio internal note.
  if: IfParams;
  foreach: ForeachParams;
  while: WhileParams;
  executeFlow: ExecuteFlowParams;

  // Brauzio internal note.
  navigate: NavigateParams;
  openTab: OpenTabParams;
  switchTab: SwitchTabParams;
  closeTab: CloseTabParams;
  handleDownload: HandleDownloadParams;
}

export type ActionType = keyof ActionParamsByType;

export interface ActionBase<T extends ActionType> {
  id: ActionId;
  type: T;
  name?: string;
  disabled?: boolean;
  tags?: ReadonlyArray<string>;
  policy?: ActionPolicy;
  ui?: { x: number; y: number };
}

export type Action<T extends ActionType = ActionType> = ActionBase<T> & {
  params: ActionParamsByType[T];
};

export type AnyAction = { [T in ActionType]: Action<T> }[ActionType];

export type ExecutableActionType = Exclude<ActionType, 'trigger'>;
export type ExecutableAction<T extends ExecutableActionType = ExecutableActionType> = Action<T>;

// ================================
// Brauzio internal note.
// ================================

export interface HttpResponse {
  url: string;
  status: number;
  headers?: Record<string, string>;
  body?: JsonValue | string | null;
}

export type DownloadState = 'in_progress' | 'complete' | 'interrupted' | 'canceled';

export interface DownloadInfo {
  id: string;
  filename: string;
  url?: string;
  state?: DownloadState;
  size?: number;
}

/**
  * Brauzio internal note.
 */
export interface ActionOutputsByType {
  screenshot: { base64Data: string };
  extract: { value: JsonValue };
  script: { result: JsonValue };
  http: { response: HttpResponse };
  handleDownload: { download: DownloadInfo };
  loopElements: { elements: string[] };
}

export type ActionOutput<T extends ActionType> = T extends keyof ActionOutputsByType
  ? ActionOutputsByType[T]
  : undefined;

// ================================
// Brauzio internal note.
// ================================

export type ValidationResult = { ok: true } | { ok: false; errors: NonEmptyArray<string> };

/**
 * Execution flags for coordinating with orchestrator policies.
 * Used to avoid duplicate retry/nav-wait when StepRunner owns these policies.
 */
export interface ExecutionFlags {
  /**
   * When true, navigation waiting should be handled by StepRunner.
   * Action handlers (click, navigate) should skip their internal nav-wait logic.
   */
  skipNavWait?: boolean;
}

export interface ActionExecutionContext {
  vars: VariableStore;
  tabId: number;
  frameId?: number;
  runId?: string;
  /* Brauzio internal note. */
  log: (message: string, level?: 'info' | 'warn' | 'error') => void;
  /* Brauzio internal note. */
  captureScreenshot?: () => Promise<string>;
  /**
   * Optional structured log sink for replay UIs (legacy RunLogger integration).
   * Action handlers may emit richer entries (e.g. selector fallback) via this hook.
   */
  pushLog?: (entry: unknown) => void;
  /**
   * Execution flags provided by the orchestrator.
   * Handlers should respect these flags to avoid duplicating StepRunner policies.
   */
  execution?: ExecutionFlags;
}

export type ControlDirective =
  | {
      kind: 'foreach';
      listVar: VariableName;
      itemVar: VariableName;
      subflowId: SubflowId;
      concurrency?: number;
    }
  | {
      kind: 'while';
      condition: Condition;
      subflowId: SubflowId;
      maxIterations: number;
    };

export interface ActionExecutionResult<T extends ActionType = ActionType> {
  status: 'success' | 'failed' | 'skipped' | 'paused';
  output?: ActionOutput<T>;
  error?: ActionError;
  /* Brauzio internal note. */
  nextLabel?: EdgeLabel;
  /* Brauzio internal note. */
  control?: ControlDirective;
  /* Brauzio internal note. */
  durationMs?: Milliseconds;
  /**
   * New tab ID after tab operations (openTab/switchTab).
   * Used to update execution context for subsequent steps.
   */
  newTabId?: number;
}

/**
  * Brauzio internal note.
 */
export interface ActionHandler<T extends ExecutableActionType = ExecutableActionType> {
  type: T;
  /* Brauzio internal note. */
  validate?: (action: Action<T>) => ValidationResult;
  /* Brauzio internal note. */
  run: (ctx: ActionExecutionContext, action: Action<T>) => Promise<ActionExecutionResult<T>>;
  /* Brauzio internal note. */
  describe?: (action: Action<T>) => string;
}

// ================================
// Brauzio internal note.
// ================================

export interface ActionEdge {
  id: EdgeId;
  from: ActionId;
  to: ActionId;
  label?: EdgeLabel;
}

export interface FlowBinding {
  type: 'domain' | 'path' | 'url';
  value: string;
}

export interface FlowMeta {
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  domain?: string;
  tags?: ReadonlyArray<string>;
  bindings?: ReadonlyArray<FlowBinding>;
  tool?: { category?: string; description?: string };
  exposedOutputs?: ReadonlyArray<{ nodeId: ActionId; as: VariableName }>;
}

export interface Flow {
  id: FlowId;
  name: string;
  description?: string;
  version: number;
  meta: FlowMeta;
  variables?: ReadonlyArray<VariableDefinition>;

  /* Brauzio internal note. */
  nodes: ReadonlyArray<AnyAction>;
  /* Brauzio internal note. */
  edges: ReadonlyArray<ActionEdge>;
  /* Brauzio internal note. */
  subflows?: Record<
    SubflowId,
    { nodes: ReadonlyArray<AnyAction>; edges: ReadonlyArray<ActionEdge> }
  >;
}

// ================================
// Brauzio internal note.
// ================================

export type ActionCategory = 'Flow' | 'Actions' | 'Logic' | 'Tools' | 'Tabs' | 'Page';

export interface ActionSpecDisplay {
  label: string;
  description?: string;
  category: ActionCategory;
  icon?: string;
  docUrl?: string;
}

export interface ActionSpecPorts {
  inputs: number | 'any';
  outputs: Array<{ label?: EdgeLabel }> | 'any';
  maxConnection?: number;
  allowedInputs?: boolean;
}

export interface ActionSpec<T extends ActionType = ActionType> {
  type: T;
  version: number;
  display: ActionSpecDisplay;
  ports: ActionSpecPorts;
  defaults?: Partial<ActionParamsByType[T]>;
  /* Brauzio internal note. */
  refDataKeys?: ReadonlyArray<string>;
}

// ================================
// Brauzio internal note.
// ================================

export const ACTION_TYPES: ReadonlyArray<ActionType> = [
  'trigger',
  'delay',
  'click',
  'dblclick',
  'fill',
  'key',
  'scroll',
  'drag',
  'wait',
  'assert',
  'extract',
  'script',
  'http',
  'screenshot',
  'triggerEvent',
  'setAttribute',
  'switchFrame',
  'loopElements',
  'if',
  'foreach',
  'while',
  'executeFlow',
  'navigate',
  'openTab',
  'switchTab',
  'closeTab',
  'handleDownload',
] as const;

export const EXECUTABLE_ACTION_TYPES: ReadonlyArray<ExecutableActionType> = ACTION_TYPES.filter(
  (t): t is ExecutableActionType => t !== 'trigger',
);
