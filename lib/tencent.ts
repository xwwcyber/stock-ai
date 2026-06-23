// 兜底数据源 1：腾讯财经 qt.gtimg.cn
// A 股 / 港股 / 美股 字段最全，海外 IP 可达（不在东方财富 push2 黑名单上）
//
// 数据格式：v_sh600519="1~名称~600519~1285.88~...";
// 字段按 ~ 分隔，PB 位置在 A 股 / 美股 / 港股 间不同
//
// A 股位置参考（sh600519 / sz000001 / sh688xxx 都适用）：
//   [3] 现价 [4] 昨收 [5] 开盘 [6] 成交量(手) [31] 涨跌额 [32] 涨跌幅%
//   [33] 最高 [34] 最低 [37] 成交额(万元) [38] 换手率% [39] PE(静态)
//   [43] 振幅% [44] 总市值(亿元) [45] 流通市值(亿元) [46] PB
//   [47] 涨停价 [48] 跌停价 [49] 量比
// 港股位置参考（hk00700）：
//   [3] 现价 [4] 昨收 [5] 开盘 [6] 成交量(股) [31] 涨跌额 [32] 涨跌幅%
//   [33] 最高 [34] 最低 [37] 成交额(港币元) [39] PE
//   [44] 流通市值(亿港币) [45] 总市值(亿港币)
//   港股不提供 PB / 换手率
// 美股位置参考（usAAPL，无后缀）：
//   [3] 现价 [4] 昨收 [5] 开盘 [6] 成交量(股) [31] 涨跌额 [32] 涨跌幅%
//   [33] 最高 [34] 最低 [37] 成交额(美元) [38] 换手率% [39] PE
//   [44] 流通市值(亿美元) [45] 总市值(亿美元) [51] PB（注意位置和 A 股不同）

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
  // 美股：腾讯财经格式为 us + 代码（无 .OQ/.N 后缀，系统会自动补全）
  if (/^[A-Z]{1,5}$/.test(s)) return { ticker: `us${s}`, market: "US" };
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

  // GBK 编码：Node 22 默认 full-icu 支持 GBK，老 ICU 退回 latin1（数字字段不受影响）
  const buf = await res.arrayBuffer();
  let text: string;
  try {
    text = new TextDecoder("gbk", { fatal: false }).decode(buf);
  } catch {
    text = new TextDecoder("latin1", { fatal: false }).decode(buf);
  }
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

  // 成交额单位：A 股是万元（×10000）；港股/美股已经是本币元
  const isHK = r.market === "HK";
  const isUS = r.market === "US";
  const turnover = isHK || isUS ? n(fields[37]) : n(fields[37]) * 10000;
  // 市值单位：三种市场都是"亿"（亿元/亿港币/亿美元），统一 ×1e8。
  // a-stock-data 对 A 股字段的经验是 [44] 总市值、[45] 流通市值；
  // 港股/美股保留原项目里验证过的 [45] 总市值、[44] 流通市值。
  const isAStock = !isHK && !isUS;
  const marketCap = n(fields[isAStock ? 44 : 45]) * 1e8;
  const floatCap = n(fields[isAStock ? 45 : 44]) * 1e8;
  // PB 位置：A 股在 [46]，美股在 [51]（[46] 是英文公司名），港股无
  let pb = 0;
  if (isUS) pb = n(fields[51]);
  else if (!isHK) pb = n(fields[46]);

  return {
    symbol: rawSymbol.trim().toUpperCase(),
    fullSymbol: r.ticker,
    source: "tencent",
    sourceName: "腾讯财经",
    // fields[1] 是 GBK 中文名；若解码失败含 U+FFFD 替换字符，回落到代码
    name:
      fields[1] && !fields[1].includes("�")
        ? fields[1]
        : rawSymbol.trim().toUpperCase(),
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
    amplitudePct:
      n(fields[43]) || (prev && high && low ? ((high - low) / prev) * 100 : 0),
    volumeRatio: isAStock ? n(fields[49]) : 0,
    limitUp: isAStock ? n(fields[47]) : 0,
    limitDown: isAStock ? n(fields[48]) : 0,
    pe: n(fields[39]),
    pb,
    marketCap,
    floatCap,
    market: r.market,
  };
}
