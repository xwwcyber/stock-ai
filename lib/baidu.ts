export interface TrendPoint {
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

export interface TrendSnapshot {
  source: "baidu";
  sourceName: string;
  symbol: string;
  latest: TrendPoint;
  previous: TrendPoint | null;
  points: TrendPoint[];
}

interface BaiduKlineResponse {
  ResultCode?: string | number;
  Result?: {
    newMarketData?: {
      keys?: string[];
      marketData?: string;
    };
  };
}

function isAStockSymbol(rawSymbol: string): boolean {
  const s = rawSymbol.trim();
  return /^\d{6}$/.test(s) && /^[60348]/.test(s);
}

function num(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pick(row: Record<string, string>, ...keys: string[]): number {
  for (const key of keys) {
    const value = num(row[key]);
    if (value) return value;
  }
  return 0;
}

function mapPoint(keys: string[], line: string): TrendPoint | null {
  const values = line.split(",");
  if (values.length < 6) return null;

  const row: Record<string, string> = {};
  keys.forEach((key, i) => {
    row[key.toLowerCase()] = values[i] ?? "";
  });

  return {
    date: row.time ?? row.date ?? values[0] ?? "",
    open: pick(row, "open"),
    close: pick(row, "close", "price"),
    high: pick(row, "high"),
    low: pick(row, "low"),
    volume: pick(row, "volume", "vol"),
    amount: pick(row, "amount"),
    ma5: pick(row, "ma5avgprice", "ma5"),
    ma10: pick(row, "ma10avgprice", "ma10"),
    ma20: pick(row, "ma20avgprice", "ma20"),
  };
}

export async function fetchTrendSnapshot(
  rawSymbol: string,
): Promise<TrendSnapshot> {
  const symbol = rawSymbol.trim().toUpperCase();
  if (!isAStockSymbol(symbol)) {
    throw new Error(`百度 K 线暂只支持 A 股 6 位代码: ${rawSymbol}`);
  }

  const url = new URL("https://finance.pae.baidu.com/selfselect/getstockquotation");
  const params: Record<string, string> = {
    all: "1",
    isIndex: "false",
    isBk: "false",
    isBlock: "false",
    isFutures: "false",
    isStock: "true",
    newFormat: "1",
    group: "quotation_kline_ab",
    finClientType: "pc",
    code: symbol,
    ktype: "1",
  };
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/vnd.finance-web.v1+json",
      Origin: "https://gushitong.baidu.com",
      Referer: "https://gushitong.baidu.com/",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`百度 K 线请求失败: ${res.status}`);

  const json = (await res.json()) as BaiduKlineResponse;
  if (String(json.ResultCode ?? "0") !== "0") {
    throw new Error(`百度 K 线返回异常: ${String(json.ResultCode)}`);
  }

  const marketData = json.Result?.newMarketData;
  const keys = marketData?.keys?.map((key) => key.toLowerCase()) ?? [];
  const lines = marketData?.marketData?.split(";").filter(Boolean) ?? [];
  const points = lines
    .map((line) => mapPoint(keys, line))
    .filter((point): point is TrendPoint => Boolean(point))
    .slice(-30);

  const latest = points.at(-1);
  if (!latest) throw new Error(`百度 K 线未返回有效数据: ${rawSymbol}`);

  return {
    source: "baidu",
    sourceName: "百度股市通",
    symbol,
    latest,
    previous: points.length > 1 ? points[points.length - 2] : null,
    points,
  };
}
