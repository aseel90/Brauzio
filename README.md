# Brauzio

Brauzio هو جسر MCP للتحكم في Chrome من ChatGPT عبر Cloudflare مباشرة.

## المسار المدعوم

```text
ChatGPT Custom MCP
        ↓ HTTPS /mcp + OAuth 2.1
Cloudflare Worker
        ↓ Durable Object / WebSocket
Brauzio Chrome Extension
        ↓ Chrome APIs + CDP
Chrome
```

لا يحتاج المستخدم النهائي إلى `cloudflared` أو Native Messaging أو خادم Node محلي.

## ما يميز Brauzio V2

- واجهة عربية RTL خاصة بـBrauzio.
- اتصال آمن ومباشر عبر Cloudflare.
- OAuth 2.1 لربط ChatGPT بدون وضع كلمة سر في رابط MCP.
- رمز Pairing مؤقت من الإضافة، صالح لخمس دقائق ويستخدم مرة واحدة.
- أدوات قراءة الصفحة، التنقل، النقر، الكتابة، Console، JavaScript، الشبكة، الأداء، الصور وGIF.
- مؤشر Brauzio افتراضي مرئي داخل الصفحة.
- تحكم ماوس حقيقي مستمر: `mouse_move` و`mouse_down` و`mouse_up` و`drag_hold`، مناسب للألعاب والـCanvas والـVirtual Joystick.
- اختيار عناصر يدوي Human-in-the-loop عند تعذر تحديد عنصر آليًا.
- Logging من طرف إلى طرف بدون طباعة الأسرار.
- بناء ZIP تلقائي لأحدث نسخة من الإضافة.

## ما أزيل من المشروع

Brauzio V2 لا يحتوي على المنتج القديم الخاص بـRecord/Replay أو Workflow Builder أو Agent Chat أو Quick Panel أو Local AI/Embeddings أو Vector Search أو Web Editor أو Side Panel أو الجسر المحلي القديم.

## المستودع

```text
app/chrome-extension/   إضافة Chrome
app/cloudflare-mcp/     Cloudflare MCP relay
packages/shared/        أسماء ومخططات أدوات MCP المشتركة
docs/                   توثيق Brauzio الحالي
releases/               آخر ZIP قابل للتثبيت
```

## التطوير

يتطلب تطوير المشروع Node.js 22 وpnpm.

```bash
pnpm install
pnpm build
```

أوامر منفصلة:

```bash
pnpm build:shared
pnpm build:cloud
pnpm build:extension
```

## حالة V2

- [x] اتصال ChatGPT → Cloudflare → Extension → Chrome
- [x] اختبار حقيقي لأدوات المتصفح
- [x] واجهة Brauzio الجديدة
- [x] إزالة طبقات المنتج القديم
- [x] إضافة الماوس الافتراضي المرئي وحالة الضغط المستمرة
- [x] نجاح TypeScript compile وChrome extension build بعد التنظيف
- [x] استبدال MCP query-string secret بـOAuth 2.1 + one-time pairing
- [ ] إعادة اختبار النسخة المثبتة النهائية بعد نشر ZIP الجديد

## اتجاه V3

خطة V3 تركز على تحويل Brauzio من Browser MCP إلى Browser Agent Platform بدون إضافة طبقات محلية جديدة. أهم المراحل القادمة:

- CDP Core مع جلسات معزولة.
- Event Engine وSmart Wait بدل الانتظار الثابت.
- Raw CDP Advanced Tool بدل تضخيم عدد الأدوات.
- Sense → Act → Verify.
- Human Takeover وEmergency Stop.
- Actor / Observer sessions.
- Diagnostics + Self Test.

الخريطة التنفيذية الكاملة موجودة في `docs/ROADMAP.md`.

## المصادقة والأمان

رابط MCP النهائي نظيف ولا يحتوي على أسرار:

```text
https://<worker>/mcp
```

عند الربط، ChatGPT يستخدم OAuth 2.1. الإضافة تنشئ Pairing Code مؤقتًا لاستخدام واحد، ثم يصدر Cloudflare OAuth tokens للعميل.

مصادقة MCP ومصادقة الجهاز منفصلتان تمامًا:

- ChatGPT ↔ Cloudflare: OAuth access/refresh tokens.
- Extension ↔ Cloudflare: Device Token / `BROWSER_SHARED_SECRET`.

لا تسجل أو ترفع إلى GitHub `BROWSER_SHARED_SECRET` أو Device Token أو OAuth tokens. لا يُسمح بإرسال Device Token داخل `?key=` أو أي query string.

## الترخيص والنسب

Brauzio مبني تاريخيًا على مشروع `hangwin/mcp-chrome` مفتوح المصدر. ملفات الترخيص والنسب المطلوبة قانونيًا تبقى محفوظة وفق رخصة MIT. المنتج الحالي والواجهة والمسار السحابي تم إعادة بنائها وتبسيطها لـBrauzio.

راجع:

- `docs/ROADMAP.md`
- `docs/BRAUZIO_ARCHITECTURE.md`
- `docs/BRAUZIO_V2.md`
- `docs/TOOLS.md`
- `docs/TROUBLESHOOTING.md`
