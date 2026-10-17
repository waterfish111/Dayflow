import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 5173);

app.use(express.json({ limit: "1mb" }));

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

function buildPrompt(payload) {
  const {
    text,
    today,
    weekday,
    timezone,
    settings,
  } = payload;

  const workday = settings?.workday
    ? JSON.stringify(settings.workday)
    : "未提供";
  const weekend = settings?.weekend
    ? JSON.stringify(settings.weekend)
    : "未提供";
  const categories = Array.isArray(settings?.categories)
    ? settings.categories.join("、")
    : "工作、学习、生活、运动";

  return `你是一个严谨的中文日程解析器。把用户的自然语言转换成结构化日程草案。

当前日期：${today}
当前星期：${weekday}
时区：${timezone}
可用分类：${categories}
工作日可用时间模板：${workday}
周末可用时间模板：${weekend}

规则：
1. 只输出 JSON，不要 Markdown，不要代码块，不要解释。
2. 一句话里有几件独立的事，就输出几个 items；不要把一个任务拆成多个步骤或子任务。
3. kind 只能是 "task" 或 "event"。有明确起止时间且通常不可移动的会议、课程、 appointments 归为 event；其余归为 task。
4. 日期用 YYYY-MM-DD，时间用 HH:mm，deadline 用 YYYY-MM-DDTHH:mm。
5. 日期必须根据“当前日期”换算。用户说“周三”时，指当前这一周的周三；如果已经过去，除非语境明确，否则按下一个周三处理。
6. 不要把不确定的信息编造成事实。缺少关键时间、时长或日期时，在 questions 中提出最多 3 个简短问题；能合理推断的，写进 assumptions。
7. task 如果没有明确时间，可以给出 estimatedMinutes（默认 60）和可选的 preferredStart；不要强行编造具体开始时间。
8. event 尽量有 date、start、end；如果缺失，写进 questions。
9. 优先级只能是 "high"、"medium"、"low"。用户没有说明时用 "medium"。
10. 置信度 confidence 是 0 到 1 的数字；信息不完整时降低。
11. recurrence 可选：{"type":"none"}、{"type":"daily"}、{"type":"weekdays"}、{"type":"weekly","weekdays":[1,3,5]}、{"type":"interval","intervalDays":2}；可加 "until":"YYYY-MM-DD"。

输出结构：
{
  "items": [
    {
      "title": "会议名称",
      "kind": "event",
      "date": "2026-10-21",
      "start": "14:00",
      "end": "16:00",
      "estimatedMinutes": 120,
      "priority": "medium",
      "category": "工作",
      "deadline": "2026-10-18T23:59",
      "locked": true,
      "notes": "",
      "location": "",
      "link": "",
      "recurrence": {"type": "none"},
      "confidence": 0.95,
      "assumptions": []
    }
  ],
  "questions": [],
  "summary": "一句话说明解析结果"
}

用户输入：
${text}`;
}

function normalizeAiResult(value) {
  if (!value || typeof value !== "object") {
    throw new Error("模型返回的内容不是对象");
  }
  const items = Array.isArray(value.items) ? value.items : [];
  const questions = Array.isArray(value.questions)
    ? value.questions.filter((item) => typeof item === "string")
    : [];
  return {
    items: items.map((item) => {
      const priority = ["high", "medium", "low"].includes(item.priority)
        ? item.priority
        : "medium";
      const kind = item.kind === "event" ? "event" : "task";
      return {
        title: String(item.title || "未命名任务").slice(0, 160),
        kind,
        date: typeof item.date === "string" ? item.date : undefined,
        start: typeof item.start === "string" ? item.start : undefined,
        end: typeof item.end === "string" ? item.end : undefined,
        estimatedMinutes:
          Number.isFinite(Number(item.estimatedMinutes)) &&
          Number(item.estimatedMinutes) > 0
            ? Number(item.estimatedMinutes)
            : undefined,
        priority,
        category:
          typeof item.category === "string" ? item.category : undefined,
        deadline:
          typeof item.deadline === "string" ? item.deadline : undefined,
        locked: Boolean(item.locked),
        notes: typeof item.notes === "string" ? item.notes : undefined,
        location:
          typeof item.location === "string" ? item.location : undefined,
        link: typeof item.link === "string" ? item.link : undefined,
        recurrence:
          item.recurrence && typeof item.recurrence === "object"
            ? item.recurrence
            : { type: "none" },
        confidence: Math.max(
          0,
          Math.min(1, Number(item.confidence ?? 0.5)),
        ),
        assumptions: Array.isArray(item.assumptions)
          ? item.assumptions.filter((entry) => typeof entry === "string")
          : [],
      };
    }),
    questions,
    summary: typeof value.summary === "string" ? value.summary : "",
  };
}

app.post("/api/ai/parse", async (req, res) => {
  const key =
    req.get("x-deepseek-key")?.trim() ||
    process.env.DEEPSEEK_API_KEY?.trim() ||
    "";
  if (!key) {
    return jsonError(
      res,
      400,
      "还没有配置 DeepSeek API Key。请打开设置，填入你自己的 Key。",
    );
  }

  const text = String(req.body?.text ?? "").trim();
  if (!text) return jsonError(res, 400, "请先输入一段计划。");
  if (text.length > 4000) {
    return jsonError(res, 400, "输入太长了，请控制在 4000 字以内。");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);

  try {
    const response = await fetch(
      "https://api.deepseek.com/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: req.body?.model || "deepseek-chat",
          temperature: 0.1,
          max_tokens: 2400,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "你是日程解析器。严格输出合法 JSON，不要输出 Markdown 或额外文字。",
            },
            {
              role: "user",
              content: buildPrompt(req.body ?? {}),
            },
          ],
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      const message =
        response.status === 401 || response.status === 403
          ? "DeepSeek Key 无效或没有权限，请在设置里检查。"
          : response.status === 429
            ? "DeepSeek 请求太频繁或额度不足，请稍后再试。"
            : `DeepSeek 请求失败（${response.status}）：${detail.slice(0, 180)}`;
      return jsonError(res, response.status, message);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return jsonError(res, 502, "DeepSeek 没有返回可用内容。");
    }

    const cleaned = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    return res.json(normalizeAiResult(parsed));
  } catch (error) {
    if (error?.name === "AbortError") {
      return jsonError(res, 504, "DeepSeek 响应超时，请稍后重试。");
    }
    return jsonError(
      res,
      502,
      `解析失败：${String(error?.message || error).slice(0, 180)}`,
    );
  } finally {
    clearTimeout(timeout);
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "dayflow" });
});

if (process.env.NODE_ENV === "production") {
  const dist = path.join(root, "dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
} else {
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
