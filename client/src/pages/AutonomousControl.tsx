import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Shield,
  Brain,
  TrendingUp,
  TrendingDown,
  Zap,
  FileText,
  Settings2,
  Activity,
  Clock,
} from "lucide-react";

// ─── Governance Status Card ────────────────────────────────────────────────────
function GovernanceStatusCard() {
  const { data: status, isLoading, refetch } = trpc.governance.status.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const manualRecovery = trpc.governance.manualRecovery.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("تمت الاستعادة بنجاح", { description: data.message });
        refetch();
      } else {
        toast.error("فشلت الاستعادة", { description: data.message });
      }
    },
    onError: (err) => toast.error("خطأ", { description: err.message }),
  });

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="flex items-center justify-center h-48">
          <div className="flex items-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>جاري تحميل حالة الحوكمة...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="flex items-center justify-center h-48">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>تعذّر تحميل الحالة</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const healthColor =
    status.isBlocked ? "text-destructive" :
    status.drawdownPct > 5 ? "text-yellow-500" :
    "text-emerald-500";

  const healthLabel =
    status.isBlocked ? "محجوب — انهيار" :
    status.drawdownPct > 5 ? "تحذير — انخفاض" :
    "يعمل بشكل طبيعي";

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-primary" />
            حالة الحوكمة الذاتية
          </CardTitle>
          <Badge
            variant={status.isBlocked ? "destructive" : "default"}
            className={status.isBlocked ? "" : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"}
          >
            {healthLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Balance vs Peak */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-background/50 p-3 border border-border/30">
            <div className="text-xs text-muted-foreground mb-1">الرصيد الحالي</div>
            <div className="text-xl font-bold text-foreground">
              ${status.liveBalance.toFixed(2)}
            </div>
          </div>
          <div className="rounded-lg bg-background/50 p-3 border border-border/30">
            <div className="text-xs text-muted-foreground mb-1">ذروة الرصيد</div>
            <div className="text-xl font-bold text-foreground">
              ${status.peakBalance.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Drawdown bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">الانهيار من الذروة</span>
            <span className={healthColor}>
              {status.drawdownPct.toFixed(2)}% / {status.trailingPct}% حد
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                status.isBlocked ? "bg-destructive" :
                status.drawdownPct > 5 ? "bg-yellow-500" :
                "bg-emerald-500"
              }`}
              style={{ width: `${Math.min((status.drawdownPct / status.trailingPct) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Parameters */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-background/50 p-2 border border-border/30">
            <div className="text-xs text-muted-foreground">الثقة</div>
            <div className="text-sm font-semibold">{status.currentConfidence}%</div>
          </div>
          <div className="rounded-md bg-background/50 p-2 border border-border/30">
            <div className="text-xs text-muted-foreground">حد الخسارة</div>
            <div className="text-sm font-semibold">{status.currentDailyLoss}%</div>
          </div>
          <div className="rounded-md bg-background/50 p-2 border border-border/30">
            <div className="text-xs text-muted-foreground">أقصى صفقات</div>
            <div className="text-sm font-semibold">{status.maxPositions}</div>
          </div>
        </div>

        {/* Manual Recovery Button */}
        {status.isBlocked && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">المحرك محجوب — انهيار {status.drawdownPct.toFixed(1)}%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              يمكنك الانتظار حتى يتعافى المحرك تلقائياً خلال 24 ساعة، أو الاستعادة الفورية الآن.
            </p>
            <Button
              size="sm"
              variant="destructive"
              className="w-full"
              onClick={() => manualRecovery.mutate()}
              disabled={manualRecovery.isPending}
            >
              {manualRecovery.isPending ? (
                <><RefreshCw className="h-3 w-3 animate-spin mr-2" />جاري الاستعادة...</>
              ) : (
                <><Zap className="h-3 w-3 mr-2" />استعادة فورية الآن</>
              )}
            </Button>
          </div>
        )}

        {!status.isBlocked && (
          <div className="flex items-center gap-2 text-xs text-emerald-500">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>المحرك يعمل بشكل طبيعي — الحوكمة الذاتية نشطة</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Auto-Adjustments History ─────────────────────────────────────────────────
function AdjustmentsHistory() {
  const { data: adjustments, isLoading } = trpc.governance.adjustmentHistory.useQuery({ limit: 20 });

  const typeLabels: Record<string, { label: string; color: string; icon: typeof Shield }> = {
    auto_recovery: { label: "استعادة تلقائية", color: "text-blue-400", icon: RefreshCw },
    auto_risk_scaling: { label: "تعديل المخاطر", color: "text-yellow-400", icon: Settings2 },
    auto_disable_instrument: { label: "تعطيل أداة", color: "text-destructive", icon: TrendingDown },
    auto_enable_instrument: { label: "تفعيل أداة", color: "text-emerald-400", icon: TrendingUp },
    manual_recovery: { label: "استعادة يدوية", color: "text-purple-400", icon: Zap },
    auto_parameter: { label: "تعديل معامل", color: "text-primary", icon: Brain },
  };

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />
          سجل التعديلات التلقائية
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            جاري التحميل...
          </div>
        ) : !adjustments || adjustments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-muted-foreground text-sm gap-2">
            <Activity className="h-8 w-8 opacity-30" />
            <span>لا توجد تعديلات تلقائية بعد</span>
            <span className="text-xs opacity-60">ستظهر هنا بعد أول دورة تداول</span>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {adjustments.map((adj) => {
              const typeInfo = typeLabels[adj.adjustmentType] ?? { label: adj.adjustmentType, color: "text-foreground", icon: Settings2 };
              const Icon = typeInfo.icon;
              return (
                <div key={adj.id} className="rounded-lg border border-border/30 bg-background/30 p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className={`flex items-center gap-1.5 text-xs font-medium ${typeInfo.color}`}>
                      <Icon className="h-3 w-3" />
                      {typeInfo.label}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {adj.createdAt ? new Date(adj.createdAt).toLocaleDateString("ar-SA", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                      }) : "—"}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="text-foreground/60">من:</span> {adj.oldValue}
                    <span className="mx-1.5 text-primary">→</span>
                    <span className="text-foreground/60">إلى:</span> {adj.newValue}
                  </div>
                  {adj.reasoning && (
                    <div className="text-xs text-muted-foreground/70 italic leading-relaxed">
                      {adj.reasoning}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Autonomous Features Overview ─────────────────────────────────────────────
function AutonomousFeatures() {
  const monthlyReport = trpc.governance.monthlyReport.useMutation({
    onSuccess: () => toast.success("تم إرسال التقرير الشهري عبر Telegram"),
    onError: (err) => toast.error("خطأ", { description: err.message }),
  });

  const features = [
    {
      icon: RefreshCw,
      title: "الاستعادة التلقائية من الانهيار",
      description: "بعد 24 ساعة من الحجب، يُقرر الذكاء الاصطناعي إعادة ضبط ذروة الرصيد تلقائياً لاستئناف التداول.",
      status: "نشط",
      color: "text-blue-400",
    },
    {
      icon: Shield,
      title: "إصلاح الصفقات العالقة",
      description: "أي صفقة مفتوحة في قاعدة البيانات أكثر من 48 ساعة تُغلق تلقائياً لتحرير العداد.",
      status: "نشط",
      color: "text-emerald-400",
    },
    {
      icon: Settings2,
      title: "تعديل المخاطر حسب صحة الحساب",
      description: "كل 6 ساعات: وضع التعافي (رصيد < 75% من الذروة) → رفع الثقة، تقليل الحجم. وضع النمو → توسيع النشاط.",
      status: "نشط",
      color: "text-yellow-400",
    },
    {
      icon: Brain,
      title: "إدارة الأدوات تلقائياً",
      description: "أداة بنتيجة < 20 بعد 10 صفقات تُعطَّل. أداة معطلة بنتيجة > 55 تُعاد تلقائياً.",
      status: "نشط",
      color: "text-purple-400",
    },
    {
      icon: FileText,
      title: "التقرير الشهري التلقائي",
      description: "في أول كل شهر الساعة 8 صباحاً UTC، يُرسل الذكاء الاصطناعي تقريراً شاملاً عبر Telegram.",
      status: "نشط",
      color: "text-primary",
    },
    {
      icon: Activity,
      title: "حقن المعرفة في قرارات التداول",
      description: "كل قرار تداول يستفيد من 173+ درساً متراكماً وملفات الأدوات وذاكرة أنظمة السوق.",
      status: "نشط",
      color: "text-orange-400",
    },
  ];

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary" />
            الميزات الذاتية المُفعَّلة
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => monthlyReport.mutate()}
            disabled={monthlyReport.isPending}
            className="text-xs h-7"
          >
            {monthlyReport.isPending ? (
              <><RefreshCw className="h-3 w-3 animate-spin mr-1" />جاري الإرسال...</>
            ) : (
              <><FileText className="h-3 w-3 mr-1" />تقرير شهري الآن</>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-border/20 bg-background/20 p-3">
                <div className={`mt-0.5 shrink-0 ${feature.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{feature.title}</span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shrink-0">
                      {feature.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{feature.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AutonomousControl() {
  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          الحوكمة الذاتية
        </h1>
        <p className="text-sm text-muted-foreground">
          المنصة تُدير نفسها بالكامل — تتعلم، تتكيف، وتُصلح أخطاءها تلقائياً. راجعها مرة كل شهر.
        </p>
      </div>

      <Separator className="opacity-30" />

      {/* Status + Adjustments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GovernanceStatusCard />
        <AdjustmentsHistory />
      </div>

      {/* Features */}
      <AutonomousFeatures />

      {/* Philosophy */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Brain className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">فلسفة التعلم المستمر</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                كل صفقة تُغلق → الذكاء الاصطناعي يستخرج درساً ويُحدّث ملف الأداة.
                كل أسبوع → تحليل استراتيجي يقرأ كل الدروس ويُعدّل القواعد.
                كل شهر → تقرير شامل يُرسل عبر Telegram.
                كل 24 ساعة من الحجب → استعادة تلقائية ذكية.
                أنت لا تحتاج للتدخل — المنصة تتطور وحدها.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
