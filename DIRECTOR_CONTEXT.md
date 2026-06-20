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
| الرصيد الحالي | ~$1,021 على Capital.com (ربح ~$21) |
| الموقع | https://hjcapital.vip |
| GitHub | https://github.com/Hamadajaber/hjcapital (private) |
| مسار المشروع | `/home/ubuntu/hj-capital-platform` |
| آخر Checkpoint | `6de7b7f9` |

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
- الحد الأدنى للدخول: 45% confidence (dynamic threshold)
- إذا كان Win Rate < 50% → threshold يرتفع تلقائياً

### إدارة المخاطر
| المعامل | القيمة |
|---|---|
| maxRiskPerTrade | 1% |
| maxOpenPositions | 3 |
| dailyLossLimit | 25% |
| Trailing Stop | عند 50% target → breakeven، عند 75% target → +25% profit lock |
| SL/TP Guard | 0.1% tolerance — يمنع أي صفقة بـ SL/TP خاطئ |

### الأدوات المتداولة (CORE_INSTRUMENTS)
`EURUSD, GBPUSD, GOLD, US500, GER40, XAGUSD, USDJPY, ETHUSD, AUDUSD`

> **محذوفة:** NASDAQ و OIL_CRUDE (خسارة -$103 لكل منهما)

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
| Round 42 | نظام العمل متعدد الـ Chats: DIRECTOR_CONTEXT.md، hjcapital-workflow Skill، scripts/git-sync.sh، GitHub sync | ✅ |
| Round 43 | 3 bug fixes: broker epic->friendly name mapping، Reconciliation P&L محسّن، Client sentiment retry logic | ✅ |
| Round 44 | تحديث DIRECTOR_CONTEXT.md، Telegram alert للصفقات المعادلة، تأكيد EURUSD/GBPUSD غير محجوبة | ✅ |
| Trailing stop عند 50%/75% | تأمين الأرباح تدريجياً | Round 28 |
| SL/TP Guard بـ 0.1% tolerance | منع رفض الأوامر من Capital.com | Round 37-38 |

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
- [x] مراقبة أداء المحرك — المحرك يعمل (Cycle #18+، رصيد $1,021)
- [ ] تحليل نتائج الصفقات الأولى وتعديل الاستراتيجية إذا لزم

### أولوية متوسطة
- [x] إضافة Telegram alert للصفقات المعادلة (Round 44)
- [ ] لوحة تحكم للـ Risk Management (رسم بياني للـ drawdown)
- [ ] إضافة backtesting حقيقي بدلاً من الـ simulation الحالي

### أولوية منخفضة
- [ ] دعم أدوات إضافية (Crypto pairs)
- [ ] واجهة Mobile-friendly محسّنة

---

## 11. معلومات تقنية مهمة

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

## 12. سجل التحديثات

| التاريخ | التحديث | بواسطة |
|---|---|---|
| 2026-06-19 | إنشاء الملف الأولي — Round 41 مكتمل | Manus AI |
| 2026-06-19 | Round 42: نظام العمل متعدد الـ Chats + GitHub sync | Manus AI |
| 2026-06-20 | Round 43: 3 bug fixes (epic mapping، reconciliation P&L، sentiment retry) | Manus AI |
| 2026-06-20 | Round 44: Telegram reconciliation alert + تحديث DIRECTOR_CONTEXT | Manus AI |

---

> **تذكير:** بعد كل جلسة عمل، قم بتحديث قسم "الخطوات القادمة" وإضافة سطر في "سجل التحديثات".
