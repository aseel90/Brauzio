# Brauzio

**Brauzio** إضافة Chrome مفتوحة المصدر تربط متصفحك مباشرةً مع عملاء **Model Context Protocol (MCP)** مثل ChatGPT، مع الحفاظ على جلسة Chrome الحالية والتبويبات وتسجيلات الدخول الموجودة في المتصفح.

Brauzio مبني على المشروع الأصلي [`hangwin/mcp-chrome`](https://github.com/hangwin/mcp-chrome) ويحتفظ بترخيص MIT وإشعار الحقوق الأصلي، مع إعادة تصميم مسار الاتصال ليعمل عبر **Cloudflare Remote MCP** بدل `localhost` وNative Messaging.

## ما الذي تغيّر في Brauzio؟

- واجهة عربية افتراضيًا مع دعم RTL.
- إزالة اللغتين الصينية المبسطة والتقليدية من الإضافة.
- إزالة `nativeMessaging` ومسار الـ Native Host المحلي.
- لا يوجد منفذ محلي `12306` ولا حاجة إلى `cloudflared`.
- لا يحتاج المستخدم النهائي إلى Node.js أو `mcp-chrome-bridge`.
- اتصال الإضافة بالخادم عبر WebSocket آمن.
- اتصال ChatGPT بالخادم عبر Remote MCP على HTTPS.
- استخدام Durable Objects في Cloudflare للحفاظ على جلسة كل متصفح وربط طلبات MCP بالإضافة الصحيحة.
- أدوات المتصفح الأصلية تُنفّذ داخل الإضافة باستخدام طبقة `handleCallTool()`.

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

## النشر الحالي

تم نشر Worker الفعلي على Cloudflare بنجاح بتاريخ 2026-09-06:

```text
https://brauzio-mcp.aseelsalah266.workers.dev
```

الإصدار المنشور يستخدم Durable Object باسم `BrowserSession` ومتغير الجهاز الافتراضي:

```text
DEFAULT_DEVICE_ID=default
```

أسرار التشغيل محفوظة داخل Cloudflare/GitHub Actions ولا يجب وضعها داخل الكود:

```text
BROWSER_SHARED_SECRET
MCP_SHARED_SECRET
```

النشر يتم تلقائيًا من GitHub عبر:

```text
.github/workflows/deploy-cloudflare.yml
```

ويعمل عند تغييرات كود Cloudflare أو الـ shared schemas، ويمكن تشغيله يدويًا أيضًا.

## المتطلبات للمستخدم النهائي

- Google Chrome أو Chromium بإصدار **116 أو أحدث**.
- إضافة Brauzio المبنية مسبقًا.
- رابط Cloudflare Worker.
- رمز اتصال سري بين الإضافة وCloudflare.

**لا تحتاج إلى:** Node.js أو pnpm أو npm أو cloudflared أو خادم محلي.

## ربط إضافة Brauzio بـ Cloudflare

1. افتح نافذة Brauzio في Chrome.
2. في قسم **اتصال Brauzio Cloud** أدخل:

```text
https://brauzio-mcp.aseelsalah266.workers.dev
```

3. ضع **معرّف الجهاز**:

```text
default
```

4. ضع **رمز الاتصال** المطابق لقيمة `BROWSER_SHARED_SECRET` المحفوظة في GitHub/Cloudflare.
5. فعّل إعادة الاتصال التلقائي واحفظ الإعدادات.
6. عند نجاح الاتصال ستظهر الحالة **متصل**.

## ربط ChatGPT Custom MCP

لنفس الجهاز، يكون رابط MCP في نسخة الاستخدام الفردي الحالية:

```text
https://brauzio-mcp.aseelsalah266.workers.dev/mcp?device=default&key=<MCP_SHARED_SECRET>
```

حيث:

- `device` هو معرّف الجهاز المسجل في الإضافة.
- `key` هو قيمة `MCP_SHARED_SECRET`.

يمكن أيضًا استخدام `Authorization: Bearer <MCP_SHARED_SECRET>` مع عميل يدعم ترويسة Authorization.

> **تنبيه أمني:** معامل `key` في الرابط مناسب للاستخدام الفردي/MVP فقط. اعتبر رابط MCP كاملًا سرًا ولا تنشره. قبل إطلاق Brauzio كخدمة عامة متعددة المستخدمين يجب استبدال هذا الأسلوب بمصادقة OAuth وهوية مستقلة لكل مستخدم/جهاز.

## الأدوات

Brauzio يعيد استخدام مجموعة أدوات `mcp-chrome` الأصلية، ومنها:

- قراءة الصفحة والعناصر القابلة للتفاعل.
- النقر والكتابة والتمرير ولوحة المفاتيح.
- فتح التبويبات وإغلاقها والتنقل بينها.
- لقطات الشاشة.
- قراءة المحتوى.
- السجل والإشارات المرجعية.
- التقاط الشبكة وأدوات المطور.
- تنفيذ JavaScript.
- Record & Replay وسير العمل حيث تكون الوظيفة مدعومة داخل الإضافة.

تم حذف مسار Native Server المحلي القديم من Brauzio، وأصبح مسار MCP الأساسي Cloud-only.

## التطوير والبناء

هذه الخطوات للمطورين فقط، وليست مطلوبة لمستخدم Brauzio النهائي.

```bash
pnpm install --ignore-scripts
pnpm --filter chrome-mcp-server exec wxt prepare
pnpm --filter chrome-mcp-shared build
pnpm --filter brauzio-cloud-mcp check
pnpm --filter brauzio-cloud-mcp build
pnpm --filter chrome-mcp-server build
```

## هيكل المشروع

```text
app/
├── chrome-extension/   إضافة Brauzio
└── cloudflare-mcp/     Remote MCP + WebSocket relay على Cloudflare

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
- [x] إزالة Native Messaging والـ Native Host المحلي.
- [x] WebSocket relay داخل الإضافة.
- [x] Cloudflare Worker + Durable Object.
- [x] Remote MCP `/mcp`.
- [x] شاشة إعداد Brauzio Cloud.
- [x] CI لبناء الإضافة وCloud MCP.
- [x] نشر Worker على حساب Cloudflare الفعلي.
- [x] إعداد نشر تلقائي عبر GitHub Actions.
- [ ] اختبار end-to-end من ChatGPT إلى Chrome الفعلي.
- [ ] استبدال مصادقة MVP بـ OAuth قبل أي إطلاق عام متعدد المستخدمين.

## الأصل والترخيص

Brauzio مشتق من:

- **mcp-chrome** بواسطة hangwin/hangye: https://github.com/hangwin/mcp-chrome

المشروع الأصلي وBrauzio يخضعان لترخيص **MIT**. راجع ملف [`LICENSE`](LICENSE). يجب الحفاظ على إشعار حقوق النشر والترخيص الأصلي عند التوزيع.
