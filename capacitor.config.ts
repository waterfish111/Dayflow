import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.waterfish111.dayflow",
  appName: "Dayflow",
  webDir: "dist",
  server: {
    // 用 http://localhost 作为页面源：localhost 是安全上下文，
    // 且请求 http://<服务器> 不构成混合内容，省掉一层拦截。
    androidScheme: "http",
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
