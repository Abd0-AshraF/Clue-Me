# Clue Me — نشر على Wispbyte

حزمة جاهزة للتشغيل: **سيرفر واحد، بورت واحد** — بيقدّم اللعبة (الواجهة) والـ API والـ WebSocket كلهم مع بعض.

## محتويات الملف

```
index.js        ← السيرفر مبني ومجمّع (Express + Socket.IO + منطق اللعبة)
public/         ← الواجهة مبنية (React) — الصفحة والأصول والخطوط
package.json    ← أوامر التشغيل؛ السيرفر Self-contained ومكتباته مدمجة داخله
.env.example    ← نموذج الإعدادات (غيّر اسمه لـ .env)
apps/web/       ← ملفات توافق مع قوالب Next.js (اقرا قسم المشاكل تحت)
```

## خطوات النشر (٥ دقايق)

### 1) اعمل سيرفر
من [لوحة Wispbyte](https://wispbyte.com/client) → **Create Server** → اختار نوع **Node.js** (أو Generic/Web Application).

### 2) ارفع الملفات
افتح **File Manager** → **Upload** → ارفع ملف `clue-me-wispbyte.zip` → اضغط عليه بزرار الفأرة اليمين → **Unarchive**.

> لازم `index.js` و `package.json` يكونوا في **جذر** السيرفر مباشرة، مش جوه فولدر.

### 3) اضبط التشغيل
من تبويب **Startup**:

| الحقل | القيمة |
|---|---|
| Startup Command | `npm start` |
| Main File / App File | `index.js` |
| Auto Install / Install deps | مفعّل ✅ |
| Node version | 20 أو أحدث |

الحزمة Self-contained؛ كل مكتبات السيرفر مدمجة داخل `index.js`. أمر `npm install` الخاص بالقالب سيكمل بدون تنزيل dependencies أو إنشاء `node_modules`. لو شغّلت يدويًا يكفي:

```bash
npm start
```

### 4) افحص الإعدادات ثم شغّل
بعد إضافة متغيرات Neon وDiscord شغّل من Console:

```bash
npm run config:check
```

بعد نجاح الفحص اضغط **Start**. في الكونسول المفروض تشوف:
```
[server] Clue Me API v0.1.0 (REST + Socket.IO) on http://0.0.0.0:<PORT>
```

### 5) افتح اللعبة
من تبويب **Network / Allocations** خد العنوان (`IP:PORT`) وافتحه في المتصفح. اللعبة هتشتغل على طول.

---

### ⚠️ لو السيرفر اتعمل بقالب Next.js بالغلط

لو شفت في الكونسول:

```
npm error Missing script: "db:generate"
Server marked as offline
```

معناها إن أمر التشغيل بتاع القالب بيدوّر على مشروع Next.js مش موجود عندنا.

**الحل الصح (المفضّل):** من تبويب **Startup** غيّر الـ Startup Command لـ:
```
npm start
```
أو اعمل سيرفر جديد بقالب **Node.js** بدل Next.js.

**الحل السريع:** الحزمة دي متظبطة أصلاً عشان تعدّي من القوالب دي من غير ما تغيّر أي حاجة — فيها سكربتات فاضية لـ `db:generate` و `build`، وفولدر `apps/web/.next` عشان القالب يتخطى خطوة البناء ويروح على `npm start` على طول. يعني مجرد ما ترفع النسخة دي، السيرفر هيقوم حتى بالأمر القديم.


## ملاحظات مهمة

**البورت** — السيرفر بيقرا `PORT` وبعدها `SERVER_PORT` (اللي اللوحة بتحقنه تلقائياً)، ولو ملقاش حاجة بيستخدم 3001. متكتبش بورت ثابت في `.env` غير لو انت متأكد إنه نفس البورت المخصص لك في اللوحة، وإلا اللعبة مش هتفتح.

**الربط** — بيسمع على `0.0.0.0` فالبورت مفتوح للناس برة تلقائياً.

**قاعدة البيانات** — عند ضبط `DATABASE_URL` يستخدم السيرفر PostgreSQL/Neon ويحفظ الحسابات والجلسات والإحصائيات والإدارة والغرف النشطة وحالة اللعب تلقائيًا. السيرفر ينشئ الجدول المطلوب بنفسه ويحفظ التغييرات دوريًا وعند الإغلاق. بدون `DATABASE_URL` يعمل بنظام الذاكرة فقط وستُمسح البيانات بعد Restart.

**الأدمن** — أول حساب يتسجل بياخد صلاحية الإدارة تلقائياً. الأفضل تحط إيميلك في `ADMIN_EMAILS` قبل التشغيل.

**HTTPS** — لو محتاج شهادة (وهي **شرط** لتسجيل الدخول بديسكورد ولخاصية Discord Activity)، اربط دومين عبر Cloudflare وخليه يعمل بروكسي للعنوان. ديسكورد مبيقبلش `http://` ولا عناوين IP.

**ديسكورد** — الزرار بيختفي لوحده لو مفيش `DISCORD_CLIENT_ID` و `DISCORD_CLIENT_SECRET`. تسجيل الدخول والـActivity بيقرؤوا Application ID وقت التشغيل من السيرفر؛ لا تحتاج `VITE_DISCORD_CLIENT_ID` أو إعادة Build. راجع `DISCORD-NEON-SETUP.md` للإعداد الكامل.

---

## تحديث النسخة لاحقاً

ارفع `index.js` و `public/` الجديدين بس (مش محتاج `node_modules` تاني) واضغط **Restart**.

## لو حصلت مشكلة

| العرض | السبب غالباً |
|---|---|
| السيرفر بيقفل فوراً | `npm install --omit=dev` مااتعملش |
| صفحة بيضا | فولدر `public/` مش موجود جنب `index.js` |
| اللعبة تفتح بس الأونلاين مش شغال | البروكسي/الدومين مش ممرر WebSocket |
| Discord Login يعمل redirect error | راجع `DISCORD_REDIRECT_URI` وتأكد إنه مطابق للـDeveloper Portal بالحرف |
| Activity تعرض شاشة فشل | راجع Application ID وURL Mapping وEnable Activities |
| السيرفر يقفل عند `[database] startup failed` | راجع Neon pooled `DATABASE_URL` وSSL واتصال Wispbyte الخارجي |
| `EADDRINUSE` | حاطط `PORT` غلط في `.env` — امسحه وسيب اللوحة تحدده |
| `Missing script: "db:generate"` | قالب Next.js — غيّر Startup Command لـ `npm start` (أو ارفع النسخة دي وهي متظبطة له) |
