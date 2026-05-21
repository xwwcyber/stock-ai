import { NextRequest, NextResponse } from 'next/server';
import { fetchQuote } from '@/lib/eastmoney';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.trim();
  if (!symbol) {
    return NextResponse.json({ error: '缺少 symbol 参数' }, { status: 400 });
  }

  try {
    const quote = await fetchQuote(symbol);
    return NextResponse.json({ quote });
  } catch (err) {
    const message = err instanceof Error ? err.message : '行情查询失败';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
