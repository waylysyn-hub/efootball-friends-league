# سهرة اللعب

من حساب المدير، افتح **سهرة اللعب** وحدد اللاعبين الحاضرين من لاعبي الدوري، ثم اضغط **ابدأ السهرة واعمل القرعة**. يتطلب البدء لاعبين مختلفين على الأقل.

- تُحفظ السهرة والقرعة في الخادم، وتبقيان كما هما بعد تحديث الصفحة أو العودة لاحقًا.
- يظهر كل حاضر مرة واحدة في القرعة. إذا كان العدد فرديًا، يحصل اللاعب الأخير في الترتيب العشوائي على استراحة.
- **تجهيز المباراة** يفتح نموذج تسجيل النتيجة باللاعبين والموسم المختارين. لا يُسجّل نتيجة تلقائيًا؛ أدخل الأهداف واحفظ بعد اللعب.
- **إنهاء السهرة** ينقلها إلى السجل، ثم يمكن بدء سهرة جديدة. توجد سهرة جارية واحدة في كل وقت.
- اختيار الحاضرين قبل البدء يبقى أثناء التنقل والتحديث داخل التطبيق؛ لا يُحفظ هذا النموذج غير المرسل بعد إعادة تحميل المتصفح.
- لا يظهر القسم لبقية اللاعبين، ولا تسمح قاعدة البيانات لهم بقراءة السهرات أو إجراء القرعة أو إنهائها.

## Implementation and validation

`league/js/evenings.js` owns the Arabic UI and draft lifecycle. The client sends canonical account names; presentation uses the shared Arabic name mapping. `start_league_evening` creates the draw server-side and uses a client UUID for idempotent retry after a lost response. The draw never mutates matches, standings, scores or saved squads. Each evening contains one draw, without a tournament bracket or automatic round progression.

Migration `20260922115643_admin_evening_draw.sql` is additive and repeatable. Database tests cover all five non-admin players and anonymous callers, read/write grants, invalid/duplicate attendees, two through six attendees, immutable draws, one active evening, retry identity, closure and invoker functions. DOM tests cover saved drafts, escaped titles, even/odd results, duplicate clicks, lost responses, match prefilling and logout during an in-flight operation. Chromium coverage includes the evening flow and overflow checks at all seven configured widths. Tests use isolated synthetic accounts; they do not require or disclose production passwords.

Competition JSON export/import excludes evenings. Normal database backups include them; deleting/replacing a season leaves the draw intact with an empty season reference. Apply the database migration before the frontend and preserve the prior frontend commit for rollback.
