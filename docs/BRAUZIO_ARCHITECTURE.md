# Brauzio Architecture

هذه الوثيقة هي مرجع هندسي دائم لمشروع **Brauzio** حتى يستطيع أي مطور أو Agent متابعة العمل دون الرجوع إلى تاريخ المحادثات.

## الهدف

تحويل `hangwin/mcp-chrome` من بنية تعتمد على Native Messaging وخادم Node محلي إلى إضافة Chrome عربية تتصل مباشرةً بـ ChatGPT Custom MCP عبر Cloudflare، بدون `cloudflared` وبدون Node.js على جهاز المستخدم النهائي.

## البنية المستهدفة

```text
┌──────────────────────────┐
│ ChatGPT / Remote MCP     │
└────────────┬─────────────┘
             │ HTTPS Streamable MCP
             ▼
┌──────────────────────────┐
│ Cloudflare Worker        │
│ /mcp /ws /health         │
└────────────┬─────────────┘
             │ Durable Object routing
             ▼
┌──────────────────────────┐
│ BrowserSession DO        │
│ one logical device       │
└────────────┬─────────────┘
             │ WebSocket
             ▼
┌──────────────────────────┐
│ Brauzio Chrome Extension │
│ remote-relay.ts          │
└────────────┬─────────────┘
             │ handleCallTool()
             ▼
┌──────────────────────────┐
│ Existing Chrome tools    │
│ Chrome APIs / debugger   │
└──────────────────────────┘
```

## المسارات المهمة

### الإضافة

- `app/chrome-extension/entrypoints/background/remote-relay.ts`
  - إدارة WebSocket.
  - حفظ إعدادات Worker والجهاز والرمز.
  - heartbeat كل 20 ثانية.
  - استقبال `tool_call` وإرجاع `tool_result`.
- `app/chrome-extension/entrypoints/background/tools/index.ts`
  - `handleCallTool()`، وهي طبقة التنفيذ التي يعاد استخدامها من المشروع الأصلي.
- `app/chrome-extension/entrypoints/background/index.ts`
  - نقطة تشغيل خدمات الخلفية ومنها Remote Relay.
- `app/chrome-extension/entrypoints/popup/components/RemoteConnectionCard.vue`
  - واجهة إعداد اتصال Cloudflare للمستخدم.
- `app/chrome-extension/_locales/ar/messages.json`
  - اللغة العربية الأساسية.
- `app/chrome-extension/wxt.config.ts`
  - Manifest الخاص بإصدار Brauzio.

### Cloudflare

- `app/cloudflare-mcp/src/index.ts`
  - نقطة دخول Worker ومسارات `/mcp`, `/ws`, `/health`, `/browser-status`.
- `app/cloudflare-mcp/src/browser-session.ts`
  - Durable Object لكل جهاز/جلسة متصفح.
- `app/cloudflare-mcp/wrangler.jsonc`
  - إعداد Worker وDurable Object migration.

### المخططات المشتركة

- `packages/shared/src/tools.ts`
  - أسماء ومخططات أدوات MCP الأصلية.
- `packages/shared/src/node-specs-builtin.ts`
  - مواصفات عقد محرر سير العمل.

## الفرق عن upstream

### upstream القديم

```text
MCP Client
  -> http://127.0.0.1:12306/mcp
  -> Node native server
  -> Chrome Native Messaging
  -> Extension
```

### Brauzio

```text
ChatGPT
  -> https://worker/mcp
  -> Cloudflare Worker + Durable Object
  -> wss://worker/ws
  -> Extension
```

## ما أزيل من مسار التشغيل

- `nativeMessaging` permission من Manifest.
- التشغيل التلقائي لـ `initNativeHostListener()`.
- واجهة المنفذ 12306 في popup.
- إعداد `127.0.0.1` للمستخدم.
- الحاجة إلى `mcp-chrome-bridge` للمستخدم النهائي.
- الحاجة إلى `cloudflared` بالكامل.

## لماذا ما زال `app/native-server` موجودًا؟

المجلد محفوظ مؤقتًا كمرجع توافق للمزايا التي ربما كانت تعتمد على معالجة Node خاصة، وليس جزءًا من مسار Brauzio السحابي الأساسي. لا يجب إعادة ربطه تلقائيًا بالإصدار السحابي.

قبل حذفه نهائيًا يجب إجراء audit لكل أداة لمعرفة إن كانت تعتمد على وظائف native-only. أي وظيفة لازمة يجب نقلها إلى الإضافة أو Cloudflare بطريقة مناسبة أولًا.

## المصادقة الحالية

نسخة الاستخدام الفردي تستخدم أسرارًا مشتركة:

- `BROWSER_SHARED_SECRET`: بين إضافة Chrome والـ Worker.
- `MCP_SHARED_SECRET`: بين عميل MCP والـ Worker، ويمكن أن يكون منفصلًا.

الإضافة ترسل الرمز داخل رسالة المصادقة الأولى للـ WebSocket. Endpoint MCP يقبل Bearer token، ويوجد دعم `?key=` لتسهيل MVP الفردي.

### قبل الإطلاق العام

يجب استبدال `?key=` بمصادقة OAuth مناسبة وربط كل مستخدم/جهاز بهوية مستقلة. لا تُخزن أسرار Cloudflare داخل المستودع.

## Device routing

كل إضافة تملك `deviceId`. طلب MCP يحدد الجهاز:

```text
/mcp?device=default
```

ويتم توجيه الطلب إلى Durable Object الموافق لذلك الجهاز. هذا يسمح مستقبلًا بإدارة أكثر من متصفح دون تغيير أدوات MCP نفسها.

## دورة tool call

1. ChatGPT يستدعي أداة MCP.
2. Worker يحدد `deviceId`.
3. Worker يرسل الطلب إلى `BrowserSession`.
4. Durable Object يرسل `tool_call` للـ WebSocket الخاص بالإضافة.
5. `remote-relay.ts` يستدعي `handleCallTool({ name, args })`.
6. الأداة تنفذ عبر Chrome APIs.
7. الإضافة ترسل `tool_result` مع `requestId`.
8. Durable Object يحل الطلب المنتظر.
9. MCP يعيد النتيجة إلى ChatGPT.

## سياسة اللغة

- العربية هي اللغة الافتراضية.
- اتجاه الواجهات RTL.
- القيم التقنية مثل URLs وJSON وأسماء الأدوات تبقى LTR حيث يلزم.
- `_locales/zh_CN` و`_locales/zh_TW` غير موجودتين في إصدار Brauzio.
- `scripts/audit_ui_chinese.py` يفحص واجهات التشغيل لمنع عودة نص صيني ظاهر للمستخدم.

## CI

`.github/workflows/brauzio-ci.yml` يتحقق من:

1. تثبيت الاعتماديات مع `--ignore-scripts` لتجنب postinstall الخاص بالـ Native Server القديم.
2. `wxt prepare`.
3. بناء shared schemas.
4. Typecheck لـ Cloud MCP.
5. build لـ Cloud MCP.
6. build لإضافة Chrome.

أي تغيير في relay أو Cloudflare أو الإضافة يجب أن يمر بهذا البناء قبل اعتباره جاهزًا.

## خطة ما قبل الإصدار العام

1. نشر Worker على حساب Cloudflare الفعلي.
2. ضبط أسرار Worker.
3. تثبيت build حديث من الإضافة.
4. التحقق من WebSocket authentication.
5. اختبار `/browser-status`.
6. إضافة MCP إلى ChatGPT.
7. اختبار `get_windows_and_tabs` أولًا.
8. اختبار read/click/type/screenshot/navigation.
9. اختبار الأدوات المتقدمة واحدةً واحدة لتحديد أي native-only gaps.
10. اعتماد OAuth قبل خدمة متعددة المستخدمين.
11. إصدار ZIP/Release مبني تلقائيًا للمستخدم النهائي.

## الأصل والترخيص

Brauzio مشتق من `hangwin/mcp-chrome` ويستمر تحت ترخيص MIT. يجب الاحتفاظ بملف `LICENSE` وإشعار حقوق النشر الأصلي عند النسخ أو التوزيع.
