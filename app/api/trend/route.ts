import { NextRequest, NextResponse } from 'next/server';
import { fetchTrendSnapshot } from '@/lib/baidu';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.trim();
  if (!symbol) {
    return NextResponse.json({ error: '缺少 symbol 参数' }, { status: 400 });
  }

  try {
    const trend = await fetchTrendSnapshot(symbol);
    return NextResponse.json({ trend });
  } catch (err) {
    const message = err instanceof Error ? err.message : '趋势查询失败';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
