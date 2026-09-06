import type { PickedElement } from 'brauzio-shared';

export interface ElementPickerControllerOptions {
  hostId?: string;
  zIndex?: number;
  onCancel?: () => void;
  onConfirm?: () => void;
  onSetActiveRequest?: (requestId: string) => void;
  onClearSelection?: (requestId: string) => void;
}

export interface ElementPickerController {
  show: (state: ElementPickerUiState) => void;
  update: (patch: ElementPickerUiPatch) => void;
  hide: () => void;
  isVisible: () => boolean;
  dispose: () => void;
}

export interface ElementPickerUiRequest {
  id: string;
  name: string;
  description?: string;
}

export interface ElementPickerUiState {
  sessionId: string;
  requests: ElementPickerUiRequest[];
  activeRequestId: string | null;
  selections: Record<string, PickedElement | null>;
  deadlineTs: number;
  errorMessage: string | null;
}

export type ElementPickerUiPatch = Partial<Omit<ElementPickerUiState, 'sessionId'>> & { sessionId: string };

const STYLES = `
  :host{all:initial;color-scheme:light;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Tahoma,Arial,sans-serif}
  *{box-sizing:border-box}
  .wrap{position:fixed;inset:0;display:flex;align-items:flex-end;justify-content:flex-end;padding:18px;pointer-events:none}
  .panel{width:min(430px,calc(100vw - 36px));max-height:min(620px,calc(100vh - 36px));overflow:auto;pointer-events:auto;background:#fff;color:#101828;border:1px solid #e4e7ec;border-radius:18px;box-shadow:0 22px 60px rgba(16,24,40,.22);direction:rtl}
  .head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 17px;border-bottom:1px solid #eaecf0}
  .brand strong{display:block;font-size:15px}.brand span{display:block;margin-top:2px;color:#667085;font-size:11px}
  .timer{font:700 12px ui-monospace,SFMono-Regular,Menlo,monospace;color:#6941c6;background:#f4f3ff;border:1px solid #d9d6fe;border-radius:999px;padding:5px 9px;direction:ltr}
  .body{padding:14px}.hint{margin:0 0 12px;color:#667085;font-size:12px;line-height:1.7}.error{margin-bottom:10px;padding:9px 10px;background:#fef3f2;color:#b42318;border:1px solid #fecdca;border-radius:10px;font-size:12px}
  .list{display:grid;gap:9px}.item{padding:11px;border:1px solid #eaecf0;border-radius:12px;background:#fcfcfd}.item.active{border-color:#9b8afb;box-shadow:0 0 0 2px #f4f3ff}.row{display:flex;align-items:center;justify-content:space-between;gap:10px}.title{font-size:13px;font-weight:700}.badge{font-size:10px;padding:3px 7px;border-radius:999px;background:#f2f4f7;color:#475467}.badge.selected{background:#ecfdf3;color:#027a48}.badge.active{background:#f4f3ff;color:#6941c6}.desc{margin-top:5px;color:#667085;font-size:11px;line-height:1.6}.picked{margin-top:8px;padding:8px;border-radius:9px;background:#f9fafb;color:#344054;font-size:11px;word-break:break-word;direction:ltr;text-align:left}.actions{display:flex;gap:7px;margin-top:9px}
  button{appearance:none;border:1px solid #d0d5dd;background:#fff;color:#344054;border-radius:9px;padding:7px 10px;font:600 11px inherit;cursor:pointer}button:hover{background:#f9fafb}button:disabled{opacity:.45;cursor:not-allowed}.primary{background:#5b5bd6;border-color:#5b5bd6;color:#fff}.primary:hover{background:#4a4ac3}.foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 16px;border-top:1px solid #eaecf0}.progress{color:#667085;font-size:11px}.foot-actions{display:flex;gap:8px}
`;

function countdown(deadlineTs: number): string {
  const seconds = Math.max(0, Math.floor((deadlineTs - Date.now()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function truncate(value: string, max = 100): string {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function createElementPickerController(options: ElementPickerControllerOptions = {}): ElementPickerController {
  const hostId = options.hostId ?? '__brauzio_element_picker_host__';
  const zIndex = options.zIndex ?? 2147483647;
  let host: HTMLDivElement | null = null;
  let shadow: ShadowRoot | null = null;
  let root: HTMLDivElement | null = null;
  let state: ElementPickerUiState | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !state) return;
    event.preventDefault();
    event.stopPropagation();
    options.onCancel?.();
  };

  function ensureMounted() {
    if (host && shadow && root) return;
    host = document.createElement('div');
    host.id = hostId;
    host.style.cssText = `position:fixed;inset:0;z-index:${zIndex};pointer-events:none`;
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLES;
    root = document.createElement('div');
    shadow.append(style, root);
    (document.documentElement || document.body).append(host);
    window.addEventListener('keydown', onKey, true);
  }

  function render() {
    if (!root || !state) return;
    root.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'اختيار عناصر Brauzio');

    const head = document.createElement('header');
    head.className = 'head';
    const brand = document.createElement('div');
    brand.className = 'brand';
    brand.innerHTML = '<strong>Brauzio — اختيار العناصر</strong><span>حدد العناصر المطلوبة مباشرة من الصفحة</span>';
    const timerEl = document.createElement('span');
    timerEl.className = 'timer';
    timerEl.dataset.role = 'timer';
    timerEl.textContent = countdown(state.deadlineTs);
    head.append(brand, timerEl);

    const body = document.createElement('div');
    body.className = 'body';
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'اختر كل عنصر طلبه ChatGPT، ثم اضغط تأكيد. يمكنك الضغط على Esc للإلغاء.';
    body.append(hint);
    if (state.errorMessage) {
      const error = document.createElement('div');
      error.className = 'error';
      error.textContent = state.errorMessage;
      body.append(error);
    }

    const list = document.createElement('div');
    list.className = 'list';
    let selectedCount = 0;
    for (const request of state.requests) {
      const picked = state.selections[request.id] || null;
      const active = state.activeRequestId === request.id;
      if (picked) selectedCount++;
      const item = document.createElement('article');
      item.className = `item${active ? ' active' : ''}`;
      const row = document.createElement('div');
      row.className = 'row';
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = request.name;
      const badge = document.createElement('span');
      badge.className = `badge${picked ? ' selected' : active ? ' active' : ''}`;
      badge.textContent = picked ? 'تم الاختيار' : active ? 'اختر الآن' : 'بانتظارك';
      row.append(title, badge);
      item.append(row);
      if (request.description) {
        const desc = document.createElement('div');
        desc.className = 'desc';
        desc.textContent = request.description;
        item.append(desc);
      }
      if (picked) {
        const info = document.createElement('div');
        info.className = 'picked';
        info.textContent = `${picked.tagName || 'element'} • ref=${picked.ref} • ${truncate(picked.text || picked.selector || '')}`;
        item.append(info);
      }
      const actions = document.createElement('div');
      actions.className = 'actions';
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.textContent = active ? 'جارٍ الاختيار…' : 'اختيار';
      pick.disabled = active;
      pick.addEventListener('click', () => options.onSetActiveRequest?.(request.id));
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.textContent = 'مسح';
      clear.disabled = !picked;
      clear.addEventListener('click', () => options.onClearSelection?.(request.id));
      actions.append(pick, clear);
      item.append(actions);
      list.append(item);
    }
    body.append(list);

    const foot = document.createElement('footer');
    foot.className = 'foot';
    const progress = document.createElement('span');
    progress.className = 'progress';
    progress.textContent = `${selectedCount}/${state.requests.length} تم اختيارها`;
    const footActions = document.createElement('div');
    footActions.className = 'foot-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'إلغاء';
    cancel.addEventListener('click', () => options.onCancel?.());
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'primary';
    confirm.textContent = 'تأكيد';
    confirm.disabled = selectedCount !== state.requests.length;
    confirm.addEventListener('click', () => options.onConfirm?.());
    footActions.append(cancel, confirm);
    foot.append(progress, footActions);

    panel.append(head, body, foot);
    wrap.append(panel);
    root.append(wrap);
  }

  function updateTimer() {
    const timerEl = shadow?.querySelector<HTMLElement>('[data-role="timer"]');
    if (timerEl && state) timerEl.textContent = countdown(state.deadlineTs);
  }

  function clearTimer() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  function show(next: ElementPickerUiState) {
    if (disposed) return;
    ensureMounted();
    state = next;
    render();
    clearTimer();
    timer = setInterval(updateTimer, 500);
  }

  function update(patch: ElementPickerUiPatch) {
    if (!state || state.sessionId !== patch.sessionId || disposed) return;
    state = {
      ...state,
      ...patch,
      sessionId: state.sessionId,
      requests: patch.requests ?? state.requests,
      activeRequestId: patch.activeRequestId ?? state.activeRequestId,
      selections: patch.selections ?? state.selections,
      deadlineTs: patch.deadlineTs ?? state.deadlineTs,
      errorMessage: patch.errorMessage ?? state.errorMessage,
    };
    render();
  }

  function hide() {
    clearTimer();
    state = null;
    window.removeEventListener('keydown', onKey, true);
    host?.remove();
    host = null;
    shadow = null;
    root = null;
  }

  function dispose() {
    if (disposed) return;
    hide();
    disposed = true;
  }

  return { show, update, hide, isVisible: () => !!host && !!state, dispose };
}
