# Dayflow 阶段一学习手册：从本地应用到 Vercel

这份手册对应第一阶段：把本地运行的 Dayflow 部署成一个手机可以通过 HTTPS 访问的 PWA。

完整的项目背景、需求决策和后续问题见[项目学习手册](PROJECT_LEARNING_MANUAL.md)。

## 1. 这一阶段完成了什么

部署前，应用的结构是：

```text
浏览器 → 本地 Express 服务
           ├── Vite 开发/静态页面
           └── /api/ai/parse → DeepSeek
```

部署后，结构变成：

```text
手机/电脑浏览器
   │
   ├── 静态页面（dist）
   │      React + TypeScript + CSS + PWA 资源
   │
   └── POST /api/ai/parse
          └── Vercel Serverless Function
                 └── server/ai.mjs
                        └── DeepSeek API
```

这一阶段解决的是“真实手机能打开、能安装、能调用 AI”，还没有解决账号和跨设备同步。

## 2. Vercel 的构建流程

Vercel 部署通常分三步：

1. **Install**：安装依赖，例如 `pnpm install`。
2. **Build**：执行 `pnpm build`，生成 `dist`。
3. **Runtime**：浏览器访问静态文件，或者调用 `api/` 下的函数。

这三个阶段要分开理解：

- Install 失败：依赖没有装好，代码根本还没开始编译。
- Build 失败：依赖装好了，但 TypeScript 检查或 Vite 打包失败。
- Runtime 失败：部署成功，但访问页面或 API 时出错。

看 Build Logs 时，先找**第一条真正的 Error**，不要只看最后一行。

## 3. 这次真实的部署错误

第一次部署时，Build Logs 出现了：

```text
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.25.12
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
Error: [BUILD_UTILS_SPAWN_1] Command "pnpm install" exited
```

问题不在 React 代码，而在依赖安装阶段。

`esbuild` 是 Vite 使用的打包器，它安装后需要执行一个 `postinstall` 脚本，把对应平台的二进制准备好。pnpm 11 默认会拦截依赖的构建脚本，除非项目明确允许。

项目里的 `pnpm-workspace.yaml` 原本是：

```yaml
allowBuilds:
  esbuild: set this to true or false
```

这是一个占位值，不是有效的允许配置。改成：

```yaml
allowBuilds:
  esbuild: true
```

之后本地验证：

```powershell
pnpm install
pnpm rebuild esbuild
pnpm build
```

三步都成功，Vercel 的 install 阶段才不会再因为 esbuild 退出。

这里学到的原则是：**安装脚本也是依赖的一部分**。构建工具需要原生二进制时，不能只看 `package.json` 里有没有包，还要确认它的 postinstall 是否执行。

## 4. 本地 Express 和 Vercel Function 如何共用代码

本地开发仍然需要一个长期运行的 HTTP 服务，所以保留：

```text
server/index.mjs
```

Vercel 不运行这个长期进程，而是把每个 API 文件当成独立函数：

```text
api/ai/parse.js  →  /api/ai/parse
api/health.js    →  /api/health
```

为了避免本地和线上出现两套提示词、两套校验逻辑，把核心逻辑抽到了：

```text
server/ai.mjs
```

它包含：

- `buildPrompt()`：构造发给 DeepSeek 的提示词。
- `normalizeAiResult()`：清洗模型返回的 JSON。
- `parseSchedule()`：校验输入、调用 DeepSeek、处理错误。
- `keyFromHeaders()`：从请求头读取当前使用者的 Key。

`server/index.mjs` 和 `api/ai/parse.js` 都只是很薄的 HTTP 适配层：

```text
接收请求 → 调用 parseSchedule → 返回 JSON 或错误
```

这是“把业务逻辑和运行环境分开”的例子。以后换成 Cloudflare、自己的服务器，核心解析逻辑仍然可以复用。

## 5. Serverless Function 的几个特点

Vercel Function 和本地 Express 不完全一样：

- **无状态**：函数实例随时可能被创建或销毁，不能依赖进程内全局变量保存用户数据。
- **冷启动**：长时间没人访问后，第一次请求可能慢一点。
- **执行时间有限**：`vercel.json` 和 `api/ai/parse.js` 都设置了 60 秒上限；代码内部在 50 秒时主动中止 DeepSeek 请求。
- **请求级隔离**：每次请求都应该自己携带认证信息。当前版本通过 `x-deepseek-key` 请求头传递 Key。

这就是为什么 Key 不能放在一个全局变量里，也不能假设函数进程会一直存在。

## 6. DeepSeek Key 的完整路径

当前版本的路径是：

```text
设置页输入 Key
   ↓
浏览器 localStorage 保存
   ↓
POST /api/ai/parse
请求头 x-deepseek-key
   ↓
Vercel Function
   ↓
Authorization: Bearer <Key>
   ↓
DeepSeek API
```

特点：

- 每个使用者填自己的 Key。
- Key 不写入仓库、不写入 Supabase 数据库。
- Vercel Function 只在本次请求中使用 Key。
- 换浏览器、清缓存或重装 App 后需要重新填写。

这是“个人使用、暂不共享”阶段可以接受的方案。以后如果要给多人长期使用，可以再考虑服务端加密保存或系统安全存储。

## 7. PWA、HTTPS 和通知

项目包含：

- `public/manifest.webmanifest`：让浏览器知道这是可安装应用。
- `public/sw.js`：Service Worker，负责缓存和离线回退。
- `public/icon-192.png`、`public/icon-512.png`：安装图标。

PWA 的两个现实限制：

1. **必须使用 HTTPS**。`localhost` 是例外；手机通过局域网 HTTP 打开时，通知权限通常不可用。
2. **Service Worker 能缓存页面，但不能保证页面关闭后继续执行 JavaScript 定时器**。

所以第一阶段的结论是：

- 可以测试通知权限。
- 页面打开时可以检查提醒。
- 真正的后台提醒要等 Web Push 或 Capacitor APK。

不要在 Codex 内置预览窗口里判断“系统通知坏了”。内置浏览器不是系统通知的可靠测试环境。

## 8. 部署后的验收清单

打开部署地址后逐项检查：

- [ ] `https://你的域名/api/health` 返回 `{"ok":true,"service":"dayflow"}`
- [ ] 首页能正常显示，没有 404 或空白页
- [ ] 手机 Chrome 能打开，布局正常
- [ ] 设置里能保存 DeepSeek Key
- [ ] 自然语言能返回计划草案
- [ ] 草案确认后能写入日历
- [ ] 手动添加任务、待办池、自动排期正常
- [ ] 日/周/月视图切换正常
- [ ] 刷新后本机数据仍保留
- [ ] 浏览器菜单能找到“添加到主屏幕”
- [ ] 点铃铛能触发通知权限申请

## 9. 常见错误定位

**`pnpm install` 失败**

看是不是依赖的构建脚本被拦截。检查 `pnpm-workspace.yaml` 的 `allowBuilds`，以及 `packageManager` 版本。

**`pnpm build` 失败**

看 TypeScript 错误或 Vite 打包错误。本地先运行：

```powershell
pnpm build
```

本地通过、Vercel 不通过，通常是 Node 版本、环境变量或大小写路径差异。

**API 返回 400**

通常是请求没有带 DeepSeek Key，或者输入为空。先看浏览器 Network 面板的请求头。

**API 返回 401 / 403**

DeepSeek Key 无效、过期或没有权限。

**API 返回 429**

DeepSeek 请求太频繁或额度不足。

**API 返回 504**

DeepSeek 响应超时。检查函数时长和网络；当前内部超时是 50 秒。

**页面 404**

检查 Vercel 的 Output Directory 是否为 `dist`，以及构建是否成功。

## 10. 这一阶段新增的文件

| 文件 | 作用 |
|---|---|
| `api/ai/parse.js` | Vercel 的 AI 解析函数 |
| `api/health.js` | Vercel 健康检查函数 |
| `server/ai.mjs` | 本地与线上共享的解析逻辑 |
| `server/index.mjs` | 本地 Express + Vite 开发服务 |
| `vercel.json` | Vercel 构建、输出目录和函数时长 |
| `pnpm-workspace.yaml` | 允许 esbuild 执行安装脚本 |
| `docs/DEPLOY_VERCEL.md` | 部署操作步骤 |

## 11. 建议练习

1. 修改提示词里的一条规则，重新构建并部署，观察草案结果变化。
2. 在 `/api/health` 中增加一个版本字段，验证 Vercel 是否自动重新部署。
3. 在浏览器 Network 面板观察 `/api/ai/parse` 的请求头、状态码和返回 JSON。
4. 故意填一个错误 Key，确认 401 错误能被前端正确显示。
5. 把手机切到飞行模式，验证已加载页面的离线表现。

## 12. 下一阶段预告

阶段二会加入 Supabase：

- 邮箱 + 密码登录
- `tasks` 和 `settings` 表
- 每个用户的数据隔离（RLS）
- 本地数据迁移到云端
- 手机和电脑看到同一份计划

阶段二完成后，再做后台通知和 Android APK 封装。
