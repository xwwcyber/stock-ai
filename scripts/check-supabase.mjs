// 诊断 Supabase 连接 / 读写 / RLS
// 跑法：node --env-file=.env.local scripts/check-supabase.mjs

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_ANON_KEY?.trim();

console.log('=== 配置检查 ===');
if (!url) { console.error('❌ SUPABASE_URL 未设置'); process.exit(1); }
if (!key) { console.error('❌ SUPABASE_ANON_KEY 未设置'); process.exit(1); }

// 脱敏打印
console.log('URL :', url);
console.log('KEY :', key.slice(0, 12) + '...' + key.slice(-6), `(共 ${key.length} 字符)`);

// URL 校验
if (url.endsWith('/')) console.warn('⚠️  URL 末尾不应有 /');
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) {
  console.warn('⚠️  URL 格式可能异常，标准形如 https://abc123.supabase.co');
}

// Key 格式提示
if (key.startsWith('sb_publishable_')) console.log('KEY 类型：新版 publishable key ✅');
else if (key.startsWith('eyJ')) console.log('KEY 类型：legacy anon JWT ✅');
else console.warn('⚠️  KEY 既不像 publishable 也不像 JWT，可能复制错了');

console.log('\n=== 1. 测试基本连通 ===');
const root = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
console.log('GET /rest/v1/ →', root.status, root.statusText);

console.log('\n=== 2. 测试读 analyses 表 ===');
const read = await fetch(`${url}/rest/v1/analyses?select=*&limit=1`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
console.log('GET analyses →', read.status, await read.text());

console.log('\n=== 3. 测试写 analyses 表 ===');
const write = await fetch(`${url}/rest/v1/analyses`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify({
    symbol: 'TEST',
    name: '诊断写入',
    price: 1,
    change_pct: 0,
    summary: 'diagnostic insert',
    sentiment: 'Neutral',
    risk_level: 'Low',
    key_factors: ['test'],
  }),
});
console.log('POST analyses →', write.status, await write.text());
