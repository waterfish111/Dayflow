import { createInitialState, DEFAULT_SETTINGS } from "./defaults";
import { addMinutesToTime } from "../lib/date";
import { createId } from "../lib/id";
import type {
  AppState,
  ItemKind,
  Priority,
  Recurrence,
  RecurrenceType,
  ScheduleItem,
} from "../types";

const STATE_KEY = "dayflow.state.v1";
const AI_KEY = "dayflow.deepseek-key.v1";
const NOTIFICATION_KEY = "dayflow.notifications.v1";

function mergeState(raw: Partial<AppState> | null): AppState {
  const initial = createInitialState();
  if (!raw) return initial;
  return {
    ...initial,
    ...raw,
    version: 1,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(raw.settings ?? {}),
      workday: {
        ...DEFAULT_SETTINGS.workday,
        ...(raw.settings?.workday ?? {}),
      },
      weekend: {
        ...DEFAULT_SETTINGS.weekend,
        ...(raw.settings?.weekend ?? {}),
      },
    },
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return createInitialState();
    return mergeState(JSON.parse(raw) as Partial<AppState>);
  } catch {
    return createInitialState();
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({ ...state, updatedAt: new Date().toISOString() }),
    );
  } catch {
    // Storage can be unavailable in private browsing; the app still works in memory.
  }
}

export function loadDeepSeekKey(): string {
  try {
    return localStorage.getItem(AI_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveDeepSeekKey(value: string): void {
  try {
    if (value) localStorage.setItem(AI_KEY, value);
    else localStorage.removeItem(AI_KEY);
  } catch {
    // Ignore storage errors.
  }
}

export type NotificationMemory = Record<string, string>;

export function loadNotificationMemory(): NotificationMemory {
  try {
    return JSON.parse(
      localStorage.getItem(NOTIFICATION_KEY) ?? "{}",
    ) as NotificationMemory;
  } catch {
    return {};
  }
}

export function saveNotificationMemory(memory: NotificationMemory): void {
  try {
    localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(memory));
  } catch {
    // Ignore storage errors.
  }
}

/* ------------------------------------------------------------------ *
 * 导入：把备份文件变成可信的 AppState
 * 备份是用户手改过的 JSON，不能直接 spread 进 state，否则一个坏字段
 * 就能让排期引擎整天崩。这里逐字段校验、能修则修、修不了就丢掉。
 * ------------------------------------------------------------------ */

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITIES: Priority[] = ["high", "medium", "low"];
const KINDS: ItemKind[] = ["task", "event"];
const RECURRENCE_TYPES: RecurrenceType[] = [
  "none",
  "daily",
  "weekdays",
  "weekly",
  "interval",
];
const MAX_IMPORTED_TASKS = 5000;

export type ImportOutcome =
  | { ok: true; state: AppState; taskCount: number; skipped: number }
  | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text : undefined;
}

function pickTime(value: unknown): string | undefined {
  const text = pickText(value);
  return text && TIME_RE.test(text) ? text : undefined;
}

function pickDate(value: unknown): string | undefined {
  const text = pickText(value);
  return text && DATE_RE.test(text) ? text : undefined;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function pickRecurrence(value: unknown): Recurrence | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const type = pickText(record.type) as RecurrenceType | undefined;
  if (!type || !RECURRENCE_TYPES.includes(type) || type === "none") {
    return undefined;
  }
  const recurrence: Recurrence = { type };
  const interval = Number(record.intervalDays);
  if (type === "interval" && Number.isFinite(interval)) {
    recurrence.intervalDays = Math.min(90, Math.max(1, Math.round(interval)));
  }
  if (type === "weekly" && Array.isArray(record.weekdays)) {
    const weekdays = record.weekdays
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    if (weekdays.length) recurrence.weekdays = [...new Set(weekdays)];
  }
  const until = pickDate(record.until);
  if (until) recurrence.until = until;
  return recurrence;
}

function sanitizeTask(value: unknown): ScheduleItem | null {
  const record = asRecord(value);
  if (!record) return null;
  const title = pickText(record.title);
  if (!title) return null;

  const estimated = Number(record.estimatedMinutes);
  const estimatedMinutes = Number.isFinite(estimated)
    ? Math.min(600, Math.max(15, Math.round(estimated)))
    : 30;

  const kind = KINDS.includes(record.kind as ItemKind)
    ? (record.kind as ItemKind)
    : "task";
  const priority = PRIORITIES.includes(record.priority as Priority)
    ? (record.priority as Priority)
    : "medium";

  const date = pickDate(record.date);
  const start = date ? pickTime(record.start) : undefined;
  const end = start ? (pickTime(record.end) ?? addMinutesToTime(start, estimatedMinutes)) : undefined;

  const now = new Date().toISOString();
  const recurrence = pickRecurrence(record.recurrence);

  return {
    id: pickText(record.id) ?? createId("task"),
    title,
    kind,
    date,
    start,
    end: end && start && end > start ? end : start ? addMinutesToTime(start, estimatedMinutes) : undefined,
    preferredStart: pickTime(record.preferredStart),
    estimatedMinutes,
    priority,
    category: pickText(record.category) ?? "未分类",
    deadline: pickDate(record.deadline),
    notes: pickText(record.notes),
    location: pickText(record.location),
    link: pickText(record.link),
    locked: pickBoolean(record.locked, false),
    completed: pickBoolean(record.completed, false),
    recurrence,
    recurrenceGroupId: pickText(record.recurrenceGroupId),
    source: record.source === "ai" ? "ai" : "manual",
    createdAt: pickText(record.createdAt) ?? now,
    updatedAt: pickText(record.updatedAt) ?? now,
  };
}

export function parseImportedState(text: string): ImportOutcome {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { ok: false, error: "不是有效的 JSON 文件" };
  }

  const record = Array.isArray(root) ? { tasks: root } : asRecord(root);
  if (!record) {
    return { ok: false, error: "文件内容不是 Dayflow 备份格式（缺少 tasks）" };
  }
  const rawTasks = record.tasks;
  if (!Array.isArray(rawTasks)) {
    return { ok: false, error: "备份里没有 tasks 数组" };
  }
  if (rawTasks.length > MAX_IMPORTED_TASKS) {
    return {
      ok: false,
      error: `任务太多（${rawTasks.length} 条），一次最多导入 ${MAX_IMPORTED_TASKS} 条`,
    };
  }

  const seen = new Set<string>();
  const tasks: ScheduleItem[] = [];
  let skipped = 0;
  for (const item of rawTasks) {
    const task = sanitizeTask(item);
    if (!task) {
      skipped += 1;
      continue;
    }
    if (seen.has(task.id)) task.id = createId("task");
    seen.add(task.id);
    tasks.push(task);
  }
  if (rawTasks.length && !tasks.length) {
    return { ok: false, error: "没有一条任务能识别，请确认文件来自 Dayflow 导出" };
  }

  const settings = mergeState({ settings: asRecord(record.settings) as never })
    .settings;
  const state: AppState = {
    version: 1,
    tasks,
    settings,
    updatedAt: new Date().toISOString(),
  };
  return { ok: true, state, taskCount: tasks.length, skipped };
}
