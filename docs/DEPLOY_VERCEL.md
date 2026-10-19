# 部署到 Vercel

这份步骤对应项目的第一阶段：把本地版本部署成手机可通过 HTTPS 访问的 PWA。

## 1. 导入仓库

1. 登录 [Vercel](https://vercel.com/dashboard)。
2. 点击 **Add New → Project**。
3. 选择 **Import Git Repository**，授权并选择 `waterfish111/workdaily`。
4. 如果没有看到仓库，检查 Vercel 的 GitHub App 是否只授权了部分仓库。

## 2. 构建设置

Vercel 通常会自动识别为 Vite 项目。确认以下值：

| 设置 | 值 |
|---|---|
| Framework Preset | Vite |
| Root Directory | `./` |
| Install Command | `pnpm install`（或保持自动识别） |
| Build Command | `pnpm build` |
| Output Directory | `dist` |

项目根目录的 `vercel.json` 已经声明了构建命令、输出目录和 API 函数超时。

## 3. 环境变量

第一阶段不需要配置 DeepSeek Key 到 Vercel：

- 使用者在应用「设置」里填写自己的 Key。
- 前端把 Key 放在请求头 `x-deepseek-key`。
- Vercel Function 只在本次请求内使用它，不写入数据库或日志。

可选的 `DEEPSEEK_API_KEY` 只适合本地开发或单人自用；多人使用时不要配置公共 Key，否则所有 AI 费用都会记在项目所有者身上。

如果以后接入 Supabase：

- `NEXT_PUBLIC_*` 或 Vite 的公开变量只能放公开的 anon key。
- `service_role` 私钥只能放在服务端环境变量，不能进入前端代码或提交到仓库。

## 4. 部署后验证

部署完成后依次检查：

1. 打开 `https://你的域名/api/health`，应返回：

```json
{"ok":true,"service":"dayflow"}
```

2. 打开首页，确认日历、待办池和设置能正常显示。
3. 在手机 Chrome 中打开 HTTPS 地址。
4. 在设置里填入自己的 DeepSeek Key。
5. 输入一段计划，确认能返回草案。
6. 浏览器菜单选择“添加到主屏幕”，确认 PWA 可以安装。
7. 点铃铛测试通知权限。真正关闭页面后的后台提醒仍属于第三阶段。

## 5. 更新方式

当前配置使用 Git 集成。之后把代码推送到 GitHub 的 `main`，Vercel 会自动重新部署。

```powershell
git add -A
git commit -m "描述这次修改"
git push
```

## 常见问题

**构建时报 pnpm 版本问题**

检查 `package.json` 的 `packageManager` 是否是 `pnpm@11.25.0`，或者在 Vercel 项目设置里把 Install Command 固定为 `pnpm install`。

**API 返回 504**

DeepSeek 有时响应较慢。当前函数配置为 60 秒，代码内部 50 秒超时；如果持续超时，可以在 Vercel 项目设置里调整 Function Duration，或改用支持更长请求的后端。

**手机通知没有权限**

必须使用 HTTPS 地址，并点铃铛或设置里的“开启系统通知”主动触发浏览器权限提示。Codex 内置预览窗口通常不能作为系统通知的测试环境。
