// 兜底数据源 1：腾讯财经 qt.gtimg.cn
// A 股 / 港股 字段最全，海外 IP 可达（不在东方财富 push2 黑名单上）
// 美股 ticker 不稳定，留给 Twelve Data 处理
//
// 数据格式：v_sh600519="1~名称~600519~1285.88~...";
// 字段按 ~ 分隔，按市场（A 股 vs 港股）位置不同
//
// A 股位置参考（sh600519 / sz000001 / sh688xxx 都适用）：
//   [3] 现价 [4] 昨收 [5] 开盘 [6] 成交量(手) [31] 涨跌额 [32] 涨跌幅%
//   [33] 最高 [34] 最低 [37] 成交额(万元) [38] 换手率% [39] PE(静态)
//   [44] 流通市值(亿元) [45] 总市值(亿元) [46] PB
// 港股位置参考（hk00700）：
//   [3] 现价 [4] 昨收 [5] 开盘 [6] 成交量(股) [31] 涨跌额 [32] 涨跌幅%
//   [33] 最高 [34] 最低 [37] 成交额(港币元) [39] PE
//   [44] 流通市值(亿港币) [45] 总市值(亿港币)
//   港股不提供 PB / 换手率

import type { Quote } from "./eastmoney";

function toTencentSymbol(
  raw: string,
): { ticker: string; market: Quote["market"] } | null {
  const s = raw.trim().toUpperCase();
  if (!s) return null;
  if (/^\d{5}$/.test(s)) return { ticker: `hk${s}`, market: "HK" };
  if (/^\d{6}$/.test(s)) {
    if (s.startsWith("6")) return { ticker: `sh${s}`, market: "SH" };
    if (/^[03]/.test(s)) return { ticker: `sz${s}`, market: "SZ" };
    if (/^[48]/.test(s)) return { ticker: `bj${s}`, market: "BJ" };
  }
  // 美股代码：腾讯财经格式不稳，不接管，让上层降到 Twelve Data
  return null;
}

function n(v: string | undefined): number {
  if (!v) return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function fetchFromTencent(rawSymbol: string): Promise<Quote> {
  const r = toTencentSymbol(rawSymbol);
  if (!r) throw new Error(`腾讯财经不支持的代码: ${rawSymbol}`);

  const url = `https://qt.gtimg.cn/q=${r.ticker}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`腾讯财经请求失败: ${res.status}`);

  // GBK 编码：数字部分是 ASCII，中文名按 utf-8 解会乱码（这里不依赖中文名）
  const text = await res.text();
  const m = text.match(/="([^"]+)"/);
  if (!m) throw new Error(`腾讯财经解析失败: ${rawSymbol}`);
  const fields = m[1].split("~");

  // 腾讯财经无数据时会返回 v_pv_none_match="1"，长度只有 1
  if (fields.length < 30) {
    throw new Error(`腾讯财经未查询到: ${rawSymbol}`);
  }

  const price = n(fields[3]);
  const prev = n(fields[4]);
  const open = n(fields[5]) || prev;
  const high = n(fields[33]) || price;
  const low = n(fields[34]) || price;

  // A 股成交额是万元、市值是亿元；港股成交额是元、市值是亿港币
  const isHK = r.market === "HK";
  const turnover = isHK ? n(fields[37]) : n(fields[37]) * 10000;
  const marketCap = n(fields[45]) * 1e8;
  const floatCap = n(fields[44]) * 1e8;

  return {
    symbol: rawSymbol.trim().toUpperCase(),
    fullSymbol: r.ticker,
    name: rawSymbol.trim().toUpperCase(), // GBK 中文名跳过，用代码占位
    price,
    open,
    high,
    low,
    prevClose: prev,
    change: n(fields[31]),
    changePct: n(fields[32]),
    volume: n(fields[6]),
    turnover,
    turnoverRate: isHK ? 0 : n(fields[38]),
    pe: n(fields[39]),
    pb: isHK ? 0 : n(fields[46]),
    marketCap,
    floatCap,
    market: r.market,
  };
}
