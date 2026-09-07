# دليل بناء ورفع تطبيق Clue Me على متجر Google Play (AAB / APK)

تطبيق **Clue Me** مجهز بالكامل ومضبوط بإصدار **Capacitor 8** مع أحدث تقنيات الويب، والـ Deep Links، والأيقونات وشاشات البداية، ودعم اللغة العربية (RTL).

---

## 1. متطلبات البناء

- برنامج **Android Studio** (نسخة Ladybug أو Hedgehog أو أحدث).
- **Java JDK 17 أو JDK 21**.

---

## 2. خطوات فتح المشروع وتجهيزه في Android Studio

1. حمّل أو استخرج مجلد المشروع على جهازك.
2. افتح **Android Studio** واختر **Open Existing Project**.
3. حدد مجلد `android` الموجود داخل المشروع.
4. انتظر حتى يكتمل فحص ومزامنة الـ Gradle (Gradle Sync).

> **ملاحظة:** تم تشغيل `npx cap sync android` بالفعل، وتم نسخ أحدث ملفات الويب والأصول والمؤثرات الصوتية بالكامل إلى:
> `android/app/src/main/assets/public`

---

## 3. إنشاء ملف الـ AAB الموقّع للرفع (Google Play Release)

لرفع التطبيق على Google Play Console، يتطلب متجر جوجل حزمة **Android App Bundle (.aab)** موقّعة بمفتاحك الخاص (Keystore):

### الخطوات داخل Android Studio:
1. من القائمة العلوية اضغط على **Build** > **Generate Signed Bundle / APK...**.
2. اختر **Android App Bundle** ثم اضغط **Next**.
3. **Key store path**:
   - إذا كان لديك مفتاح سابق، اختر **Choose existing**.
   - إذا كانت هذه المرة الأولى، اضغط **Create new...** وحدد مكاناً لحفظ ملف `clueme-release-key.jks` مع كلمة سر وبيانات المطور.
4. أدخل **Key alias** و **Key password**.
5. اضغط **Next**، ثم اختر نوع البناء **release**.
6. حدد المجلد لحفظ الملف، ثم اضغط **Finish / Create**.

---

## 4. مسار الملف الناتج الجاهز للرفع

بعد انتهاء البناء، ستجد ملف الحزمة في المسار التالي:
```text
android/app/release/app-release.aab
```

---

## 5. رفع التطبيق على Google Play Console

1. ادخل على حسابك في [Google Play Console](https://play.google.com/console).
2. أنشئ تطبيقاً جديداً (Create App) باسم **Clue Me** وحدد اللغة الافتراضية **العربية (ar)**.
3. انتقل إلى قسم **Production** (أو **Closed testing / Internal testing** للتجربة).
4. أنشئ إصداراً جديداً (**Create new release**).
5. اسحب وأسقط ملف `app-release.aab`.
6. اكتب ملاحظات الإصدار (Release notes)، واضغط **Save** ثم **Review release** و **Start rollout**.

---

## 6. معلومات التكوين والهوية (App Info)

- **Package Name (Application ID):** `com.clueme.game`
- **App Name:** Clue Me
- **Minimum SDK:** API 24 (Android 7.0+)
- **Target SDK:** API 36 (متوافق مع أحدث متطلبات وسياسات جوجل بلاي)
- **RTL Support:** نعم (`android:supportsRtl="true"`)
- **Deep Links المدعومة:** `https://clue-me.ai.studio` و `clue-me://` و `clueme://`
