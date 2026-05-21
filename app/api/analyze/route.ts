import { NextRequest, NextResponse } from 'next/server';
import { fetchQuote } from '@/lib/eastmoney';
import { analyzeQuote } from '@/lib/deepseek';
import { saveAnalysis } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { symbol?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body 必须是 JSON' }, { status: 400 });
  }

  const symbol = body.symbol?.trim();
  if (!symbol) {
    return NextResponse.json({ error: '缺少 symbol' }, { status: 400 });
  }

  try {
    const quote = await fetchQuote(symbol);
    const analysis = await analyzeQuote(quote);

    // 落库（失败不阻断主流程）
    const persisted = await saveAnalysis(quote, analysis).catch((e) => {
      console.error('[save] 落库失败:', e);
      return null;
    });

    return NextResponse.json({
      quote,
      analysis,
      saved: !!persisted,
      record_id: persisted?.id ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '分析失败';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
