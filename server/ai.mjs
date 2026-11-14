export class AiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "AiError";
    this.status = status;
  }
}

export const ALLOWED_MODELS = new Set([
  "deepseek-chat",
  "deepseek-reasoner",
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PRIORITIES = new Set(["high", "medium", "low"]);
const RECURRENCE_TYPES = new Set([
  "none",
  "daily",
  "weekdays",
  "weekly",
  "interval",
]);

function text(value, maxLength) {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean ? clean.slice(0, maxLength) : undefined;
}

function validDateKey(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function validTime(value) {
  return typeof value === "string" && TIME_RE.test(value);
}

function pickDate(value) {
  return validDateKey(value) ? value : undefined;
}

function pickTime(value) {
  return validTime(value) ? value : undefined;
}

function pickDeadline(value) {
  if (typeof value !== "string") return undefined;
  const [date, timePart, extra] = value.split("T");
  if (extra !== undefined || !validDateKey(date)) return undefined;
  if (timePart === undefined) return date;
  return validTime(timePart) ? `${date}T${timePart}` : undefined;
}

function normalizeRecurrence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { type: "none" };
  }
  const type = text(value.type, 20);
  if (!type || !RECURRENCE_TYPES.has(type) || type === "none") {
    return { type: "none" };
  }
  const recurrence = { type };
  if (type === "interval") {
    const interval = Math.round(Number(value.intervalDays));
    recurrence.intervalDays = Number.isFinite(interval)
      ? Math.min(90, Math.max(1, interval))
      : 2;
  }
  if (type === "weekly") {
    const weekdays = Array.isArray(value.weekdays)
      ? [...new Set(
          value.weekdays
            .map((day) => Number(day))
            .filter(
              (day) => Number.isInteger(day) && day >= 0 && day <= 6,
            ),
        )]
      : [];
    if (weekdays.length === 0) return { type: "none" };
    recurrence.weekdays = weekdays;
  }
  const until = pickDate(value.until);
  if (until) recurrence.until = until;
  return recurrence;
}

function promptJson(value, maxLength = 2400) {
  if (!value) return "未提供";
  try {
    return JSON.stringify(value).slice(0, maxLength);
  } catch {
    return "未提供";
  }
}

export function buildPrompt(payload) {
  const { text, today, weekday, timezone, settings } = payload;
  const workday = settings?.workday
    ? promptJson(settings.workday)
    : "未提供";
  const weekend = settings?.weekend
    ? promptJson(settings.weekend)
    : "未提供";
  const categories = Array.isArray(settings?.categories)
    ? settings.categories
        .filter((item) => typeof item === "string")
        .slice(0, 20)
        .join("、")
        .slice(0, 240)
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
3. kind 只能是 "task" 或 "event"。
   - event：由外部安排、有固定场次的——会议、课程、面试、就医、约见、搬家 / 装修这类需要他人配合的，以及看电影 / 演出 / 比赛这类有场次的活动。
   - task：需要自己完成或自己安排的事——写文档、复习、整理，以及运动锻炼（跑步、健身、打球、练琴）。
   运动类即使写了固定时间也算 task。
4. 日期用 YYYY-MM-DD，时间用 HH:mm，deadline 用 YYYY-MM-DDTHH:mm。
5. 日期必须根据“当前日期”换算。用户说“周三”时，指当前这一周的周三；如果已经过去，除非语境明确，否则按下一个周三处理。
6. 不要把不确定的信息编造成事实。缺少关键时间、时长或日期时，在 questions 中提出最多 3 个简短问题；能合理推断的，写进 assumptions。
7. task 如果没有明确时间，可以给出 estimatedMinutes（默认 60）和可选的 preferredStart；不要强行编造具体开始时间。但用户已经说了具体时间（例如“每天早上七点半”）时，必须把 start 写成该时间，task 也一样；给了开始时间却没给结束时间时，用 estimatedMinutes 推算 end 或省略 end。
8. event 尽量有 date、start、end；如果缺失，写进 questions。
9. 优先级只能是 "high"、"medium"、"low"。用户没有说明时用 "medium"。
10. 置信度 confidence 是 0 到 1 的数字；信息不完整时降低。
11. recurrence 可选：{"type":"none"}、{"type":"daily"}、{"type":"weekdays"}、{"type":"weekly","weekdays":[1,3,5]}、{"type":"interval","intervalDays":2}；可加 "until":"YYYY-MM-DD"。
    星期的数字是 0=周日、1=周一、2=周二、3=周三、4=周四、5=周五、6=周六。用户说“每周日”就写 weekdays:[0]，“每周五”写 [5]。
    type 为 weekly 时 weekdays 必须是非空数组，哪怕只有一天；不要省略，也不要改写成 interval。
12. 如果用户明确说“加入待办池”“放入待办池”“先记到待办池”等，该 item 必须设置 "pool": true，并且不要给 date、start、end；estimatedMinutes 可以保留。明确指定待办池时，不要再把这件事排进日历。

输出结构：
{
  "items": [
    {
      "title": "会议名称",
      "kind": "event",
      "pool": false,
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

export function normalizeAiResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("模型返回的内容不是对象");
  }

  const items = Array.isArray(value.items)
    ? value.items.filter(
        (item) => item && typeof item === "object" && !Array.isArray(item),
      ).slice(0, 50)
    : [];
  const questions = Array.isArray(value.questions)
    ? value.questions
        .map((item) => text(item, 200))
        .filter(Boolean)
        .slice(0, 3)
    : [];

  return {
    items: items.map((item) => {
      const priority = PRIORITIES.has(item.priority) ? item.priority : "medium";
      const kind = item.kind === "event" ? "event" : "task";
      const pool = Boolean(item.pool);
      const start = pickTime(item.start);
      const end = pickTime(item.end);
      const estimated = Math.round(Number(item.estimatedMinutes));
      return {
        title: text(item.title, 160) ?? "未命名任务",
        kind,
        pool,
        date: pool ? undefined : pickDate(item.date),
        start: pool ? undefined : start,
        end:
          pool || !start || !end || end <= start
            ? undefined
            : end,
        estimatedMinutes:
          Number.isFinite(estimated) && estimated > 0
            ? Math.min(600, Math.max(15, estimated))
            : undefined,
        priority,
        category: text(item.category, 40),
        deadline: pool ? undefined : pickDeadline(item.deadline),
        locked: Boolean(item.locked),
        notes: text(item.notes, 1000),
        location: text(item.location, 200),
        link: text(item.link, 500),
        recurrence: normalizeRecurrence(item.recurrence),
        confidence: Number.isFinite(Number(item.confidence))
          ? Math.max(0, Math.min(1, Number(item.confidence)))
          : 0.5,
        assumptions: Array.isArray(item.assumptions)
          ? item.assumptions
              .map((entry) => text(entry, 200))
              .filter(Boolean)
              .slice(0, 5)
          : [],
      };
    }),
    questions,
    summary: text(value.summary, 500) ?? "",
  };
}

export function selectModel(value, isDemo = false) {
  if (isDemo) return "deepseek-chat";
  return ALLOWED_MODELS.has(value) ? value : "deepseek-chat";
}

export async function parseSchedule(payload, key, options = {}) {
  const cleanKey = String(key ?? "").trim();
  if (!cleanKey) {
    throw new AiError(
      400,
      "这个站点没有开启演示额度。请打开设置，填入你自己的 DeepSeek Key。",
    );
  }

  const text = String(payload?.text ?? "").trim();
  if (!text) throw new AiError(400, "请先输入一段计划。");
  if (text.length > 4000) {
    throw new AiError(400, "输入太长了，请控制在 4000 字以内。");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);

  try {
    const response = await fetch(
      "https://api.deepseek.com/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cleanKey}`,
        },
        body: JSON.stringify({
          model: selectModel(payload?.model, Boolean(options.isDemo)),
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
              content: buildPrompt({ ...payload, text }),
            },
          ],
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const message =
        response.status === 401 || response.status === 403
          ? "DeepSeek Key 无效或没有权限，请在设置里检查。"
          : response.status === 429
            ? "DeepSeek 请求太频繁或额度不足，请稍后再试。"
            : response.status >= 500
              ? `DeepSeek 服务暂时不可用（${response.status}）。`
              : `DeepSeek 请求未通过校验（${response.status}）。`;
      throw new AiError(response.status, message);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new AiError(502, "DeepSeek 没有返回可用内容。");
    }

    const cleaned = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    try {
      return normalizeAiResult(JSON.parse(cleaned));
    } catch (error) {
      if (error instanceof AiError) throw error;
      throw new AiError(
        502,
        `DeepSeek 返回的 JSON 无法解析：${String(error?.message || error).slice(0, 120)}`,
      );
    }
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (error?.name === "AbortError") {
      throw new AiError(504, "DeepSeek 响应超时，请稍后重试。");
    }
    throw new AiError(
      502,
      "暂时无法连接 AI 服务，请稍后重试。",
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 决定这次请求用谁的 Key。
 * isDemo 为 true 表示用的是服务端共享 Key，需要按 IP 限流。
 */
export function resolveKey(headers, env = process.env) {
  const headerKey =
    headers?.["x-deepseek-key"] ??
    headers?.get?.("x-deepseek-key") ??
    "";
  const userKey = String(headerKey).trim();
  if (userKey) return { key: userKey, isDemo: false };

  const sharedKey = String(env.DEMO_KEY ?? env.DEEPSEEK_API_KEY ?? "").trim();
  return { key: sharedKey, isDemo: Boolean(sharedKey) };
}

export function bodyFromRequest(body) {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body ?? {};
}
