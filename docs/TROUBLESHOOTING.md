# استكشاف أخطاء Brauzio V2

## الواجهة تقول متصل لكن الأدوات لا ترجع نتيجة

حالة «متصل» تثبت WebSocket authentication فقط. للتحقق من المسار الكامل جرّب بالترتيب:

1. `get_windows_and_tabs`
2. `chrome_read_page` على صفحة ويب عادية
3. `chrome_console`
4. `chrome_navigate`

إذا أعاد Chrome نتيجة أو خطأ صلاحيات طبيعيًا، فهذا يثبت round trip كاملًا.

## Logs

ابحث عن:

- `[BrauzioRelay]` في Service Worker Console.
- `[BrauzioWorker]` في Cloudflare Worker logs.
- `[BrauzioSession]` في Durable Object logs.

لا يجب أن تظهر Device Token أو OAuth access/refresh tokens أو Pairing Code في السجلات.

## لا يمكن قراءة chrome:// أو chrome-extension://

Chrome يقيّد حقن scripts في الصفحات الداخلية. اختبر `chrome_read_page` على صفحة HTTPS عادية قبل اعتبار الاتصال معطلاً.

## Virtual Mouse لا يحرك لعبة أو Joystick

لا تعتمد على تغير إحداثيات اللاعب فقط. قد تحركه physics أو enemy knockback.

اختبار صحيح:

1. `mouse_move` إلى مركز joystick.
2. `mouse_down`.
3. `mouse_move` إلى الاتجاه المطلوب.
4. افحص قيمة input/move داخل اللعبة أثناء استمرار الضغط.
5. `mouse_up`.

إذا بقي input صفرًا أثناء الضغط، فالستيك لم يستقبل الحركة حتى لو تغير موضع الشخصية.

## الإضافة غير متصلة

تحقق من:

- Worker URL يبدأ بـ`https://`.
- Device ID غير فارغ.
- Device Token يطابق إعداد Cloudflare.
- Worker وDurable Object منشوران من النسخة الحالية.

## ChatGPT لا يقبل MCP URL

استخدم فقط HTTPS endpoint النظيف:

```text
https://<worker>/mcp
```

لا تضف `?key=` ولا Device Token إلى الرابط. من المفترض أن يكتشف ChatGPT OAuth تلقائيًا ويفتح صفحة تفويض Brauzio.

إذا ظهرت صفحة التفويض ولم يقبل الرمز:

1. أنشئ Pairing Code جديدًا من Popup.
2. استخدم أحدث رمز ظاهر خلال خمس دقائق.
3. كل رمز يستخدم مرة واحدة فقط.
4. منذ Brauzio Cloud 2.1.1 لا يؤدي انقطاع WebSocket أو إعادة اتصال الإضافة لحظيًا إلى إبطال رمز تم إنشاؤه بالفعل.
5. صفحة التفويض تعرض سبب الرفض بدقة: لا يوجد رمز نشط، منتهي، غير مطابق، تجاوز المحاولات، أو خطأ Cloud.

ملاحظة أمان: رمز الربط يبقى قصير العمر، يستخدم مرة واحدة، يخزن كـSHA-256 فقط، ومحدد بعدد محاولات حتى مع السماح بإكمال OAuth أثناء إعادة اتصال الإضافة.

إذا لم تظهر صفحة OAuth أصلًا، افحص `/health` وتأكد أن `auth` يساوي `oauth2.1-pairing`، ثم افحص OAuth discovery metadata.

## أدوات تظهر لكن أداة واحدة تفشل

إذا نجح `get_windows_and_tabs` و`chrome_read_page` وفشلت أداة واحدة فقط، فالمشكلة غالبًا داخل الأداة المحددة وليست في relay.

## Build verification

نسخة جاهزة يجب أن تمر عبر GitHub Actions:

- shared schemas build
- Cloudflare MCP typecheck/build
- extension build
- ZIP verification

ثم ينشر CI تلقائيًا:

`releases/chrome-extension/latest/brauzio-chrome-latest.zip`

## ممنوع استخدام المسار القديم

Brauzio V2 لا يحتاج ولا يدعم كمسار منتج:

```text
mcp-chrome-bridge
127.0.0.1:12306
Native Messaging bridge
cloudflared tunnel
```

### خطأ `form-action 'self'` في صفحة OAuth

إذا ظهرت رسالة Console تقول إن إرسال `/authorize?...` محظور بواسطة `Content-Security-Policy`، فهذا كان خطأ في Brauzio Cloud 2.1.1 وليس في Pairing Code. تم إصلاحه في Cloud 2.1.2 بجعل نموذج التفويض و`form-action` يشيران صراحةً إلى نفس أصل Worker. لا تحتاج إعادة تثبيت الإضافة.
