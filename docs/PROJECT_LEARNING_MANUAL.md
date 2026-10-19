# Dayflow 项目学习手册：从需求到部署

这份手册覆盖 Dayflow 从需求讨论、第一版实现、GitHub 管理，到 Vercel 部署和手机访问问题的完整过程。

阶段一的部署专题仍然保留在 [PHASE1_LEARNING_MANUAL.md](PHASE1_LEARNING_MANUAL.md)，可以作为本文的详细附录。

## 1. 项目起点

最初的目标是做一个可以依据自然语言分析每日工作学习计划的工具：

- 内置日历，可以按时间段查看安排
- 能在桌面和手机上使用
- 用自然语言输入计划
- 由 AI 辅助生成日程

第一轮讨论没有直接写代码，而是先确认了产品边界。这个决定很重要，因为“AI 日历”很容易变成一个功能很多但没有主线的项目。

## 2. 需求如何收敛

| 问题 | 最终选择 | 原因 |
|---|---|---|
| 产品形态 | 手机优先的 PWA，Android 优先 | 先验证真实使用，再考虑原生 App |
| 桌面端 | 暂时不作为重点 | 手机是主要场景，跨设备同步以后再做 |
| 日历 | 内置日历，不接系统日历 | 降低 OAuth、冲突和同步复杂度 |
| AI | DeepSeek，用户自己的 Key | 理解中文自然语言，成本和权限边界清晰 |
| AI 输出 | 先生成草案，用户确认后写入 | 避免模型误判直接改正式日程 |
| 排期 | AI 解析 + 确定性排期引擎 | AI 负责理解，代码负责计算时间 |
| 任务拆分 | 第一版不做子任务 | 控制复杂度，先保证单条日程稳定 |
| 统计/分享 | 第一版不做 | 先把主链路做完整 |
| 通知 | 应用内 + 手机系统通知 | 8:00 汇总，重要时间提前 2 小时 |
| 数据 | 先 localStorage，后续 Supabase | 先让个人版本跑起来，再补云端 |

几个关键取舍：

- **没有让 AI 直接排时间**。模型负责理解“周五晚上”“截止周日”，排期算法负责避开冲突、检查每日上限。
- **没有把所有功能都做全**。第一版刻意去掉了统计、分享、子任务和系统日历同步。
- **没有把 Key 写进代码**。每个使用者填自己的 Key，服务端只做代理。
- **没有把“能部署”等同于“手机一定能访问”**。后来证明这两件事确实是分开的。

## 3. 技术选型

| 层 | 选择 | 学习价值 |
|---|---|---|
| 前端 | React 19 + TypeScript + Vite | 组件化、类型检查、现代构建 |
| 样式 | 原生 CSS | 响应式布局、设计变量、移动端适配 |
| 本地服务 | Node.js + Express + Vite middleware | 理解 HTTP、API 代理和开发服务器 |
| 线上 API | Vercel Serverless Functions | 无状态函数、冷启动、执行时长 |
| AI | DeepSeek Chat Completions | 提示词、JSON 输出、错误处理 |
| 数据 | localStorage | 本地优先、序列化、数据迁移问题 |
| PWA | manifest + Service Worker | 安装、缓存、HTTPS 和通知权限 |
| 版本管理 | Git + GitHub | 提交、远程仓库、部署触发 |

项目没有使用数据库，也没有使用状态管理库。对当前规模来说，这些选择足够；以后接 Supabase 时再引入数据库和认证。

## 4. 数据模型

核心数据在 `src/types.ts`：

### ScheduleItem

一条已排或待排的日程：

- `title`、`kind`（task/event）
- `date`、`start`、`end`
- `estimatedMinutes`
- `priority`（high/medium/low）
- `category`
- `deadline`
- `locked`、`completed`
- `recurrence`
- `source`（manual/ai）

有 `date + start + end` 的任务进入日历；没有完整时间的任务进入待办池。这样不需要额外保存一个“是否已排期”的布尔字段，状态由数据本身推导出来。

### Settings

保存工作日/周末模板、每日最大分钟数、缓冲时间、默认视图、免打扰、分类和 AI 模型。

### ParsedItem / DraftItem

AI 返回的是候选数据，不是正式日程：

- `confidence` 决定草案里是否默认勾选
- `assumptions` 记录模型做出的推断
- `questions` 记录需要用户补充的信息

“草案”和“正式日程”分开，是整个产品最重要的边界之一。

## 5. 核心流程

```text
输入自然语言
   ↓
DeepSeek 解析
   ↓
生成 DraftItem 列表
   ↓
低置信度条目等待确认
   ↓
用户拖拽/勾选/补充
   ↓
排期引擎 autoSchedule
   ↓
写入日历 + localStorage
```

如果信息不足，AI 先在 `questions` 中反问；如果用户不想继续回答，也可以手动编辑或放弃草案。

## 6. 排期算法

排期代码在 `src/lib/scheduler.ts`。

基本思路：

1. 把任务看作一段有长度的时间。
2. 把固定日程、已排任务和锁定任务看作已占用区间。
3. 从工作日/周末模板中取出可用时段。
4. 按优先级、截止时间排序。
5. 在可用时段中寻找不重叠、满足每日上限和缓冲的时间块。
6. 当天放不下就尝试下一天，最多看 21 天。
7. 找不到空档时保留在待办池，并返回 warning。

伪代码：

```text
for task in tasks sorted by priority, deadline:
  for date in candidateDates(task):
    for block in availableBlocks(date):
      for start in block:
        if fits(start, duration, busy, dailyMax, deadline):
          place task
          break
```

几个重要概念：

- **硬约束**：锁定、固定日程、截止时间、每日上限。
- **软约束**：优先级、首选时间、尽早安排。
- **可解释性**：为什么排到这里，可以通过占用区间和候选日期解释。

当前算法还没有处理任务依赖、自动顺延未完成任务、跨时区、通勤时间和多人日历。

## 7. AI 层

`server/ai.mjs` 是本地和 Vercel 共用的核心：

1. 把当前日期、星期、时区、分类、作息模板和用户输入拼成提示词。
2. 要求 DeepSeek 只返回 JSON。
3. 清洗日期、时间、优先级、置信度和 recurrence。
4. 返回 `items + questions + summary`。

提示词明确要求：

- 一句话有几件事就输出几个 item
- 不把单个任务拆成多个步骤
- 日期按当前日期换算
- 信息不足时提问，不要编造
- 没有说明优先级时默认 medium
- 明确说“加入待办池”时设置 `pool: true`，不生成日期和开始/结束时间

Key 的路径：

```text
设置页 → localStorage → 请求头 x-deepseek-key
       → Vercel Function → DeepSeek API
```

当前 Key 没有在服务端持久化，也没有应用层加密。个人自用可以接受，公开分享前需要重新设计。

## 8. 界面与交互

界面优先考虑手机：

- 默认周视图
- 日视图使用时间轴
- 月视图看整体分布
- 15 / 30 / 60 分钟粒度
- 优先级用红/黄/绿圆点
- 未完成用单独的红色边框或角标
- 锁定任务显示锁图标
- 任务编辑器支持日期、时间、截止、分类、重复、备注、地点和链接

桌面端可以拖拽任务到另一天，或在日视图里移动到新时间；移动端以编辑时间为主。

日历中的任务也可以拖入右侧待办池，任务会清空日期和时间但保留标题、分类、优先级和预计时长。任务编辑器里另外提供了“移入待办池”按钮，方便触屏设备或不方便拖拽时使用。固定日程和锁定任务不会被移入待办池。

UI 的一个原则是：**不要让颜色成为唯一信息**。优先级除了颜色，还有位置和文字；未完成状态也有独立标记。

## 9. PWA 与通知

项目包含：

- `manifest.webmanifest`
- `sw.js`
- 192/512 PNG 图标

通知的第一版实现：

- 每天固定时间发送当天任务汇总
- 有具体开始时间的日程提前 2 小时提醒
- 有截止时间的任务在截止前 2 小时提醒
- 免打扰时间段可配置

现实限制：

- 通知需要 HTTPS；`localhost` 例外
- 网页关闭后，JavaScript 定时器不能保证继续运行
- 真正的后台提醒需要 Web Push + 服务端定时任务，或 Capacitor APK 的本地通知
- iPhone 的网页通知限制更多，所以第一版优先 Android

## 10. 构建与部署

本地开发：

```text
浏览器 → Express + Vite middleware → /api/ai/parse
```

线上部署：

```text
浏览器 → Vercel 静态资源
       → api/ai/parse.js
       → server/ai.mjs
       → DeepSeek
```

Vercel 配置：

- 构建命令：`pnpm build`
- 输出目录：`dist`
- API 函数超时：60 秒
- 代码内部 DeepSeek 超时：50 秒

### 这次真实遇到的构建问题

第一次 Vercel 部署在 install 阶段失败：

```text
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild
Error: Command "pnpm install" exited
```

根因是 `pnpm-workspace.yaml` 里有一个占位值：

```yaml
allowBuilds:
  esbuild: set this to true or false
```

改成：

```yaml
allowBuilds:
  esbuild: true
```

本地验证：

```powershell
pnpm install
pnpm rebuild esbuild
pnpm build
```

之后 Vercel 部署成功。这个案例说明：**install 失败不等于业务代码失败**，构建工具的原生依赖也有自己的安装脚本。

### 部署成功后的新问题

Vercel 部署成功后，电脑可以通过代理访问，但手机直连 `vercel.app` 打不开，连 `/api/health` 也无法访问。

进一步检查发现：

- 线上站点本身返回 200
- Vercel 没有启用登录保护
- 电脑系统代理是 `127.0.0.1:7897`
- 电脑通过代理访问，手机没有代理
- 手机 DNS/网络到 `vercel.app` 的链路不稳定

这说明“部署成功”和“目标用户能访问”是两个不同问题。下一阶段需要自定义域名 + Cloudflare，或者迁移到香港/国内服务器。

## 11. 项目时间线

| 时间 | 事件 |
|---|---|
| 2026-10-17 | 讨论产品定位、AI 方式、日历和提醒需求 |
| 2026-10-17 | 完成 React/TypeScript 第一版和确定性排期算法 |
| 2026-10-17 | 初始化 Git 仓库并推送到 GitHub |
| 2026-10-19 | 把 Express 逻辑拆成共享 AI 模块，增加 Vercel API |
| 2026-10-19 | 修复 pnpm/esbuild 安装脚本问题，Vercel 部署成功 |
| 2026-10-19 | 编写阶段一学习手册 |
| 2026-10-19 | 发现手机网络无法直连 `vercel.app`，开始评估域名和服务器方案 |

## 12. 已验证的内容

- `pnpm build` 通过
- 本地 `/api/health` 正常
- 本地无 Key 请求返回 400
- 本地错误 Key 请求到达 DeepSeek 并返回 401
- Vercel 首页返回 200
- Vercel `/api/health` 返回 `{"ok":true,"service":"dayflow"}`
- Vercel `/api/ai/parse` 无 Key 返回 400
- Vercel manifest 和 service worker 可访问
- 390px 手机宽度下页面布局正常
- 手动任务、待办池自动排期、日/周/月切换、设置保存、刷新持久化、完成状态均经过本地验证
- AI 提示词和结果清洗已支持 `pool: true`；任务编辑器“移入待办池”路径已实际验证

## 13. 项目做得好的地方

- 有明确的主链路，没有把“AI 日历”做成功能堆砌
- AI 与排期分离，结果可解释
- 第一版范围控制得比较好
- UI 完成度高，手机优先布局成立
- 本地和线上共用核心代码
- 遇到构建和网络问题时有记录、有验证
- 文档、GitHub、部署流程完整

## 14. 还需要提高的地方

- 缺少自动化测试，尤其是排期边界条件
- 没有真实数据库、登录和权限体系
- 没有后台推送和原生 App
- Key 存储方式只适合个人
- 手机网络可达性还没有解决
- AI 输出缺少评测集、重试和限流
- 代码里还存在一些第一版留下的复杂度，可以继续重构

## 15. 下一步建议

按优先级：

1. **解决手机访问**：自定义域名 + Cloudflare，或香港/国内服务器。
2. **接 Supabase**：登录、数据表、RLS、云同步、本地数据迁移。
3. **补通知**：Web Push 或 Capacitor APK 本地通知。
4. **补测试**：`src/lib/scheduler.ts` 的单元测试和 GitHub Actions。
5. **做 AI 评测**：固定中文输入集，统计日期、时间、优先级解析准确率。

## 16. 建议练习

1. 把工作日可用时间改成两个时段，观察排期结果。
2. 把每日上限改成 60 分钟，测试任务是否留在待办池。
3. 给锁定任务写一个测试，确认自动排期不会移动它。
4. 给 `/api/health` 增加版本号，验证 GitHub push 后 Vercel 自动部署。
5. 故意填错 DeepSeek Key，观察 401 错误如何显示。
6. 在手机无痕窗口测试部署地址，区分缓存和网络问题。
7. 把数据导出为 JSON，再设计一个导入流程，思考数据迁移。

## 17. 文件地图

```text
src/App.tsx                 应用状态和业务闭环
src/types.ts                数据模型
src/lib/scheduler.ts        排期算法
src/lib/date.ts             日期和时间工具
src/lib/ai.ts               前端 AI 请求
src/lib/notifications.ts    提醒逻辑
src/data/storage.ts         localStorage
server/ai.mjs               本地与线上共享的 AI 核心
server/index.mjs            本地 Express 服务
api/ai/parse.js             Vercel AI 函数
api/health.js               Vercel 健康检查
vercel.json                 Vercel 配置
docs/DEPLOY_VERCEL.md       部署操作
```

## 18. 常用命令

```powershell
pnpm dev
pnpm typecheck
pnpm build

node server/index.mjs
$env:NODE_ENV = "production"
node server/index.mjs
```

## 19. 结论

Dayflow 目前是一个“功能闭环已经跑通、真实使用还差三个硬条件”的学习型 MVP：

1. 手机能稳定访问的入口
2. 不依赖单浏览器 localStorage 的数据
3. 页面关闭后仍然可靠的通知

作为学习项目，它已经覆盖了从需求、UI、算法、AI、后端、部署到故障排查的完整链路。后续最有价值的方向不是继续堆功能，而是把这三块基础能力补深。
