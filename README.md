# Brauzio

**Brauzio** إضافة Chrome مفتوحة المصدر تربط متصفحك مباشرةً مع عملاء **Model Context Protocol (MCP)** مثل ChatGPT، مع الحفاظ على جلسة Chrome الحالية والتبويبات وتسجيلات الدخول الموجودة في المتصفح.

Brauzio مبني على المشروع الأصلي [`hangwin/mcp-chrome`](https://github.com/hangwin/mcp-chrome) ويحتفظ بترخيص MIT وإشعار الحقوق الأصلي، مع إعادة تصميم مسار الاتصال ليعمل عبر **Cloudflare Remote MCP** بدل الاعتماد على `localhost` وNative Messaging في الاستخدام اليومي.

## ما الذي تغيّر في Brauzio؟

- واجهة عربية افتراضيًا مع دعم RTL.
- إزالة اللغتين الصينية المبسطة والتقليدية من الإضافة.
- إزالة `nativeMessaging` من Manifest الخاص بإصدار Brauzio السحابي.
- لا يوجد منفذ محلي `12306` ولا حاجة إلى `cloudflared`.
- لا يحتاج المستخدم النهائي إلى تثبيت Node.js أو `mcp-chrome-bridge` لتشغيل الاتصال السحابي.
- اتصال الإضافة بالخادم عبر WebSocket آمن.
- اتصال ChatGPT بالخادم عبر Remote MCP على HTTPS.
- استخدام Durable Objects في Cloudflare للحفاظ على جلسة كل متصفح وربط طلبات MCP بالإضافة الصحيحة.
- أدوات المتصفح الأصلية ما زالت تُنفّذ داخل الإضافة باستخدام نفس طبقة `handleCallTool()`.

## البنية

```text
ChatGPT / MCP Client
        │
        │ HTTPS Streamable MCP
        ▼
Cloudflare Worker
        │
        ▼
Durable Object (BrowserSession)
        │
        │ WebSocket
        ▼
Brauzio Chrome Extension
        │
        ▼
Chrome APIs + أدوات المتصفح
```

المسارات الأساسية في Worker:

```text
/mcp             Remote MCP endpoint
/ws              WebSocket endpoint for the Chrome extension
/health          Health check
/browser-status  Browser session status
```

## المتطلبات للمستخدم النهائي

- Google Chrome أو Chromium بإصدار **116 أو أحدث**.
- إضافة Brauzio المبنية مسبقًا.
- رابط Cloudflare Worker الخاص بك.
- رمز اتصال سري بين الإضافة وCloudflare.

**لا تحتاج إلى:** Node.js أو pnpm أو npm أو cloudflared أو تشغيل خادم محلي على جهازك.

## إعداد Cloudflare بدون تنزيل cloudflared

أفضل مسار للمستخدم الذي لا يريد تثبيت أدوات محلية هو ربط هذا المستودع مباشرةً مع Cloudflare Workers من لوحة Cloudflare، وجعل Cloudflare يبني وينشر مجلد:

```text
app/cloudflare-mcp
```

اسم Worker الافتراضي في الإعداد الحالي:

```text
brauzio-mcp
```

يحتاج Worker إلى أسرار، ولا يجب وضعها داخل GitHub أو داخل الكود:

```text
BROWSER_SHARED_SECRET   رمز اتصال الإضافة بالـ Worker
MCP_SHARED_SECRET       رمز وصول MCP (اختياري؛ إن لم يوضع يمكن استخدام BROWSER_SHARED_SECRET)
```

كما يوجد متغير غير سري افتراضي:

```text
DEFAULT_DEVICE_ID=default
```

يمكن ضبط الأسرار من إعدادات Worker في لوحة Cloudflare بعد إنشاء المشروع.

## ربط إضافة Brauzio بـ Cloudflare

بعد نشر Worker:

1. افتح نافذة Brauzio في Chrome.
2. في قسم **اتصال Brauzio Cloud** أدخل رابط Worker، مثل:

```text
https://brauzio-mcp.<account>.workers.dev
```

3. ضع **معرّف الجهاز**، ويمكن تركه `default` لجهاز واحد.
4. ضع **رمز الاتصال** المطابق لـ `BROWSER_SHARED_SECRET`.
5. فعّل إعادة الاتصال التلقائي واحفظ الإعدادات.
6. عند نجاح الاتصال ستظهر الحالة **متصل**.

## ربط ChatGPT Custom MCP

لنفس الجهاز، يكون رابط MCP بالشكل التالي في الإصدار الفردي الحالي:

```text
https://brauzio-mcp.<account>.workers.dev/mcp?device=default&key=<MCP_SECRET>
```

حيث:

- `device` هو معرّف الجهاز المسجل في الإضافة.
- `key` هو `MCP_SHARED_SECRET`، أو `BROWSER_SHARED_SECRET` إذا لم يتم تعريف سر MCP منفصل.

> **تنبيه أمني:** معامل `key` في الرابط مناسب لنسخة الاستخدام الفردي/MVP فقط. اعتبر رابط MCP كاملًا سرًا ولا تنشره أو تضعه داخل الكود. قبل تحويل Brauzio إلى خدمة عامة متعددة المستخدمين يجب استبدال هذا الأسلوب بمصادقة OAuth مناسبة.

## الأدوات

Brauzio يعيد استخدام مجموعة أدوات `mcp-chrome` الأصلية، ومنها أدوات مثل:

- قراءة الصفحة والعناصر القابلة للتفاعل.
- النقر والكتابة والتمرير ولوحة المفاتيح.
- فتح التبويبات وإغلاقها والتنقل بينها.
- لقطات الشاشة.
- قراءة المحتوى.
- السجل والإشارات المرجعية.
- التقاط الشبكة وأدوات المطور.
- تنفيذ JavaScript.
- Record & Replay وسير العمل حيث تكون الوظيفة مدعومة داخل الإضافة.

بعض الوظائف القديمة التي كانت تعتمد مباشرةً على Native Host قد تحتاج إعادة تنفيذ سحابية مستقلة قبل حذف مصدر `app/native-server` نهائيًا، لذلك بقي المصدر في المستودع مؤقتًا كمرجع توافق وليس كمتطلب تشغيل للمستخدم النهائي.

## التطوير والبناء

هذه الخطوات للمطورين فقط، وليست مطلوبة لمستخدم Brauzio النهائي.

المشروع Monorepo ويستخدم pnpm أثناء التطوير والبناء. البناء يتم التحقق منه آليًا عبر GitHub Actions.

```bash
pnpm install --ignore-scripts
pnpm --filter chrome-mcp-server exec wxt prepare
pnpm --filter chrome-mcp-shared build
pnpm --filter brauzio-cloud-mcp check
pnpm --filter brauzio-cloud-mcp build
pnpm --filter chrome-mcp-server build
```

استخدام `--ignore-scripts` مقصود حتى لا يتم تشغيل `postinstall` الخاص بالـ Native Server القديم أثناء بناء إصدار Brauzio السحابي.

## هيكل المشروع

```text
app/
├── chrome-extension/   إضافة Brauzio
├── cloudflare-mcp/     Remote MCP + WebSocket relay على Cloudflare
└── native-server/      كود upstream قديم محفوظ مؤقتًا للتوافق والمرجعية

packages/
└── shared/             مخططات وأسماء أدوات MCP المشتركة

docs/
└── BRAUZIO_ARCHITECTURE.md
```

## الحالة الحالية

- [x] استيراد المشروع الأصلي.
- [x] إعادة الهوية إلى Brauzio.
- [x] العربية وRTL افتراضيًا.
- [x] إزالة zh_CN وzh_TW من الإضافة.
- [x] إزالة Native Messaging من Manifest السحابي.
- [x] WebSocket relay داخل الإضافة.
- [x] Cloudflare Worker + Durable Object.
- [x] Remote MCP `/mcp`.
- [x] شاشة إعداد Brauzio Cloud.
- [x] CI لبناء الإضافة وCloud MCP.
- [ ] نشر Worker على حساب Cloudflare الفعلي.
- [ ] اختبار end-to-end مع ChatGPT على Worker المنشور.
- [ ] استبدال مصادقة MVP بـ OAuth قبل أي إطلاق عام متعدد المستخدمين.

## الأصل والترخيص

Brauzio مشتق من:

- **mcp-chrome** بواسطة hangwin/hangye: https://github.com/hangwin/mcp-chrome

المشروع الأصلي وBrauzio يخضعان لترخيص **MIT**. راجع ملف [`LICENSE`](LICENSE). يجب الحفاظ على إشعار حقوق النشر والترخيص الأصلي عند التوزيع.
