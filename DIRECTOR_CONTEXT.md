# HJCapital Director Context
> **هذا الملف هو الدماغ الرئيسي لمشروع HJCapital.**
> يجب قراءته في بداية كل chat جديد داخل المشروع.
> يجب تحديثه في نهاية كل جلسة عمل.

---

## 1. هوية المشروع

| الحقل | القيمة |
|---|---|
| اسم المشروع | HJ Capital — منصة حمادة الاستثمارية |
| الهدف | منصة تداول آلي مدعومة بالذكاء الاصطناعي تتصل بـ Capital.com |
| المالك | حمادة جابر |
| الرصيد الحالي | ~$2,000+ على Capital.com (إيداع جديد $1,000 في 2026-06-25) |
| الموقع | https://hjcapital.vip |
| GitHub | https://github.com/Hamadajaber/hjcapital (private) |
| مسار المشروع | `/home/ubuntu/hj-capital-platform` |
| آخر Checkpoint | Round 52 (Trading Standards V1) |

---

## 2. المكدس التقني (Tech Stack)

| الطبقة | التقنية |
|---|---|
| Frontend | React 19 + Tailwind CSS 4 + shadcn/ui |
| Backend | Express 4 + tRPC 11 + Drizzle ORM |
| Database | MySQL (TiDB Cloud) |
| AI Layer | Claude Sonnet via `invokeLLM` (server/_core/llm.ts) |
| Broker API | Capital.com REST API |
| Auth | Manus OAuth |
| Hosting | Manus Autoscale |

---

## 3. استراتيجية التداول (MTF Strategy)

### القواعد الثلاث
1. **Rule 1 — 4H Trend:** EMA50 > EMA200 = uptrend, EMA50 < EMA200 = downtrend
2. **Rule 2 — 1H Confirmation:** MACD histogram > -0.0005 + RSI بين 35-75
3. **Rule 3 — 5m Trigger:** أنماط الشموع (Doji, Hammer, Engulfing, Shooting Star)

### طبقة AI
- Claude يُحلل الإشارة النهائية ويعطي confidence score
- **الحد الأدنى للدخول: 65% confidence (Conviction Filter — Round 52)**
- أي صفقة أقل من 65% تُرفض تماماً (لا يتم تصغيرها)

### إدارة المخاطر
| المعامل | القيمة |
|---|---|
| maxRiskPerTrade | 1% (Fixed Fractional ~$20 على $2,000) |
| maxOpenPositions | 3 |
| **maxPositionSize** | **1 وحدة (خُفّض من 2 — Round 52)** |
| **dailyLossLimit** | **1.5% (~$30 — Round 52)** |
| **minConfidence** | **65% (Round 52)** |
| **Cooldown بعد خسارة** | **120 دقيقة (رُفع من 60 — Round 52)** |
| Trailing Stop | عند 40% target → breakeven، عند 60% target → +20% profit lock (Round 52 — أكثر عدوانية في حجز الربح) |
| Trailing Drawdown | 5% من قمة الرصيد |
| SL/TP Guard | 0.1% tolerance — يمنع أي صفقة بـ SL/TP خاطئ |

### الأدوات المتداولة (CORE_INSTRUMENTS) — 6 أدوات نخبوية (Round 52)
`EURUSD, GBPUSD, GOLD, US500, GER40, ETHUSD`

> **حُذف في Round 52:** `NASDAQ` (خسارة -$106، كان لا يزال يُتداول رغم اعتقاد توثيقه بحذفه)، `USDJPY` (خسارة -$63)، `XAGUSD` (ارتباط عالٍ بالذهب + سيولة أقل)، `AUDUSD` (ثقة منخفضة / تذبذب حول التعادل). الفلسفة: التداول بثقة لا بكثرة.

> **محذوفة نهائياً:** OIL_CRUDE (ساعات تداول مقيّدة) — وRound 52 حذف NASDAQ/USDJPY/XAGUSD/AUDUSD فعلياً من الكود.

---

## 4. بنية الملفات الرئيسية

```
hj-capital-platform/
├── server/
│   ├── autoTradeEngine.ts      ← المحرك الرئيسي (runCycle, MTF strategy, trailing stop)
│   ├── engineIntelligence.ts   ← AI analysis, ATR sizing, evaluateClosedTrade
│   ├── capitalcom.ts           ← Capital.com API wrapper + market hours
│   ├── routers.ts              ← جميع tRPC procedures
│   ├── db.ts                   ← DB query helpers
│   └── _core/index.ts          ← Server boot + Market-Hours Watcher
├── client/src/pages/
│   ├── AutoTrade.tsx           ← واجهة التداول الرئيسية
│   ├── Dashboard.tsx           ← لوحة التحكم
│   ├── Lessons.tsx             ← صفحة الدروس المستفادة من AI
│   ├── Performance.tsx         ← تحليل الأداء
│   └── MarketHours.tsx         ← جدول أوقات الأسواق
├── drizzle/schema.ts           ← مخطط قاعدة البيانات الكامل
├── DIRECTOR_CONTEXT.md         ← هذا الملف (الدماغ الرئيسي)
└── todo.md                     ← قائمة المهام
```

---

## 5. سجل الجولات المكتملة (Rounds Log)

| الجولة | ما تم | الحالة |
|---|---|---|
| Round 1-27 | بناء المنصة الأساسية، ربط Capital.com، واجهة التداول | ✅ |
| Round 28 | استراتيجية MTF الكاملة (3 قواعد + AI confirmation) | ✅ |
| Round 29 | Asian session filter، تحسين Rule 2 MACD، أنماط Doji/Hammer | ✅ |
| Round 30 | EMA gap filter (0.15%)، تحسين AI prompt، Risk presets أكثر أماناً | ✅ |
| Round 31 | Strategy Comparison tab، Smart preset banner، Weekly Friday Telegram summary | ✅ |
| Round 32 | إصلاح SL/TP Bug: حفظ finalSL/finalTP الفعلية بدلاً من raw AI estimates | ✅ |
| Round 33 | Auto position reconciliation في بداية كل runCycle | ✅ |
| Round 34 | Reconciliation يجلب close price الحقيقي، Reconciliation tab، SL/TP Validation Guard | ✅ |
| Round 35 | Market Hours دقيقة لكل أداة من Capital.com، صفحة Market Hours | ✅ |
| Round 36 | 4 bug fixes: evaluateClosedTrade في reconciliation/manual close، OIL_CRUDE removed، SILVER market-hours guard | ✅ |
| Round 37 | Technical SL/TP fallback close guard، live balance cache، صفحة AI Lessons Learned | ✅ |
| Round 38 | View All Lessons link، 0.1% tolerance في SL/TP guard، AI Lessons stats card في Dashboard | ✅ |
| Round 39 | إصلاح error.invalid.from في reconciliation، mode column في trade_lessons، Weekly Accuracy Trend Chart، Paper/Live filter | ✅ |
| Round 40 | Instrument Performance Comparison table، Close Reason Pie Chart، تحسين formatLessonsForPrompt (5 lessons، incorrect أولاً) | ✅ |
| Round 41 | استبدال الجدول الثابت بـ Market-Hours Watcher ديناميكي (كل 5 دقائق)، isAnyMarketOpen()، getNextMarketEvent() | ✅ |
| Round 42 | نظام العمل متعدد الـ Chats: DIRECTOR_CONTEXT.md، hjcapital-workflow Skill، scripts/git-sync.sh، GitHub sync | ✅ |
| Round 43 | 3 bug fixes: broker epic->friendly name mapping، Reconciliation P&L محسّن، Client sentiment retry logic | ✅ |
| Round 44 | تحديث DIRECTOR_CONTEXT.md، Telegram alert للصفقات المعادلة، تأكيد EURUSD/GBPUSD غير محجوبة | ✅ |
| Round 45 | Hard size cap (max 2 units)، 60-min cooldown بعد خسارة، رفع confidence threshold من 45% إلى 55% | ✅ |
| Round 46 | Daily Drawdown Chart، Per-Instrument Bar Chart، Weekly Summary card، weeklyReportHandler | ✅ |
| Round 47 | dealId tracking، balance sync كل cycle، dealId backfill، Dashboard يعرض live balance | ✅ |
| Round 48 | initialBalance=$1000، /positions Telegram command، auto-register webhook | ✅ |
| Round 49 | إزالة Daily Profit Lock، Trailing Drawdown Protection (5% من peak)، dynamic Daily Loss Limit، تحديث RiskSettings frontend | ✅ |
| Round 50 | إزالة Asian Session Filter (كان يوقف المحرك 9 ساعات/يوم)، تغيير الـ cron من يومي إلى أسبوعي (Sun 21:00 UTC open / Fri 21:00 UTC close)، المحرك الآن 24/5 مثل Capital.com تماماً | ✅ |
| Round 51 | 6 إصلاحات استقرار: (1) getCurrentBalance يحاول 3 مرات ثم يرجع لـ DB كبديل، (2) Trailing drawdown يتجاهل الفحص إذا كان الرصيد < 20% من الذروة، (3) المحرك لا يوقف نفسه عند حد المخاطر — يتخطى الدورة فقط، (4) 403 Incapsula يُعالَج مثل 401 بإعادة مصادقة، (5) مدة الجلسة من 10 إلى 8 دقائق، (6) peakBalance يُحدَّث من Capital.com عند بدء المحرك | ✅ |
| **Round 52** | **Trading Standards V1 (وضع نشط / تداول بثقة):** (1) تقليص الأدوات 10→6 نخبوية (حذف NASDAQ، USDJPY، XAGUSD، AUDUSD)، (2) رفع حد الثقة 55%→65% كفلتر صارم (رفض لا تصغير)، (3) dailyLossLimit 25%→1.5% (~$30)، (4) maxPositionSize 2→1 وحدة، (5) Trailing Stop أعنف: breakeven@40% و +20% lock@60%، (6) Cooldown 60→120 دقيقة، (7) **إصلاح ثغرة الإغلاق**: مطابقة سجل DB بـ dealId بدل أحدث صفقة على الأداة، (8) إصلاح مطابقة Trailing Stop بـ dealId. النتيجة: 105/105 اختبار مستقل عن DB ناجح، 0 أخطاء TypeScript | ✅ |

---

## 6. القرارات الاستراتيجية المهمة

| القرار | السبب | التاريخ |
|---|---|---|
| حذف NASDAQ من CORE_INSTRUMENTS | خسارة -$103 | Round 36 |
| حذف OIL_CRUDE من CORE_INSTRUMENTS | خسارة -$103 | Round 36 |
| maxRiskPerTrade = 1% (ليس أكثر) | الرصيد $1,000 — حماية رأس المال أولاً | Round 30 |
| Dynamic confidence threshold | Win Rate < 50% → threshold يرتفع تلقائياً | Round 30 |
| Market-Hours Watcher بدلاً من جدول ثابت | الأسواق تفتح/تغلق بشكل ديناميكي | Round 41 |
| openInstruments يستخدم friendly names | broker epics كانت تحجب EURUSD/GBPUSD خطأً | Round 43 |
| Telegram alert للصفقات المعادلة | إشعار فوري عند إغلاق Capital.com لصفقة عبر SL/TP | Round 44 |
| Hard size cap (max 2 units) | منع خسارة -$57 USDJPY type | Round 45 |
| 60-min cooldown بعد خسارة | منع تكرار GOLD BUY ×3 | Round 45 |
| Confidence threshold 45%→55% | تحسين Win Rate من 38.9% | Round 45 |
| إزالة Daily Profit Lock | لا حد للأرباح — فقط حماية الخسائر | Round 49 |
| إزالة Asian Session Filter | المحرك يعمل 24/5 مثل Capital.com — لا توقف ليلي | Round 50 |
| Cron أسبوعي بدلاً من يومي | Sun 21:00 UTC open / Fri 21:00 UTC close | Round 50 |
| getCurrentBalance مع retry + DB fallback | يمنع قراءة $250 الخاطئة عند إعادة التشغيل | Round 51 |
| Engine لا يوقف نفسه عند risk limit | يتخطى الدورة فقط ويستمر — لا false shutdowns | Round 51 |
| Trailing Drawdown Protection (5%) | يوقف التداول إذا انخفض الرصيد 5% عن الذروة | Round 49 |
| Trailing stop عند 50%/75% | تأمين الأرباح تدريجياً | Round 28 |
| SL/TP Guard بـ 0.1% tolerance | منع رفض الأوامر من Capital.com | Round 37-38 |
| **Trading Standards V1 (وضع نشط)** | المستخدم اختار صراحة "تداول بثقة لا بكثرة" — صفقات أقل وأعلى جودة بدل 150 صفقة/أسبوعين بـ 31% win | Round 52 |
| **حصر الأدوات في 6 نخبوية** | حذف أكبر الخاسرين (NASDAQ -$106، USDJPY -$63) والمرتبطات | Round 52 |
| **minConfidence 65% كرفض صريح** | الصفقات تحت 65% تُرفض بالكامل (Conviction Filter) | Round 52 |
| Trailing stop أعنف (40%/60%) | حجز الربح أبكر — "أي ربح أفضل من نسبة" | Round 52 |

---

## 7. المشاكل المعروفة والمحلولة

| المشكلة | الحل | الجولة |
|---|---|---|
| Position sync mismatch (DB vs Capital.com) | Auto reconciliation في بداية كل cycle | Round 33 |
| SL/TP خاطئ يُحفظ في DB | حفظ finalSL/finalTP بعد التحقق | Round 32 |
| error.invalid.from في reconciliation | 23h lookback + ISO date format | Round 39 |
| SILVER يُغلق خلال فترة الراحة | Market hours guard قبل closePosition | Round 36 |
| Win rate warning يُرسل كل 15 دقيقة | DB guard يمنع التكرار | Round 31 |
| AUDUSD Ghost Position يحجب EURUSD/GBPUSD | epicToFriendly reverse-map في openInstruments | Round 43 |
| P&L=0.00 على reconciled trades | Multi-fallback name matching + sorted by date + robust regex | Round 43 |
| Client sentiment TypeError متكرر | Retry 2x بـ 2s delay + single warning on final failure | Round 43 |
| المحرك يتوقف 9 ساعات/يوم (Asian session filter) | إزالة الفلتر — المحرك يعمل طالما أي أداة مفتوحة | Round 50 |
| رصيد $250 خاطئ عند إعادة التشغيل يُوقف المحرك | retry 3x + DB fallback + sanity check < 20% peak | Round 51 |
| 403 Incapsula يوقف كل طلبات Capital.com | إعادة مصادقة تلقائية عند 403 مثل 401 | Round 51 |
| NASDAQ لا يزال يُتداول رغم "حذفه" في التوثيق (خسارة -$106) | حذفه فعلياً من CORE_INSTRUMENTS | Round 52 |
| إغلاق سجل DB الخاطئ عند وجود صفقتين على نفس الأداة | مطابقة بـ dealId أولاً (close + trailing stop) | Round 52 |

---

## 8. بروتوكول GitHub Sync

كل تغيير في الكود يجب أن يتبع هذا المسار:

```
sandbox server → git commit → GitHub (Hamadajaber/hjcapital)
```

### الأمر السريع للـ sync:
```bash
cd /home/ubuntu/hj-capital-platform
git add -A
git commit -m "Round XX: وصف موجز للتغييرات"
git push origin main
```

### سكريبت الـ sync التلقائي:
```bash
/home/ubuntu/hj-capital-platform/scripts/git-sync.sh "وصف التغييرات"
```

---

## 9. أدوار الـ Chats داخل المشروع

| الدور | الاسم | المسؤولية |
|---|---|---|
| **Director** | HJCapital Director | القرارات الاستراتيجية، مراجعة الأداء، تحديد الأولويات |
| **Developer** | HJCapital Dev | تنفيذ الكود، إصلاح الـ bugs، إضافة الميزات |
| **Analyst** | HJCapital Analyst | تحليل نتائج التداول، اقتراح تحسينات الاستراتيجية |
| **Reviewer** | HJCapital Reviewer | مراجعة الكود، اختبار الميزات، التحقق من الجودة |

> **قاعدة ذهبية:** كل chat يبدأ بقراءة هذا الملف (DIRECTOR_CONTEXT.md) أولاً.

---

## 10. الخطوات القادمة (Next Steps)

> يُحدّث هذا القسم في نهاية كل جلسة عمل.

### أولوية عالية
- [x] مراقبة أداء المحرك — المحرك يعمل في LIVE mode
- [x] Trailing Drawdown Protection (5% من peak) — مفعّل الآن (Round 49)
- [x] نشر المنصة على hjcapital.vip — المنصة منشورة ✅
- [x] تحليل نتائج الصفقات بعد أسبوع — تم (تقرير Round 51 الأسبوعي)
- [x] تطبيق توصيات التقرير الأسبوعي — **تجاوزناها بـ Trading Standards V1 (Round 52): confidence 65%، حد خسارة 1.5% (~$30)**
- [x] تحسين USDJPY — **تم حذف USDJPY بالكامل (أكبر خاسر ثانٍ) في Round 52**
- [ ] **مراقبة أداء Round 52 لمدة أسبوع** (هل ارتفع Win Rate وانخفض عدد الصفقات؟) — فتح chat كـ HJCapital Analyst
- [ ] **تقرير أداء احترافي:** Profit Factor + Sharpe Ratio + Max Drawdown + Equity Curve (مستوحى من تحليل copyalgo)

### أولوية متوسطة
- [x] إضافة Telegram alert للصفقات المعادلة (Round 44)
- [x] لوحة تحكم للـ Risk Management — تم تحسينها (Round 46)
- [ ] إضافة backtesting حقيقي بدلاً من الـ simulation الحالي

### أولوية منخفضة
- [ ] دعم أدوات إضافية (Crypto pairs)
- [ ] واجهة Mobile-friendly محسّنة

---

## 11. حالة إدارة المخاطر (Round 49)

| المعامل | القيمة | الوصف |
|---|---|---|
| dailyLossLimitPct | **1.5% (Round 52)** | يوقف فتح صفقات جديدة إذا تجاوزت خسارة اليوم ~$30 |
| trailingDrawdownPct | 5% | يوقف التداول إذا انخفض الرصيد 5% عن أعلى قيمة له |
| peakBalance | $2,000 | تم تحديثه بعد الإيداع الجديد — يتحدث تلقائياً عند كل ارتفاع جديد |
| stopLossPerTrade | 1% | كل صفقة لها stop loss بـ 1% من رأس المال |
| maxRiskPerTrade | 1% | الحد الأقصى للمخاطرة في صفقة واحدة |
| minConfidenceThreshold | **65% (Round 52)** | الحد الأدنى لثقة الـ AI — أقل منه = رفض صريح |
| maxOpenPositions | 3 | الحد الأقصى لعدد الصفقات المفتوحة في نفس الوقت |
| maxPositionSize | **1 unit (Round 52)** | الحد الأقصى لحجم الصفقة (خُفّض 2→1) |
| cooldownAfterLoss | **120 دقيقة (Round 52)** | حظر الأداة بعد صفقة خاسرة (رُفع 60→120) |

---

## 12. معلومات تقنية مهمة

### متغيرات البيئة المهمة
```
CAPITAL_COM_API_KEY    ← مفتاح Capital.com API
CAPITAL_COM_EMAIL      ← بريد الحساب
CAPITAL_COM_PASSWORD   ← كلمة المرور
TELEGRAM_BOT_TOKEN     ← بوت التيليجرام للإشعارات
TELEGRAM_CHAT_ID       ← معرف المحادثة
DATABASE_URL           ← TiDB Cloud connection string
```

### أوامر مهمة
```bash
# تشغيل الـ tests
pnpm test

# تحديث قاعدة البيانات
pnpm db:push

# بدء الـ dev server
pnpm dev

# رفع التغييرات لـ GitHub
./scripts/git-sync.sh "وصف التغيير"
```

---

## 13. سجل التحديثات

| التاريخ | التحديث | بواسطة |
|---|---|---|
| 2026-06-19 | إنشاء الملف الأولي — Round 41 مكتمل | Manus AI |
| 2026-06-19 | Round 42: نظام العمل متعدد الـ Chats + GitHub sync | Manus AI |
| 2026-06-20 | Round 43: 3 bug fixes (epic mapping، reconciliation P&L، sentiment retry) | Manus AI |
| 2026-06-20 | Round 44: Telegram reconciliation alert + تحديث DIRECTOR_CONTEXT | Manus AI |
| 2026-06-24 | Round 45: Hard size cap (max 2 units), 60-min cooldown, confidence 55% | Manus AI |
| 2026-06-24 | Round 46: Daily Drawdown Chart, Per-Instrument Bar Chart, Weekly Report | Manus AI |
| 2026-06-24 | Round 47: dealId tracking, balance sync, Dashboard live balance | Manus AI |
| 2026-06-24 | Round 48: initialBalance=$1000, /positions Telegram command, webhook auto-register | Manus AI |
| 2026-06-25 | Round 49: Trailing Drawdown Protection (5%), remove Daily Profit Lock, RiskSettings UI update | Manus AI |
| 2026-06-25 | إيداع $1,000 جديد — initialBalance و peakBalance تم تحديثهما إلى $2,000 | Manus AI |
| 2026-06-26 | Round 50: إزالة Asian Session Filter، Cron أسبوعي 24/5، AutoTrade UI محدَّث | Manus AI |
| 2026-06-26 | Round 51: 6 إصلاحات استقرار المحرك — false risk triggers، 403 Incapsula، peakBalance sync | Manus AI |
| 2026-06-30 | تقرير الأداء الأسبوعي (14-26 يونيو): 150 صفقة، Win Rate 31.3%، P&L -$307.67، أبرز الدروس: NASDAQ/OIL_CRUDE يجب إزالتهما | Manus AI |
| 2026-06-30 | تحديث DIRECTOR_CONTEXT.md بجولات 50-51 والتقرير الأسبوعي | Manus AI |
| 2026-07-01 | **Round 52 — Trading Standards V1 (وضع نشط):** تقليص الأدوات 10→6، confidence 65%، dailyLoss 1.5%، size cap 1، trailing 40%/60%، cooldown 120د، إصلاح ثغرتي الإغلاق والـ trailing stop بـ dealId | Manus AI |

---

> **تذكير:** بعد كل جلسة عمل، قم بتحديث قسم "الخطوات القادمة" وإضافة سطر في "سجل التحديثات".
