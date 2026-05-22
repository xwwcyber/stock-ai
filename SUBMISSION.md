# AI 股票分析面板 — 作业提交文档

> 这是一份独立的作业提交说明，所有面试题要求的内容（在线 URL、技术栈、Prompt 设计、Debug 记录）都集中在本文档。
>
> 项目使用 **Cursor / Claude Code** 协作完成，全程 AI 辅助编码与调试。

---

## 📌 项目链接

| 类别 | 链接 |
|---|---|
| **🌐 在线访问** | **https://stock-ai-r7qr.onrender.com** |
| **📦 源码仓库** | https://github.com/xwwcyber/stock-ai |
| **📄 提交文档** | https://github.com/xwwcyber/stock-ai/blob/main/SUBMISSION.md（即本文件） |
| **📘 项目 README** | https://github.com/xwwcyber/stock-ai/blob/main/README.md |

> ⚠️ Render Free 实例 15 分钟无访问会休眠，首次唤醒约 30 秒，请耐心等待。

---

## 1️⃣ 项目概述

输入股票代码（A股 6 位 / 港股 5 位 / 美股字母），从行情接口拉取实时数据 → 调用 LLM 给出**结构化分析（严格 JSON）** → 存入 Supabase Postgres → 主页同时展示当次结果与历史记录。

### 演示样例

| 输入代码 | 公司 | 市场 |
|---|---|---|
| `600519` | 贵州茅台 | 沪市 |
| `000001` | 平安银行 | 深市 |
| `00700` | 腾讯控股 | 港股 |
| `AAPL` | 苹果 | 美股 |

---

## 2️⃣ 完整技术栈说明

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Render Web Service                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Next.js 16 (App Router)                  │  │
│  │  ┌──────────────┐   ┌───────────────────────────────┐ │  │
│  │  │  前端 (RSC)  │──▶│  API Routes (Node Runtime)    │ │  │
│  │  │  page.tsx    │   │  /api/quote                   │ │  │
│  │  │  Tailwind 4  │   │  /api/analyze                 │ │  │
│  │  └──────────────┘   │  /api/history                 │ │  │
│  └──────────────────────└────────┬──────────────────────┘  │
└───────────────────────────────────┼────────────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                       ▼
   ┌────────────────┐    ┌────────────────┐     ┌────────────────┐
   │  东方财富 HTTP │    │  DeepSeek API  │     │   Supabase     │
   │  push2.east-   │    │  deepseek-chat │     │   Postgres     │
   │  money.com     │    │  (兼容 OpenAI) │     │  (REST + RLS)  │
   └────────────────┘    └────────────────┘     └────────────────┘
```

### 技术选型矩阵

| 层级 | 选型 | 版本 | 选择理由 |
|---|---|---|---|
| **前端框架** | Next.js (App Router) | 16.2.6 | 全栈一体化，API Route 替代独立后端，Render 单服务部署 |
| **UI 语言** | TypeScript + React | TS 5 / React 19 | 类型安全，配合 LLM 返回的结构化数据更可靠 |
| **样式** | Tailwind CSS | 4.x | 工具类样式快速搭暗色模式 / 响应式 |
| **后端运行时** | Node (Next.js API Routes) | Node 24 | 与前端共享代码（如类型定义）、共享 `lib/*` |
| **行情数据源** | 东方财富公开 HTTP 接口 | - | 零 API Key、A股/港股/美股全覆盖、AKShare 底层同源 |
| **LLM** | DeepSeek（`deepseek-chat`） | 兼容 OpenAI SDK v6 | 国内访问稳定 / 价格低 / 支持 `response_format: json_object` |
| **数据库** | Supabase Postgres | - | 免费 500MB / 自带 REST API / RLS 行级安全 |
| **Auth & 凭据** | Supabase Publishable Key | 新版 API Key 体系 | 前端可直接持有，搭配 RLS 策略限权 |
| **部署平台** | Render Web Service | Free Tier | GitHub 直连自动部署 / 一键环境变量 |
| **代码托管** | GitHub | - | 与 Render 联动持续部署 |
| **包管理** | npm | 11.6.2 | Next.js 默认推荐 |

### 关键依赖

```json
{
  "dependencies": {
    "next": "16.2.6",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "openai": "^6.38.0",            // ← 兼容 DeepSeek 的 OpenAI SDK
    "@supabase/supabase-js": "^2.106.1"
  },
  "devDependencies": {
    "typescript": "^5",
    "tailwindcss": "^4",
    "@tailwindcss/postcss": "^4",
    "eslint": "^9",
    "eslint-config-next": "16.2.6"
  }
}
```

### 数据库 Schema

```sql
create table public.analyses (
  id          uuid primary key default gen_random_uuid(),
  symbol      text not null,
  name        text,
  price       numeric,
  change_pct  numeric,
  summary     text not null,
  sentiment   text not null check (sentiment in ('Bullish','Neutral','Bearish')),
  risk_level  text not null check (risk_level in ('Low','Medium','High')),
  key_factors jsonb,
  raw_quote   jsonb,
  created_at  timestamptz default now()
);

-- 启用 RLS，anon 可读可写（演示用，生产应更严格）
alter table public.analyses enable row level security;
create policy "anon can read"   on public.analyses for select to anon using (true);
create policy "anon can insert" on public.analyses for insert to anon with check (true);
```

- `check` 约束在**数据库层**再次兜底，防止应用层校验绕过
- `key_factors` / `raw_quote` 用 `jsonb`，存原始 LLM 返回数组 + 行情快照便于审计

### 目录结构

```
stock/
├── app/
│   ├── api/
│   │   ├── analyze/route.ts    # POST 行情+AI+落库一站式
│   │   ├── quote/route.ts      # GET 行情查询
│   │   └── history/route.ts    # GET 最近 20 条历史
│   ├── layout.tsx              # 全局布局 + 暗色模式
│   ├── page.tsx                # 主界面（输入框/结果卡/历史）
│   └── globals.css
├── lib/
│   ├── eastmoney.ts            # 东方财富封装 + 多市场代码识别
│   ├── deepseek.ts             # LLM 调用 + 三层 JSON 防御
│   └── supabase.ts             # 客户端 + saveAnalysis/listAnalyses
├── supabase/schema.sql         # 建表 + RLS 策略
├── scripts/check-supabase.mjs  # Supabase 连通诊断脚本（见 Debug 记录）
├── .env.example                # 环境变量模板
├── package.json
├── README.md                   # 用户文档
└── SUBMISSION.md               # 本文件
```

---

## 3️⃣ Prompt 设计：如何强制 LLM 只吐 JSON

LLM 默认非常喜欢：

- 在 JSON 前后写一堆解释（「以下是分析结果：...」）
- 用 ` ```json ... ``` ` markdown 代码块包裹
- 字段名拼写不一致（`risk_level` vs `riskLevel`）
- 枚举值擅自翻译（`高/中/低` 代替 `High/Medium/Low`）

任何一种都会让前端 `JSON.parse` 炸掉或后续逻辑错乱。本项目用 **三层防御** 保证拿到的一定是合法且字段合规的 JSON。

### 第一层：System Prompt 写死格式契约

源代码 — [`lib/deepseek.ts` L18-29](https://github.com/xwwcyber/stock-ai/blob/main/lib/deepseek.ts#L18-L29)：

```ts
const SYSTEM_PROMPT = `你是一名资深股票分析师。基于用户给出的实时行情快照，输出客观的短评。

返回必须是严格的 JSON 对象，字段如下：
- summary: string（中文，120-200 字，总结当前价格表现、成交活跃度、相对昨收的位置，避免任何投资建议）
- sentiment: "Bullish" | "Neutral" | "Bearish"（基于技术面信号判断当下情绪）
- risk_level: "Low" | "Medium" | "High"（结合波幅、换手率、估值给出风险）
- key_factors: string[]（3-5 条最关键的支撑/风险点，每条不超过 30 字）

只返回 JSON，不要任何解释性前后缀，不要使用 markdown 代码块包裹。`;
```

**关键技巧**：

| 技巧 | 为什么有效 |
|---|---|
| 逐字段列约束（类型 + 取值 + 字数限制） | 远比一句「输出 JSON」具体，模型可遵循的颗粒度细 |
| 枚举值用 TypeScript 字面量写出（`"Bullish" \| "Neutral" \| "Bearish"`） | 模型会照抄，不会自创 `Up/Down` |
| 显式禁止 markdown 包裹（"不要使用 markdown 代码块包裹"） | 阻止 ` ```json ... ``` ` 这种破坏 JSON.parse 的格式 |
| 加上「避免任何投资建议」 | 合规友好，同时降低模型发散 |

### 第二层：API 调用层强制 JSON 模式

源代码 — [`lib/deepseek.ts` L47-54](https://github.com/xwwcyber/stock-ai/blob/main/lib/deepseek.ts#L47-L54)：

```ts
const completion = await client.chat.completions.create({
  model: 'deepseek-chat',
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(quote) },
  ],
  response_format: { type: 'json_object' },   // ← 关键
  temperature: 0.4,                            // ← 降低发散度
  max_tokens: 800,
});
```

- **`response_format: { type: 'json_object' }`** — DeepSeek 兼容 OpenAI 协议，会在解码层强制约束输出为合法 JSON 对象。**从根本上杜绝非 JSON 输出**（哪怕模型想加前缀也输不出来）
- **`temperature: 0.4`** — 股票分析不需要创造性，低温度让字段取值更稳定，多次调用同股票结果接近
- **`max_tokens: 800`** — 防止输出无限增长撑爆 token

### 第三层：后端运行时校验，非法值直接抛错

源代码 — [`lib/deepseek.ts` L70-91](https://github.com/xwwcyber/stock-ai/blob/main/lib/deepseek.ts#L70-L91)：

```ts
function validate(data: unknown): Analysis {
  if (!data || typeof data !== 'object') throw new Error('LLM 输出格式错误');
  const obj = data as Record<string, unknown>;

  const summary = typeof obj.summary === 'string' ? obj.summary : '';
  const sentiment = obj.sentiment;
  const risk_level = obj.risk_level ?? obj.riskLevel;          // 兼容 camelCase
  const key_factors = Array.isArray(obj.key_factors)
    ? obj.key_factors.map(String).slice(0, 6)
    : Array.isArray(obj.keyFactors)
      ? (obj.keyFactors as unknown[]).map(String).slice(0, 6)
      : [];

  if (!summary) throw new Error('summary 字段缺失');
  if (sentiment !== 'Bullish' && sentiment !== 'Neutral' && sentiment !== 'Bearish') {
    throw new Error(`sentiment 取值非法: ${String(sentiment)}`);
  }
  if (risk_level !== 'Low' && risk_level !== 'Medium' && risk_level !== 'High') {
    throw new Error(`risk_level 取值非法: ${String(risk_level)}`);
  }

  return { summary, sentiment, risk_level, key_factors };
}
```

- 即使前两层都失守，这里也会拦住任何「字段缺失 / 枚举值乱写 / 类型错误」的输出
- 兼容 `riskLevel` / `risk_level` 两种命名（模型偶尔会用驼峰），但**不接受 `Up/Down`、`高/中/低`** 这类擅自翻译

### 防御纵深总结

```
                ┌─────────────────────────────┐
   LLM 输出 ──▶ │ 1. System Prompt 写死契约   │
                └─────────────┬───────────────┘
                              ▼
                ┌─────────────────────────────┐
                │ 2. response_format=json_obj │
                │    解码层强制 JSON          │
                └─────────────┬───────────────┘
                              ▼
                ┌─────────────────────────────┐
                │ 3. 后端 validate() 校验     │
                │    枚举/字段/类型兜底       │
                └─────────────┬───────────────┘
                              ▼
                       前端拿到的 100%
                       是合法且合规的 JSON
```

### 线上真实输出样例

`POST /api/analyze`  Body `{ "symbol": "000001" }`：

```json
{
  "summary": "平安银行今日低开低走，现价10.7元，较昨收下跌0.65%，成交额约11.94亿元，换手率0.57%显示交投清淡。股价运行于10.69-10.8区间，低于昨日收盘价，整体偏弱。PE仅3.57倍，PB 0.45倍，估值处于历史低位，但短期技术面承压。",
  "sentiment": "Bearish",
  "risk_level": "Low",
  "key_factors": [
    "股价低于昨收，日内高点未能突破开盘价",
    "成交量及换手率偏低，市场参与度低",
    "PE/PB 处于历史估值低位",
    "短期技术面承压但波动有限"
  ]
}
```

每一个字段都在前述三层约束的目标内，可以直接用于前端渲染、数据库写入。

---

## 4️⃣ Debug 记录：`Invalid path specified in request URL`

### 问题现象

集成 Supabase 完成第一次本地联调时，请求 `/api/analyze` 返回看起来一切正常，但响应里始终：

```json
{ "quote": { ... }, "analysis": { ... }, "saved": false, "record_id": null }
```

**Supabase 写入失败**。看 dev server 控制台输出：

```
POST /api/analyze 200 in 5.3s
[save] 落库失败: Error: Supabase 写入失败: Invalid path specified in request URL
    at saveAnalysis (lib\supabase.ts:48:20)
```

错误信息非常简短（PostgREST 错误码 `PGRST125`），没有堆栈细节，光看日志无法定位根因。

### AI 辅助排查思路（使用 Claude Code）

把这条错误丢给 Claude，AI 提出了 4 个可能原因方向：

1. ⚠️ `SUPABASE_URL` 末尾带了 `/` 或多余路径
2. 表不在 `public` schema
3. Data API 没启用（Supabase 项目创建时的安全选项）
4. 客户端版本与 Publishable Key 不兼容

但 Claude **不能直接读 `.env.local`**（包含真实凭据有泄露风险），所以它帮我写了一段**脱敏诊断脚本** [`scripts/check-supabase.mjs`](https://github.com/xwwcyber/stock-ai/blob/main/scripts/check-supabase.mjs)：

```js
// 关键脱敏打印：只显示前后几位
console.log('URL :', url);
console.log('KEY :', key.slice(0, 12) + '...' + key.slice(-6),
            `(共 ${key.length} 字符)`);

// URL 格式校验
if (url.endsWith('/')) console.warn('⚠️  URL 末尾不应有 /');
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) {
  console.warn('⚠️  URL 格式可能异常');
}

// 逐层诊断：根路径 → 读表 → 写表
const root  = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, ... } });
const read  = await fetch(`${url}/rest/v1/analyses?select=*&limit=1`, ...);
const write = await fetch(`${url}/rest/v1/analyses`, { method: 'POST', ... });
```

### 跑诊断脚本，问题立刻暴露

```bash
$ node --env-file=.env.local scripts/check-supabase.mjs

=== 配置检查 ===
URL : https://rvjgpyxorigsjxzkrbhu.supabase.co/rest/v1/    ← 问题暴露！
KEY : sb_publishab...7ZzQXI (共 46 字符)
⚠️  URL 末尾不应有 /
⚠️  URL 格式可能异常，标准形如 https://abc123.supabase.co
KEY 类型：新版 publishable key ✅

=== 1. 测试基本连通 ===
GET /rest/v1/ → 404 Not Found

=== 2. 测试读 analyses 表 ===
GET analyses → 404 {"code":"PGRST125","details":null,"hint":null,"message":"Invalid path specified in request URL"}
```

### 根因分析

`SUPABASE_URL` 末尾**多了 `/rest/v1/`** —— 配置时从 Supabase Dashboard 的 **"API Docs"** 页复制了完整 endpoint，而不是从 **"Project URL"** 字段拿。

`@supabase/supabase-js` 内部会自己拼 `/rest/v1/<table>` 路径，所以最终请求 URL 变成：

```
https://rvjgpyxorigsjxzkrbhu.supabase.co/rest/v1/  +  /rest/v1/analyses
= https://.../rest/v1/rest/v1/analyses       ← 路径根本不存在
```

PostgREST 找不到这个路径，正确地返回了 `404 PGRST125 Invalid path specified in request URL`。

### 修复

`.env.local` 改一行（**末尾去掉 `/rest/v1/`**）：

```diff
- SUPABASE_URL=https://rvjgpyxorigsjxzkrbhu.supabase.co/rest/v1/
+ SUPABASE_URL=https://rvjgpyxorigsjxzkrbhu.supabase.co
```

重启 dev server 后重跑诊断脚本：

```
=== 2. 测试读 analyses 表 ===
GET analyses → 200 []

=== 3. 测试写 analyses 表 ===
POST analyses → 201 [{"id":"28ee06cd-4cc0-44cd-8e2e-651b34e22588",
                      "symbol":"TEST","name":"诊断写入", ...}]
```

读 `200`、写 `201`，全链路打通。同步在主 API 验证：

```
$ curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"symbol":"600519"}'

{"quote":{...},"analysis":{...},"saved":true,
 "record_id":"00294ca8-929f-49ff-8f3c-4459bc12d73b"}
```

### 经验总结

| 经验 | 说明 |
|---|---|
| **配置类错误用诊断脚本而不是改代码** | 写一段独立的连通性测试，比反复改 SDK 调用更快定位 |
| **脱敏打印是 AI 协作的必要技巧** | 让 AI 看真实凭据值是错的，但「URL 长这样、Key 长这样」这种结构信息可以放心暴露 |
| **错误码搜文档** | `PGRST125` 直接对应 PostgREST 的「路径解析失败」，比 google 错误文案更精准 |
| **诊断脚本要留在仓库里** | `scripts/check-supabase.mjs` 已保留，以后换环境复测可直接跑 |

---

## 5️⃣ 本地复现步骤

```bash
# 1. 克隆
git clone https://github.com/xwwcyber/stock-ai.git
cd stock-ai

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入：
#   DEEPSEEK_API_KEY=sk-...
#   SUPABASE_URL=https://xxxxx.supabase.co      ← 切记不带 /rest/v1/
#   SUPABASE_ANON_KEY=sb_publishable_...

# 4. 在 Supabase SQL Editor 跑一次 supabase/schema.sql 建表

# 5. 启动 dev server
npm run dev
# 浏览器打开 http://localhost:3000

# 6.（可选）跑 Supabase 连通诊断
node --env-file=.env.local scripts/check-supabase.mjs
```

详细凭据申请步骤见仓库根目录的 [`README.md`](https://github.com/xwwcyber/stock-ai/blob/main/README.md#申请凭据约-10-分钟)。

---

## 6️⃣ 总结

| 任务项 | 完成情况 |
|---|---|
| 用户输入股票代码，调用免费 API 获取行情 | ✅ 东方财富，A股/港股/美股 |
| 点击按钮调用 LLM API 分析数据 | ✅ DeepSeek |
| LLM 返回严格 JSON 格式（`summary` / `sentiment` / `risk_level`） | ✅ 三层防御保障 |
| 数据存入 Supabase | ✅ Postgres + RLS |
| 部署到 Render | ✅ https://stock-ai-r7qr.onrender.com |
| 代码提交到 GitHub | ✅ https://github.com/xwwcyber/stock-ai |
| README 包含在线 URL / Prompt / Debug | ✅ |

> **免责声明**：本项目仅作技术演示与学习用途，AI 分析结果不构成任何投资建议。
