// 临时调试接口：从 Render 服务器端发请求测试东方财富各子域名的可达性
// 验证完即删除
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDPOINTS: Array<{ name: string; url: string; referer?: string }> = [
  {
    name: "push2 (对照组)",
    url: "https://push2.eastmoney.com/api/qt/stock/get?secid=1.600519&fields=f43,f57,f162,f116",
    referer: "https://quote.eastmoney.com/",
  },
  {
    name: "腾讯财经 A 股 sh600519",
    url: "https://qt.gtimg.cn/q=sh600519",
  },
  {
    name: "腾讯财经 港股 hk00700",
    url: "https://qt.gtimg.cn/q=hk00700",
  },
  {
    name: "腾讯财经 美股 usAAPL.OQ",
    url: "https://qt.gtimg.cn/q=usAAPL.OQ",
  },
  {
    name: "新浪财经 A 股 sh600519",
    url: "https://hq.sinajs.cn/list=sh600519",
    referer: "https://finance.sina.com.cn/",
  },
];

export async function GET() {
  const results = await Promise.all(
    ENDPOINTS.map(async (e) => {
      const t0 = Date.now();
      try {
        const headers: Record<string, string> = {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        };
        if (e.referer) headers.Referer = e.referer;
        const res = await fetch(e.url, {
          headers,
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        // GBK 编码（腾讯/新浪）也按 latin1 取出可读片段
        const buf = await res.arrayBuffer();
        const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
        return {
          name: e.name,
          status: res.status,
          contentType: res.headers.get("content-type"),
          bodyLength: buf.byteLength,
          bodySnippet: text.slice(0, 300),
          elapsedMs: Date.now() - t0,
        };
      } catch (err) {
        return {
          name: e.name,
          error: err instanceof Error ? err.message : String(err),
          elapsedMs: Date.now() - t0,
        };
      }
    }),
  );
  return NextResponse.json({ results }, { status: 200 });
}
