import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Quote } from './eastmoney';
import type { Analysis } from './deepseek';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('缺少 SUPABASE_URL 或 SUPABASE_ANON_KEY');
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export interface AnalysisRecord {
  id: string;
  symbol: string;
  name: string | null;
  price: number | null;
  change_pct: number | null;
  summary: string;
  sentiment: 'Bullish' | 'Neutral' | 'Bearish';
  risk_level: 'Low' | 'Medium' | 'High';
  key_factors: string[] | null;
  raw_quote: Quote | null;
  created_at: string;
}

export async function saveAnalysis(quote: Quote, analysis: Analysis): Promise<AnalysisRecord> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('analyses')
    .insert({
      symbol: quote.symbol,
      name: quote.name,
      price: quote.price,
      change_pct: quote.changePct,
      summary: analysis.summary,
      sentiment: analysis.sentiment,
      risk_level: analysis.risk_level,
      key_factors: analysis.key_factors,
      raw_quote: quote,
    })
    .select()
    .single();

  if (error) throw new Error(`Supabase 写入失败: ${error.message}`);
  return data as AnalysisRecord;
}

export async function listAnalyses(limit = 20): Promise<AnalysisRecord[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Supabase 读取失败: ${error.message}`);
  return (data ?? []) as AnalysisRecord[];
}
