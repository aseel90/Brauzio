export type V3SnapshotMode = 'compact' | 'full' | 'delta';

export interface V3Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface V3ElementFingerprint {
  role?: string;
  name?: string;
  text?: string;
  tag?: string;
  type?: string;
  id?: string;
  fieldName?: string;
  placeholder?: string;
  href?: string;
  frameId?: string;
  documentId: string;
}

export interface V3Element {
  eid: string;
  backendNodeId: number;
  documentId: string;
  frameId: string;
  sessionId?: string;
  targetId?: string;
  role?: string;
  name?: string;
  description?: string;
  text?: string;
  tag: string;
  nodeName?: string;
  nodeValue?: string;
  attributes: Record<string, string>;
  box?: V3Rect;
  visible: boolean;
  enabled: boolean;
  editable: boolean;
  clickable: boolean;
  focusable: boolean;
  checked?: boolean | 'mixed';
  selected?: boolean;
  expanded?: boolean;
  required?: boolean;
  value?: unknown;
  fingerprint: V3ElementFingerprint;
  signature: string;
}

export interface V3Frame {
  frameId: string;
  parentFrameId?: string;
  loaderId?: string;
  url?: string;
  name?: string;
  securityOrigin?: string;
  sessionId?: string;
  targetId?: string;
}

export interface V3TabSummary {
  tabId: number;
  windowId: number;
  active: boolean;
  title: string;
  url: string;
  openerTabId?: number;
  status?: chrome.tabs.Tab['status'];
}

export interface V3SnapshotDelta {
  baseSnapshotId?: string;
  added: string[];
  removed: string[];
  changed: string[];
}

export interface V3ObservationSnapshot {
  snapshotId: string;
  tabId: number;
  windowId: number;
  capturedAt: number;
  mode: V3SnapshotMode;
  url: string;
  title: string;
  documentId: string;
  viewport: {
    width: number | null;
    height: number | null;
    dpr: number | null;
    scrollX?: number;
    scrollY?: number;
    contentWidth?: number;
    contentHeight?: number;
  };
  tabs: V3TabSummary[];
  frames: V3Frame[];
  elements: V3Element[];
  focusedEid?: string;
  delta?: V3SnapshotDelta;
  eventCursor?: number;
  lastAction?: V3RuntimeTabState['lastAction'];
  warnings?: string[];
}

export interface V3ResolveTarget {
  eid?: string;
  backendNodeId?: number;
  role?: string;
  name?: string;
  text?: string;
  tag?: string;
  type?: string;
  id?: string;
  fieldName?: string;
  placeholder?: string;
  href?: string;
  frameId?: string;
}

export interface V3ResolveCandidate {
  eid: string;
  score: number;
  reasons: string[];
  element: V3Element;
}

export interface V3ResolveResult {
  status: 'exact' | 'matched' | 'ambiguous' | 'stale_target' | 'not_found';
  snapshotId: string;
  requested: V3ResolveTarget;
  candidates: V3ResolveCandidate[];
}

export interface V3Actionability {
  actionable: boolean;
  visible: boolean;
  stable: boolean;
  enabled: boolean;
  receivesEvents: boolean;
  editable?: boolean;
  reason?: string;
  center?: { x: number; y: number };
  box?: V3Rect;
}

export interface V3JournalEvent {
  sequence: number;
  tabId: number;
  actionId?: string;
  sessionId?: string;
  method: string;
  category:
    | 'navigation'
    | 'network'
    | 'runtime'
    | 'log'
    | 'target'
    | 'download'
    | 'tab'
    | 'other';
  receivedAt: number;
  summary?: Record<string, unknown>;
}

export interface V3ActionEvidence {
  actionId: string;
  action: string;
  tabId: number;
  startedAt: number;
  completedAt: number;
  elapsedMs: number;
  success: boolean;
  beforeSnapshotId?: string;
  afterSnapshotId?: string;
  targetEid?: string;
  actionability?: V3Actionability;
  events: V3JournalEvent[];
  verification?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface V3RuntimeTabState {
  tabId: number;
  lastSnapshotId?: string;
  lastDocumentId?: string;
  lastUrl?: string;
  lastUpdatedAt: number;
  eventCursor?: number;
  sessionGraphEnabled?: boolean;
  lastAction?: {
    actionId: string;
    action: string;
    success: boolean;
    completedAt: number;
    targetEid?: string;
    afterSnapshotId?: string;
    errorCode?: string;
  };
}
