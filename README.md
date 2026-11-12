# Dayflow

[![CI](https://github.com/waterfish111/Dayflow/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/waterfish111/Dayflow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f6b4f.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](tsconfig.app.json)
[![PWA](https://img.shields.io/badge/PWA-installable-5a0fc8.svg)](public/manifest.webmanifest)

手机优先的个人日程助手。用一句自然语言描述安排，AI 只负责**理解语言**，具体时间由**确定性排期引擎**计算，确认后才写入日历。

> **核心取舍**：让模型做它擅长的事（把「周三下午组会改到四点」变成结构化字段），把「时间怎么排」交给可测试的代码。模型输出永远是草案，用户勾选后才落库。

在线演示：

- 阿里云服务器（IP 直连，国内可访问）：<http://39.106.48.233>
- Vercel（备用，部分大陆网络不可直连）：<https://dayflow-eta-teal.vercel.app>

> IP 直连版本走的是 HTTP，Service Worker 只在 HTTPS 下生效，所以「添加到桌面 / 离线缓存 / 浏览器通知」在这个地址上不可用；配好域名和证书后即可恢复。

| 自然语言 → 草案确认 | 周视图自动排期 | 手机端 390px |
|---|---|---|
| <img src="docs/screenshots/01-draft.png" width="300" alt="草案确认：4 条解析结果，低置信度条目默认不勾选"> | <img src="docs/screenshots/02-week.png" width="420" alt="周视图：自动排期结果与待办池"> | <img src="docs/screenshots/03-mobile.png" width="150" alt="390px 手机端布局"> |

## 它解决什么问题

日程工具的输入成本很高：想加一件事，要先选日期、再选时间段、再拖动、再确认冲突。但人描述计划时用的却是「明天下午写两小时报告，周五前交」这种模糊表达。

Dayflow 把这条路径压缩成一句话，同时不让 AI 直接决定时间——因为 LLM 不知道你今天 19:00 已经排了课，也不知道你每天最多安排 6 小时。

## 功能

- **自然语言 → 草案 → 确认**：一句话可以拆成多个条目（任务 / 固定事件）
- **确认前就看到时间**：草案里直接用同一个排期函数试算一遍，显示「预计 明天 19:00–21:00」或「暂时没有空档」
- **人机边界**：信息不足时 AI 先反问；低置信度条目默认不勾选；明确说「加入待办池」则完全不排期
- **确定性排期**：按优先级、截止时间、首选时间、每日上限、任务间缓冲找空档；排不下就回待办池并说明原因
- **日历**：日 / 周 / 月三视图，15 / 30 / 60 分钟粒度，桌面端拖拽改期、拖回待办池
- **自定义节奏**：工作日 / 周末作息模板、每日安排上限、缓冲时间、免打扰时段、分类
- **PWA**：可安装、离线外壳缓存、应用内提醒与系统通知
- **数据自持**：状态存在浏览器 `localStorage`，DeepSeek Key 由使用者自带（或由站点提供限额演示额度），支持 JSON 导出与导入（换设备 / 换域名不丢数据）

## 排期引擎

`src/lib/scheduler.ts` 是一个纯函数：相同输入必得相同输出，不依赖随机数、不依赖网络。

```ts
autoSchedule(tasks, settings, { today: "2026-11-09" })
// → { tasks, warnings }
```

规则（按顺序）：

1. **候选日期**：任务已指定日期时只考虑那一天；有截止时间时从今天枚举到今天与截止日期的较小者；否则在 horizon 天（默认 14）内逐日尝试
2. **候选时段**：在作息模板的时间块内按粒度步进；没有时间块时回退到「起床–睡觉」整段
3. **冲突判定**：与已排条目重叠则跳过，前后各留 `bufferMinutes`
4. **每日上限**：只统计 `kind === "task"` 的时长，事件不占额度但占时间
5. **截止截断**：当天可用结束时间不超过截止时间
6. **失败处理**：所有候选日期都放不下时保持未排期，并返回「在接下来 N 天内没有找到合适的空档」的警告

举例：工作日可排 19:00–22:00，已占 19:00–20:30，新任务 60 分钟，缓冲 5 分钟 → 20:35 起找空档，按 30 分钟粒度落到 21:00–22:00。

## 技术栈

| 层 | 使用 |
|---|---|
| 前端 | React 19、TypeScript（strict）、Vite、原生 CSS |
| 本地服务 | Node.js、Express、Vite middleware |
| 线上 API | Vercel Serverless Functions |
| AI | DeepSeek Chat Completions，JSON 结构化输出 |
| 数据 | 浏览器 `localStorage`，local-first |
| 测试 | Vitest（37 个单元测试，覆盖排期与日期工具） |
| 基准与评测 | `pnpm bench` 排期耗时基准，`pnpm eval:ai` 解析准确率评测（24 条中文用例） |
| CI | GitHub Actions：typecheck → test → build |
| PWA | Manifest、Service Worker、通知权限 |

## 架构

```text
浏览器
  ├── React 页面（TypeScript / CSS）
  ├── 排期引擎（src/lib/scheduler.ts，纯函数）
  ├── 本地存储（src/data/storage.ts）
  └── POST /api/ai/parse
          ├── 本地：server/index.mjs
          └── 线上：api/ai/parse.js
                    └── server/ai.mjs
                          └── DeepSeek API
```

关键设计：

- **本地和线上共用 `server/ai.mjs`**，只有一套提示词和一套结果清洗逻辑，避免「本地能跑、线上不一样」
- **AI 输出要过两道清洗**：服务端校验 JSON 结构，客户端再用正则校验 `HH:mm` / `YYYY-MM-DD`，不信任模型输出
- **已排期状态是派生的**：`date && start && end` 三者齐全即为已排期，不额外存 `scheduled` 标志位，避免两个字段互相矛盾
- **日期用 `YYYY-MM-DD` 墙上时间**，不经过 UTC，避免跨时区偏移一天

## 快速开始

需要 Node.js ≥ 20 和 pnpm 11。

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

常用命令：

```bash
pnpm typecheck  # tsc --noEmit，strict
pnpm test       # vitest run
pnpm build      # typecheck + vite build
pnpm preview    # 以生产模式启动本地服务
```

## 配置 DeepSeek

有两种模式，按场景选一个：

**A. 访客自带 Key（默认）**

打开右上角「设置」，在 DeepSeek 区域填入自己的 API Key。

- Key 只保存在当前浏览器的 `localStorage`，不写入仓库、不经过数据库
- 请求由服务端代理转发，前端不把 Key 拼进页面代码
- 默认模型 `deepseek-chat`，可切换 `deepseek-reasoner`

**B. 站点共享演示额度（公开 demo 用）**

在服务端 `.env` 里配置一个额度很小的 Key：

```bash
DEMO_KEY=sk-你的低余额Key
DEMO_DAILY_LIMIT=20    # 每个 IP 每天的次数，默认 20
DEMO_GLOBAL_LIMIT=200  # 全站每天总次数，防止换 IP 刷；0 = 不限
```

配置后：没填 Key 的访客会自动使用 `DEMO_KEY`，按 IP 每天计数；页面顶部会显示「演示模式 · 每天 20 次」，草案弹窗底部会显示本次剩余次数。用完了返回 `429`，并提示去设置里填自己的 Key。填了自己 Key 的请求不计数。

实现见 `server/demo.mjs`（Key 选择 + 额度扣减）与 `server/ratelimit.mjs`（内存计数器）。计数存在进程内存里：重启清零、多实例不共享——单机 demo 够用，要抗刷得换 Redis。

兼容旧变量名：只配 `DEEPSEEK_API_KEY` 时也会当作演示 Key，并同样受每日限额约束（不会再出现「配了环境变量就等于无限额度」的情况）。

**关于 Key 安全**（重要）：

- `DEMO_KEY` 只在服务端 `.env` 里，**永远不会发给浏览器**；前端拿到的只有剩余次数
- 服务端不打印请求头、不把 Key 写进日志、不回显上游错误体；`.env` 已加入 `.gitignore`，权限建议 `600`
- 但**当前是 HTTP**：访客在设置里填自己的 Key 时，这个 Key 会以明文经过网络（`x-deepseek-key` 头）。所以现在的建议是「只用自己的演示额度，别在公网 HTTP 页面上填自己的 Key」；等配好域名和证书再开放自带 Key

## 测试

```bash
pnpm test
```

`src/lib/scheduler.test.ts` 覆盖：空日历放置、时间块回退、跳过占用、缓冲边界、粒度取整、每日上限、截止截断、指定日期不跨天、优先级排序、`taskIds` 重排、事件不占额度、重复规则展开（每天 / 每周 / 每 N 天 / until / 缺字段）。

`src/lib/date.test.ts` 覆盖：跨月跨年加减、闰年、周起始、月视图 42 格、时间与分钟互转与夹取、免打扰跨零点。

CI 在每次 push 和 PR 上执行 `typecheck → test → build`。

## 基准与评测

两个「可验证」脚本，用来回答「你怎么知道它够快、够准」。

**排期耗时**（`pnpm bench`，5 轮取分位，horizon 14 天，默认设置）：

| 任务数 | p50 | p95 | 已排入 |
|---|---|---|---|
| 20 | 0.4 ms | 6.4 ms | 20 |
| 200 | 4.7 ms | 5.6 ms | 69 |
| 1000 | 20.3 ms | 21.3 ms | 90 |
| 5000 | 89.1 ms | 95.5 ms | 96 |

规模上去后排入变少是容量问题（14 天内只有那么多空档），不是算法卡死；耗时基本线性，5000 条仍在 100 ms 内。

**AI 解析准确率**（`pnpm eval:ai`，24 条中文用例，按字段拆分）：

```bash
pnpm eval:ai --dry-run   # 只校验题库，不花钱
pnpm eval:ai --mock      # 用标准答案反测打分逻辑（应得 100%）
DEEPSEEK_API_KEY=sk-xxx pnpm eval:ai   # 真跑
```

每条用例断言 `条数 / kind / date / start / end / minutes / deadline / priority / pool / recurrence / weekdays`，输出每个字段的命中率与失败明细。改提示词后可以直接对比退化在哪一类。

> 未在 README 里写具体准确率数字：需要真实 Key 跑出来才算证据，不编。跑完把结果贴到 `docs/INTERVIEW.md`。

## 已知限制

- **数据在单个浏览器**：换设备、换域名或清缓存不会自动迁移，需要用「导出 JSON / 导入 JSON」手动搬；导入会覆盖当前任务
- **通知不是真后台**：只在页面打开时每 30 秒检查一次，关闭页面后不会提醒；需要 Web Push 或 Capacitor 壳
- **`vercel.app` 在部分网络不可直连**：这是网络环境问题，不是代码错误；换自定义域名 + Cloudflare 或迁移机房可解
- **Key 明文存储**：`localStorage` 未加密，个人自用可接受，公开分享前需要改造
- **重复任务展开 42 天**：修改其中一次不会同步整组；`horizonDays` 参数当前包含起始日，展开条数比参数大 1
- **排期是贪心算法**：先排优先级高的任务，不做全局最优；已指定日期的任务排不下时不会自动跨天
- **暂无**：账号体系、云同步、子任务、统计报表、分享、系统日历同步、Android / iOS 原生包

## 项目文档

- [完整项目学习手册：从需求到部署](docs/PROJECT_LEARNING_MANUAL.md)
- [阶段一部署专题：Vercel 与 esbuild 问题](docs/PHASE1_LEARNING_MANUAL.md)
- [代码阅读笔记](docs/LEARNING.md)
- [Vercel 部署操作步骤](docs/DEPLOY_VERCEL.md)
- [云服务器部署（IP 直连，免备案）](docs/DEPLOY_VPS.md)
- [面试材料包：简历写法、90 秒讲述稿与预判问答](docs/INTERVIEW.md)

## 项目历程

| 时间 | 进展 |
|---|---|
| 2026-10-17 | 明确产品需求，完成第一版本地应用 |
| 2026-10-17 | 推送 GitHub 仓库，实现自然语言、排期、日历、待办池 |
| 2026-10-19 | 改造为 Vercel Serverless 结构并完成首次部署 |
| 2026-10-19 | 修复 pnpm / esbuild 安装脚本问题（`ERR_PNPM_IGNORED_BUILDS`） |
| 2026-10-19 | 完成线上健康检查；发现手机直连 `vercel.app` 受网络环境影响 |
| 2026-11-08 | 补充 MIT 协议、Vitest 单元测试与 GitHub Actions |
| 2026-11-09 | 补三张真实界面截图、仓库 About 与 `v0.2.0` Release |
| 2026-11-12 | 部署到阿里云（IP 直连），加演示额度与草案预计时间 |
| 2026-11-12 | 补 JSON 导入（含 schema 校验）、排期基准与 AI 解析评测脚本 |

## 下一步

1. 拆分 `src/App.tsx` 为 hooks + reducer，降低耦合
2. Web Push 或 Capacitor APK，补真正的后台提醒
3. 域名 + HTTPS：恢复 Service Worker，并让「填自己 Key」在链路上安全
4. Playwright 端到端测试，覆盖「输入 → 草案 → 确认 → 刷新仍在」
5. 用真实 Key 跑一遍 `pnpm eval:ai`，把字段准确率写进 `docs/INTERVIEW.md`

## License

[MIT](LICENSE)
