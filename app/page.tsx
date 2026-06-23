"use client";

import { useEffect, useState } from "react";

interface Quote {
  symbol: string;
  sourceName: string;
  name: string;
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  change: number;
  changePct: number;
  volume: number;
  turnover: number;
  turnoverRate: number;
  amplitudePct: number;
  volumeRatio: number;
  limitUp: number;
  limitDown: number;
  pe: number;
  pb: number;
  marketCap: number;
  floatCap: number;
  market: string;
}

interface Analysis {
  summary: string;
  sentiment: "Bullish" | "Neutral" | "Bearish";
  risk_level: "Low" | "Medium" | "High";
  key_factors: string[];
}

interface TrendPoint {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  ma5: number;
  ma10: number;
  ma20: number;
}

interface TrendSnapshot {
  sourceName: string;
  latest: TrendPoint;
  previous: TrendPoint | null;
}

interface HistoryRecord {
  id: string;
  symbol: string;
  name: string | null;
  price: number | null;
  change_pct: number | null;
  summary: string;
  sentiment: "Bullish" | "Neutral" | "Bearish";
  risk_level: "Low" | "Medium" | "High";
  created_at: string;
}

const SENTIMENT_STYLE: Record<string, string> = {
  Bullish:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  Neutral: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200",
  Bearish: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

const RISK_STYLE: Record<string, string> = {
  Low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  Medium:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  High: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

function fmtNumber(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("zh-CN", { maximumFractionDigits: digits });
}

function fmtBig(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "-";
  if (n >= 1e12) return (n / 1e12).toFixed(2) + " 万亿";
  if (n >= 1e8) return (n / 1e8).toFixed(2) + " 亿";
  if (n >= 1e4) return (n / 1e4).toFixed(2) + " 万";
  return n.toFixed(0);
}

export default function Home() {
  const [symbol, setSymbol] = useState("600519");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [trend, setTrend] = useState<TrendSnapshot | null>(null);
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  async function fetchHistoryRecords(): Promise<HistoryRecord[]> {
    const res = await fetch("/api/history");
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "读取历史失败");
    }
    return data.records ?? [];
  }

  function messageFromError(e: unknown, fallback = "网络错误") {
    return e instanceof Error ? e.message : fallback;
  }

  async function loadHistory() {
    try {
      const records = await fetchHistoryRecords();
      setHistoryError(null);
      setHistory(records);
    } catch (e) {
      setHistoryError(messageFromError(e));
      setHistory([]);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialHistory() {
      try {
        const records = await fetchHistoryRecords();
        if (cancelled) return;
        setHistoryError(null);
        setHistory(records);
      } catch (e) {
        if (cancelled) return;
        setHistoryError(messageFromError(e));
        setHistory([]);
      }
    }

    void loadInitialHistory();

    return () => {
      cancelled = true;
    };
  }, []);

  async function onAnalyze() {
    const s = symbol.trim();
    if (!s) {
      setError("请输入股票代码");
      return;
    }
    setLoading(true);
    setError(null);
    setQuote(null);
    setAnalysis(null);
    setTrend(null);
    setSaved(false);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: s }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "分析失败");
        return;
      }
      setQuote(data.quote);
      setTrend(data.trend ?? null);
      setAnalysis(data.analysis);
      setSaved(Boolean(data.saved));
      if (data.saved) loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setLoading(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") onAnalyze();
  }

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 md:py-12">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          AI 股票分析面板
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          输入股票代码 · 实时拉取行情 · DeepSeek 给出结构化解读
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/50 backdrop-blur shadow-sm p-5">
        <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
          股票代码
        </label>
        <div className="flex gap-3 flex-col sm:flex-row">
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            onKeyDown={onKey}
            placeholder="如 600519 / 00700 / AAPL"
            className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={onAnalyze}
            disabled={loading}
            className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white font-medium shadow transition"
          >
            {loading ? "分析中…" : "开始分析"}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          A 股 6 位数字 · 港股 5 位数字 · 美股字母代码
        </p>
        {error && (
          <div className="mt-4 rounded-lg bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 p-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}
      </section>

      {quote && (
        <section className="mt-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/50 backdrop-blur shadow-sm p-5">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {quote.name}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {quote.symbol} · {quote.market} · {quote.sourceName}
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {fmtNumber(quote.price)}
              </div>
              <div
                className={`text-sm font-medium ${
                  quote.changePct >= 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {quote.change >= 0 ? "+" : ""}
                {fmtNumber(quote.change)} ({quote.changePct >= 0 ? "+" : ""}
                {fmtNumber(quote.changePct)}%)
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="开盘" value={fmtNumber(quote.open)} />
            <Stat label="昨收" value={fmtNumber(quote.prevClose)} />
            <Stat label="最高" value={fmtNumber(quote.high)} />
            <Stat label="最低" value={fmtNumber(quote.low)} />
            <Stat label="成交额" value={fmtBig(quote.turnover)} />
            <Stat
              label="换手率"
              value={
                quote.turnoverRate ? fmtNumber(quote.turnoverRate) + "%" : "-"
              }
            />
            <Stat
              label="振幅"
              value={
                quote.amplitudePct ? fmtNumber(quote.amplitudePct) + "%" : "-"
              }
            />
            <Stat
              label="量比"
              value={quote.volumeRatio ? fmtNumber(quote.volumeRatio) : "-"}
            />
            <Stat
              label="涨停"
              value={quote.limitUp ? fmtNumber(quote.limitUp) : "-"}
            />
            <Stat
              label="跌停"
              value={quote.limitDown ? fmtNumber(quote.limitDown) : "-"}
            />
            <Stat label="市盈率" value={quote.pe ? fmtNumber(quote.pe) : "-"} />
            <Stat label="市净率" value={quote.pb ? fmtNumber(quote.pb) : "-"} />
            <Stat label="总市值" value={fmtBig(quote.marketCap)} />
            <Stat label="流通市值" value={fmtBig(quote.floatCap)} />
          </div>
        </section>
      )}

      {analysis && (
        <section className="mt-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/50 backdrop-blur shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mr-2">
              AI 分析
            </h3>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${SENTIMENT_STYLE[analysis.sentiment]}`}
            >
              情绪 · {analysis.sentiment}
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${RISK_STYLE[analysis.risk_level]}`}
            >
              风险 · {analysis.risk_level}
            </span>
            {saved && (
              <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                ✓ 已存入数据库
              </span>
            )}
          </div>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
            {analysis.summary}
          </p>
          {analysis.key_factors.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                关键要点
              </div>
              <ul className="space-y-1.5">
                {analysis.key_factors.map((f, i) => (
                  <li
                    key={i}
                    className="text-sm text-slate-700 dark:text-slate-300 flex gap-2"
                  >
                    <span className="text-blue-500 dark:text-blue-400">·</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
            * AI 分析仅供学习参考，不构成投资建议
          </p>
        </section>
      )}

      {trend && (
        <section className="mt-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/50 backdrop-blur shadow-sm p-5">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                趋势快照
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {trend.sourceName} · {trend.latest.date}
              </p>
            </div>
            {trend.previous && (
              <div
                className={`text-sm font-medium ${
                  trend.latest.close >= trend.previous.close
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                较前收{" "}
                {fmtNumber(
                  ((trend.latest.close - trend.previous.close) /
                    trend.previous.close) *
                    100,
                )}
                %
              </div>
            )}
          </div>
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="收盘" value={fmtNumber(trend.latest.close)} />
            <Stat label="最高" value={fmtNumber(trend.latest.high)} />
            <Stat label="最低" value={fmtNumber(trend.latest.low)} />
            <Stat label="成交额" value={fmtBig(trend.latest.amount)} />
            <Stat
              label="MA5"
              value={trend.latest.ma5 ? fmtNumber(trend.latest.ma5) : "-"}
            />
            <Stat
              label="MA10"
              value={trend.latest.ma10 ? fmtNumber(trend.latest.ma10) : "-"}
            />
            <Stat
              label="MA20"
              value={trend.latest.ma20 ? fmtNumber(trend.latest.ma20) : "-"}
            />
            <Stat
              label="均线位置"
              value={
                trend.latest.ma20
                  ? trend.latest.close >= trend.latest.ma20
                    ? "MA20 上方"
                    : "MA20 下方"
                  : "-"
              }
            />
          </div>
        </section>
      )}

      <section className="mt-8">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">
          最近分析记录
        </h3>
        {historyError && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-700 dark:text-amber-300">
            历史记录不可用：{historyError}
          </div>
        )}
        {!historyError && history.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">暂无记录</p>
        )}
        <div className="space-y-2">
          {history.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/40 p-3 text-sm flex gap-3 items-start"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {r.name ?? r.symbol}
                  </span>
                  <span className="text-xs text-slate-500">{r.symbol}</span>
                  {r.price !== null && (
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      ¥{fmtNumber(r.price)}
                    </span>
                  )}
                  {r.change_pct !== null && (
                    <span
                      className={`text-xs ${r.change_pct >= 0 ? "text-rose-500" : "text-emerald-500"}`}
                    >
                      {r.change_pct >= 0 ? "+" : ""}
                      {fmtNumber(r.change_pct)}%
                    </span>
                  )}
                </div>
                <p className="mt-1 text-slate-600 dark:text-slate-400 line-clamp-2">
                  {r.summary}
                </p>
              </div>
              <div className="flex flex-col gap-1 items-end shrink-0">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${SENTIMENT_STYLE[r.sentiment]}`}
                >
                  {r.sentiment}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${RISK_STYLE[r.risk_level]}`}
                >
                  {r.risk_level}
                </span>
                <span className="text-[10px] text-slate-400">
                  {new Date(r.created_at).toLocaleString("zh-CN", {
                    hour12: false,
                    timeZone: "Asia/Shanghai",
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-12 pt-6 border-t border-slate-200 dark:border-slate-700 text-center text-xs text-slate-500 dark:text-slate-400">
        数据来源：腾讯财经 / 东方财富 / Twelve Data / Yahoo Finance ·
        分析模型：DeepSeek · 存储：Supabase
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
        {value}
      </div>
    </div>
  );
}
