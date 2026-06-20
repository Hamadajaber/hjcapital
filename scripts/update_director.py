#!/usr/bin/env python3
"""Update DIRECTOR_CONTEXT.md with Round 42/43/44 information."""
import re

path = "/home/ubuntu/hj-capital-platform/DIRECTOR_CONTEXT.md"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update checkpoint version
content = content.replace(
    "| آخر Checkpoint | `b16c8074` |",
    "| آخر Checkpoint | `6de7b7f9` |"
)

# 2. Update balance
content = content.replace(
    "| الرصيد الحي | ~$1,000 على Capital.com (live trading) |",
    "| الرصيد الحالي | ~$1,021 على Capital.com (ربح ~$21) |"
)

# 3. Add Round 42/43/44 rows to rounds log (only if not already present)
if "Round 42" not in content:
    lines = content.split("\n")
    new_lines = []
    for line in lines:
        new_lines.append(line)
        if "Round 41 |" in line and "Market-Hours Watcher" in line:
            new_lines.append("| Round 42 | نظام العمل متعدد الـ Chats: DIRECTOR_CONTEXT.md، hjcapital-workflow Skill، scripts/git-sync.sh، GitHub sync | ✅ |")
            new_lines.append("| Round 43 | 3 bug fixes: broker epic->friendly name mapping، Reconciliation P&L محسّن، Client sentiment retry logic | ✅ |")
            new_lines.append("| Round 44 | تحديث DIRECTOR_CONTEXT.md، Telegram alert للصفقات المعادلة، تأكيد EURUSD/GBPUSD غير محجوبة | ✅ |")
    content = "\n".join(new_lines)

# 4. Add new known issues/solutions (only if not already present)
if "AUDUSD Ghost Position" not in content:
    old = "| Win rate warning يُرسل كل 15 دقيقة | DB guard يمنع التكرار | Round 31 |"
    new = (old +
           "\n| AUDUSD Ghost Position يحجب EURUSD/GBPUSD | epicToFriendly reverse-map في openInstruments | Round 43 |"
           "\n| P&L=0.00 على reconciled trades | Multi-fallback name matching + sorted by date + robust regex | Round 43 |"
           "\n| Client sentiment TypeError متكرر | Retry 2x بـ 2s delay + single warning on final failure | Round 43 |")
    content = content.replace(old, new)

# 5. Add new strategic decisions (only if not already present)
if "openInstruments يستخدم friendly names" not in content:
    old = "| Market-Hours Watcher بدلاً من جدول ثابت | الأسواق تفتح/تغلق بشكل ديناميكي | Round 41 |"
    new = (old +
           "\n| openInstruments يستخدم friendly names | broker epics كانت تحجب EURUSD/GBPUSD خطأً | Round 43 |"
           "\n| Telegram alert للصفقات المعادلة | إشعار فوري عند إغلاق Capital.com لصفقة عبر SL/TP | Round 44 |")
    content = content.replace(old, new)

# 6. Update Next Steps
content = content.replace(
    "- [ ] مراقبة أداء المحرك في الأسبوع الأول من التشغيل الحي",
    "- [x] مراقبة أداء المحرك — المحرك يعمل (Cycle #18+، رصيد $1,021)"
)
content = content.replace(
    "- [ ] إضافة Telegram alerts لكل صفقة تُفتح/تُغلق (بدلاً من الإشعارات الحالية فقط)",
    "- [x] إضافة Telegram alert للصفقات المعادلة (Round 44)"
)

# 7. Update history log (only if not already present)
if "Round 42:" not in content:
    old_h = "| 2026-06-19 | إنشاء الملف الأولي — Round 41 مكتمل | Manus AI |"
    new_h = (old_h +
             "\n| 2026-06-19 | Round 42: نظام العمل متعدد الـ Chats + GitHub sync | Manus AI |"
             "\n| 2026-06-20 | Round 43: 3 bug fixes (epic mapping، reconciliation P&L، sentiment retry) | Manus AI |"
             "\n| 2026-06-20 | Round 44: Telegram reconciliation alert + تحديث DIRECTOR_CONTEXT | Manus AI |")
    content = content.replace(old_h, new_h)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("DIRECTOR_CONTEXT.md updated successfully!")
