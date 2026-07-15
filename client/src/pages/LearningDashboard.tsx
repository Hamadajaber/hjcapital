/**
 * Self-Learning Dashboard — HJ Capital Platform
 *
 * Shows the AI's accumulated knowledge:
 * - Instrument performance scores (updated after every trade)
 * - Strategy adjustment history (auto-changes made by weekly meta-analysis)
 * - Trade lessons (what the AI learned from each closed trade)
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  BarChart3,
  BookOpen,
  Settings2,
  RefreshCw,
  Trophy,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Lightbulb,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

// ─── Score Badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
    score >= 50 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
    "bg-red-500/20 text-red-400 border-red-500/30";

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${color}`}>
      {score}
    </span>
  );
}

// ─── Instrument Card ──────────────────────────────────────────────────────────

interface InstrumentScore {
  instrument: string;
  wins: number;
  losses: number;
  totalTrades: number;
  totalPnl: number;
  avgPnl: number;
  winRate: number;
  score: number;
  aiAnalysis: string | null;
  recommendedConfidence: number | null;
  isEnabled: boolean;
  lastTradeAt: Date | null;
  updatedAt: Date;
}

function InstrumentCard({
  score,
  onToggle,
}: {
  score: InstrumentScore;
  onToggle: (instrument: string, enabled: boolean) => void;
}) {
  const isProfit = score.totalPnl >= 0;
  const winRateColor =
    score.winRate >= 60 ? "text-emerald-400" :
    score.winRate >= 40 ? "text-amber-400" :
    "text-red-400";

  return (
    <Card className="bg-slate-900/60 border-slate-700/50 hover:border-slate-600/50 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold text-white">{score.instrument}</CardTitle>
              <p className="text-xs text-slate-400">{score.totalTrades} صفقة</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ScoreBadge score={score.score} />
            <Switch
              checked={score.isEnabled}
              onCheckedChange={(checked) => onToggle(score.instrument, checked)}
              className="scale-75"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 rounded-lg bg-slate-800/50">
            <p className={`text-sm font-bold ${winRateColor}`}>{score.winRate.toFixed(1)}%</p>
            <p className="text-xs text-slate-500">نسبة الفوز</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-slate-800/50">
            <p className={`text-sm font-bold ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
              {isProfit ? "+" : ""}${score.totalPnl.toFixed(2)}
            </p>
            <p className="text-xs text-slate-500">إجمالي</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-slate-800/50">
            <p className={`text-sm font-bold ${score.avgPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {score.avgPnl >= 0 ? "+" : ""}${score.avgPnl.toFixed(2)}
            </p>
            <p className="text-xs text-slate-500">متوسط</p>
          </div>
        </div>

        {/* Win/Loss Bar */}
        {score.totalTrades > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> {score.wins} فوز
              </span>
              <span className="flex items-center gap-1">
                {score.losses} خسارة <XCircle className="w-3 h-3 text-red-400" />
              </span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${score.winRate}%` }}
              />
            </div>
          </div>
        )}

        {/* AI Analysis */}
        {score.aiAnalysis && (
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <p className="text-xs text-blue-300 leading-relaxed">{score.aiAnalysis}</p>
          </div>
        )}

        {/* Recommended Confidence */}
        {score.recommendedConfidence && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Zap className="w-3 h-3 text-amber-400" />
            <span>الحد الأدنى الموصى: <span className="text-amber-400 font-bold">{score.recommendedConfidence}%</span></span>
          </div>
        )}

        {!score.isEnabled && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
            <p className="text-xs text-red-300">معطّل — أداء ضعيف</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Adjustment Row ───────────────────────────────────────────────────────────

interface StrategyAdjustment {
  id: number;
  adjustmentType: string;
  oldValue: string | null;
  newValue: string | null;
  reasoning: string;
  tradesAnalyzed: number;
  lessonsRead: number;
  source: string;
  createdAt: Date;
}

function AdjustmentRow({ adj }: { adj: StrategyAdjustment }) {
  const typeLabels: Record<string, string> = {
    confidence_threshold: "حد الثقة",
    daily_loss_limit: "حد الخسارة اليومية",
    disable_instrument: "تعطيل أداة",
    enable_instrument: "تفعيل أداة",
  };

  const typeColors: Record<string, string> = {
    confidence_threshold: "bg-blue-500/20 text-blue-400",
    daily_loss_limit: "bg-amber-500/20 text-amber-400",
    disable_instrument: "bg-red-500/20 text-red-400",
    enable_instrument: "bg-emerald-500/20 text-emerald-400",
  };

  const label = typeLabels[adj.adjustmentType] ?? adj.adjustmentType;
  const colorClass = typeColors[adj.adjustmentType] ?? "bg-slate-500/20 text-slate-400";

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/30">
      <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
        <Settings2 className="w-4 h-4 text-purple-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge className={`text-xs ${colorClass} border-0`}>{label}</Badge>
          {adj.oldValue && adj.newValue && (
            <span className="text-xs text-slate-400">
              {adj.oldValue} → <span className="text-white font-medium">{adj.newValue}</span>
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 leading-relaxed mb-1">{adj.reasoning}</p>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{adj.tradesAnalyzed} صفقة محللة</span>
          <span>•</span>
          <span>{adj.lessonsRead} درس مقروء</span>
          <span>•</span>
          <span>{new Date(adj.createdAt).toLocaleDateString("ar-EG")}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Lesson Row ───────────────────────────────────────────────────────────────

interface TradeLesson {
  id: number;
  tradeId: number | null;
  instrument: string;
  direction: string;
  entryPrice: string | null;
  exitPrice: string | null;
  pnl: string | null;
  wasCorrect: boolean;
  aiVerdict: string | null;
  lessonText: string;
  marketConditions: string | null;
  mode: string | null;
  createdAt: Date;
}

function LessonRow({ lesson }: { lesson: TradeLesson }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${
      lesson.wasCorrect
        ? "bg-emerald-500/5 border-emerald-500/20"
        : "bg-red-500/5 border-red-500/20"
    }`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
        lesson.wasCorrect ? "bg-emerald-500/20" : "bg-red-500/20"
      }`}>
        {lesson.wasCorrect
          ? <TrendingUp className="w-4 h-4 text-emerald-400" />
          : <TrendingDown className="w-4 h-4 text-red-400" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold text-white">{lesson.instrument}</span>
          <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">
            {lesson.direction}
          </Badge>
          {lesson.pnl && (
            <span className={`text-xs font-bold ${parseFloat(lesson.pnl) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {parseFloat(lesson.pnl) >= 0 ? "+" : ""}${parseFloat(lesson.pnl).toFixed(2)}
            </span>
          )}
        </div>
        {lesson.aiVerdict && (
          <p className="text-xs text-slate-300 mb-1 italic">"{lesson.aiVerdict}"</p>
        )}
        <div className="flex items-start gap-1.5">
          <Lightbulb className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-400 leading-relaxed">{lesson.lessonText}</p>
        </div>
        <p className="text-xs text-slate-600 mt-1">
          {new Date(lesson.createdAt).toLocaleString("ar-EG")}
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LearningDashboard() {
  const [selectedInstrument, setSelectedInstrument] = useState<string | undefined>(undefined);

  const { data: scores, isLoading: scoresLoading, refetch: refetchScores } =
    trpc.learning.instrumentScores.useQuery();

  const { data: adjustments, isLoading: adjustmentsLoading } =
    trpc.learning.adjustments.useQuery({ limit: 30 });

  const { data: lessons, isLoading: lessonsLoading } =
    trpc.learning.lessons.useQuery({ instrument: selectedInstrument, limit: 50 });

  const toggleMutation = trpc.learning.toggleInstrument.useMutation({
    onSuccess: () => {
      refetchScores();
      toast.success("تم تحديث حالة الأداة");
    },
    onError: (err) => toast.error(`خطأ: ${err.message}`),
  });

  const metaMutation = trpc.learning.triggerMetaAnalysis.useMutation({
    onSuccess: () => toast.success("بدأ التحليل الأسبوعي في الخلفية — ستصل النتائج عبر Telegram"),
    onError: (err) => toast.error(`خطأ: ${err.message}`),
  });

  const totalTrades = scores?.reduce((s, p) => s + p.totalTrades, 0) ?? 0;
  const totalPnl = scores?.reduce((s, p) => s + p.totalPnl, 0) ?? 0;
  const avgWinRate = scores && scores.length > 0
    ? scores.reduce((s, p) => s + p.winRate, 0) / scores.length
    : 0;
  const enabledCount = scores?.filter((s) => s.isEnabled).length ?? 0;

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Brain className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">محرك التعلم الذاتي</h1>
            <p className="text-sm text-slate-400">المنصة تتعلم من كل صفقة وتطور استراتيجيتها تلقائياً</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => metaMutation.mutate()}
          disabled={metaMutation.isPending}
          className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
        >
          {metaMutation.isPending ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Brain className="w-4 h-4 mr-2" />
          )}
          تشغيل التحليل الأسبوعي
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/60 border-slate-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-slate-400">إجمالي الصفقات</span>
            </div>
            <p className="text-2xl font-bold text-white">{totalTrades}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/60 border-slate-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-slate-400">إجمالي الربح</span>
            </div>
            <p className={`text-2xl font-bold ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/60 border-slate-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-slate-400">متوسط نسبة الفوز</span>
            </div>
            <p className={`text-2xl font-bold ${avgWinRate >= 50 ? "text-emerald-400" : "text-amber-400"}`}>
              {avgWinRate.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/60 border-slate-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-slate-400">أدوات مفعّلة</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {enabledCount}/{scores?.length ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* How it works banner */}
      <Card className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border-purple-500/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Brain className="w-5 h-5 text-purple-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-white mb-1">كيف يعمل محرك التعلم الذاتي؟</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                بعد كل صفقة تُغلق، يُحلل الذكاء الاصطناعي النتيجة ويستخرج درساً محدداً، ثم يُحدّث درجة الأداء لكل أداة.
                كل جمعة، يُجري تحليلاً شاملاً لكل الدروس المتراكمة ويُعدّل تلقائياً حد الثقة، حد الخسارة اليومية،
                ويُعطّل الأدوات ذات الأداء الضعيف. <span className="text-purple-300 font-medium">المنصة تتطور مع كل صفقة.</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="scores">
        <TabsList className="bg-slate-800/50 border border-slate-700/50">
          <TabsTrigger value="scores" className="text-xs">
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
            أداء الأدوات
          </TabsTrigger>
          <TabsTrigger value="lessons" className="text-xs">
            <BookOpen className="w-3.5 h-3.5 mr-1.5" />
            الدروس المستفادة
          </TabsTrigger>
          <TabsTrigger value="adjustments" className="text-xs">
            <Settings2 className="w-3.5 h-3.5 mr-1.5" />
            التعديلات التلقائية
          </TabsTrigger>
        </TabsList>

        {/* Instrument Scores Tab */}
        <TabsContent value="scores" className="mt-4">
          {scoresLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-48 bg-slate-800/50" />
              ))}
            </div>
          ) : !scores || scores.length === 0 ? (
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardContent className="p-8 text-center">
                <Brain className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">لا توجد بيانات أداء بعد.</p>
                <p className="text-slate-500 text-xs mt-1">ستظهر البيانات بعد إغلاق أول صفقة.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scores.map((score) => (
                <InstrumentCard
                  key={score.instrument}
                  score={score}
                  onToggle={(instrument, enabled) =>
                    toggleMutation.mutate({ instrument, enabled })
                  }
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Lessons Tab */}
        <TabsContent value="lessons" className="mt-4">
          <div className="space-y-4">
            {/* Instrument Filter */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedInstrument === undefined ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedInstrument(undefined)}
                className="text-xs h-7"
              >
                الكل
              </Button>
              {scores?.map((s) => (
                <Button
                  key={s.instrument}
                  variant={selectedInstrument === s.instrument ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedInstrument(s.instrument)}
                  className="text-xs h-7"
                >
                  {s.instrument}
                </Button>
              ))}
            </div>

            {lessonsLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 bg-slate-800/50" />
                ))}
              </div>
            ) : !lessons || lessons.length === 0 ? (
              <Card className="bg-slate-900/60 border-slate-700/50">
                <CardContent className="p-8 text-center">
                  <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">لا توجد دروس بعد.</p>
                  <p className="text-slate-500 text-xs mt-1">ستُسجَّل الدروس بعد إغلاق أول صفقة.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {(lessons as TradeLesson[]).map((lesson) => (
                  <LessonRow key={lesson.id} lesson={lesson} />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Adjustments Tab */}
        <TabsContent value="adjustments" className="mt-4">
          {adjustmentsLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 bg-slate-800/50" />
              ))}
            </div>
          ) : !adjustments || adjustments.length === 0 ? (
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardContent className="p-8 text-center">
                <Settings2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">لا توجد تعديلات تلقائية بعد.</p>
                <p className="text-slate-500 text-xs mt-1">
                  سيُجري الذكاء الاصطناعي أول تعديل بعد تراكم عدد كافٍ من الصفقات.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {(adjustments as StrategyAdjustment[]).map((adj) => (
                <AdjustmentRow key={adj.id} adj={adj} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
