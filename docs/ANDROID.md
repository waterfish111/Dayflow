# Android App

Dayflow 的网页版本可以直接装成 Android App：Capacitor 把 `dist/` 打进一个 WebView 壳，界面和逻辑完全复用，API 仍然请求服务器。

## 当前状态

| 项目 | 说明 |
| --- | --- |
| 包名 | `com.waterfish111.dayflow` |
| 应用名 | Dayflow |
| 页面源 | `http://localhost`（Capacitor 本地资源） |
| API 地址 | `http://39.106.48.233`，写在 `src/lib/api.ts`，可用 `VITE_API_BASE` 覆盖 |
| 构建方式 | GitHub Actions 云打包（本机没有 Android SDK / JDK 21） |
| 产物 | `app-debug.apk`，仅用于自用安装，未上架 |

## 获取安装包

1. 打开仓库的 **Actions → Android APK**，选最新一次成功的运行。
2. 页面底部 **Artifacts** 里下载 `dayflow-debug-apk.zip`，解压得到 `app-debug.apk`。
3. 传到手机安装（需要允许「安装未知来源应用」）。

也可以等 CI 跑完后由 agent 直接下载好放到本地，用数据线或网盘传过去。

## 安装后要做的三件事

1. **在设置里填自己的 DeepSeek Key**（或者什么都不填，用站点演示额度，每天 20 次）。
2. 首次启动若提示网络错误，检查服务器 `http://39.106.48.233/api/health` 是否可达。
3. 想保留数据就定期「导出 JSON」——App 里没有云同步，卸载即丢。

## 已知限制

- **通知仍然是网页那一套**：只在 App 打开时每 30 秒检查一次，锁屏/切后台不会响。真正的本地通知要接 `@capacitor/local-notifications`，属于下一步。
- **每次重新构建的签名可能不同**，覆盖安装会失败。解决办法是先导出 JSON → 卸载 → 装新包 → 导入 JSON。等提醒做完会换成固定签名。
- Android 返回键会直接退出 App，不做页面内后退。
- 界面没有做安全区适配（刘海屏、手势条可能压住内容）。
- 明文 HTTP：API 地址是 `http://`，所以 `usesCleartextTraffic` 是开着的；换域名上 HTTPS 后可以关掉。

## 本地构建（需要 JDK 21 + Android SDK）

```bash
pnpm install
pnpm build
npx cap sync android
cd android && ./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

改了网页代码后重新跑 `pnpm build && npx cap sync android` 即可，不用动 `android/` 目录。

## 改了服务器地址怎么办

改 `src/lib/api.ts` 里的 `DEFAULT_NATIVE_API_BASE`，或者在构建时设置环境变量：

```bash
VITE_API_BASE=http://新地址 pnpm build
```

注意网页版仍然用相对路径（同源），只有 App 里才会用到这个绝对地址。
