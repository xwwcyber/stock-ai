// 东方财富公开行情接口封装
// 文档无官方版本，字段含义来自社区与逆向：
// f43 现价 f44 最高 f45 最低 f46 开盘 f60 昨收
// f47 成交量(手) f48 成交额 f50 量比 f51 涨停价 f52 跌停价
// f57 代码 f58 名称 f168 换手率(‰) f170 涨跌幅(%) f169 涨跌额
// f116 总市值 f117 流通市值 f162 市盈率(动) f167 市净率

export interface Quote {
  symbol: string;       // 600519
  fullSymbol: string;   // 1.600519
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

// 判断市场前缀（东方财富的 secid 用前缀区分市场）
// 0=深市 1=沪市 116=港股 105/106/107=美股 90=北交所
function resolveSecid(rawInput: string): { secid: string; market: Quote['market'] } | null {
  const input = rawInput.trim().toUpperCase();
  if (!input) return null;

  // 港股 5 位数字
  if (/^\d{5}$/.test(input)) return { secid: `116.${input}`, market: 'HK' };

  // A股 6 位数字
  if (/^\d{6}$/.test(input)) {
    if (input.startsWith('6')) return { secid: `1.${input}`, market: 'SH' };
    if (input.startsWith('0') || input.startsWith('3')) return { secid: `0.${input}`, market: 'SZ' };
    if (input.startsWith('8') || input.startsWith('4')) return { secid: `0.${input}`, market: 'BJ' };
  }

  // 美股纯字母代码 — 默认走 105（NASDAQ），失败再尝试 106（NYSE）
  if (/^[A-Z]{1,5}$/.test(input)) return { secid: `105.${input}`, market: 'US' };

  return null;
}

const FIELDS = [
  'f43','f44','f45','f46','f47','f48','f50',
  'f57','f58','f60','f116','f117',
  'f162','f167','f168','f169','f170',
].join(',');

interface EastmoneyResponse {
  data: Record<string, number | string> | null;
}

// 部分价格字段返回的是放大整数（保留两位小数=值/100）
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

export async function fetchQuote(rawSymbol: string): Promise<Quote> {
  const resolved = resolveSecid(rawSymbol);
  if (!resolved) throw new Error(`无法识别的股票代码: ${rawSymbol}`);

  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${resolved.secid}&fields=${FIELDS}&_=${Date.now()}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://quote.eastmoney.com/',
    },
    // 行情数据有时效性，禁用缓存
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`行情接口请求失败: ${res.status}`);

  const json = (await res.json()) as EastmoneyResponse;
  const d = json.data;
  if (!d || !d.f57) {
    // 美股 NASDAQ 失败时再试 NYSE
    if (resolved.market === 'US' && resolved.secid.startsWith('105.')) {
      const retryUrl = url.replace('secid=105.', 'secid=106.');
      const retry = await fetch(retryUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://quote.eastmoney.com/' },
        cache: 'no-store',
      });
      if (retry.ok) {
        const retryJson = (await retry.json()) as EastmoneyResponse;
        if (retryJson.data && retryJson.data.f57) {
          return mapData(retryJson.data, resolved.market, '106.' + rawSymbol.toUpperCase());
        }
      }
    }
    throw new Error(`未查询到股票: ${rawSymbol}`);
  }

  return mapData(d, resolved.market, resolved.secid);
}

function mapData(d: Record<string, number | string>, market: Quote['market'], fullSymbol: string): Quote {
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
