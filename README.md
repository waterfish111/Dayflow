# Dayflow

手机优先的个人工作学习日程助手。用一句自然语言描述安排，AI 生成计划草案，你确认后写入内置日历。

当前版本是可运行的第一版，核心闭环已经打通：

- 自然语言 → DeepSeek 解析 → 草案 → 混合确认 → 写入日历
- 待办池、自动排期、优先级、截止时间、锁定、完成状态
- 日 / 周 / 月三种视图，15 / 30 / 60 分钟粒度
- 工作日 / 周末可编辑作息模板、每日安排上限、任务间缓冲
- 本地持久化、PWA 安装、应用内提醒和手机系统通知（需要 HTTPS）
- 桌面端可将任务拖到另一天或日视图中的新时间

## 快速运行

依赖已经安装在 `node_modules`。开发模式：

```powershell
node server/index.mjs
```

打开 <http://localhost:5173>。

生产模式：

```powershell
node_modules\.bin\tsc.CMD --noEmit -p tsconfig.app.json
node_modules\.bin\vite.CMD build
$env:NODE_ENV = "production"
node server/index.mjs
```

如果本机可以使用 `pnpm`，也可以使用：

```powershell
pnpm dev
pnpm typecheck
pnpm build
pnpm preview
```

## 部署到 Vercel

项目已经包含 Vercel Serverless Function：

- 前端由 Vite 构建到 `dist`
- `api/ai/parse.js` 提供 `/api/ai/parse`
- `vercel.json` 指定构建命令和 60 秒函数超时
- DeepSeek Key 仍然由前端设置页保存到本机，并通过请求头传给函数；不需要把 Key 配进 Vercel 环境变量

在 Vercel 控制台导入 GitHub 仓库 `workdaily` 后，使用默认的 pnpm 构建即可。部署完成后用手机 Chrome 打开 HTTPS 地址，测试 PWA 安装、Key 填写和 `/api/health`。

如果构建环境没有自动识别 pnpm，构建命令保持 `pnpm build`，输出目录保持 `dist`。

详细的导入、构建和验证步骤见 [docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md)。

## 配置 DeepSeek

打开应用右上角「设置」，在 DeepSeek 区域填入使用者自己的 API Key，然后保存。

- Key 只保存在当前浏览器的 `localStorage`，不会写进代码仓库。
- AI 请求会通过本地 `server/index.mjs` 代理到 DeepSeek，前端不会直接暴露 Key。
- 也支持在 `.env` 中配置 `DEEPSEEK_API_KEY` 作为服务端默认值；多人使用时不应共用同一个 Key。
- 模型默认 `deepseek-chat`，可在设置中切换 `deepseek-reasoner`。

## 目录

```text
server/index.mjs          Express + Vite 中间件 + DeepSeek 代理
src/App.tsx               应用状态和完整业务闭环
src/types.ts              任务、日程、设置、AI 草案的数据模型
src/lib/date.ts           日期和时间计算
src/lib/scheduler.ts      确定性排期算法
src/lib/ai.ts             前端 AI 请求与结果清洗
src/lib/notifications.ts  通知权限、每日汇总和提前提醒
src/components/           日历、待办池、编辑器、设置、草案确认
public/                   PWA manifest、service worker、图标
docs/LEARNING.md          项目学习笔记
```

## 当前边界

这是第一版，以下内容尚未完成：

- 云端账号和 Supabase 同步；当前数据在单个浏览器的 `localStorage`。
- 真正的后台推送。当前提醒逻辑在应用打开时运行；关闭页面后，浏览器不能保证继续执行定时器。生产环境需要 Web Push + 服务端定时任务，或封装成手机 App 后用本地通知。
- 分享、统计报表、任务拆分/子任务、系统日历双向同步、iOS 版本。
- 重复任务会在保存时展开未来 42 天；修改其中一次不会同步整组。

下一阶段建议先接 Supabase 登录和数据同步，再补 Web Push 或 Capacitor 封装。具体学习路线见 [docs/LEARNING.md](docs/LEARNING.md)。
