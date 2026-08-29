# 📱 دليل بناء وتصدير تطبيق Clue Me لهواتف Android و iPhone (iOS)

تم تجهيز المشروع بنجاح باستخدام **Capacitor** لتوليد تطبيقات أصلية (Native) حقيقية لكل من أندرويد و iOS دون أي تعديل على كود اللعبة!

---

## 📂 المجلدات التي تم إنشاؤها:
1. `android/`: مشروع أندرويد ستوديو كامل (Android Studio Project).
2. `ios/`: مشروع إكس كود كامل (Xcode iOS Project).
3. `capacitor.config.json`: ملف إعدادات التطبيق (معرّف التطبيق `com.clueme.game` واسم التطبيق `Clue Me`).

---

## 🤖 أولاً: خطوات تصدير تطبيق الأندرويد (Android Studio -> APK / AAB)

### المتطلبات:
- تثبيت برنامج **[Android Studio](https://developer.android.com/studio)** على جهازك.

### الخطوات:
1. **تحديث ومزامنة الملفات**:
   ```bash
   npm run cap:sync
   ```
2. **فتح المشروع داخل Android Studio**:
   ```bash
   npm run cap:open:android
   ```
   *(أو قم بفتح مجلد `android` يدوياً من داخل Android Studio)*.

3. **استخراج ملف التطبيق (APK / AAB)**:
   - لتجربة التطبيق على هاتفك فوراً (APK):
     - من القائمة العلوية في Android Studio، اختر:
     - `Build` ➔ `Build Bundle(s) / APK(s)` ➔ `Build APK(s)`.
     - سيظهر لك رابط المجلد وفيه ملف `app-debug.apk` يمكنك تثبيته على هاتفك مباشرة.
   - لرفع التطبيق على متجر **Google Play Console**:
     - اختر: `Build` ➔ `Generate Signed Bundle / APK` ➔ `Android App Bundle (.aab)`.

---

## 🍏 ثانياً: خطوات تصدير تطبيق الآيفون (Xcode -> iOS App)

### المتطلبات:
- جهاز **Mac** ومثبت عليه برنامج **[Xcode](https://developer.apple.com/xcode/)**.

### الخطوات:
1. **تحديث ومزامنة الملفات**:
   ```bash
   npm run cap:sync
   ```
2. **فتح المشروع داخل Xcode**:
   ```bash
   npm run cap:open:ios
   ```
   *(أو قم بفتح ملف `ios/App/App.xcworkspace` من داخل Xcode)*.

3. **تشغيل وتصدير التطبيق**:
   - قم بتوصيل هاتف iPhone بالماك، أو اختر محاكي (Simulator).
   - اختر حساب المطور الخاص بك في خانة `Signing & Capabilities`.
   - اضغط على زر **Play (Run)** لتشغيل اللعبة فوراً على الآيفون.
   - لرفع اللعبة على **App Store Connect**:
     - اختر من القائمة: `Product` ➔ `Archive` ➔ `Distribute App`.

---

## 🔄 الأوامر السريعة المتاحة في المشروع:

| الأمر | الوظيفة |
| :--- | :--- |
| `npm run cap:sync` | مزامنة أي تحديثات جديدة في ملفات الويب مع مشروعي أندرويد و iOS |
| `npm run cap:open:android` | فتح مشروع الأندرويد في Android Studio مباشرة |
| `npm run cap:open:ios` | فتح مشروع الآيفون في Xcode مباشرة |

---

> ✨ **ملاحظة**: أي تغييرات مستقبلية في تصميم أو منطق اللعبة تحتاج فقط لتشغيل `npm run cap:sync` وسيتم تحديثها فوراً داخل مشروعي الهاتف!
