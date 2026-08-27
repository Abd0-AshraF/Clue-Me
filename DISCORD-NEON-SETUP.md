# إعداد Discord Login + Discord Activity + Neon على Wispbyte

الرابط النهائي المستخدم في الإعداد:

```text
https://clueme.wisp.uno
```

> لا تشارك `DISCORD_CLIENT_SECRET` أو `DATABASE_URL` في رسالة عامة أو داخل ملفات الواجهة.

## 1) قاعدة البيانات المجانية — Neon

نعم، Neon لديه خطة Free بقيمة $0 بدون مدة انتهاء أو بطاقة بنكية. الحدود الحالية المنشورة تشمل 100 CU-hour شهريًا و0.5 GB تخزين لكل مشروع، وهي كافية كبداية للعبة صغيرة.

1. افتح https://console.neon.tech وسجّل حسابًا.
2. اختر **New Project**.
3. الاسم المقترح: `clue-me-production`.
4. اختر Region قريبًا من Wispbyte/المستخدمين (غالبًا Europe/Frankfurt مناسب).
5. افتح **Connection Details** واختر **Pooled connection**.
6. انسخ الرابط كاملًا؛ يبدأ بـ `postgresql://` وينتهي غالبًا بـ `sslmode=require`.
7. ضعه في Wispbyte باسم `DATABASE_URL`.

السيرفر ينشئ جدول `clue_me_state` تلقائيًا. ملف `database/schema.sql` موجود للمرجع فقط.

البيانات المحفوظة الآن:
- الحسابات وPassword hashes وربط Discord.
- الجلسات والإحصائيات والإنجازات.
- إعدادات الإدارة والكلمات المخصصة والحظر والكتم.
- الغرف النشطة وحالة اللعب والشات وسجل الأحداث.

## 2) إنشاء Discord Application

1. افتح https://discord.com/developers/applications
2. اختر **New Application** وسمّها `Clue Me`.
3. من **General Information**:
   - انسخ **Application ID** → قيمة `DISCORD_CLIENT_ID`.
   - ارفع أيقونة ووصف اللعبة.
4. من **OAuth2**:
   - اضغط **Reset Secret** وانسخ القيمة فورًا → `DISCORD_CLIENT_SECRET`.
   - تحت **Redirects** أضف بالحرف:

```text
https://clueme.wisp.uno/api/auth/discord/callback
```

5. من **Installation** فعّل User Install وGuild Install (الإعداد الموصى به).

## 3) إعداد Discord Activity

1. من **Activities → Settings** فعّل **Enable Activities**.
2. اترك Default Entry Point Command باسم `Launch`؛ Discord ينشئه تلقائيًا.
3. من **Activities → URL Mappings** أضف:

| Prefix | Target |
|---|---|
| `/` | `clueme.wisp.uno` |

إذا طلبت اللوحة Target كرابط كامل استخدم:

```text
https://clueme.wisp.uno
```

4. فعّل Developer Mode في Discord أثناء التجربة.
5. اختبر Activity من App Launcher داخل Voice/Text Channel في سيرفر تجريبي.

الواجهة تقرأ Application ID وقت التشغيل من `/api/auth/discord/config`؛ لم تعد تحتاج `VITE_DISCORD_CLIENT_ID` أو إعادة Build عند تغيير الـID.

Scopes المستخدمة داخل Activity:

```text
identify email guilds applications.commands
```

## 4) متغيرات Wispbyte المطلوبة

أضف القيم التالية من **Startup / Variables**:

```dotenv
NODE_ENV=production
PUBLIC_URL=https://clueme.wisp.uno
ADMIN_EMAILS=YOUR_EMAIL@example.com

DATABASE_URL=PASTE_NEON_POOLED_CONNECTION_STRING
DATABASE_SSL=true
DATABASE_SAVE_INTERVAL_MS=3000

DISCORD_CLIENT_ID=PASTE_DISCORD_APPLICATION_ID
DISCORD_CLIENT_SECRET=PASTE_DISCORD_CLIENT_SECRET
DISCORD_REDIRECT_URI=https://clueme.wisp.uno/api/auth/discord/callback
DISCORD_DOMAIN_VERIFICATION=dh=25c4ae9e0f4fc78390d8c9b14b8be9c204750154
DISCORD_MOCK_MODE=0
DISCORD_SERVER_INVITE_URL=https://discord.gg/YOUR_INVITE
```

لا تضف `PORT`؛ Wispbyte يرسل `SERVER_PORT` تلقائيًا.

## 5) تأكيد ملكية الدومين في Discord

المشروع يقدّم ملف التحقق تلقائيًا على:

```text
https://clueme.wisp.uno/.well-known/discord
```

والمحتوى المطلوب هو:

```text
dh=25c4ae9e0f4fc78390d8c9b14b8be9c204750154
```

بعد رفع النسخة وعمل Restart، افتح الرابط وتأكد أنه يعرض السطر فقط، ثم اضغط **Verify** في Discord Developer Portal. المسار موجود أيضًا كملف `public/.well-known/discord`، ومعه Route صريح لأن بعض static servers تتجاهل المجلدات التي تبدأ بنقطة.

## 6) Cloudflare / Proxy

- SSL mode: **Full (strict)** إن كانت شهادة الـOrigin صحيحة.
- WebSockets: مفعلة.
- لا تعمل Cache لمسارات `/api/*` أو `/socket.io/*`.
- اجعل `https://clueme.wisp.uno` يوجّه إلى بورت Wispbyte الصحيح.

## 7) اختبار سريع بعد Restart

1. افتح:

```text
https://clueme.wisp.uno/api/auth/discord/config
```

المتوقع (Application ID قيمة عامة وآمنة):

```json
{"enabled":true,"clientId":"YOUR_APPLICATION_ID"}
```

2. جرّب زر Login with Discord من المتصفح.
3. شغّل Activity من Discord App Launcher.
4. أنشئ حسابًا أو غيّر إحصائية، ثم Restart للسيرفر وتأكد أن البيانات ما زالت موجودة.
5. في Console ابحث عن:

```text
[database] connected
```

أو:

```text
[database] restored N users and N active rooms
```

## 8) أخطاء شائعة

- `redirect_uri mismatch`: رابط Redirect في Discord لا يطابق المتغير بالحرف.
- `Discord Activity is not configured`: Client ID/Secret غير موجودين أو السيرفر لم يُعمل له Restart.
- `invalid_client`: Client Secret غلط أو اتعمل له Reset؛ انسخ الجديد.
- فشل قاعدة البيانات: تأكد من استخدام Pooled URL ووجود `sslmode=require` وأن Wispbyte يسمح باتصال outbound على PostgreSQL.
- Activity شاشة خطأ: راجع URL Mapping وEnable Activities وDefault Entry Point.

## مراجع رسمية

- Discord OAuth2: https://docs.discord.com/developers/topics/oauth2
- Discord Activity guide: https://docs.discord.com/developers/activities/building-an-activity
- Neon pricing: https://neon.com/pricing
