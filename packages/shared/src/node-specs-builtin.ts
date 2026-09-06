// node-specs-builtin.ts — builtin NodeSpecs shared for UI + runtime
import type { NodeSpec } from './node-spec';
import { registerNodeSpec } from './node-spec-registry';
import { STEP_TYPES } from './step-types';

export function registerBuiltinSpecs() {
  const nav: NodeSpec = {
    type: STEP_TYPES.NAVIGATE,
    version: 1,
    display: { label: 'انتقال', iconClass: 'icon-navigate', category: 'Actions' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      {
        key: 'url',
        label: 'URL',
        type: 'string',
        required: true,
        placeholder: 'https://example.com',
        help: 'العنوان الهدف، يدعم قالب المتغير {var}',
        default: '',
      },
    ],
    defaults: { url: '' },
    validate: (cfg) => {
      const errs: string[] = [];
      if (!cfg || !cfg.url || String(cfg.url).trim() === '') errs.push('URL مطلوب');
      return errs;
    },
  };
  registerNodeSpec(nav);

  // Click / Dblclick
  registerNodeSpec({
    type: STEP_TYPES.CLICK,
    version: 1,
    display: { label: 'نقر', iconClass: 'icon-click', category: 'Actions' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      {
        key: 'target',
        label: 'الهدف',
        type: 'json',
        widget: 'targetlocator',
        help: 'اختر أو أدخل محدد العنصر',
      },
      {
        key: 'before',
        label: 'قبل التنفيذ',
        type: 'object',
        fields: [
          { key: 'scrollIntoView', label: 'التمرير حتى الظهور', type: 'boolean', default: true },
          { key: 'waitForSelector', label: 'انتظار المحدد', type: 'boolean', default: true },
        ],
      },
      {
        key: 'after',
        label: 'بعد التنفيذ',
        type: 'object',
        fields: [
          { key: 'waitForNavigation', label: 'انتظار اكتمال الانتقال', type: 'boolean', default: false },
          { key: 'waitForNetworkIdle', label: 'انتظار خمول الشبكة', type: 'boolean', default: false },
        ],
      },
    ],
    defaults: { before: { scrollIntoView: true, waitForSelector: true }, after: {} },
  });
  registerNodeSpec({
    type: STEP_TYPES.DBLCLICK,
    version: 1,
    display: { label: 'نقر مزدوج', iconClass: 'icon-click', category: 'Actions' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      { key: 'target', label: 'الهدف', type: 'json', widget: 'targetlocator' },
      {
        key: 'before',
        label: 'قبل التنفيذ',
        type: 'object',
        fields: [
          { key: 'scrollIntoView', label: 'التمرير حتى الظهور', type: 'boolean', default: true },
          { key: 'waitForSelector', label: 'انتظار المحدد', type: 'boolean', default: true },
        ],
      },
      {
        key: 'after',
        label: 'بعد التنفيذ',
        type: 'object',
        fields: [
          { key: 'waitForNavigation', label: 'انتظار اكتمال الانتقال', type: 'boolean', default: false },
          { key: 'waitForNetworkIdle', label: 'انتظار خمول الشبكة', type: 'boolean', default: false },
        ],
      },
    ],
    defaults: { before: { scrollIntoView: true, waitForSelector: true }, after: {} },
  });

  // Fill
  registerNodeSpec({
    type: STEP_TYPES.FILL,
    version: 1,
    display: { label: 'تعبئة', iconClass: 'icon-fill', category: 'Actions' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      { key: 'target', label: 'الهدف', type: 'json', widget: 'targetlocator' },
      { key: 'value', label: 'قيمة الإدخال', type: 'string', required: true, help: 'يدعم قالب {var}' },
    ],
    defaults: { value: '' },
  });

  // Key
  registerNodeSpec({
    type: STEP_TYPES.KEY,
    version: 1,
    display: { label: 'لوحة المفاتيح', iconClass: 'icon-key', category: 'Actions' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      {
        key: 'keys',
        label: 'تسلسل المفاتيح',
        type: 'string',
        widget: 'keysequence',
        required: true,
        help: 'مثل Backspace Enter أو cmd+a',
      },
      { key: 'target', label: 'هدف التركيز (اختياري)', type: 'json', widget: 'targetlocator' },
    ],
    defaults: { keys: '' },
  });

  // Scroll
  registerNodeSpec({
    type: STEP_TYPES.SCROLL,
    version: 1,
    display: { label: 'تمرير', iconClass: 'icon-scroll', category: 'Actions' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      {
        key: 'mode',
        label: 'الوضع',
        type: 'select',
        options: [
          { label: 'عنصر', value: 'element' },
          { label: 'إزاحة', value: 'offset' },
          { label: 'حاوية', value: 'container' },
        ] as any,
        default: 'offset',
      },
      { key: 'target', label: 'الهدف (للعنصر/الحاوية)', type: 'json', widget: 'targetlocator' },
      {
        key: 'offset',
        label: 'إزاحة',
        type: 'object',
        fields: [
          { key: 'x', label: 'X', type: 'number' },
          { key: 'y', label: 'Y', type: 'number' },
        ],
      },
    ],
    defaults: { mode: 'offset', offset: { x: 0, y: 300 } },
  });

  // Drag
  registerNodeSpec({
    type: STEP_TYPES.DRAG,
    version: 1,
    display: { label: 'سحب', iconClass: 'icon-drag', category: 'Actions' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      { key: 'start', label: 'البداية', type: 'json', widget: 'targetlocator' },
      { key: 'end', label: 'النهاية', type: 'json', widget: 'targetlocator' },
      {
        key: 'path',
        label: 'إحداثيات المسار',
        type: 'array',
        item: {
          key: 'p',
          label: 'نقطة',
          type: 'object',
          fields: [
            { key: 'x', label: 'X', type: 'number' },
            { key: 'y', label: 'Y', type: 'number' },
          ],
        } as any,
      },
    ],
    defaults: {},
  });

  // Wait
  registerNodeSpec({
    type: STEP_TYPES.WAIT,
    version: 1,
    display: { label: 'انتظار', iconClass: 'icon-wait', category: 'Actions' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      {
        key: 'condition',
        label: 'الشرط (JSON)',
        type: 'json',
        help: 'مثل {"sleep":1000} أو {"text":"Hello","appear":true}',
      },
    ],
    defaults: { condition: { sleep: 500 } },
  });

  // Assert
  registerNodeSpec({
    type: STEP_TYPES.ASSERT,
    version: 1,
    display: { label: 'تحقق', iconClass: 'icon-assert', category: 'Actions' },
    ports: { inputs: 1, outputs: [{ label: 'default' }, { label: 'onError' }] },
    schema: [
      {
        key: 'assert',
        label: 'تحقق(JSON)',
        type: 'json',
        help: 'مثل {"exists":"#id"} / {"visible":".btn"}',
      },
      {
        key: 'failStrategy',
        label: 'استراتيجية الفشل',
        type: 'select',
        options: [
          { label: 'إيقاف', value: 'stop' },
          { label: '警告', value: 'warn' },
          { label: 'إعادة المحاولة', value: 'retry' },
        ] as any,
        default: 'stop',
      },
    ],
    defaults: { assert: {} },
  });

  // HTTP
  registerNodeSpec({
    type: STEP_TYPES.HTTP,
    version: 1,
    display: { label: 'HTTP', iconClass: 'icon-http', category: 'Tools' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      {
        key: 'method',
        label: 'الطريقة',
        type: 'select',
        options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({
          label: m,
          value: m,
        })) as any,
        default: 'GET',
      },
      { key: 'url', label: 'URL', type: 'string', required: true },
      { key: 'headers', label: 'طلب头(JSON)', type: 'json' },
      { key: 'body', label: 'طلب体(JSON)', type: 'json' },
      { key: 'formData', label: '表单(JSON)', type: 'json' },
      { key: 'saveAs', label: 'حفظ为变量', type: 'string' },
      { key: 'assign', label: '映射(JSON)', type: 'json' },
    ],
    defaults: { method: 'GET' },
  });

  // Extract
  registerNodeSpec({
    type: STEP_TYPES.EXTRACT,
    version: 1,
    display: { label: 'استخراج', iconClass: 'icon-extract', category: 'Tools' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      { key: 'selector', label: 'المحدد', type: 'string', widget: 'selector' },
      {
        key: 'attr',
        label: 'خاصية',
        type: 'select',
        options: [
          { label: '文本(text)', value: 'text' },
          { label: '文本(textContent)', value: 'textContent' },
          { label: '自定义اسم الخاصية', value: 'attr' },
        ] as any,
      },
      { key: 'js', label: '自定义JS', type: 'string', help: '在页面中执行并رجوع值' },
      { key: 'saveAs', label: 'حفظ变量', type: 'string', required: true },
    ],
    defaults: { saveAs: '' },
  });

  // Screenshot
  registerNodeSpec({
    type: STEP_TYPES.SCREENSHOT,
    version: 1,
    display: { label: 'لقطة شاشة', iconClass: 'icon-screenshot', category: 'Tools' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      { key: 'selector', label: 'الهدفالمحدد', type: 'string' },
      { key: 'fullPage', label: '整页لقطة شاشة', type: 'boolean', default: false },
      { key: 'saveAs', label: 'حفظ变量', type: 'string' },
    ],
    defaults: { fullPage: false },
  });

  // TriggerEvent
  registerNodeSpec({
    type: STEP_TYPES.TRIGGER_EVENT,
    version: 1,
    display: { label: '触发حدث', iconClass: 'icon-trigger', category: 'Tools' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      { key: 'target', label: 'الهدف', type: 'json', widget: 'targetlocator' },
      { key: 'event', label: 'نوع الحدث', type: 'string', required: true },
      { key: 'bubbles', label: 'Bubbling', type: 'boolean', default: true },
      { key: 'cancelable', label: 'قابل للإلغاء', type: 'boolean', default: false },
    ],
    defaults: { event: '' },
  });

  // SetAttribute
  registerNodeSpec({
    type: STEP_TYPES.SET_ATTRIBUTE,
    version: 1,
    display: { label: '设置خاصية', iconClass: 'icon-attr', category: 'Tools' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      { key: 'target', label: 'الهدف', type: 'json', widget: 'targetlocator' },
      { key: 'name', label: 'اسم الخاصية', type: 'string', required: true },
      { key: 'value', label: 'قيمة الخاصية', type: 'string' },
      { key: 'remove', label: '移除خاصية', type: 'boolean', default: false },
    ],
    defaults: { remove: false },
  });

  // LoopElements
  registerNodeSpec({
    type: STEP_TYPES.LOOP_ELEMENTS,
    version: 1,
    display: { label: 'تكرارعنصر', iconClass: 'icon-loop', category: 'Tools' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      { key: 'selector', label: 'المحدد', type: 'string', required: true },
      { key: 'saveAs', label: 'اسم متغير القائمة', type: 'string', default: 'elements' },
      { key: 'itemVar', label: '项اسم المتغير', type: 'string', default: 'item' },
      { key: 'subflowId', label: 'سير عمل فرعي程ID', type: 'string', required: true },
    ],
    defaults: { saveAs: 'elements', itemVar: 'item' },
  });

  // SwitchFrame
  registerNodeSpec({
    type: STEP_TYPES.SWITCH_FRAME,
    version: 1,
    display: { label: '切换Frame', iconClass: 'icon-frame', category: 'Tools' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      {
        key: 'frame',
        label: 'frame定位',
        type: 'object',
        fields: [
          { key: 'index', label: '索引', type: 'number' },
          { key: 'urlContains', label: 'URLيحتوي', type: 'string' },
        ],
      },
    ],
    defaults: {},
  });

  // HandleDownload
  registerNodeSpec({
    type: STEP_TYPES.HANDLE_DOWNLOAD,
    version: 1,
    display: { label: '下载处理', iconClass: 'icon-download', category: 'Tools' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      { key: 'filenameContains', label: '文件名يحتوي', type: 'string' },
      { key: 'waitForComplete', label: 'انتظار完成', type: 'boolean', default: true },
      { key: 'timeoutMs', label: '超时(ms)', type: 'number', default: 60000 },
      { key: 'saveAs', label: 'حفظ变量', type: 'string' },
    ],
    defaults: { waitForComplete: true, timeoutMs: 60000 },
  });

  // Script
  registerNodeSpec({
    type: STEP_TYPES.SCRIPT,
    version: 1,
    display: { label: 'سكربت', iconClass: 'icon-script', category: 'Tools' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      {
        key: 'world',
        label: '执行上下文',
        type: 'select',
        options: [
          { label: 'ISOLATED', value: 'ISOLATED' },
          { label: 'MAIN', value: 'MAIN' },
        ] as any,
        default: 'ISOLATED',
      },
      { key: 'code', label: 'سكربت代码', type: 'string', widget: 'code', required: true },
      {
        key: 'when',
        label: 'توقيت التنفيذ',
        type: 'select',
        options: [
          { label: 'before', value: 'before' },
          { label: 'after', value: 'after' },
        ] as any,
        default: 'after',
      },
      { key: 'assign', label: '映射(JSON)', type: 'json' },
      { key: 'saveAs', label: 'حفظ变量', type: 'string' },
    ],
    defaults: { world: 'ISOLATED', when: 'after' },
  });

  // Tabs
  registerNodeSpec({
    type: STEP_TYPES.OPEN_TAB,
    version: 1,
    display: { label: 'فتح علامة تبويب', iconClass: 'icon-openTab', category: 'Tabs' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      { key: 'url', label: 'URL', type: 'string' },
      { key: 'newWindow', label: 'نافذة جديدة', type: 'boolean', default: false },
    ],
    defaults: { newWindow: false },
  });
  registerNodeSpec({
    type: 'executeFlow' as any,
    version: 1,
    display: { label: '执行سير عمل فرعي程', iconClass: 'icon-exec', category: 'Flow' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      { key: 'flowId', label: '流程ID', type: 'string', required: true },
      { key: 'inline', label: '内联执行', type: 'boolean', default: false },
      { key: 'args', label: 'المعاملات (JSON)', type: 'json' },
    ],
    defaults: { inline: false },
  });
  registerNodeSpec({
    type: STEP_TYPES.SWITCH_TAB,
    version: 1,
    display: { label: 'تبديل علامة التبويب', iconClass: 'icon-switchTab', category: 'Tabs' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      { key: 'tabId', label: 'TabId', type: 'number' },
      { key: 'urlContains', label: 'URLيحتوي', type: 'string' },
      { key: 'titleContains', label: 'العنوانيحتوي', type: 'string' },
    ],
    defaults: {},
  });
  registerNodeSpec({
    type: STEP_TYPES.CLOSE_TAB,
    version: 1,
    display: { label: 'إغلاق علامة التبويب', iconClass: 'icon-closeTab', category: 'Tabs' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      {
        key: 'tabIds',
        label: 'TabIds',
        type: 'array',
        item: { key: 'id', label: 'id', type: 'number' } as any,
      },
      { key: 'url', label: 'URL', type: 'string' },
    ],
    defaults: {},
  });

  // Logic
  registerNodeSpec({
    type: STEP_TYPES.IF,
    version: 1,
    display: { label: 'الشرط', iconClass: 'icon-if', category: 'Logic' },
    ports: { inputs: 1, outputs: 'any' },
    schema: [
      {
        key: 'condition',
        label: 'الشرط表达式(JSON)',
        type: 'json',
        help: 'مثل {"expression":"vars.a>0"} وغيرها',
      },
      {
        key: 'branches',
        label: 'فرع',
        type: 'array',
        item: {
          key: 'b',
          label: 'case',
          type: 'object',
          fields: [
            { key: 'id', label: 'ID', type: 'string' },
            { key: 'name', label: 'الاسم', type: 'string' },
            { key: 'expr', label: '表达式', type: 'string' },
          ],
        } as any,
      },
      { key: 'else', label: 'تفعيل else', type: 'boolean', default: true },
    ],
    defaults: { else: true },
  });
  registerNodeSpec({
    type: STEP_TYPES.FOREACH,
    version: 1,
    display: { label: 'تكرار', iconClass: 'icon-foreach', category: 'Logic' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      { key: 'listVar', label: '列表变量', type: 'string', required: true },
      { key: 'itemVar', label: '项变量', type: 'string', default: 'item' },
      { key: 'subflowId', label: 'سير عمل فرعي程ID', type: 'string', required: true },
      {
        key: 'concurrency',
        label: '并发数',
        type: 'number',
        default: 1,
        help: '并发执行سير عمل فرعي程（浅拷贝变量，不自动合并）',
      },
    ],
    defaults: { itemVar: 'item' },
  });
  registerNodeSpec({
    type: STEP_TYPES.WHILE,
    version: 1,
    display: { label: 'تكرار', iconClass: 'icon-while', category: 'Logic' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      { key: 'condition', label: 'الشرط (JSON)', type: 'json' },
      { key: 'subflowId', label: 'سير عمل فرعي程ID', type: 'string', required: true },
      { key: 'maxIterations', label: 'الحد الأقصى للمرات', type: 'number', default: 100 },
    ],
    defaults: { maxIterations: 100 },
  });

  // Delay (UI-only helper)
  registerNodeSpec({
    type: STEP_TYPES.DELAY,
    version: 1,
    display: { label: 'تأخير', iconClass: 'icon-delay', category: 'Actions' },
    ports: { inputs: 1, outputs: [{ label: 'default' }] },
    schema: [
      {
        key: 'sleep',
        label: 'تأخير',
        type: 'number',
        widget: 'duration',
        required: true,
        default: 1000,
      },
    ],
    defaults: { sleep: 1000 },
  });

  // Trigger (builder-only, flow-level node)
  registerNodeSpec({
    type: STEP_TYPES.TRIGGER,
    version: 1,
    display: { label: 'المشغل', iconClass: 'icon-trigger', category: 'Flow' },
    ports: { inputs: 0, outputs: [{ label: 'default' }] },
    schema: [
      { key: 'enabled', label: 'تفعيل', type: 'boolean', default: true },
      { key: 'description', label: 'الوصف', type: 'string' },
      {
        key: 'modes',
        label: 'الوضع',
        type: 'object',
        fields: [
          { key: 'manual', label: 'يدوي', type: 'boolean', default: true },
          { key: 'url', label: 'URL 触发', type: 'boolean', default: false },
          { key: 'contextMenu', label: 'القائمة السياقية', type: 'boolean', default: false },
          { key: 'command', label: 'اختصار لوحة المفاتيح', type: 'boolean', default: false },
          { key: 'dom', label: 'DOM حدث', type: 'boolean', default: false },
          { key: 'schedule', label: 'جدولة', type: 'boolean', default: false },
        ],
      },
      {
        key: 'url',
        label: 'URL 规则',
        type: 'object',
        fields: [
          {
            key: 'rules',
            label: '规则列表',
            type: 'array',
            item: {
              key: 'rule',
              label: '规则',
              type: 'object',
              fields: [
                {
                  key: 'kind',
                  label: 'النوع',
                  type: 'select',
                  options: [
                    { label: 'URL', value: 'url' },
                    { label: 'النطاق', value: 'domain' },
                    { label: '路径', value: 'path' },
                  ] as any,
                  default: 'url',
                },
                { key: 'value', label: '值', type: 'string' },
              ],
            } as any,
          },
        ],
      },
      {
        key: 'contextMenu',
        label: 'القائمة السياقية',
        type: 'object',
        fields: [
          { key: 'title', label: 'العنوان', type: 'string', default: 'تشغيل سير العمل' },
          { key: 'enabled', label: 'تفعيل', type: 'boolean', default: false },
        ],
      },
      {
        key: 'command',
        label: 'اختصار لوحة المفاتيح',
        type: 'object',
        fields: [
          { key: 'commandKey', label: 'اختصار لوحة المفاتيح', type: 'string' },
          { key: 'enabled', label: 'تفعيل', type: 'boolean', default: false },
        ],
      },
      {
        key: 'dom',
        label: 'DOM حدث',
        type: 'object',
        fields: [
          { key: 'selector', label: 'المحدد', type: 'string' },
          { key: 'appear', label: '出现', type: 'boolean', default: true },
          { key: 'once', label: '一次', type: 'boolean', default: true },
          { key: 'debounceMs', label: '防抖(ms)', type: 'number', default: 800 },
          { key: 'enabled', label: 'تفعيل', type: 'boolean', default: false },
        ],
      },
      {
        key: 'schedules',
        label: 'جدولة',
        type: 'array',
        item: {
          key: 'sched',
          label: '计划',
          type: 'object',
          fields: [
            { key: 'id', label: 'ID', type: 'string' },
            {
              key: 'type',
              label: 'النوع',
              type: 'select',
              options: [
                { label: '一次', value: 'once' },
                { label: '间隔', value: 'interval' },
                { label: '每日', value: 'daily' },
              ] as any,
            },
            { key: 'when', label: '时间(ISO/cron)', type: 'string' },
            { key: 'enabled', label: 'تفعيل', type: 'boolean', default: true },
          ],
        } as any,
      },
    ],
    defaults: { enabled: true },
  });
}
