import type {
  DayTemplate,
  Priority,
  ScheduleItem,
  ScheduleWarning,
  Settings,
  TimeGranularity,
} from "../types";
import {
  addDaysKey,
  addMinutesToTime,
  durationBetween,
  minutesFromTime,
  parseDateKey,
  snapMinutes,
  timeFromMinutes,
  timeToDate,
  todayKey,
} from "./date";

const PRIORITY_RANK: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

type Interval = {
  start: number;
  end: number;
};

type BusyMap = Record<string, Interval[]>;

export function taskDuration(task: ScheduleItem): number {
  if (task.start && task.end) {
    return Math.max(
      task.estimatedMinutes || 15,
      durationBetween(task.start, task.end),
    );
  }
  return Math.max(15, task.estimatedMinutes || 30);
}

export function isTaskScheduled(task: ScheduleItem): boolean {
  return Boolean(task.date && task.start && task.end);
}

export function templateForDate(
  dateKey: string,
  settings: Settings,
): DayTemplate {
  const day = parseDateKey(dateKey).getDay();
  return day === 0 || day === 6 ? settings.weekend : settings.workday;
}

function normalizeTask(task: ScheduleItem): ScheduleItem {
  const estimatedMinutes = Math.max(15, task.estimatedMinutes || 30);
  if (task.date && task.start && !task.end) {
    return {
      ...task,
      estimatedMinutes,
      end: addMinutesToTime(task.start, estimatedMinutes),
    };
  }
  return { ...task, estimatedMinutes };
}

function buildBusyMap(tasks: ScheduleItem[]): BusyMap {
  const busy: BusyMap = {};
  for (const task of tasks) {
    if (!task.date || !task.start || !task.end) continue;
    const interval = {
      start: minutesFromTime(task.start),
      end: minutesFromTime(task.end),
    };
    if (interval.end <= interval.start) continue;
    (busy[task.date] ??= []).push(interval);
  }
  return busy;
}

function buildDailyMinutes(tasks: ScheduleItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const task of tasks) {
    if (task.kind !== "task" || !task.date || !task.start || !task.end) continue;
    totals[task.date] =
      (totals[task.date] ?? 0) + durationBetween(task.start, task.end);
  }
  return totals;
}

function overlaps(
  start: number,
  end: number,
  intervals: Interval[],
  bufferMinutes: number,
): boolean {
  return intervals.some(
    (interval) =>
      start < interval.end + bufferMinutes &&
      end > interval.start - bufferMinutes,
  );
}

function deadlineParts(deadline?: string): {
  dateKey?: string;
  minutes?: number;
} {
  if (!deadline) return {};
  const [dateKey, timePart] = deadline.split("T");
  return {
    dateKey,
    minutes: timePart
      ? minutesFromTime(timePart)
      : 23 * 60 + 59,
  };
}

function candidateDates(
  task: ScheduleItem,
  today: string,
  horizonDays: number,
): string[] {
  if (task.date) return [task.date];
  const deadline = deadlineParts(task.deadline);
  if (deadline.dateKey) {
    const dates: string[] = [];
    let cursor = today;
    for (let index = 0; index < horizonDays; index += 1) {
      if (cursor > deadline.dateKey) break;
      dates.push(cursor);
      cursor = addDaysKey(cursor, 1);
    }
    return dates;
  }
  return Array.from({ length: horizonDays }, (_, index) =>
    addDaysKey(today, index),
  );
}

function findSlotOnDate(
  task: ScheduleItem,
  dateKey: string,
  busy: BusyMap,
  dailyMinutes: Record<string, number>,
  settings: Settings,
): { start: string; end: string } | null {
  const template = templateForDate(dateKey, settings);
  const duration = taskDuration(task);
  const granularity: TimeGranularity = settings.granularity;
  const buffer = Math.max(0, settings.bufferMinutes);
  const currentMinutes = dailyMinutes[dateKey] ?? 0;

  if (task.kind === "task" && currentMinutes + duration > template.maxMinutes) {
    return null;
  }

  const deadline = deadlineParts(task.deadline);
  if (deadline.minutes !== undefined && deadline.dateKey === dateKey) {
    if (duration > deadline.minutes) return null;
  }

  const blocks =
    template.blocks.length > 0
      ? template.blocks
      : [{ start: template.wake, end: template.sleep }];

  const preferred = task.preferredStart
    ? Math.ceil(minutesFromTime(task.preferredStart) / granularity) *
      granularity
    : undefined;

  for (const block of blocks) {
    const blockStart = minutesFromTime(block.start);
    const blockEnd = Math.min(
      minutesFromTime(block.end),
      deadline.dateKey === dateKey && deadline.minutes !== undefined
        ? deadline.minutes
        : 24 * 60,
    );
    if (blockEnd - blockStart < duration) continue;

    let start = Math.max(blockStart, preferred ?? blockStart);
    start = Math.ceil(start / granularity) * granularity;
    if (start < blockStart) start = blockStart;

    while (start + duration <= blockEnd) {
      const end = start + duration;
      if (
        !overlaps(start, end, busy[dateKey] ?? [], buffer) &&
        (task.kind !== "task" ||
          currentMinutes + duration <= template.maxMinutes)
      ) {
        return {
          start: timeFromMinutes(start),
          end: timeFromMinutes(end),
        };
      }
      start += granularity;
    }
  }

  return null;
}

export function autoSchedule(
  inputTasks: ScheduleItem[],
  settings: Settings,
  options: {
    taskIds?: string[];
    horizonDays?: number;
    today?: string;
  } = {},
): { tasks: ScheduleItem[]; warnings: ScheduleWarning[] } {
  const today = options.today ?? todayKey();
  const horizonDays = options.horizonDays ?? 14;
  const tasks = inputTasks.map(normalizeTask);
  const hasSelection = options.taskIds !== undefined;
  const selected = new Set(options.taskIds ?? []);
  const candidates = tasks
    .filter((task) =>
      hasSelection
        ? selected.has(task.id)
        : !isTaskScheduled(task),
    )
    .sort((a, b) => {
      const priority =
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (priority !== 0) return priority;
      const deadlineA = a.deadline ?? "9999-12-31T23:59";
      const deadlineB = b.deadline ?? "9999-12-31T23:59";
      if (deadlineA !== deadlineB) return deadlineA.localeCompare(deadlineB);
      return a.createdAt.localeCompare(b.createdAt);
    });

  const scheduledIds = new Set(
    tasks.filter((task) => isTaskScheduled(task)).map((task) => task.id),
  );
  const warnings: ScheduleWarning[] = [];
  const stableTasks =
    hasSelection
      ? tasks.filter((task) => !selected.has(task.id))
      : tasks;
  const busy = buildBusyMap(stableTasks);
  const dailyMinutes = buildDailyMinutes(stableTasks);

  for (const candidate of candidates) {
    if (scheduledIds.has(candidate.id) && !selected.has(candidate.id)) {
      continue;
    }

    const dates = candidateDates(candidate, today, horizonDays);
    let placed = false;

    for (const dateKey of dates) {
      const slot = findSlotOnDate(
        candidate,
        dateKey,
        busy,
        dailyMinutes,
        settings,
      );
      if (!slot) continue;

      const index = tasks.findIndex((task) => task.id === candidate.id);
      if (index >= 0) {
        tasks[index] = {
          ...candidate,
          date: dateKey,
          start: slot.start,
          end: slot.end,
          updatedAt: new Date().toISOString(),
        };
      }

      const duration = durationBetween(slot.start, slot.end);
      (busy[dateKey] ??= []).push({
        start: minutesFromTime(slot.start),
        end: minutesFromTime(slot.end),
      });
      if (candidate.kind === "task") {
        dailyMinutes[dateKey] = (dailyMinutes[dateKey] ?? 0) + duration;
      }
      scheduledIds.add(candidate.id);
      placed = true;
      break;
    }

    if (!placed) {
      warnings.push({
        taskId: candidate.id,
        message: `「${candidate.title}」在接下来 ${horizonDays} 天内没有找到合适的空档，已留在待办池。`,
      });
    }
  }

  return { tasks, warnings };
}

export function expandRecurrence(
  task: ScheduleItem,
  horizonDays = 42,
): ScheduleItem[] {
  if (
    !task.recurrence ||
    task.recurrence.type === "none" ||
    !task.date ||
    !task.start ||
    !task.end
  ) {
    return [task];
  }

  const groupId = task.recurrenceGroupId ?? task.id;
  const until = task.recurrence.until;
  const limit = addDaysKey(task.date, Math.max(1, horizonDays));
  const endDate = until && until < limit ? until : limit;
  const dates: string[] = [];
  const weekdays = new Set(task.recurrence.weekdays ?? []);
  const baseWeekday = parseDateKey(task.date).getDay();
  let cursor = task.date;
  let guard = 0;

  while (cursor <= endDate && guard < 180) {
    guard += 1;
    const weekday = parseDateKey(cursor).getDay();
    const shouldInclude =
      task.recurrence.type === "daily" ||
      (task.recurrence.type === "weekdays" && weekday >= 1 && weekday <= 5) ||
      (task.recurrence.type === "weekly" &&
        (weekdays.size > 0 ? weekdays.has(weekday) : weekday === baseWeekday)) ||
      (task.recurrence.type === "interval" &&
        Math.round(
          (parseDateKey(cursor).getTime() - parseDateKey(task.date).getTime()) /
            (24 * 60 * 60 * 1000),
        ) %
          Math.max(1, task.recurrence.intervalDays ?? 2) ===
          0);

    if (shouldInclude) dates.push(cursor);

    if (task.recurrence.type === "daily" || task.recurrence.type === "weekdays") {
      cursor = addDaysKey(cursor, 1);
    } else {
      cursor = addDaysKey(cursor, 1);
    }
  }

  if (dates.length === 0) return [task];

  return dates.map((dateKey, index) => ({
    ...task,
    id: index === 0 ? task.id : `${task.id}_r${index}`,
    date: dateKey,
    recurrenceGroupId: groupId,
    createdAt: task.createdAt,
    updatedAt: new Date().toISOString(),
  }));
}

export function timeForTask(task: ScheduleItem): string {
  if (!task.start || !task.end) return "待安排";
  return `${task.start}–${task.end}`;
}

export function sortForPool(a: ScheduleItem, b: ScheduleItem): number {
  const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (priority !== 0) return priority;
  const deadlineA = a.deadline ?? "9999-12-31T23:59";
  const deadlineB = b.deadline ?? "9999-12-31T23:59";
  if (deadlineA !== deadlineB) return deadlineA.localeCompare(deadlineB);
  return a.createdAt.localeCompare(b.createdAt);
}

export function parseDeadlineToDate(deadline: string): Date {
  const [dateKey, time] = deadline.split("T");
  return timeToDate(dateKey, time || "23:59");
}

export function snapStartTime(
  time: string,
  granularity: TimeGranularity,
): string {
  return timeFromMinutes(
    snapMinutes(minutesFromTime(time), granularity),
  );
}
