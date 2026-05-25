// 临时调试接口：从 Render 服务器端发请求测试东方财富各子域名的可达性
// 验证完即删除
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDPOINTS = [
  {
    name: "push2 (已知被封作对照)",
    url: "https://push2.eastmoney.com/api/qt/stock/get?secid=1.600519&fields=f43,f57,f58,f162,f116",
  },
  {
    name: "emweb F10 公司资料",
    url: "https://emweb.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax?code=SH600519",
  },
  {
    name: "emweb 主要财务指标",
    url: "https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/MainTargetsAjax?code=SH600519",
  },
  {
    name: "datacenter-web 数据中心",
    url: "https://datacenter-web.eastmoney.com/api/data/v1/get?columns=ALL&reportName=RPT_F10_FINANCE_MAINFINADATA&filter=(SECUCODE%3D%22600519.SH%22)&pageNumber=1&pageSize=1",
  },
];

export async function GET() {
  const results = await Promise.all(
    ENDPOINTS.map(async (e) => {
      const t0 = Date.now();
      try {
        const res = await fetch(e.url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Referer: "https://quote.eastmoney.com/",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        const text = await res.text();
        return {
          name: e.name,
          status: res.status,
          contentType: res.headers.get("content-type"),
          bodyLength: text.length,
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
