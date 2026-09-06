// Brauzio shared browser-tool types.

export interface ElementPickerRequest {
  id?: string;
  name: string;
  description?: string;
}

export interface PickedElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PickedElementPoint {
  x: number;
  y: number;
}

export interface PickedElement {
  ref: string;
  selector: string;
  selectorType: 'css';
  rect: PickedElementRect;
  center: PickedElementPoint;
  text?: string;
  tagName?: string;
  frameId: number;
}

export interface ElementPickerResultItem {
  id: string;
  name: string;
  element: PickedElement | null;
  error?: string;
}

export interface ElementPickerResult {
  success: boolean;
  sessionId: string;
  timeoutMs: number;
  cancelled?: boolean;
  timedOut?: boolean;
  missingRequestIds?: string[];
  results: ElementPickerResultItem[];
}
