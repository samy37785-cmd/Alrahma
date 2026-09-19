# Home — Arabic copy approval pack

Date: 2026-09-18
Status: **DRAFT FOR HUMAN REVIEW. Not a published translation.**

## Read this before anything else

- **This is a draft for human review, not a published translation.** Every Arabic cell below is a *proposed* wording for محمود (or a qualified Arabic-language/content reviewer) to approve, correct, or reject — none of it has been placed in any `src/i18n/*` file, and none of it renders on the live site.
- **Nothing here promotes Arabic to `published`.** `src/data/translationStatus.js`'s `/` entry stays exactly as it is (`legacy` for `ar`, unchanged by this document). Moving any of this text into code is a **separate, later phase**, after approval.
- **The Arabic Qur'an verse and the Hadith quotation are not machine-translated, and no Arabic wording for the Hadith is proposed here at all.** The Qur'an verse elsewhere on Home already exists in the code as the real Arabic ayah (not touched by this document). The Hadith in IsnadChain has **no verified Arabic source in this codebase** — see section 2's dedicated note. No AI-authored or from-memory Arabic Hadith text appears anywhere below.

This file does not repeat `docs/home-copy-review-pack.md` (2026-09-18, the earlier all-6-language, all-Home inventory with old file/line references from before the Home Content Foundation migration). This file is narrower and newer: **Arabic only**, sourced from the *current* content modules (`src/i18n/home/levelQuiz.js`, `src/i18n/home/isnadChain.js`, `src/i18n/home/countries.js`, `src/i18n/home/leakedStrings.js`), with a real proposed Arabic draft per string instead of an empty `NEEDS_HUMAN_REVIEW` cell.

## Scope of this pack

Covered: Level Quiz, Isnad Chain (marketing text only — **not** the Hadith itself), the Trial form's course-of-interest dropdown (display label only), the TrustBar country ticker (display label only), and the small leaked strings (`Most Popular` / `Featured Tutor` / `Start your free trial` / `Browse full curriculum` / `Play Quran` / `24-day`).

**Not covered here, on purpose:** Home SEO (title/description/keywords) — reserved as its own section below, left empty. Accessibility-only (`aria-label`/`title`) strings — out of scope for this pass (see `docs/home-copy-review-pack.md` section 7 if needed later).

## Column legend

- **المفتاح/المسار** — the exact path in the current content module (e.g. `LEVEL_QUIZ_TEXT.en.steps.arabic.question`) plus its file.
- **النص الإنجليزي الحالي** — verbatim, copied directly from the source file read for this pack.
- **المسودة العربية المقترحة** — a proposed draft only. Not reviewed, not approved, not published.
- **الحالة** — always `NEEDS_HUMAN_REVIEW` in this pack.
- **ملاحظة أسلوبية** — a short style note where one is useful (terminology choice, a number-format flag, an RTL-arrow flag, etc.).

---

## 1. Level Quiz

Source: `src/i18n/home/levelQuiz.js`, `LEVEL_QUIZ_TEXT.en`.

### 1a. Eyebrow / heading

| المفتاح/المسار | النص الإنجليزي الحالي | المسودة العربية المقترحة | الحالة | ملاحظة أسلوبية |
|---|---|---|---|---|
| `LEVEL_QUIZ_TEXT.en.eyebrow` | `Find your course` | دورتك المناسبة | NEEDS_HUMAN_REVIEW | صيغة اسمية قصيرة، تطابق أسلوب باقي عناوين "eyebrow" المعتمدة في الموقع (مثل "ما نقدمه"، "فريقنا") بدل ترجمة حرفية أمرية. |
| `LEVEL_QUIZ_TEXT.en.heading` | `3 questions → your perfect lesson plan` | 3 أسئلة ← خطة دروسك المثالية | NEEDS_HUMAN_REVIEW | حافظت على السهم كرمز اتجاه (`←`) لا كترجمة؛ الاتجاه هنا مرتبط بتصميم الصفحة وليس نصًا، يُترك قرار اتجاهه للفريق التقني. الرقم `3` كُتب بالحروف اللاتينية للاتساق مع الاستخدام الغالب في نصوص الموقع الأخرى. |

### 1b. السؤال الأول — هل يقرأ العربية

| المفتاح/المسار | النص الإنجليزي الحالي | المسودة العربية المقترحة | الحالة | ملاحظة أسلوبية |
|---|---|---|---|---|
| `steps.arabic.question` | `Can your child / you read Arabic?` | هل يستطيع طفلك / تستطيع أنت قراءة العربية؟ | NEEDS_HUMAN_REVIEW | صيغة تخاطب ولي الأمر والزائر البالغ معًا، كما في الإنجليزية. |
| `steps.arabic.options.none` | `Not yet — starting from zero` | ليس بعد — البداية من الصفر | NEEDS_HUMAN_REVIEW | |
| `steps.arabic.options.basic` | `A few letters — needs practice` | بضعة حروف — يحتاج إلى تدريب | NEEDS_HUMAN_REVIEW | |
| `steps.arabic.options.fluent` | `Yes, can read Arabic` | نعم، يستطيع قراءة العربية | NEEDS_HUMAN_REVIEW | |

### 1c. السؤال الثاني — الهدف

| المفتاح/المسار | النص الإنجليزي الحالي | المسودة العربية المقترحة | الحالة | ملاحظة أسلوبية |
|---|---|---|---|---|
| `steps.goal.question` | `What is your main goal?` | ما هو هدفك الرئيسي؟ | NEEDS_HUMAN_REVIEW | |
| `steps.goal.options.read` | `Learn to read the Quran correctly` | تعلّم قراءة القرآن الكريم بشكل صحيح | NEEDS_HUMAN_REVIEW | |
| `steps.goal.options.memorize` | `Memorize the Quran (Hifz)` | حفظ القرآن الكريم | NEEDS_HUMAN_REVIEW | |
| `steps.goal.options.ijazah` | `Earn an Ijazah certification` | الحصول على إجازة معتمدة | NEEDS_HUMAN_REVIEW | |
| `steps.goal.options.islamic` | `Islamic Studies / Arabic` | الدراسات الإسلامية / اللغة العربية | NEEDS_HUMAN_REVIEW | |

### 1d. السؤال الثالث — لمن الدورة

| المفتاح/المسار | النص الإنجليزي الحالي | المسودة العربية المقترحة | الحالة | ملاحظة أسلوبية |
|---|---|---|---|---|
| `steps.who.question` | `Who is this for?` | لمن هذه الدورة؟ | NEEDS_HUMAN_REVIEW | |
| `steps.who.options.child` | `My child (under 12)` | طفلي (أقل من 12 عامًا) | NEEDS_HUMAN_REVIEW | الرقم بالحروف اللاتينية؛ لا يسبب مشكلة RTL لأنه غير محاط بنص إنجليزي. |
| `steps.who.options.teen` | `My teenager (12–17)` | ابني/ابنتي المراهق(ة) (12–17 عامًا) | NEEDS_HUMAN_REVIEW | صيغة تشمل الذكر والأنثى؛ يمكن تبسيطها لاحقًا حسب رأي المدقق. |
| `steps.who.options.adult` | `Myself (adult)` | لنفسي (بالغ) | NEEDS_HUMAN_REVIEW | |
| `steps.who.options.family` | `Multiple family members` | أكثر من فرد في الأسرة | NEEDS_HUMAN_REVIEW | |

### 1e. التوصيات (شاشة النتيجة)

| المفتاح/المسار | النص الإنجليزي الحالي | المسودة العربية المقترحة | الحالة | ملاحظة أسلوبية |
|---|---|---|---|---|
| `recommendations.read.title` | `Quran Reading — Noorani Qaida` | قراءة القرآن — القاعدة النورانية | NEEDS_HUMAN_REVIEW | يطابق الاسم المعتمد فعليًا في صفحات أخرى منشورة بالموقع. |
| `recommendations.read.desc` | `Start from the very first letter. Our tutors take complete beginners to confident Quran reading in 4–6 months.` | ابدأ من أول حرف. يرافق معلمونا المبتدئين تمامًا حتى يقرأوا القرآن الكريم بثقة خلال 4–6 أشهر. | NEEDS_HUMAN_REVIEW | |
| `recommendations.read.badge` | `🌱 Perfect for beginners` | 🌱 مثالي للمبتدئين | NEEDS_HUMAN_REVIEW | الإيموجي محفوظ كما هو. |
| `recommendations.memorize.title` | `Quran Memorization (Hifz)` | حفظ القرآن الكريم | NEEDS_HUMAN_REVIEW | |
| `recommendations.memorize.desc` | `A structured Hifz plan with daily revision, spaced repetition, and personal accountability — for all ages.` | خطة حفظ منظمة مع مراجعة يومية وتكرار متباعد ومتابعة شخصية — لجميع الأعمار. | NEEDS_HUMAN_REVIEW | |
| `recommendations.memorize.badge` | `🏆 Most popular course` | 🏆 الدورة الأكثر طلبًا | NEEDS_HUMAN_REVIEW | يطابق مصطلح `t.pricing.mostPopular` المعتمد فعليًا ("الأكثر طلباً") — يُقترح على المدقق توحيد الصياغة معه. |
| `recommendations.ijazah.title` | `Quran Ijazah Course` | دورة إجازة القرآن الكريم | NEEDS_HUMAN_REVIEW | |
| `recommendations.ijazah.desc` | `Receive an Ijazah with a connected chain (sanad) back to the Prophet ﷺ — taught by Ijazah-holders themselves.` | احصل على إجازة بسند متصل إلى النبي ﷺ — بتدريس من حاملي الإجازة أنفسهم. | NEEDS_HUMAN_REVIEW | |
| `recommendations.ijazah.badge` | `📜 Advanced certification` | 📜 شهادة متقدمة | NEEDS_HUMAN_REVIEW | |
| `recommendations.islamic.title` | `Islamic Studies & Arabic` | الدراسات الإسلامية واللغة العربية | NEEDS_HUMAN_REVIEW | |
| `recommendations.islamic.desc` | `Aqeedah, Fiqh, Seerah, Hadith, Tafsir — plus foundational Arabic — in your language.` | العقيدة والفقه والسيرة والحديث والتفسير — إلى جانب أساسيات اللغة العربية — بلغتك. | NEEDS_HUMAN_REVIEW | كلمة "Hadith" هنا تسمية لمادة دراسية (منهج)، وليست اقتباسًا لحديث نبوي بعينه؛ لا علاقة لها بقسم 2 أدناه. |
| `recommendations.islamic.badge` | `🌍 All levels welcome` | 🌍 لكل المستويات | NEEDS_HUMAN_REVIEW | |

### 1f. شاشة النتيجة وأزرارها

| المفتاح/المسار | النص الإنجليزي الحالي | المسودة العربية المقترحة | الحالة | ملاحظة أسلوبية |
|---|---|---|---|---|
| `resultEyebrow` | `Your personalised recommendation` | توصيتك الشخصية | NEEDS_HUMAN_REVIEW | |
| `startTrialBtn` | `Start free trial — no card needed` | ابدأ تجربة مجانية — دون الحاجة لبطاقة | NEEDS_HUMAN_REVIEW | |
| `learnMoreBtn` | `Learn more about this course` | مزيد من التفاصيل عن هذه الدورة | NEEDS_HUMAN_REVIEW | |
| `retakeBtn` | `← Retake quiz` | ← إعادة الاختبار | NEEDS_HUMAN_REVIEW | **علم أسلوبي:** السهم `←` في الأصل الإنجليزي يشير لليسار (رجوع في سياق LTR). في صفحة عربية RTL قد يكون الأنسب بصريًا سهمًا لليمين (`→`) ليعبّر عن "رجوع" بنفس المنطق. هذا قرار تصميم/اتجاه، وليس ترجمة نص — يُترك للفريق التقني وقت التنفيذ، غير معتمد هنا. |

**عدد نصوص Level Quiz: 32** (مطابق للعدد في الكود الحالي).

---

## 2. Isnad Chain

Source: `src/i18n/home/isnadChain.js`, `ISNAD_CHAIN_TEXT.en`.

### 2a. العنوان والمقدمة

| المفتاح/المسار | النص الإنجليزي الحالي | المسودة العربية المقترحة | الحالة | ملاحظة أسلوبية |
|---|---|---|---|---|
| `eyebrow` | `Our Legacy` | إرثنا | NEEDS_HUMAN_REVIEW | |
| `headingLine1` | `Every lesson is connected to` | كل درس متصل | NEEDS_HUMAN_REVIEW | يُكمَل بالسطر التالي كجملة واحدة على سطرين، كما في التصميم الأصلي. |
| `headingLine2` | `1,400 years of unbroken transmission` | بسند متواصل عمره 1400 عام | NEEDS_HUMAN_REVIEW | استُخدمت كلمة "سند" (المصطلح الشرعي المقابل لـ Isnad) بدل ترجمة حرفية لـ"transmission"، ويطابق أسلوب نص منشور فعليًا في قسم آخر من الصفحة الرئيسية ("سند متواصل لنقل القرآن عمره ١٤٠٠ عام"). **يُنصح بمراجعة المدقق الشرعي لصياغة "سند" هنا تحديدًا قبل الاعتماد.** رقم "1400" بالحروف اللاتينية هنا؛ النص المنشور المشابه استخدم "١٤٠٠" بالأرقام العربية — يحتاج توحيد أسلوب الأرقام موقعيًا، غير محسوم في هذا الملف. |
| `subCopy` | `When your child learns with Al-Rahma, they join a living chain — the same Quran recited to the Prophet ﷺ, passed down generation by generation to your home.` | عندما يتعلّم طفلك مع الرحمة، ينضم إلى سلسلة حية — القرآن نفسه الذي تُلي على النبي ﷺ، ونُقل جيلًا بعد جيل حتى وصل إلى بيتك. | NEEDS_HUMAN_REVIEW | "Al-Rahma" (اسم العلامة التجارية) محفوظ دون ترجمة، مكتوب هنا "الرحمة" للسياق العربي فقط — يُترك للمدقق تقرير هل يُكتب "الرحمة" أو "Al-Rahma" بالحروف اللاتينية، تمشيًا مع بقية الموقع. |

### 2b. حلقات السلسلة (Chain nodes)

| المفتاح/المسار | النص الإنجليزي الحالي | المسودة العربية المقترحة | الحالة | ملاحظة أسلوبية |
|---|---|---|---|---|
| `nodes.prophet.name` | `The Prophet ﷺ` | النبي ﷺ | NEEDS_HUMAN_REVIEW | رمز الصلاة والسلام ﷺ محفوظ كما هو. |
| `nodes.prophet.detail` | `Received revelation in the Cave of Hira` | تلقّى الوحي في غار حراء | NEEDS_HUMAN_REVIEW | |
| `nodes.companions.name` | `The Companions` | الصحابة | NEEDS_HUMAN_REVIEW | |
| `nodes.companions.detail` | `Memorised and transmitted word-for-word` | حفظوه ونقلوه كلمة بكلمة | NEEDS_HUMAN_REVIEW | |
| `nodes.alAzhar.name` | `Al-Azhar University` | جامعة الأزهر | NEEDS_HUMAN_REVIEW | |
| `nodes.alAzhar.detail` | `Over 1,000 years of unbroken scholarship` | أكثر من 1000 عام من العلم المتصل | NEEDS_HUMAN_REVIEW | |
| `nodes.tutors.name` | `Our Tutors` | معلمونا | NEEDS_HUMAN_REVIEW | |
| `nodes.tutors.detail` | `Ijazah-certified with verified sanad` | حاصلون على إجازة بسند موثّق | NEEDS_HUMAN_REVIEW | |
| `nodes.child.name` | `Your Child` | طفلك | NEEDS_HUMAN_REVIEW | |
| `nodes.child.detail` | `Joins a 1,400-year chain of Quran learners` | ينضم إلى سلسلة عمرها 1400 عام من متعلمي القرآن الكريم | NEEDS_HUMAN_REVIEW | نفس ملاحظة توحيد أسلوب الأرقام أعلاه. |

### 2c. الحديث النبوي — ⚠ محجوب، يحتاج مصدرًا موثّقًا

| المفتاح/المسار | النص الإنجليزي الحالي | المسودة العربية المقترحة | الحالة |
|---|---|---|---|
| `quote` | `"The best of you are those who learn the Quran and teach it."` | **BLOCKED — VERIFIED SOURCE REQUIRED** | NEEDS_HUMAN_REVIEW |
| `citation` | `— Sahih Al-Bukhari` | **BLOCKED — VERIFIED SOURCE REQUIRED** | NEEDS_HUMAN_REVIEW |

**لم أقترح أي نص عربي لهذين الصفّين، ولم أنقل أي صياغة عربية من الذاكرة.** الكود الحالي ينسب هذا الاقتباس إلى "صحيح البخاري" — هذه النسبة موجودة في الكود من قبل (لم تُضَف في هذه المرحلة ولا في مرحلة التأسيس السابقة)، ولم يتم التحقق منها مقابل مصدر أصلي أو مرجع شرعي معتمد.

**المطلوب قبل نقل أي نص إلى الكود:**
1. **النص العربي الأصلي** للحديث، بالصياغة المنقولة المعتمدة (وليس ترجمة عكسية من الإنجليزية).
2. **اسم المصدر** (صحيح البخاري، أو غيره إن تبيّن خلاف ذلك بعد المراجعة).
3. **رقم الحديث/الباب** إن توفّر، لتثبيت الإسناد بدقة.

هذا القسم موثّق أيضًا داخل `src/i18n/home/isnadChain.js` (تعليق الملف) بنفس التحذير — لا يُنقل أي نص لهذا الصف إلى الكود دون توفّر الثلاثة عناصر أعلاه من محمود أو مراجع شرعي مخوَّل.

### 2d. أزرار الدعوة للفعل

| المفتاح/المسار | النص الإنجليزي الحالي | المسودة العربية المقترحة | الحالة | ملاحظة أسلوبية |
|---|---|---|---|---|
| `ctaGift` | `Give your child this gift →` | امنح طفلك هذه الهدية ← | NEEDS_HUMAN_REVIEW | نفس ملاحظة اتجاه السهم في القسم 1f. |
| `ctaMeet` | `Meet our Ijazah holders` | تعرّف على حاملي الإجازة لدينا | NEEDS_HUMAN_REVIEW | |

**عدد نصوص Isnad Chain التسويقية القابلة للمراجعة: 16. عدد الصفوف المحجوبة (الحديث): 2.**

---

## 3. Trial form — قائمة "Course of interest" (نص العرض فقط)

Source: `src/i18n/home/leakedStrings.js`, `COURSE_OPTION_LABELS_TEXT.en` (المفاتيح مطابقة لقيم `src/data/marketing/courses.js`'s `courseOptions`، والتي **تبقى كما هي بدون أي تغيير** لأنها القيمة المُرسَلة فعليًا في طلب الحجز).

| القيمة الفعلية (Value — لا تُترجم ولا تتغيّر) | النص الإنجليزي المعروض حاليًا | المسودة العربية المقترحة للعرض فقط | الحالة | ملاحظة أسلوبية |
|---|---|---|---|---|
| `Quran Reading (Noorani Qaida)` | Quran Reading (Noorani Qaida) | قراءة القرآن (القاعدة النورانية) | NEEDS_HUMAN_REVIEW | |
| `Recitation with Tajweed` | Recitation with Tajweed | التلاوة بأحكام التجويد | NEEDS_HUMAN_REVIEW | |
| `Quran Memorization (Hifz)` | Quran Memorization (Hifz) | حفظ القرآن الكريم | NEEDS_HUMAN_REVIEW | |
| `Quran Ijazah` | Quran Ijazah | إجازة القرآن الكريم | NEEDS_HUMAN_REVIEW | |
| `Islamic Studies` | Islamic Studies | الدراسات الإسلامية | NEEDS_HUMAN_REVIEW | |
| `Arabic Language` | Arabic Language | اللغة العربية | NEEDS_HUMAN_REVIEW | |

**تنبيه مهم:** العمود الأول (Value) هو ما يُرسَل فعليًا إلى الباك-إند عند الحجز، ولا يجوز تغييره بأي حال عند التنفيذ لاحقًا — فقط النص المعروض للزائر (`COURSE_OPTION_LABELS_TEXT`) يُترجَم. هذا الجدول عرض فقط، وليس تعديلًا على منطق الحجز.

**عدد النصوص: 6.**

---

## 4. TrustBar — شريط الدول المتحرك (نص العرض فقط)

Source: `src/i18n/home/countries.js`، `COUNTRY_NAMES_TEXT.en` (المفاتيح مطابقة لـ `src/data/home/countries.js`'s `TRUST_BAR_COUNTRIES`). هذا الشريط عرض بصري بحت — لا قيمة منه تُرسَل في أي نموذج أو حجز.

| المفتاح | الاسم الإنجليزي الحالي | المسودة العربية المقترحة | الحالة |
|---|---|---|---|
| `gb` | UK | المملكة المتحدة | NEEDS_HUMAN_REVIEW |
| `de` | Germany | ألمانيا | NEEDS_HUMAN_REVIEW |
| `fr` | France | فرنسا | NEEDS_HUMAN_REVIEW |
| `it` | Italy | إيطاليا | NEEDS_HUMAN_REVIEW |
| `es` | Spain | إسبانيا | NEEDS_HUMAN_REVIEW |
| `nl` | Netherlands | هولندا | NEEDS_HUMAN_REVIEW |
| `us` | USA | الولايات المتحدة | NEEDS_HUMAN_REVIEW |
| `ca` | Canada | كندا | NEEDS_HUMAN_REVIEW |
| `au` | Australia | أستراليا | NEEDS_HUMAN_REVIEW |
| `se` | Sweden | السويد | NEEDS_HUMAN_REVIEW |
| `no` | Norway | النرويج | NEEDS_HUMAN_REVIEW |
| `be` | Belgium | بلجيكا | NEEDS_HUMAN_REVIEW |
| `ch` | Switzerland | سويسرا | NEEDS_HUMAN_REVIEW |
| `at` | Austria | النمسا | NEEDS_HUMAN_REVIEW |
| `dk` | Denmark | الدنمارك | NEEDS_HUMAN_REVIEW |
| `pt` | Portugal | البرتغال | NEEDS_HUMAN_REVIEW |
| `gr` | Greece | اليونان | NEEDS_HUMAN_REVIEW |
| `pl` | Poland | بولندا | NEEDS_HUMAN_REVIEW |
| `tr` | Turkey | تركيا | NEEDS_HUMAN_REVIEW |
| `sa` | Saudi Arabia | المملكة العربية السعودية | NEEDS_HUMAN_REVIEW |
| `ae` | UAE | الإمارات العربية المتحدة | NEEDS_HUMAN_REVIEW |
| `my` | Malaysia | ماليزيا | NEEDS_HUMAN_REVIEW |
| `uz` | Uzbekistan | أوزبكستان | NEEDS_HUMAN_REVIEW |
| `idn` | Indonesia | إندونيسيا | NEEDS_HUMAN_REVIEW |
| `za` | South Africa | جنوب أفريقيا | NEEDS_HUMAN_REVIEW |

**عدد النصوص: 24.** هذه أسماء دول قياسية بالعربية الفصحى، بلا خلاف أسلوبي متوقع، لكنها تبقى `NEEDS_HUMAN_REVIEW` حتى اعتماد محمود صراحة، بلا استثناء.

---

## 5. النصوص الصغيرة المتسرّبة

Source: `src/i18n/home/leakedStrings.js`، `HOME_LEAKED_STRINGS_TEXT.en`.

| المفتاح | النص الإنجليزي الحالي | المسودة العربية المقترحة | الحالة | ملاحظة أسلوبية |
|---|---|---|---|---|
| `mostPopularCourseBadge` | `Most Popular` | الأكثر طلبًا | NEEDS_HUMAN_REVIEW | يطابق حرفيًا `t.pricing.mostPopular` المعتمد والمنشور فعليًا بالموقع ("الأكثر طلباً") — عند التنفيذ لاحقًا، يُقترح إعادة استخدام نفس المفتاح المعتمد بدل نص جديد، لكن هذا قرار تقني يُترك لمرحلة التنفيذ. |
| `startFreeTrialLink` | `Start your free trial` | ابدأ تجربتك المجانية | NEEDS_HUMAN_REVIEW | |
| `featuredTutorBadge` | `Featured Tutor` | المعلم المميز | NEEDS_HUMAN_REVIEW | |
| `browseFullCurriculum` | `Browse full curriculum` | تصفّح المنهج الكامل | NEEDS_HUMAN_REVIEW | |
| `playQuranLabel` | `Play Quran` | تشغيل القرآن | NEEDS_HUMAN_REVIEW | |
| `quranPlayingLabel` | `Quran playing` | القرآن يُتلى الآن | NEEDS_HUMAN_REVIEW | نص حالة مختصر لزر صغير؛ يمكن للمدقق اقتراح صياغة أقصر مثل "جارٍ التشغيل" إن لزم لضيق المساحة. |
| `refundWindowStat` | `24-day` | 24 يومًا | NEEDS_HUMAN_REVIEW | يطابق الصياغة المنشورة فعليًا في تذييل الصفحة ("نافذة استرداد 24 يومًا") — رقم بالحروف اللاتينية، لا يسبب مشكلة RTL لعدم وجود نص إنجليزي مجاور له في هذا الموضع. |

**عدد النصوص: 7.**

---

## 6. Home SEO — محجوز لمرحلة لاحقة، لا نص هنا

عنوان الصفحة، الوصف، والكلمات المفتاحية (`Home.jsx:34,38-39` — أو مكافئها بعد أي إعادة هيكلة لاحقة) **لم تُكتب مسودتها العربية في هذا الملف**، بناءً على تعليمات صريحة بعدم كتابة SEO جديد في هذه المرحلة. يُفرد لها قسم مستقل في مرحلة منفصلة لاحقة، بعد اعتماد النصوص أعلاه أولًا.

---

## إجمالي عدد النصوص في هذا الملف

| القسم | عدد النصوص القابلة للمراجعة | عدد النصوص المحجوبة |
|---|---:|---:|
| 1. Level Quiz | 32 | 0 |
| 2. Isnad Chain (تسويقي) | 16 | 2 (الحديث والمصدر) |
| 3. Course-of-interest (عرض فقط) | 6 | 0 |
| 4. Countries ticker (عرض فقط) | 24 | 0 |
| 5. النصوص الصغيرة المتسرّبة | 7 | 0 |
| 6. Home SEO | 0 (محجوز، غير مكتوب) | — |
| **الإجمالي** | **85** | **2** |

---

## Checklist الاعتماد

قبل نقل أي نص من هذا الملف إلى الكود، يجب إتمام كل بند أدناه:

- [ ] **مراجعة اللغة والأسلوب** — صحة اللغة العربية الفصحى، ملاءمة النبرة لولي الأمر والزائر، عدم وجود مبالغة تسويقية.
- [ ] **مراجعة المصطلحات الشرعية** — خصوصًا "سند" في قسم 2، وأسماء الدورات (إجازة، حفظ، تجويد، عقيدة، فقه، سيرة، تفسير) في الأقسام 1 و3.
- [ ] **اعتماد نص الحديث ومصدره** (قسم 2c) — النص العربي الأصلي + اسم المصدر + رقم الحديث/الباب، قبل أي محاولة لكتابة نسخة عربية له. لا يُنقل هذا الصف إلى الكود دون هذا الاعتماد تحديدًا.
- [ ] **اعتماد كل نصوص Quiz** (قسم 1) — الأسئلة والخيارات والتوصيات، سؤالًا سؤالًا.
- [ ] **موافقة محمود** على مجمل الملف قبل نقل أي سطر منه إلى أي ملف داخل `src/i18n`.

---

**لا يوجد في هذا الملف أي ادّعاء بأن أي نص أصبح مترجمًا أو منشورًا أو معتمدًا.** كل خلية عربية أعلاه، بلا استثناء، `NEEDS_HUMAN_REVIEW`. حالة `/` في `src/data/translationStatus.js` تبقى `legacy` لكل اللغات غير الإنجليزية، دون أي تغيير بسبب هذا الملف.
