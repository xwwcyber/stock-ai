import OpenAI from "openai";
import type { Quote } from "./eastmoney";
import type { TrendSnapshot } from "./baidu";

// DeepSeek 兼容 OpenAI SDK，只需替换 baseURL
function getClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("缺少环境变量 DEEPSEEK_API_KEY");
  return new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com/v1",
  });
}

export type Sentiment = "Bullish" | "Neutral" | "Bearish";
export type RiskLevel = "Low" | "Medium" | "High";

export interface Analysis {
  summary: string;
  sentiment: Sentiment;
  risk_level: RiskLevel;
  key_factors: string[];
}

const SYSTEM_PROMPT = `你是一名资深股票分析师。基于用户给出的实时行情快照，输出客观的短评。

返回必须是严格的 JSON 对象，字段如下：
- summary: string（中文，120-200 字，总结当前价格表现、成交活跃度、相对昨收的位置，避免任何投资建议）
- sentiment: "Bullish" | "Neutral" | "Bearish"（基于技术面信号判断当下情绪）
- risk_level: "Low" | "Medium" | "High"（结合波幅、换手率、估值给出风险）
- key_factors: string[]（3-5 条最关键的支撑/风险点，每条不超过 30 字）

只返回 JSON，不要任何解释性前后缀，不要使用 markdown 代码块包裹。`;

function trendPrompt(trend: TrendSnapshot | null): string {
  if (!trend) return "趋势: 数据缺失";
  const { latest, previous } = trend;
  const prevClose = previous?.close;
  const closeChangePct =
    prevClose && latest.close
      ? ((latest.close - prevClose) / prevClose) * 100
      : 0;
  const maState = [
    latest.ma5 ? `MA5 ${latest.ma5}` : "",
    latest.ma10 ? `MA10 ${latest.ma10}` : "",
    latest.ma20 ? `MA20 ${latest.ma20}` : "",
  ]
    .filter(Boolean)
    .join(" / ");

  return `趋势数据源: ${trend.sourceName}
最近K线: ${latest.date} 收 ${latest.close} / 高 ${latest.high} / 低 ${latest.low}${closeChangePct ? ` / 较前收 ${closeChangePct.toFixed(2)}%` : ""}
均线: ${maState || "数据缺失"}
均线位置: 收盘价${latest.ma5 ? (latest.close >= latest.ma5 ? "高于" : "低于") + "MA5" : "缺MA5"}、${latest.ma10 ? (latest.close >= latest.ma10 ? "高于" : "低于") + "MA10" : "缺MA10"}、${latest.ma20 ? (latest.close >= latest.ma20 ? "高于" : "低于") + "MA20" : "缺MA20"}`;
}

function buildUserPrompt(q: Quote, trend: TrendSnapshot | null): string {
  const na = (v: number, suffix = "") => (v ? `${v}${suffix}` : "数据缺失");
  const naPct = (v: number) => (v ? `${v.toFixed(2)}%` : "数据缺失");
  return `股票: ${q.name || q.symbol} (${q.symbol}) [${q.market}]
数据源: ${q.sourceName}
现价: ${q.price}
今日: 开 ${q.open} / 高 ${q.high} / 低 ${q.low} / 昨收 ${q.prevClose}
涨跌: ${q.change >= 0 ? "+" : ""}${q.change} (${q.changePct.toFixed(2)}%)
成交量: ${na(q.volume, " 手")}, 成交额: ${na(q.turnover)}
换手率: ${naPct(q.turnoverRate)}, 振幅: ${naPct(q.amplitudePct)}, 量比: ${na(q.volumeRatio)}
涨跌停: 涨停 ${na(q.limitUp)} / 跌停 ${na(q.limitDown)}
估值: PE ${na(q.pe)} / PB ${na(q.pb)}
市值: 总 ${na(q.marketCap)} / 流通 ${na(q.floatCap)}
${trendPrompt(trend)}

注意：标注"数据缺失"的字段说明当前数据源不提供，请勿据此判断或在分析中编造数值。
请基于以上可用数据输出分析。`;
}

export async function analyzeQuote(
  quote: Quote,
  trend: TrendSnapshot | null = null,
): Promise<Analysis> {
  const client = getClient();

  const completion = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(quote, trend) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.4,
    max_tokens: 800,
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  if (!raw) throw new Error("LLM 返回为空");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`LLM 输出非合法 JSON: ${raw.slice(0, 200)}`);
  }

  return validate(parsed);
}

function validate(data: unknown): Analysis {
  if (!data || typeof data !== "object") throw new Error("LLM 输出格式错误");
  const obj = data as Record<string, unknown>;

  const summary = typeof obj.summary === "string" ? obj.summary : "";
  const sentiment = obj.sentiment;
  const risk_level = obj.risk_level ?? obj.riskLevel;
  const key_factors = Array.isArray(obj.key_factors)
    ? obj.key_factors.map(String).slice(0, 6)
    : Array.isArray(obj.keyFactors)
      ? (obj.keyFactors as unknown[]).map(String).slice(0, 6)
      : [];

  if (!summary) throw new Error("summary 字段缺失");
  if (
    sentiment !== "Bullish" &&
    sentiment !== "Neutral" &&
    sentiment !== "Bearish"
  ) {
    throw new Error(`sentiment 取值非法: ${String(sentiment)}`);
  }
  if (
    risk_level !== "Low" &&
    risk_level !== "Medium" &&
    risk_level !== "High"
  ) {
    throw new Error(`risk_level 取值非法: ${String(risk_level)}`);
  }

  return { summary, sentiment, risk_level, key_factors };
}
