import type { AiParseResult, ParsedItem, Settings } from "../types";
import { todayKey, WEEKDAYS_CN } from "./date";
import { apiUrl } from "./api";

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeItem(item: ParsedItem): ParsedItem {
  return {
    ...item,
    title: String(item.title || "未命名任务").slice(0, 160),
    pool: Boolean(item.pool),
    date: item.date && DATE_RE.test(item.date) ? item.date : undefined,
    start: item.start && TIME_RE.test(item.start) ? item.start : undefined,
    end: item.end && TIME_RE.test(item.end) ? item.end : undefined,
    estimatedMinutes:
      Number.isFinite(Number(item.estimatedMinutes)) &&
      Number(item.estimatedMinutes) > 0
        ? Number(item.estimatedMinutes)
        : undefined,
    priority: ["high", "medium", "low"].includes(item.priority)
      ? item.priority
      : "medium",
    confidence: Math.max(0, Math.min(1, Number(item.confidence ?? 0.5))),
  };
}

export async function parseWithAI(
  text: string,
  settings: Settings,
  apiKey: string,
  signal?: AbortSignal,
): Promise<AiParseResult> {
  // 没有自己的 Key 也允许发请求：服务端可能开着演示额度。
  // 两者都没有时，由服务端返回一句明确的错误。
  const key = apiKey.trim();
  const today = new Date();
  const response = await fetch(apiUrl("/api/ai/parse"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "x-deepseek-key": key } : {}),
    },
    body: JSON.stringify({
      text,
      today: todayKey(),
      weekday: WEEKDAYS_CN[today.getDay()],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      model: settings.aiModel,
      settings: {
        workday: settings.workday,
        weekend: settings.weekend,
        categories: settings.categories,
      },
    }),
    signal,
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(data?.error || `AI 请求失败（${response.status}）`);
  }

  const result = (await response.json()) as AiParseResult;
  if (!Array.isArray(result.items)) {
    throw new Error("AI 返回的格式不正确，请重试。");
  }

  return {
    items: result.items.map(sanitizeItem),
    questions: Array.isArray(result.questions) ? result.questions : [],
    summary: result.summary || "",
    demo: result.demo,
  };
}
