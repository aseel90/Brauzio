# استكشاف أخطاء Brauzio

هذه الصفحة خاصة بإصدار **Brauzio Cloud MCP**. لا تستخدم تعليمات `localhost:12306` أو `mcp-chrome-bridge` الخاصة بالمشروع الأصلي.

## الإضافة تظهر «غير متصل»

تحقق من التالي:

1. رابط Worker يبدأ بـ `https://` ويشير إلى Worker المنشور فعليًا.
2. `BROWSER_SHARED_SECRET` مضبوط في إعدادات Cloudflare Worker.
3. رمز الاتصال داخل الإضافة يطابق `BROWSER_SHARED_SECRET` حرفيًا.
4. معرّف الجهاز ليس فارغًا؛ للاستخدام الفردي استخدم `default`.
5. Chrome إصدار 116 أو أحدث.

يمكن فتح:

```text
https://<worker>/health
```

يجب أن يستجيب Worker بدل خطأ 404 أو 5xx.

## Worker يعمل لكن ChatGPT لا يجد المتصفح

تحقق من حالة الجهاز:

```text
https://<worker>/browser-status?device=default&key=<MCP_SECRET>
```

إذا كان Worker يعمل لكن الجهاز غير متصل، فالمشكلة بين إضافة Chrome وWebSocket وليست في MCP نفسه.

## ChatGPT يرفض رابط MCP

رابط نسخة الاستخدام الفردي الحالية يكون بالشكل:

```text
https://<worker>/mcp?device=default&key=<MCP_SECRET>
```

تحقق من:

- استخدام HTTPS وليس `ws://` أو `wss://` في إعداد MCP.
- وجود `/mcp` في المسار.
- أن `device` يطابق معرّف الجهاز في الإضافة.
- أن `key` يطابق `MCP_SHARED_SECRET` إن كان مضبوطًا، وإلا السر المشترك المستخدم للمتصفح.

> رابط MCP يحتوي سرًا في نسخة MVP؛ لا تنشره أو تشاركه علنًا.

## WebSocket يفصل بعد فترة

Brauzio يرسل heartbeat دوريًا من Service Worker. إذا استمر الفصل:

- تأكد أن Chrome 116+.
- تأكد أن Worker المنشور هو الإصدار الحالي الذي يستخدم Durable Object.
- افحص سجلات Worker في Cloudflare لمعرفة إن كان الاتصال يُرفض بسبب المصادقة.
- أعد حفظ إعدادات الاتصال من popup ثم اضغط اتصال.

## الأدوات تظهر لكن تنفيذها يفشل

ابدأ بهذه الأدوات البسيطة بالتسلسل:

1. `get_windows_and_tabs`
2. `chrome_read_page`
3. `chrome_screenshot`
4. `chrome_navigate`
5. `chrome_click_element` أو `chrome_computer`

إذا نجحت الأدوات الأساسية وفشلت أداة متقدمة فقط، فالمشكلة غالبًا في تلك الأداة وليس في Cloudflare relay.

## صلاحيات Chrome

Brauzio يحتاج صلاحيات Browser APIs الموضحة في Manifest. إذا نزعت صلاحية من صفحة الإضافات فقد تفشل أداة محددة بينما يبقى اتصال MCP سليمًا.

## لا تستخدم هذه الخطوات القديمة

هذه التعليمات تخص upstream القديم وليست مطلوبة في Brauzio Cloud:

```text
npm install -g mcp-chrome-bridge
mcp-chrome-bridge register
http://127.0.0.1:12306/mcp
cloudflared tunnel ...
```

## فحص البناء

إذا كنت مطورًا، راجع GitHub Actions. Workflow باسم **Brauzio CI** يبني:

- shared MCP schemas
- Cloudflare MCP Worker
- Chrome extension
- ZIP جاهز للإضافة

فشل CI يعني أن الإصدار الحالي لا يجب اعتباره إصدارًا جاهزًا للتثبيت حتى يتم إصلاحه.

## مرجع معماري

راجع [`BRAUZIO_ARCHITECTURE.md`](BRAUZIO_ARCHITECTURE.md) لفهم مسار ChatGPT → Cloudflare → WebSocket → Chrome Extension.
