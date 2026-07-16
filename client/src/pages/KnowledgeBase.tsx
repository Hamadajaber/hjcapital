import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Brain,
  BookOpen,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Zap,
  RefreshCw,
  Globe,
  Target,
  Shield,
  Lightbulb,
  CheckCircle2,
  XCircle,
  Clock,
  Star,
} from "lucide-react";

// ─── Knowledge Type Config ────────────────────────────────────────────────────

const KNOWLEDGE_TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  trade_pattern: { label: "نمط تداول", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: BarChart3 },
  instrument_insight: { label: "رؤية أداة", color: "bg-purple-500/10 text-purple-400 border-purple-500/20", icon: Target },
  market_regime: { label: "نظام السوق", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", icon: Globe },
  risk_rule: { label: "قاعدة مخاطر", color: "bg-red-500/10 text-red-400 border-red-500/20", icon: Shield },
  strategy_rule: { label: "قاعدة استراتيجية", color: "bg-green-500/10 text-green-400 border-green-500/20", icon: Zap },
  event_memory: { label: "ذاكرة حدث", color: "bg-orange-500/10 text-orange-400 border-orange-500/20", icon: Clock },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color = confidence >= 75 ? "text-green-400" : confidence >= 50 ? "text-yellow-400" : "text-red-400";
  return <span className={`text-xs font-bold ${color}`}>{confidence}%</span>;
}

function KnowledgeCard({ entry }: { entry: {
  id: number;
  knowledgeType: string;
  subject: string;
  title: string;
  content: string;
  confidence: number;
  validations: number;
  contradictions: number;
  source: string;
  createdAt: Date;
} }) {
  const [expanded, setExpanded] = useState(false);
  const config = KNOWLEDGE_TYPE_CONFIG[entry.knowledgeType] ?? KNOWLEDGE_TYPE_CONFIG.trade_pattern;
  const Icon = config.icon;

  return (
    <div
      className="border border-border/40 rounded-lg p-4 bg-card/50 hover:bg-card/80 transition-all cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg border ${config.color} flex-shrink-0`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge variant="outline" className={`text-xs ${config.color}`}>
              {config.label}
            </Badge>
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {entry.subject}
            </Badge>
            <ConfidenceBadge confidence={entry.confidence} />
          </div>
          <p className="text-sm font-medium text-foreground leading-snug">{entry.title}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-green-400" />
              {entry.validations} تحقق
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="w-3 h-3 text-red-400" />
              {entry.contradictions} تناقض
            </span>
            <span>{new Date(entry.createdAt).toLocaleDateString("ar-SA")}</span>
          </div>
        </div>
        <div className="flex-shrink-0">
          <Progress value={entry.confidence} className="w-16 h-1.5" />
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border/30">
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {entry.content}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function KnowledgeBase() {
  const [selectedSubject, setSelectedSubject] = useState<string | undefined>(undefined);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = trpc.knowledge.stats.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const { data: knowledgeList, isLoading: listLoading } = trpc.knowledge.list.useQuery({
    subject: selectedSubject,
    limit: 100,
  }, { refetchInterval: 30000 });

  const { data: profiles, isLoading: profilesLoading } = trpc.knowledge.instrumentProfiles.useQuery(undefined, {
    refetchInterval: 60000,
  });

  const { data: regimeHistory } = trpc.knowledge.regimeHistory.useQuery(undefined, {
    refetchInterval: 60000,
  });

  const triggerMeta = trpc.knowledge.triggerMetaAnalysis.useMutation({
    onSuccess: () => {
      toast.success("🧠 تحليل استراتيجي بدأ", { description: "سيستغرق 1-2 دقيقة. ستصل النتائج على Telegram." });
      setTimeout(() => refetchStats(), 5000);
    },
  });

  const totalEntries = stats?.totalEntries ?? 0;
  const avgConfidence = stats?.avgConfidence ?? 0;
  const byType = stats?.byType ?? {};

  const subjects = knowledgeList
    ? [...new Set(knowledgeList.map((k) => k.subject))].sort()
    : [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-7 h-7 text-primary" />
            قاعدة المعرفة المتراكمة
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            المنصة تتعلم من كل صفقة وتتطور باستمرار — المعرفة تتراكم وتُغذّي قرارات التداول تلقائياً
          </p>
        </div>
        <Button
          onClick={() => triggerMeta.mutate()}
          disabled={triggerMeta.isPending}
          className="gap-2"
        >
          {triggerMeta.isPending ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          تحليل استراتيجي الآن
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-muted-foreground">إجمالي المعرفة</span>
            </div>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold text-blue-400">{totalEntries}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">قطعة معرفة مخزّنة</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-4 h-4 text-green-400" />
              <span className="text-xs text-muted-foreground">متوسط الثقة</span>
            </div>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold text-green-400">{avgConfidence}%</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">في المعرفة المتراكمة</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-muted-foreground">الأدوات المُحللة</span>
            </div>
            {profilesLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold text-purple-400">{profiles?.length ?? 0}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">ملف أداة عميق</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-yellow-400" />
              <span className="text-xs text-muted-foreground">أنظمة السوق</span>
            </div>
            <p className="text-3xl font-bold text-yellow-400">{regimeHistory?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">نظام سوق مسجّل</p>
          </CardContent>
        </Card>
      </div>

      {/* Knowledge Type Distribution */}
      {!statsLoading && Object.keys(byType).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              توزيع أنواع المعرفة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Object.entries(byType).map(([type, count]) => {
                const config = KNOWLEDGE_TYPE_CONFIG[type] ?? KNOWLEDGE_TYPE_CONFIG.trade_pattern;
                const Icon = config.icon;
                return (
                  <div
                    key={type}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${config.color} cursor-pointer hover:opacity-80 transition-opacity`}
                    onClick={() => setSelectedSubject(undefined)}
                  >
                    <Icon className="w-3 h-3" />
                    <span className="text-xs font-medium">{config.label}</span>
                    <Badge variant="secondary" className="text-xs h-4 px-1">{count}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs defaultValue="knowledge">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="knowledge" className="gap-1">
            <BookOpen className="w-3 h-3" />
            قاعدة المعرفة
          </TabsTrigger>
          <TabsTrigger value="profiles" className="gap-1">
            <Target className="w-3 h-3" />
            ملفات الأدوات
          </TabsTrigger>
          <TabsTrigger value="regimes" className="gap-1">
            <Globe className="w-3 h-3" />
            أنظمة السوق
          </TabsTrigger>
        </TabsList>

        {/* Knowledge Base Tab */}
        <TabsContent value="knowledge" className="mt-4 space-y-4">
          {/* Subject Filter */}
          {subjects.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={selectedSubject === undefined ? "default" : "outline"}
                onClick={() => setSelectedSubject(undefined)}
                className="h-7 text-xs"
              >
                الكل
              </Button>
              {subjects.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={selectedSubject === s ? "default" : "outline"}
                  onClick={() => setSelectedSubject(s)}
                  className="h-7 text-xs"
                >
                  {s}
                </Button>
              ))}
            </div>
          )}

          {listLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : knowledgeList && knowledgeList.length > 0 ? (
            <div className="space-y-3">
              {knowledgeList.map((entry) => (
                <KnowledgeCard key={entry.id} entry={entry} />
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Brain className="w-12 h-12 text-muted-foreground/30 mb-4" />
                <h3 className="font-semibold text-muted-foreground mb-2">قاعدة المعرفة فارغة</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  ستبدأ المعرفة بالتراكم تلقائياً بعد أول صفقة تُغلق. كل صفقة = درس جديد.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Instrument Profiles Tab */}
        <TabsContent value="profiles" className="mt-4">
          {profilesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
            </div>
          ) : profiles && profiles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {profiles.map((profile) => (
                <Card key={profile.id} className="border-border/40">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Target className="w-4 h-4 text-primary" />
                        {profile.instrument}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={
                          profile.bestDirection === "BUY"
                            ? "text-green-400 border-green-500/30"
                            : profile.bestDirection === "SELL"
                            ? "text-red-400 border-red-500/30"
                            : "text-muted-foreground"
                        }>
                          {profile.bestDirection === "BUY" ? "↑ شراء" : profile.bestDirection === "SELL" ? "↓ بيع" : "محايد"}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          v{profile.version}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-muted/30 rounded-lg p-2">
                        <p className="text-xs text-muted-foreground">الصفقات</p>
                        <p className="text-lg font-bold">{profile.lifetimeTrades}</p>
                      </div>
                      <div className={`rounded-lg p-2 ${parseFloat(profile.lifetimePnl) >= 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
                        <p className="text-xs text-muted-foreground">P&L الكلي</p>
                        <p className={`text-lg font-bold ${parseFloat(profile.lifetimePnl) >= 0 ? "text-green-400" : "text-red-400"}`}>
                          ${parseFloat(profile.lifetimePnl).toFixed(0)}
                        </p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-2">
                        <p className="text-xs text-muted-foreground">الحجم</p>
                        <p className="text-lg font-bold">{parseFloat(profile.sizeMultiplier).toFixed(1)}x</p>
                      </div>
                    </div>

                    {profile.profileSummary && (
                      <div className="bg-muted/20 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground leading-relaxed">{profile.profileSummary}</p>
                      </div>
                    )}

                    {profile.behaviorPatterns && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                          <Lightbulb className="w-3 h-3" /> أنماط السلوك
                        </p>
                        <p className="text-xs text-foreground/80">{profile.behaviorPatterns}</p>
                      </div>
                    )}

                    {profile.riskFactors && (
                      <div>
                        <p className="text-xs font-medium text-red-400 mb-1 flex items-center gap-1">
                          <Shield className="w-3 h-3" /> عوامل الخطر
                        </p>
                        <p className="text-xs text-foreground/80">{profile.riskFactors}</p>
                      </div>
                    )}

                    {profile.lastAnalyzedAt && (
                      <p className="text-xs text-muted-foreground">
                        آخر تحليل: {new Date(profile.lastAnalyzedAt).toLocaleDateString("ar-SA")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Target className="w-12 h-12 text-muted-foreground/30 mb-4" />
                <h3 className="font-semibold text-muted-foreground mb-2">لا توجد ملفات أدوات بعد</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  ستُبنى ملفات الأدوات تلقائياً بعد 3+ صفقات لكل أداة.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Market Regimes Tab */}
        <TabsContent value="regimes" className="mt-4">
          {regimeHistory && regimeHistory.length > 0 ? (
            <div className="space-y-3">
              {regimeHistory.map((regime) => (
                <Card key={regime.id} className="border-border/40">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className={
                            regime.regime.includes("up") ? "text-green-400 border-green-500/30" :
                            regime.regime.includes("down") ? "text-red-400 border-red-500/30" :
                            "text-yellow-400 border-yellow-500/30"
                          }>
                            {regime.regime.includes("up") ? <TrendingUp className="w-3 h-3 mr-1" /> :
                             regime.regime.includes("down") ? <TrendingDown className="w-3 h-3 mr-1" /> :
                             <Globe className="w-3 h-3 mr-1" />}
                            {regime.regime}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">{regime.instrument}</Badge>
                          <span className="text-xs text-muted-foreground">{regime.startDate}</span>
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-center mb-3">
                          <div>
                            <p className="text-xs text-muted-foreground">نسبة الفوز</p>
                            <p className={`font-bold ${parseFloat(regime.winRate ?? "0") >= 50 ? "text-green-400" : "text-red-400"}`}>
                              {parseFloat(regime.winRate ?? "0").toFixed(1)}%
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">P&L</p>
                            <p className={`font-bold ${parseFloat(regime.totalPnl ?? "0") >= 0 ? "text-green-400" : "text-red-400"}`}>
                              ${parseFloat(regime.totalPnl ?? "0").toFixed(0)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">الصفقات</p>
                            <p className="font-bold">{regime.totalTrades}</p>
                          </div>
                        </div>

                        {regime.keyLessons && (
                          <div className="bg-muted/20 rounded-lg p-3">
                            <p className="text-xs font-medium mb-1 flex items-center gap-1">
                              <Lightbulb className="w-3 h-3 text-yellow-400" />
                              الدروس الرئيسية
                            </p>
                            <p className="text-xs text-muted-foreground">{regime.keyLessons}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Globe className="w-12 h-12 text-muted-foreground/30 mb-4" />
                <h3 className="font-semibold text-muted-foreground mb-2">لا توجد بيانات أنظمة السوق بعد</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  ستُسجَّل أنظمة السوق تلقائياً بعد أول تحليل استراتيجي أسبوعي.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Most Validated Knowledge */}
      {stats?.mostValidated && (
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-green-400 flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">المعرفة الأكثر تحققاً</p>
                <p className="text-sm font-medium text-green-300">{stats.mostValidated}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
