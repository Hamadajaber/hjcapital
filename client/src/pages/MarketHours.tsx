import { Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";

interface InstrumentSchedule {
  name: string;
  epic: string;
  category: string;
  monThu: string;
  fri: string;
  sun: string;
  dailyBreak: string;
  isOpen: () => boolean;
}

function getUTCMinutes(): number {
  const now = new Date();
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

function getUTCDay(): number {
  return new Date().getUTCDay();
}

function checkOpen(schedule: InstrumentSchedule): boolean {
  return schedule.isOpen();
}

const INSTRUMENTS: InstrumentSchedule[] = [
  {
    name: "EUR/USD",
    epic: "EURUSD",
    category: "Forex",
    monThu: "00:00–20:59, 21:05–24:00",
    fri: "00:00–20:59",
    sun: "21:00–24:00",
    dailyBreak: "21:00–21:05 UTC",
    isOpen: () => {
      const day = getUTCDay();
      const t = getUTCMinutes();
      if (day === 6) return false;
      if (day === 0) return t >= 21 * 60;
      if (day === 5) return t < 21 * 60;
      if (t >= 21 * 60 && t < 21 * 60 + 5) return false;
      return true;
    },
  },
  {
    name: "GBP/USD",
    epic: "GBPUSD",
    category: "Forex",
    monThu: "00:00–20:59, 21:05–24:00",
    fri: "00:00–20:59",
    sun: "21:00–24:00",
    dailyBreak: "21:00–21:05 UTC",
    isOpen: () => {
      const day = getUTCDay();
      const t = getUTCMinutes();
      if (day === 6) return false;
      if (day === 0) return t >= 21 * 60;
      if (day === 5) return t < 21 * 60;
      if (t >= 21 * 60 && t < 21 * 60 + 5) return false;
      return true;
    },
  },
  {
    name: "USD/JPY",
    epic: "USDJPY",
    category: "Forex",
    monThu: "00:00–20:59, 21:05–24:00",
    fri: "00:00–20:59",
    sun: "21:00–24:00",
    dailyBreak: "21:00–21:05 UTC",
    isOpen: () => {
      const day = getUTCDay();
      const t = getUTCMinutes();
      if (day === 6) return false;
      if (day === 0) return t >= 21 * 60;
      if (day === 5) return t < 21 * 60;
      if (t >= 21 * 60 && t < 21 * 60 + 5) return false;
      return true;
    },
  },
  {
    name: "EUR/GBP",
    epic: "EURGBP",
    category: "Forex",
    monThu: "00:00–20:59, 21:05–24:00",
    fri: "00:00–20:59",
    sun: "21:00–24:00",
    dailyBreak: "21:00–21:05 UTC",
    isOpen: () => {
      const day = getUTCDay();
      const t = getUTCMinutes();
      if (day === 6) return false;
      if (day === 0) return t >= 21 * 60;
      if (day === 5) return t < 21 * 60;
      if (t >= 21 * 60 && t < 21 * 60 + 5) return false;
      return true;
    },
  },
  {
    name: "AUD/USD",
    epic: "AUDUSD",
    category: "Forex",
    monThu: "00:00–20:59, 21:05–24:00",
    fri: "00:00–20:59",
    sun: "21:00–24:00",
    dailyBreak: "21:00–21:05 UTC",
    isOpen: () => {
      const day = getUTCDay();
      const t = getUTCMinutes();
      if (day === 6) return false;
      if (day === 0) return t >= 21 * 60;
      if (day === 5) return t < 21 * 60;
      if (t >= 21 * 60 && t < 21 * 60 + 5) return false;
      return true;
    },
  },
  {
    name: "Gold",
    epic: "GOLD",
    category: "Metals",
    monThu: "00:00–20:59, 22:00–24:00",
    fri: "00:00–17:00",
    sun: "22:00–24:00",
    dailyBreak: "21:00–22:00 UTC",
    isOpen: () => {
      const day = getUTCDay();
      const t = getUTCMinutes();
      if (day === 6) return false;
      if (day === 0) return t >= 22 * 60;
      if (day === 5) return t < 17 * 60;
      if (t >= 21 * 60 && t < 22 * 60) return false;
      return true;
    },
  },
  {
    name: "Silver",
    epic: "XAGUSD",
    category: "Metals",
    monThu: "00:00–20:59, 22:00–24:00",
    fri: "00:00–17:00",
    sun: "22:00–24:00",
    dailyBreak: "21:00–22:00 UTC",
    isOpen: () => {
      const day = getUTCDay();
      const t = getUTCMinutes();
      if (day === 6) return false;
      if (day === 0) return t >= 22 * 60;
      if (day === 5) return t < 17 * 60;
      if (t >= 21 * 60 && t < 22 * 60) return false;
      return true;
    },
  },
  {
    name: "US Crude Oil",
    epic: "OIL_CRUDE",
    category: "Commodities",
    monThu: "00:00–22:00",
    fri: "00:00–22:00",
    sun: "23:00–24:00",
    dailyBreak: "22:00–23:00 UTC",
    isOpen: () => {
      const day = getUTCDay();
      const t = getUTCMinutes();
      if (day === 6) return false;
      if (day === 0) return t >= 23 * 60;
      if (t >= 22 * 60 && t < 23 * 60) return false;
      return true;
    },
  },
  {
    name: "US 500 (S&P 500)",
    epic: "US500",
    category: "Indices",
    monThu: "00:00–20:59, 22:00–24:00",
    fri: "00:00–21:00",
    sun: "22:00–24:00",
    dailyBreak: "21:00–22:00 UTC",
    isOpen: () => {
      const day = getUTCDay();
      const t = getUTCMinutes();
      if (day === 6) return false;
      if (day === 0) return t >= 22 * 60;
      if (day === 5) return t < 21 * 60;
      if (t >= 21 * 60 && t < 22 * 60) return false;
      return true;
    },
  },
  {
    name: "Germany 40 (DAX)",
    epic: "GER40",
    category: "Indices",
    monThu: "00:00–20:59, 22:00–24:00",
    fri: "00:00–21:00",
    sun: "22:00–24:00",
    dailyBreak: "21:00–22:00 UTC",
    isOpen: () => {
      const day = getUTCDay();
      const t = getUTCMinutes();
      if (day === 6) return false;
      if (day === 0) return t >= 22 * 60;
      if (day === 5) return t < 21 * 60;
      if (t >= 21 * 60 && t < 22 * 60) return false;
      return true;
    },
  },
  {
    name: "Ethereum",
    epic: "ETHUSD",
    category: "Crypto",
    monThu: "24/7",
    fri: "24/7",
    sun: "24/7",
    dailyBreak: "None",
    isOpen: () => true,
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  Forex: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Metals: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  Commodities: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Indices: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Crypto: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

function UTCClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const day = dayNames[time.getUTCDay()];
  const hh = String(time.getUTCHours()).padStart(2, "0");
  const mm = String(time.getUTCMinutes()).padStart(2, "0");
  const ss = String(time.getUTCSeconds()).padStart(2, "0");

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Clock className="h-4 w-4" />
      <span>Current UTC Time: <strong className="text-foreground">{day} {hh}:{mm}:{ss}</strong></span>
    </div>
  );
}

export default function MarketHours() {
  const [, forceUpdate] = useState(0);

  // Refresh every minute to update open/closed status
  useEffect(() => {
    const id = setInterval(() => forceUpdate((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const openCount = INSTRUMENTS.filter((i) => checkOpen(i)).length;
  const categories = [...new Set(INSTRUMENTS.map((i) => i.category))];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Market Trading Hours</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Official Capital.com schedules — all times UTC
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <UTCClock />
          <span className="text-xs text-muted-foreground">
            {openCount} of {INSTRUMENTS.length} markets open
          </span>
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {categories.map((cat) => {
          const catInstruments = INSTRUMENTS.filter((i) => i.category === cat);
          const openInCat = catInstruments.filter((i) => checkOpen(i)).length;
          return (
            <Card key={cat} className="p-3">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[cat]}`}>
                  {cat}
                </span>
                <span className="text-sm font-bold">
                  {openInCat}/{catInstruments.length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {openInCat === catInstruments.length ? "All open" : openInCat === 0 ? "All closed" : `${openInCat} open`}
              </p>
            </Card>
          );
        })}
      </div>

      {/* Instruments table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Instrument Schedule</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Instrument</th>
                  <th className="text-left p-3 font-medium text-muted-foreground hidden sm:table-cell">Category</th>
                  <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Mon–Thu (UTC)</th>
                  <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Fri Close</th>
                  <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">Sun Open</th>
                  <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">Daily Break</th>
                </tr>
              </thead>
              <tbody>
                {INSTRUMENTS.map((inst, idx) => {
                  const open = checkOpen(inst);
                  const isBreak = !open && getUTCDay() >= 1 && getUTCDay() <= 5;
                  return (
                    <tr
                      key={inst.epic}
                      className={`border-b last:border-0 transition-colors ${idx % 2 === 0 ? "bg-background" : "bg-muted/10"} hover:bg-muted/20`}
                    >
                      <td className="p-3">
                        {open ? (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                            <span className="text-emerald-500 font-medium text-xs">Open</span>
                          </div>
                        ) : isBreak ? (
                          <div className="flex items-center gap-1.5">
                            <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />
                            <span className="text-yellow-500 font-medium text-xs">Break</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground font-medium text-xs">Closed</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="font-medium">{inst.name}</div>
                        <div className="text-xs text-muted-foreground">{inst.epic}</div>
                      </td>
                      <td className="p-3 hidden sm:table-cell">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[inst.category]}`}>
                          {inst.category}
                        </span>
                      </td>
                      <td className="p-3 hidden md:table-cell text-xs font-mono">{inst.monThu}</td>
                      <td className="p-3 hidden md:table-cell text-xs font-mono">{inst.fri}</td>
                      <td className="p-3 hidden lg:table-cell text-xs font-mono">{inst.sun}</td>
                      <td className="p-3 hidden lg:table-cell">
                        {inst.dailyBreak === "None" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <span className="text-xs font-mono text-yellow-600 dark:text-yellow-400">{inst.dailyBreak}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card className="bg-muted/20 border-dashed">
        <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
          <p><strong className="text-foreground">Source:</strong> Capital.com official instrument pages — verified Jun 2026.</p>
          <p><strong className="text-foreground">Auto Trade Engine:</strong> The engine automatically skips instruments during closed/break periods. No manual intervention needed.</p>
          <p><strong className="text-foreground">Saturday:</strong> All markets are closed. The engine pauses completely.</p>
          <p><strong className="text-foreground">Crypto:</strong> ETHUSD trades 24/7 with no breaks or closures.</p>
        </CardContent>
      </Card>
    </div>
  );
}
