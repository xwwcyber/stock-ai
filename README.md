# AI 股票分析面板

> **🌐 在线访问**：**https://stock-ai-r7qr.onrender.com**
>
> 部署平台 Render Free Tier；15 分钟无访问会进入休眠，首次唤醒约 30 秒。
>
> 代码仓库：https://github.com/xwwcyber/stock-ai

一个用 Next.js + DeepSeek + Supabase 搭的全栈小应用：

- 输入股票代码（A股 6 位 / 港股 5 位 / 美股字母），从东方财富拉取实时行情
- 调用 DeepSeek 让 LLM 返回严格 JSON 结构的分析（`summary` / `sentiment` / `risk_level` / `key_factors`）
- 结果落入 Supabase Postgres，主页展示历史记录

## 技术栈

| 层     | 选型                                             |
| ------ | ------------------------------------------------ |
| 前端   | Next.js (App Router) + TypeScript + Tailwind CSS |
| 后端   | Next.js API Routes (Node runtime)                |
| 行情   | 东方财富公开 HTTP 接口（无需 Key）               |
| LLM    | DeepSeek（`deepseek-chat`，兼容 OpenAI SDK）     |
| 数据库 | Supabase Postgres                                |
| 部署   | Render Web Service                               |

## 目录结构

```
.
├── app/
│   ├── api/
│   │   ├── analyze/route.ts   # POST 触发分析 + 落库
│   │   ├── quote/route.ts     # GET 查询行情
│   │   └── history/route.ts   # GET 历史记录
│   ├── layout.tsx
│   ├── page.tsx               # 主界面
│   └── globals.css
├── lib/
│   ├── eastmoney.ts           # 东方财富行情封装
│   ├── deepseek.ts            # DeepSeek 调用 + JSON 校验
│   └── supabase.ts            # Supabase 客户端 + 读写
├── supabase/schema.sql        # 建表 SQL
├── .env.example
└── package.json
```

## 本地运行

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env.local
# 然后编辑 .env.local 填入真实凭据（见下文「申请凭据」）

# 3. 启动开发服务器
npm run dev
# 访问 http://localhost:3000
```

## 申请凭据（约 10 分钟）

### 1. DeepSeek API Key

1. 打开 https://platform.deepseek.com/ ，微信或手机号注册
2. 顶部「充值」充 ¥10（按当前价格用很久）
3. 左侧菜单「API Keys」→「Create new API key」→ 复制 `sk-...` 到 `.env.local` 的 `DEEPSEEK_API_KEY`

### 2. Supabase

1. https://supabase.com/ → GitHub 登录 → New Project
   - Region 建议选 Singapore 或 Tokyo
   - 数据库密码自行设定并记好
2. 项目创建完成后，左侧菜单 `SQL Editor` → 新建 query → 粘贴 `supabase/schema.sql` 的内容 → Run
3. 左侧菜单 `Settings → API`：
   - 复制 `Project URL` 填到 `SUPABASE_URL`
   - 复制 `anon public key` 填到 `SUPABASE_ANON_KEY`

> 注意：演示 SQL 里启用了 RLS 但允许 anon 直接读写。生产场景请改用 service role key 或更严格的策略。

## 部署到 Render

### 1. 推到 GitHub

```bash
git init
git add .
git commit -m "feat: 初始化 AI 股票分析面板"
git branch -M main
git remote add origin https://github.com/<你的用户名>/stock-ai.git
git push -u origin main
```

### 2. Render 创建 Web Service

1. 登录 https://render.com → 「New +」→「Web Service」
2. 连接 GitHub，选你刚推的仓库
3. 配置如下：
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Plan**: Free 即可
4. **Environment Variables** 里添加（来自 `.env.local`）：
   - `DEEPSEEK_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
5. 点 Create Web Service。第一次构建约 3-5 分钟，完成后会得到一个 `https://stock-ai-xxxx.onrender.com` 的地址

> Render 免费实例 15 分钟无访问会休眠，第一次请求约需 30 秒冷启动。

## API 速查

| 路径                       | 方法              | 说明                              |
| -------------------------- | ----------------- | --------------------------------- |
| `/api/quote?symbol=600519` | GET               | 返回行情 JSON                     |
| `/api/analyze`             | POST `{ symbol }` | 返回 `{ quote, analysis, saved }` |
| `/api/history`             | GET               | 返回最近 20 条历史记录            |

## Prompt 设计：如何强制 LLM 只吐 JSON

LLM 默认非常喜欢「在 JSON 前后写一堆解释」「把代码块用 ```json 包起来」「字段名拼写不一致」，这些都会让前端解析炸掉。本项目用**三层防御**保证最终拿到的一定是合法且字段合规的 JSON。

### 第一层：System Prompt 写死格式契约

文件位置：[`lib/deepseek.ts`](lib/deepseek.ts#L18-L29)

```ts
const SYSTEM_PROMPT = `你是一名资深股票分析师。基于用户给出的实时行情快照，输出客观的短评。

返回必须是严格的 JSON 对象，字段如下：
- summary: string（中文，120-200 字，总结当前价格表现、成交活跃度、相对昨收的位置，避免任何投资建议）
- sentiment: "Bullish" | "Neutral" | "Bearish"（基于技术面信号判断当下情绪）
- risk_level: "Low" | "Medium" | "High"（结合波幅、换手率、估值给出风险）
- key_factors: string[]（3-5 条最关键的支撑/风险点，每条不超过 30 字）

只返回 JSON，不要任何解释性前后缀，不要使用 markdown 代码块包裹。`;
```

关键点：

- **逐字段列约束**：每个字段都标出类型 + 取值范围 + 字数限制，比一句「输出 JSON」有效得多
- **枚举值用字面量写出**：`"Bullish" | "Neutral" | "Bearish"`，模型会照抄
- **明确禁止 markdown 包裹**：很多模型会输出 ` ```json ... ``` `，导致 `JSON.parse` 失败

### 第二层：API 调用层强制 JSON 模式

文件位置：[`lib/deepseek.ts`](lib/deepseek.ts#L47-L54)

```ts
const completion = await client.chat.completions.create({
  model: "deepseek-chat",
  messages: [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(quote) },
  ],
  response_format: { type: "json_object" }, // ← 关键
  temperature: 0.4, // ← 降低发散度
  max_tokens: 800,
});
```

- `response_format: { type: 'json_object' }`：DeepSeek（兼容 OpenAI 协议）会在解码层强制约束输出为合法 JSON 对象，**从根本上杜绝非 JSON 输出**
- `temperature: 0.4`：股票分析不需要创造性，低温度让字段取值更稳定

### 第三层：后端运行时校验，非法值直接抛错

文件位置：[`lib/deepseek.ts`](lib/deepseek.ts#L70-L91)

```ts
function validate(data: unknown): Analysis {
  if (!data || typeof data !== "object") throw new Error("LLM 输出格式错误");
  const obj = data as Record<string, unknown>;

  const summary = typeof obj.summary === "string" ? obj.summary : "";
  const sentiment = obj.sentiment;
  const risk_level = obj.risk_level ?? obj.riskLevel; // 兼容 camelCase
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
```

- 即使前两层都失守，这里也会拦住任何「字段缺失 / 枚举值乱写 / 类型错误」的输出
- 兼容 `riskLevel` / `risk_level` 两种命名（模型偶尔会用驼峰），但**不接受 `Up/Down`、`高/中/低`** 这类擅自翻译

### 实际输出样例（线上抓取）

输入：`{ "symbol": "000001" }`（平安银行）

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

## Debug 记录：`Invalid path specified in request URL` 真实排查

部署初次试跑时，前端能拉到行情、AI 能正常返回分析，但响应里始终是 `saved: false`，**Supabase 写入失败**。

### 现象

```
POST /api/analyze 200
[save] 落库失败: Error: Supabase 写入失败: Invalid path specified in request URL
    at saveAnalysis (lib\supabase.ts:48:20)
```

错误信息很短（PostgREST 错误码 `PGRST125`），没有堆栈细节，光看日志无法定位问题。

### AI 辅助排查思路

我把 `Invalid path specified in request URL` 这条错误丢给 Claude，AI 给出的可能原因列表：

1. `SUPABASE_URL` 末尾带了 `/` 或路径
2. 表不在 `public` schema
3. `Data API` 没启用
4. 客户端版本与 publishable key 不兼容

由于无法直接读 `.env.local`（包含真实凭据），AI 帮我写了一段**脱敏诊断脚本** `scripts/check-supabase.mjs`：

```js
// 关键脱敏打印：只显示前后几位
console.log('URL :', url);
console.log('KEY :', key.slice(0, 12) + '...' + key.slice(-6));

// 逐层诊断：根路径 → 读表 → 写表
const root  = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, ... } });
const read  = await fetch(`${url}/rest/v1/analyses?select=*&limit=1`, ...);
const write = await fetch(`${url}/rest/v1/analyses`, { method: 'POST', ... });
```

跑一次 `node --env-file=.env.local scripts/check-supabase.mjs`，输出：

```
URL : https://rvjgpyxorigsjxzkrbhu.supabase.co/rest/v1/    ← 问题暴露！
KEY : sb_publishab...7ZzQXI (共 46 字符)
⚠️  URL 末尾不应有 /
⚠️  URL 格式可能异常，标准形如 https://abc123.supabase.co
```

### 根因

`SUPABASE_URL` 末尾**多了 `/rest/v1/`** —— 用户在 Supabase Dashboard 复制时，从 "API Docs" 页拿了完整 endpoint，而不是从 "Project URL" 字段拿。

`@supabase/supabase-js` 内部会自己拼 `/rest/v1/<table>` 路径，所以变量被覆盖成：

```
https://rvjgpyxorigsjxzkrbhu.supabase.co/rest/v1/  +  /rest/v1/analyses
= https://.../rest/v1/rest/v1/analyses    ← 路径不存在
```

PostgREST 返回 `404 PGRST125 Invalid path specified in request URL` 是正确的。

### 修复

`.env.local` 改一行：

```diff
- SUPABASE_URL=https://rvjgpyxorigsjxzkrbhu.supabase.co/rest/v1/
+ SUPABASE_URL=https://rvjgpyxorigsjxzkrbhu.supabase.co
```

重启 dev server 后立即跑通：

```
=== 3. 测试写 analyses 表 ===
POST analyses → 201 [{"id":"28ee06cd-...","symbol":"TEST",...}]
```

### 收获

- **配置类错误用诊断脚本而不是改代码**：写一段独立的连通性测试，比反复改 SDK 调用更快定位
- **脱敏打印是必须的**：让 AI 看真实凭据值是错的，但「URL 长这样、Key 长这样」这种结构信息可以放心暴露
- **错误码搜文档**：`PGRST125` 直接 grep PostgREST 源码就能确认是路径解析失败

> 这段排查脚本被保留在仓库的 `scripts/check-supabase.mjs`，以后换环境复测可以直接跑。

## 免责声明

本项目仅作技术演示与学习用途，AI 分析结果不构成任何投资建议。
