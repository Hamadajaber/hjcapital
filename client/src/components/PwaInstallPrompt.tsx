import { useState, useEffect } from "react";
import { Download, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }

    // Check if dismissed recently
    const dismissed = localStorage.getItem("pwa-prompt-dismissed");
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    // Detect iOS
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);

    if (ios) {
      // Show iOS guide after 3 seconds
      setTimeout(() => setShowPrompt(true), 3000);
      return;
    }

    // Android/Desktop: listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShowPrompt(true), 2000);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setShowPrompt(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowIOSGuide(false);
    localStorage.setItem("pwa-prompt-dismissed", Date.now().toString());
  };

  if (installed || !showPrompt) return null;

  return (
    <>
      {/* Install Banner */}
      <div
        className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300"
        style={{ maxWidth: 420, margin: "0 auto" }}
      >
        <div className="bg-slate-800 border border-amber-500/30 rounded-2xl p-4 shadow-2xl shadow-black/50">
          <div className="flex items-start gap-3">
            <img
              src="/manus-storage/hj-icon-96_7fe87ac8.png"
              alt="HJ Capital"
              className="w-12 h-12 rounded-xl flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">ثبّت HJ Capital</p>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                {isIOS
                  ? "أضف المنصة لشاشتك الرئيسية للوصول السريع"
                  : "ثبّت التطبيق على جهازك للوصول السريع بدون متصفح"}
              </p>
            </div>
            <button
              onClick={handleDismiss}
              className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0 mt-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              onClick={handleInstall}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold text-xs gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              {isIOS ? "كيفية التثبيت" : "تثبيت الآن"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              className="text-slate-400 hover:text-slate-200 text-xs"
            >
              لاحقاً
            </Button>
          </div>
        </div>
      </div>

      {/* iOS Installation Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 w-full max-w-sm animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-amber-400" />
                <h3 className="font-semibold text-white text-sm">تثبيت على iPhone / iPad</h3>
              </div>
              <button onClick={handleDismiss} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {[
                { step: "1", icon: "⬆️", text: 'اضغط على زر المشاركة في Safari' },
                { step: "2", icon: "📲", text: 'اختر "إضافة إلى الشاشة الرئيسية"' },
                { step: "3", icon: "✅", text: 'اضغط "إضافة" في الأعلى' },
              ].map(({ step, icon, text }) => (
                <div key={step} className="flex items-center gap-3 bg-slate-700/50 rounded-xl p-3">
                  <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-xs flex-shrink-0">
                    {step}
                  </div>
                  <span className="text-lg">{icon}</span>
                  <p className="text-sm text-slate-200">{text}</p>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-500 text-center mt-4">
              بعد التثبيت ستجد أيقونة HJ Capital على شاشتك الرئيسية
            </p>

            <Button
              onClick={handleDismiss}
              className="w-full mt-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold text-sm"
            >
              فهمت، شكراً
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
