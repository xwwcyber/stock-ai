# AI 股票分析面板

一个用 Next.js + DeepSeek + Supabase 搭的全栈小应用：

- 输入股票代码（A股 6 位 / 港股 5 位 / 美股字母），从东方财富拉取实时行情
- 调用 DeepSeek 让 LLM 返回严格 JSON 结构的分析（`summary` / `sentiment` / `risk_level` / `key_factors`）
- 结果落入 Supabase Postgres，主页展示历史记录

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Next.js (App Router) + TypeScript + Tailwind CSS |
| 后端 | Next.js API Routes (Node runtime) |
| 行情 | 东方财富公开 HTTP 接口（无需 Key） |
| LLM | DeepSeek（`deepseek-chat`，兼容 OpenAI SDK） |
| 数据库 | Supabase Postgres |
| 部署 | Render Web Service |

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

| 路径 | 方法 | 说明 |
|---|---|---|
| `/api/quote?symbol=600519` | GET | 返回行情 JSON |
| `/api/analyze` | POST `{ symbol }` | 返回 `{ quote, analysis, saved }` |
| `/api/history` | GET | 返回最近 20 条历史记录 |

## LLM 返回 JSON 结构

```json
{
  "summary": "贵州茅台今日开盘后小幅走低…",
  "sentiment": "Bullish | Neutral | Bearish",
  "risk_level": "Low | Medium | High",
  "key_factors": ["换手率偏低，市场观望", "估值仍处于历史中位", "..."]
}
```

`sentiment` 与 `risk_level` 都在后端做了枚举校验，模型若返回非法值会抛出错误。

## 免责声明

本项目仅作技术演示与学习用途，AI 分析结果不构成任何投资建议。
