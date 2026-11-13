import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  AiError,
  bodyFromRequest,
  parseSchedule,
} from "./ai.mjs";
import { demoStatus, resolveRequestKey } from "./demo.mjs";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 5173);

app.use(express.json({ limit: "1mb" }));

// 装进 App 以后页面源是 http://localhost，请求服务器属跨源，需要放行。
// 只放行 WebView / 本机来源，不写成 *，避免任意网站直接刷演示额度。
const ALLOWED_ORIGINS = new Set([
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const sameOrigin = origin && origin === `http://${req.headers.host}`;
  if (origin && (ALLOWED_ORIGINS.has(origin) || sameOrigin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, x-deepseek-key");
    res.set("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// 接口响应不进任何缓存：里面带着演示剩余次数，缓存会串号。
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.post("/api/ai/parse", async (req, res) => {
  try {
    const payload = bodyFromRequest(req.body);
    // 先做不花钱的校验，避免空输入也扣掉演示额度。
    const text = String(payload?.text ?? "").trim();
    if (!text) throw new AiError(400, "请先输入一段计划。");
    if (text.length > 4000) {
      throw new AiError(400, "输入太长了，请控制在 4000 字以内。");
    }

    const access = resolveRequestKey(req);
    const result = await parseSchedule(payload, access.key);
    if (access.isDemo) {
      return res.json({
        ...result,
        demo: { remaining: access.remaining, limit: access.limit },
      });
    }
    return res.json(result);
  } catch (error) {
    if (error instanceof AiError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(502).json({
      error: `解析失败：${String(error?.message || error).slice(0, 180)}`,
    });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "dayflow", ...demoStatus() });
});

if (process.env.NODE_ENV === "production") {
  const dist = path.join(root, "dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
} else {
  // 只有本地开发才需要 vite（devDependency）。生产环境不装 devDependencies 也能启动。
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

const server = app.listen(port, "0.0.0.0", () => {
  const nets = os.networkInterfaces();
  const lan = Object.values(nets)
    .flat()
    .find((net) => net && net.family === "IPv4" && !net.internal);
  console.log(`Dayflow 已启动: http://localhost:${port}`);
  if (lan) console.log(`手机同一 Wi-Fi 访问: http://${lan.address}:${port}`);
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`端口 ${port} 已被占用。设置 PORT=其他端口 再启动。`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
