# Brauzio Architecture

هذه الوثيقة هي مرجع هندسي دائم لمشروع **Brauzio** حتى يستطيع أي مطور أو Agent متابعة العمل دون الرجوع إلى تاريخ المحادثات.

## الهدف

تحويل `hangwin/mcp-chrome` من بنية تعتمد على Native Messaging وخادم Node محلي إلى إضافة Chrome عربية تتصل مباشرةً بـ ChatGPT Custom MCP عبر Cloudflare، بدون `cloudflared` وبدون Node.js على جهاز المستخدم النهائي.

## الحالة الحالية

تم تنفيذ البنية السحابية ونشرها فعليًا على Cloudflare بتاريخ 2026-09-06.

Worker الحالي:

```text
https://brauzio-mcp.aseelsalah266.workers.dev
```

اسم Worker:

```text
brauzio-mcp
```

المعرف الافتراضي للجهاز:

```text
default
```

## البنية الحالية

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
  -> https://brauzio-mcp.aseelsalah266.workers.dev/mcp
  -> Cloudflare Worker + Durable Object
  -> wss://brauzio-mcp.aseelsalah266.workers.dev/ws
  -> Extension
```

## ما أزيل نهائيًا من مسار Brauzio

- `nativeMessaging` permission من Manifest.
- Native Host المحلي.
- `app/native-server` من Workspace والمشروع الحالي.
- واجهة المنفذ 12306 في popup.
- إعداد `127.0.0.1` للمستخدم.
- الحاجة إلى `mcp-chrome-bridge` للمستخدم النهائي.
- الحاجة إلى `cloudflared` بالكامل.
- نظام Agent المحلي القديم المعتمد على localhost/SSE.

## المصادقة الحالية

نسخة الاستخدام الفردي تستخدم أسرارًا مشتركة:

- `BROWSER_SHARED_SECRET`: بين إضافة Chrome والـ Worker.
- `MCP_SHARED_SECRET`: بين عميل MCP والـ Worker.

الإضافة ترسل `BROWSER_SHARED_SECRET` داخل رسالة المصادقة الأولى للـ WebSocket.
Endpoint MCP يقبل:

```text
Authorization: Bearer <MCP_SHARED_SECRET>
```

كما يدعم مؤقتًا للاستخدام الفردي:

```text
?key=<MCP_SHARED_SECRET>
```

### قبل الإطلاق العام

يجب استبدال `?key=` بمصادقة OAuth وربط كل مستخدم/جهاز بهوية مستقلة. لا تُخزن أسرار Cloudflare أو MCP داخل المستودع أو داخل الإضافة المبنية.

## Device routing

كل إضافة تملك `deviceId`. طلب MCP يحدد الجهاز:

```text
/mcp?device=default
```

ويتم توجيه الطلب إلى Durable Object الموافق لذلك الجهاز.

WebSocket نفسه يربط الجهاز بمسار Durable Object ويتحقق من أن `deviceId` المعلن من الإضافة يطابق الجهاز المتوقع قبل قبول المصادقة.

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

## إعداد الإضافة الحالية

Relay URL:

```text
https://brauzio-mcp.aseelsalah266.workers.dev
```

Device ID:

```text
default
```

Device token:

```text
BROWSER_SHARED_SECRET
```

## إعداد ChatGPT Custom MCP الحالي

في وضع MVP الفردي:

```text
https://brauzio-mcp.aseelsalah266.workers.dev/mcp?device=default&key=<MCP_SHARED_SECRET>
```

الأفضل عند دعم العميل لـ Authorization header استخدام Bearer بدل وضع السر داخل URL.

## سياسة اللغة

- العربية هي اللغة الافتراضية.
- اتجاه الواجهات RTL.
- القيم التقنية مثل URLs وJSON وأسماء الأدوات تبقى LTR حيث يلزم.
- `_locales/zh_CN` و`_locales/zh_TW` غير موجودتين في إصدار Brauzio.
- `scripts/audit_ui_chinese.py` و`chinese-audit.yml` يمنعان عودة نص صيني إلى واجهات Brauzio.

## CI والبناء

`.github/workflows/brauzio-ci.yml` يتحقق من:

1. عدم وجود مراجع Local/Native legacy داخل الإضافة.
2. تثبيت الاعتماديات.
3. `wxt prepare`.
4. بناء shared schemas.
5. Typecheck لـ Cloud MCP.
6. build لـ Cloud MCP.
7. build لإضافة Chrome.
8. إنشاء ZIP.
9. التحقق من manifest والعربية وعدم وجود zh_CN/zh_TW.
10. رفع Artifact قابل للتثبيت.

## النشر التلقائي

`.github/workflows/deploy-cloudflare.yml` ينشر `app/cloudflare-mcp` إلى Cloudflare.

GitHub repository secrets المطلوبة:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
BRAUZIO_BROWSER_SHARED_SECRET
BRAUZIO_MCP_SHARED_SECRET
```

الـ workflow:

1. يتحقق من وجود الأسرار.
2. يبني shared schemas.
3. يعمل Typecheck لـ Cloud MCP.
4. يرفع `BROWSER_SHARED_SECRET` و`MCP_SHARED_SECRET` إلى Cloudflare عبر Wrangler.
5. ينشر Worker وDurable Object migration.

أول نشر فعلي نجح في GitHub Actions run:

```text
34032671942
```

Cloudflare Version ID لذلك النشر:

```text
363ed682-d1f5-46a9-b552-961b01e79440
```

## ما تبقى قبل اعتبار المنتج مختبرًا End-to-End

1. تثبيت أحدث ZIP للإضافة في Chrome.
2. إدخال Worker URL + `default` + `BROWSER_SHARED_SECRET` في popup.
3. التأكد أن حالة الإضافة أصبحت متصلة.
4. اختبار `/browser-status`.
5. إضافة Remote MCP إلى ChatGPT باستخدام `MCP_SHARED_SECRET`.
6. اختبار `get_windows_and_tabs` أولًا.
7. اختبار navigation/read/click/type/screenshot.
8. اختبار الأدوات المتقدمة.
9. اعتماد OAuth قبل إطلاق عام متعدد المستخدمين.

## الأصل والترخيص

Brauzio مشتق من `hangwin/mcp-chrome` ويستمر تحت ترخيص MIT. يجب الاحتفاظ بملف `LICENSE` وإشعار حقوق النشر الأصلي عند النسخ أو التوزيع.
