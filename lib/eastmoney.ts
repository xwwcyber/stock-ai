// 行情数据封装：东方财富优先，海外环境兜底走 Yahoo Finance
//
// 东方财富字段含义（社区/逆向）：
// f43 现价 f44 最高 f45 最低 f46 开盘 f60 昨收
// f47 成交量(手) f48 成交额 f50 量比 f51 涨停价 f52 跌停价
// f57 代码 f58 名称 f168 换手率(‰) f170 涨跌幅(%) f169 涨跌额
// f116 总市值 f117 流通市值 f162 市盈率(动) f167 市净率

export interface Quote {
  symbol: string;       // 600519
  fullSymbol: string;   // 1.600519 或 600519.SS
  name: string;
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  change: number;       // 涨跌额
  changePct: number;    // 涨跌幅 %
  volume: number;       // 手
  turnover: number;     // 成交额
  turnoverRate: number; // 换手率 %
  pe: number;
  pb: number;
  marketCap: number;    // 总市值
  floatCap: number;     // 流通市值
  market: 'SH' | 'SZ' | 'BJ' | 'HK' | 'US';
}

// ============================================================
// 主入口：东方财富（限时 2 秒）→ 失败兜底 Yahoo
// ============================================================
export async function fetchQuote(rawSymbol: string): Promise<Quote> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 2000);
  try {
    return await fetchFromEastmoney(rawSymbol, ac.signal);
  } catch (primaryErr) {
    // 东方财富任何形式失败（502/超时/字段缺）→ 走 Yahoo
    try {
      return await fetchFromYahoo(rawSymbol);
    } catch (fallbackErr) {
      const a = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      const b = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      throw new Error(`行情数据获取失败（东方财富: ${a}; Yahoo: ${b}）`);
    }
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// 源 1：东方财富（字段全，国内 IP 友好）
// ============================================================

// 0=深市 1=沪市 116=港股 105/106/107=美股 90=北交所
function resolveSecid(rawInput: string): { secid: string; market: Quote['market'] } | null {
  const input = rawInput.trim().toUpperCase();
  if (!input) return null;
  if (/^\d{5}$/.test(input)) return { secid: `116.${input}`, market: 'HK' };
  if (/^\d{6}$/.test(input)) {
    if (input.startsWith('6')) return { secid: `1.${input}`, market: 'SH' };
    if (input.startsWith('0') || input.startsWith('3')) return { secid: `0.${input}`, market: 'SZ' };
    if (input.startsWith('8') || input.startsWith('4')) return { secid: `0.${input}`, market: 'BJ' };
  }
  if (/^[A-Z]{1,5}$/.test(input)) return { secid: `105.${input}`, market: 'US' };
  return null;
}

const EM_FIELDS = [
  'f43','f44','f45','f46','f47','f48','f50',
  'f57','f58','f60','f116','f117',
  'f162','f167','f168','f169','f170',
].join(',');

interface EastmoneyResponse {
  data: Record<string, number | string> | null;
}

function px(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}
function pct(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function fetchFromEastmoney(rawSymbol: string, signal: AbortSignal): Promise<Quote> {
  const resolved = resolveSecid(rawSymbol);
  if (!resolved) throw new Error(`无法识别的股票代码: ${rawSymbol}`);

  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${resolved.secid}&fields=${EM_FIELDS}&_=${Date.now()}`;
  const headers = { 'User-Agent': 'Mozilla/5.0', Referer: 'https://quote.eastmoney.com/' };
  const res = await fetch(url, { headers, cache: 'no-store', signal });

  if (!res.ok) throw new Error(`行情接口请求失败: ${res.status}`);

  const json = (await res.json()) as EastmoneyResponse;
  const d = json.data;
  if (!d || !d.f57) {
    if (resolved.market === 'US' && resolved.secid.startsWith('105.')) {
      const retryUrl = url.replace('secid=105.', 'secid=106.');
      const retry = await fetch(retryUrl, { headers, cache: 'no-store', signal });
      if (retry.ok) {
        const retryJson = (await retry.json()) as EastmoneyResponse;
        if (retryJson.data && retryJson.data.f57) {
          return mapEastmoney(retryJson.data, resolved.market, '106.' + rawSymbol.toUpperCase());
        }
      }
    }
    throw new Error(`未查询到股票: ${rawSymbol}`);
  }
  return mapEastmoney(d, resolved.market, resolved.secid);
}

function mapEastmoney(d: Record<string, number | string>, market: Quote['market'], fullSymbol: string): Quote {
  return {
    symbol: String(d.f57 ?? ''),
    fullSymbol,
    name: String(d.f58 ?? ''),
    price: px(d.f43),
    high: px(d.f44),
    low: px(d.f45),
    open: px(d.f46),
    prevClose: px(d.f60),
    change: px(d.f169),
    changePct: pct(d.f170),
    volume: num(d.f47),
    turnover: num(d.f48),
    turnoverRate: pct(d.f168),
    pe: pct(d.f162),
    pb: pct(d.f167),
    marketCap: num(d.f116),
    floatCap: num(d.f117),
    market,
  };
}

// ============================================================
// 源 2：Yahoo Finance（全球可访问，字段较少，海外环境兜底）
// chart endpoint 不需要 crumb cookie，公开可用
// ============================================================

function toYahooSymbol(raw: string): { symbol: string; market: Quote['market'] } | null {
  const s = raw.trim().toUpperCase();
  if (!s) return null;
  if (/^\d{6}$/.test(s)) {
    if (s.startsWith('6')) return { symbol: `${s}.SS`, market: 'SH' };
    if (/^[03]/.test(s)) return { symbol: `${s}.SZ`, market: 'SZ' };
    if (/^[48]/.test(s)) return { symbol: `${s}.BJ`, market: 'BJ' };
  }
  if (/^\d{5}$/.test(s)) return { symbol: `${s}.HK`, market: 'HK' };
  if (/^[A-Z]{1,5}$/.test(s)) return { symbol: s, market: 'US' };
  return null;
}

interface YahooChartMeta {
  symbol?: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  chartPreviousClose?: number;
  previousClose?: number;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{ meta?: YahooChartMeta }> | null;
    error?: { description?: string } | null;
  };
}

async function fetchFromYahoo(rawSymbol: string): Promise<Quote> {
  const r = toYahooSymbol(rawSymbol);
  if (!r) throw new Error(`无法识别的股票代码: ${rawSymbol}`);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(r.symbol)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Yahoo 行情请求失败: ${res.status}`);

  const json = (await res.json()) as YahooChartResponse;
  const meta = json.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== 'number') {
    throw new Error(`未查询到股票: ${rawSymbol}`);
  }

  const price = num(meta.regularMarketPrice);
  const prev = num(meta.chartPreviousClose ?? meta.previousClose);
  const open = num(meta.regularMarketOpen) || prev;
  const high = num(meta.regularMarketDayHigh) || price;
  const low = num(meta.regularMarketDayLow) || price;

  return {
    symbol: rawSymbol.trim().toUpperCase(),
    fullSymbol: r.symbol,
    name: meta.longName || meta.shortName || rawSymbol.trim().toUpperCase(),
    price,
    open,
    high,
    low,
    prevClose: prev,
    change: price - prev,
    changePct: prev ? ((price - prev) / prev) * 100 : 0,
    volume: num(meta.regularMarketVolume),
    // 以下字段 chart endpoint 不提供，置 0 由前端/提示词识别为缺失
    turnover: 0,
    turnoverRate: 0,
    pe: 0,
    pb: 0,
    marketCap: 0,
    floatCap: 0,
    market: r.market,
  };
}
