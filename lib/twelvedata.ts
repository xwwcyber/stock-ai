// 海外兜底数据源 2：Twelve Data
// 免费 800 calls/day & 8 calls/min，全球 50+ 市场覆盖
// quote endpoint  → 价格类字段
// statistics endpoint → PE / PB / 市值 / 流通股

import type { Quote } from "./eastmoney";

interface TDQuoteResponse {
  symbol?: string;
  name?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
  previous_close?: string;
  change?: string;
  percent_change?: string;
  status?: "ok" | "error";
  code?: number;
  message?: string;
}

interface TDStatistics {
  valuations_metrics?: {
    market_capitalization?: number;
    trailing_pe?: number;
    price_to_book_mrq?: number;
  };
  stock_statistics?: {
    shares_outstanding?: number;
    float_shares?: number;
  };
}

interface TDStatisticsResponse {
  statistics?: TDStatistics;
  code?: number;
  message?: string;
}

// 用户输入 → Twelve Data 的 symbol + exchange 参数
function toTwelveDataSymbol(
  raw: string,
): { symbol: string; exchange?: string; market: Quote["market"] } | null {
  const s = raw.trim().toUpperCase();
  if (!s) return null;
  if (/^\d{5}$/.test(s)) {
    // 港股 ticker 去前导 0、补到 4 位
    const stripped = s.replace(/^0+/, "") || "0";
    const padded = stripped.padStart(4, "0");
    return { symbol: padded, exchange: "HKEX", market: "HK" };
  }
  if (/^\d{6}$/.test(s)) {
    if (s.startsWith("6")) return { symbol: s, exchange: "SSE", market: "SH" };
    if (/^[03]/.test(s)) return { symbol: s, exchange: "SZSE", market: "SZ" };
    if (/^[48]/.test(s)) return { symbol: s, exchange: "BSE", market: "BJ" };
  }
  if (/^[A-Z]{1,5}$/.test(s)) return { symbol: s, market: "US" };
  return null;
}

function tdNum(v: string | number | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchFromTwelveData(rawSymbol: string): Promise<Quote> {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error("未配置 TWELVE_DATA_API_KEY");

  const r = toTwelveDataSymbol(rawSymbol);
  if (!r) throw new Error(`无法识别的股票代码: ${rawSymbol}`);

  const baseParams =
    `symbol=${encodeURIComponent(r.symbol)}` +
    (r.exchange ? `&exchange=${r.exchange}` : "") +
    `&apikey=${encodeURIComponent(key)}`;

  // quote 必拿（价格），statistics 可降级（财务指标）
  const [quoteSettled, statSettled] = await Promise.allSettled([
    fetch(`https://api.twelvedata.com/quote?${baseParams}`, {
      cache: "no-store",
    }).then((res) => res.json() as Promise<TDQuoteResponse>),
    fetch(`https://api.twelvedata.com/statistics?${baseParams}`, {
      cache: "no-store",
    }).then((res) => res.json() as Promise<TDStatisticsResponse>),
  ]);

  if (quoteSettled.status !== "fulfilled") {
    const reason =
      quoteSettled.reason instanceof Error
        ? quoteSettled.reason.message
        : String(quoteSettled.reason);
    console.error(`[twelvedata] quote fetch 异常 [${rawSymbol}]:`, reason);
    throw new Error(reason);
  }
  const q = quoteSettled.value;
  if (q.status === "error" || !q.close) {
    console.error(
      `[twelvedata] quote 返回无数据 [${rawSymbol}]: code=${q.code ?? "-"} status=${q.status ?? "-"} msg=${q.message ?? "-"}`,
    );
    throw new Error(`Twelve Data 未查询到: ${q.message || rawSymbol}`);
  }

  let s: TDStatistics | null = null;
  if (statSettled.status === "rejected") {
    console.error(
      "[twelvedata] statistics fetch 异常:",
      statSettled.reason instanceof Error
        ? statSettled.reason.message
        : statSettled.reason,
    );
  } else if (!statSettled.value.statistics) {
    // 接口 200 但无 statistics 字段（多半是 plan 限制或市场不支持）
    console.error(
      `[twelvedata] statistics 无数据 [${rawSymbol}]: code=${statSettled.value.code ?? "-"} msg=${statSettled.value.message ?? "-"}`,
    );
  } else {
    s = statSettled.value.statistics;
  }

  const price = tdNum(q.close);
  const prev = tdNum(q.previous_close);
  const open = tdNum(q.open) || prev;
  const high = tdNum(q.high) || price;
  const low = tdNum(q.low) || price;
  const volume = tdNum(q.volume);

  const marketCap = s?.valuations_metrics?.market_capitalization ?? 0;
  const pe = s?.valuations_metrics?.trailing_pe ?? 0;
  const pb = s?.valuations_metrics?.price_to_book_mrq ?? 0;
  const sharesOut = s?.stock_statistics?.shares_outstanding ?? 0;
  const floatShares = s?.stock_statistics?.float_shares ?? 0;

  return {
    symbol: rawSymbol.trim().toUpperCase(),
    fullSymbol: r.exchange ? `${r.symbol}:${r.exchange}` : r.symbol,
    name: q.name || rawSymbol.trim().toUpperCase(),
    price,
    open,
    high,
    low,
    prevClose: prev,
    change: tdNum(q.change),
    changePct: tdNum(q.percent_change),
    volume,
    turnover: volume && price ? volume * price : 0,
    turnoverRate: sharesOut ? (volume / sharesOut) * 100 : 0,
    pe,
    pb,
    marketCap,
    floatCap: floatShares && price ? floatShares * price : 0,
    market: r.market,
  };
}
