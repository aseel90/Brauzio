# Brauzio

**Brauzio** هو امتداد Chrome يتيح لـ ChatGPT التحكم في المتصفح وفحصه مباشرة عبر Model Context Protocol (MCP)، من خلال Relay سحابي على Cloudflare.

## الهدف

مسار Brauzio الرسمي بسيط ومحدد:

```text
ChatGPT
   │ HTTPS / MCP
   ▼
Cloudflare Worker
   │ Durable Object + WebSocket
   ▼
Brauzio Chrome Extension
   │
   ▼
Chrome APIs / DevTools Protocol
```

لا يحتاج المستخدم إلى Node.js أو خادم محلي أو `cloudflared`.

## الوظائف الأساسية

- قراءة الصفحات والعناصر المرئية.
- فتح وإغلاق والتنقل بين التبويبات والنوافذ.
- النقر والكتابة والتمرير والتحكم بالماوس.
- لقطات الشاشة والفحص البصري.
- Console وJavaScript وNetwork وPerformance.
- رفع/تنزيل الملفات عندما تتطلب المهمة ذلك.
- Element Picker كحل تفاعلي عندما يصعب تحديد عنصر تلقائيًا.
- تشخيص اتصال آمن وTracing بين ChatGPT وCloudflare والإضافة.

## Cloudflare

Worker الحالي:

```text
https://brauzio-mcp.aseelsalah266.workers.dev
```

المسارات الأساسية:

```text
/mcp             Remote MCP endpoint
/ws              WebSocket endpoint للامتداد
/health          Health check
/browser-status  Browser session status
```

الأسرار تحفظ في Cloudflare/GitHub Secrets ولا توضع داخل المستودع.

## المستخدم النهائي

يحتاج فقط إلى:

- Chrome/Chromium 116 أو أحدث.
- أحدث نسخة من Brauzio.
- رابط Worker.
- رمز ربط الجهاز.

بعد إدخال الإعدادات مرة واحدة يمكن تفعيل الاتصال التلقائي عند تشغيل Chrome.

## التطوير

المشروع Monorepo:

```text
app/
├── chrome-extension/   Brauzio Chrome Extension
└── cloudflare-mcp/     MCP + WebSocket relay

packages/
└── shared/             MCP tool schemas and shared types
```

خطة إعادة البناء والتنظيف موجودة في:

```text
docs/BRAUZIO_V2.md
```

## الحالة

- [x] Cloudflare Worker + Durable Object.
- [x] WebSocket بين Worker وBrauzio.
- [x] Remote MCP لـ ChatGPT.
- [x] تحكم فعلي في Chrome تم اختباره end-to-end.
- [x] Tracing بين طبقات الاتصال.
- [x] واجهة Brauzio v2 قيد إعادة البناء.
- [ ] حذف جميع أسطح المنتج القديمة والاعتمادات غير المستخدمة.
- [ ] تقليل الصلاحيات إلى الحد الأدنى.
- [ ] اختبار كامل لكل أدوات MCP بعد التنظيف.
- [ ] مصادقة متعددة المستخدمين قبل الإطلاق العام.

## الترخيص

Brauzio موزع وفق ترخيص MIT. إشعارات الترخيص وحقوق المؤلف المطلوبة قانونيًا محفوظة في ملفات الترخيص بالمستودع، ومنفصلة عن هوية المنتج وواجهته.
