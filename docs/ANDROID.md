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

## 通知怎么工作

装进 App 以后走的是**系统本地通知**，不依赖网页轮询，App 关着、锁屏也会响：

- 每条已排期任务在开始前 **10 分钟**提醒一次（`src/lib/nativeNotifications.ts` 里的 `REMINDER_LEAD_MINUTES`）。
- 任务或作息一改，就做增量同步：删掉不再需要的、补上新增的、时间变了的换掉，其余原样保留（不做「全部取消再重排」，否则 App 退到后台时会被系统挂起，取消跑完、重排没跑完，锁屏后就什么都不响了）。
- 系统重启后会由插件自带的 `LocalNotificationRestoreReceiver` 恢复。
- 设置里有三个入口：「立即测试」（1 秒后）、「10 秒后测试」、「诊断」。

到点不响时按顺序检查：

1. 先点「立即测试」。1 秒内连通知都不出现，说明问题在权限或通知渠道，不在闹钟；出现了但「10 秒后测试」不响，说明问题在精确闹钟或系统后台限制。
2. 点「诊断」，把面板里的六行（构建时间、平台、通知权限、精确闹钟、通知渠道、已排入条数、最近错误）截图。这几行能直接区分「没权限」「渠道没建」「根本没排进去」「排进去了但没触发」。
3. 系统设置 → 应用 → Dayflow → 通知，允许通知，并打开「闹钟和提醒」类别。
4. 电池优化里把 Dayflow 设为「不受限制」（国产 ROM 还要允许自启动）。
5. Android 12+ 的「闹钟和提醒」权限（精确闹钟），首次开启通知时会自动跳转申请。

网页版仍然保留原来的页面内轮询：只在标签页打开时有效，行为没变。

## 已知限制

- **签名固定**：仓库里带了 `android/app/dayflow-debug.keystore`，CI 用它签名，所以新包可以直接覆盖安装、数据不会丢。
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

## 服务端要配合的两件事

1. **CORS**：App 的页面源是 `http://localhost`，请求服务器属跨源。`server/index.mjs` 里已放行 `http://localhost` 与 `capacitor://localhost`，并对 `OPTIONS` 预检返回 204。部署后可以这样自检：

   ```bash
   curl -i -X OPTIONS http://39.106.48.233/api/ai/parse \
     -H "Origin: http://localhost" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: content-type,x-deepseek-key"
   # 期望：204，且带 Access-Control-Allow-Origin: http://localhost
   ```

2. **明文 HTTP**：`AndroidManifest.xml` 里 `usesCleartextTraffic="true"`、`capacitor.config.ts` 里 `cleartext: true`，都是为了能访问 `http://` 的服务器。上线 HTTPS 后应当关掉。

