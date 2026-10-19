# Dayflow

手机优先的个人工作学习日程助手。

用一句自然语言描述安排，AI 生成计划草案，你确认后写入内置日历；具体时间由确定性排期引擎计算，而不是让模型自由发挥。

> 当前状态：可运行的第一个 MVP，本地构建和 Vercel 部署均已完成。  
> 在线地址：[https://dayflow-hyo9.vercel.app/](https://dayflow-hyo9.vercel.app/)  
> 注意：部分中国大陆手机网络无法直接访问 `vercel.app` 域名；电脑可能通过系统代理访问。此问题记录在[完整项目学习手册](docs/PROJECT_LEARNING_MANUAL.md)中。

## 当前能力

- 自然语言输入 → DeepSeek 解析 → 计划草案 → 人工确认 → 写入日历
- AI 信息不足时先反问；低置信度条目默认不勾选
- 待办池、自动排期、优先级、截止时间、锁定、完成状态
- 工作日 / 周末可编辑作息模板、每日安排上限、任务间缓冲
- 日 / 周 / 月三种视图，15 / 30 / 60 分钟时间粒度
- 分类可增删；重复任务由 AI 建议、用户确认
- 桌面端可把任务拖到另一天，或在日视图中移动到新时间
- PWA 安装、离线缓存、应用内提醒、手机系统通知权限
- DeepSeek Key 按使用者保存在本机；JSON 数据导出

暂时没有：账号、云同步、真正的后台推送、分享、统计报表、任务拆分/子任务、系统日历同步、Android APK 和 iOS 版本。

## 技术栈

| 层 | 使用 |
|---|---|
| 前端 | React 19、TypeScript、Vite、CSS |
| 本地开发服务 | Node.js、Express、Vite middleware |
| 线上 API | Vercel Serverless Functions |
| AI | DeepSeek Chat Completions，JSON 结构化输出 |
| 数据 | 浏览器 `localStorage`，local-first |
| PWA | Web App Manifest、Service Worker、通知权限 |
| 包管理 | pnpm |

## 架构

```text
浏览器
  ├── React 页面（TypeScript / CSS）
  ├── 排期算法（src/lib/scheduler.ts）
  ├── 本地存储（src/data/storage.ts）
  └── POST /api/ai/parse
          ├── 本地：server/index.mjs
          └── 线上：api/ai/parse.js
                    └── server/ai.mjs
                          └── DeepSeek API
```

本地和线上共用 `server/ai.mjs`，避免出现两套提示词和两套结果清洗逻辑。

## 快速开始

依赖安装完成后，本地开发：

```powershell
node server/index.mjs
```

打开 <http://localhost:5173>。

使用 pnpm：

```powershell
pnpm dev
pnpm typecheck
pnpm build
pnpm preview
```

生产构建：

```powershell
pnpm build
$env:NODE_ENV = "production"
node server/index.mjs
```

## 配置 DeepSeek

打开应用右上角「设置」，在 DeepSeek 区域填入自己的 API Key。

- Key 只保存在当前浏览器的 `localStorage`，不会写入仓库或 Supabase。
- 请求通过服务端代理发往 DeepSeek，前端不直接拼接 Key 到页面代码。
- 每个人使用自己的 Key，避免共享额度。
- 模型默认 `deepseek-chat`，可在设置中切换 `deepseek-reasoner`。

## 部署到 Vercel

项目已经包含：

- `api/ai/parse.js`：`/api/ai/parse`
- `api/health.js`：`/api/health`
- `vercel.json`：构建命令、输出目录和函数超时
- `server/ai.mjs`：本地与线上共享的 AI 解析逻辑

Vercel 导入 `waterfish111/Dayflow` 后，使用 `pnpm build`，输出目录为 `dist`。完整步骤见 [docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md)。

## 已知限制

- 当前数据在单个浏览器的 `localStorage`；换设备、换域名或清缓存不会自动迁移。
- `vercel.app` 在部分网络环境下不可直接访问；这不属于应用代码错误。
- 通知检查只在页面打开时运行；真正关闭页面后的提醒需要 Web Push 或 Capacitor APK。
- DeepSeek Key 存在浏览器本地，未做应用层加密；个人自用可接受，公开分享前需要调整。
- 没有自动化测试和 CI；排期算法目前主要靠人工验证。
- 重复任务保存时展开未来 42 天；修改其中一次不会同步整组。
- 没有分享、统计、任务拆分、系统日历同步、APK 和 iOS 版本。

## 项目文档

- [完整项目学习手册：从需求到部署](docs/PROJECT_LEARNING_MANUAL.md)
- [阶段一部署专题：Vercel 与 esbuild 问题](docs/PHASE1_LEARNING_MANUAL.md)
- [代码阅读笔记](docs/LEARNING.md)
- [Vercel 部署操作步骤](docs/DEPLOY_VERCEL.md)

## 项目历程

| 时间 | 进展 |
|---|---|
| 2026-10-17 | 明确产品需求，完成第一版本地应用 |
| 2026-10-17 | 推送 GitHub 仓库，实现自然语言、排期、日历、待办池 |
| 2026-10-19 | 改造为 Vercel Serverless 结构并完成首次部署 |
| 2026-10-19 | 修复 pnpm/esbuild 安装脚本问题 |
| 2026-10-19 | 完成线上健康检查；发现手机直连 `vercel.app` 受网络环境影响 |

## 下一步

1. 解决手机可达性：自定义域名 + Cloudflare，或迁移到香港/国内服务器。
2. 接入 Supabase 登录和云同步，避免数据只存在某个浏览器。
3. 做 Web Push 或 Capacitor APK，补真正的后台提醒。
4. 给排期算法补单元测试，并加 GitHub Actions。

## 说明

这是一个个人学习项目，目前未声明开源许可证。如果要让其他人复用代码，建议先补充 LICENSE，并重新审查数据、密钥和隐私设计。
