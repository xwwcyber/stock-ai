import { NextResponse } from 'next/server';
import { listAnalyses } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const records = await listAnalyses(20);
    return NextResponse.json({ records });
  } catch (err) {
    const message = err instanceof Error ? err.message : '读取历史记录失败';
    return NextResponse.json({ error: message, records: [] }, { status: 502 });
  }
}
