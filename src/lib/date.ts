import type { TimeGranularity } from "../types";

export const WEEKDAYS_CN = [
  "周日",
  "周一",
  "周二",
  "周三",
  "周四",
  "周五",
  "周六",
] as const;

export const WEEKDAYS_SHORT_CN = [
  "日",
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
] as const;

export function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function addDaysKey(key: string, amount: number): string {
  return toDateKey(addDays(parseDateKey(key), amount));
}

export function startOfWeek(date: Date): Date {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function weekDates(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function monthMatrix(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

export function formatMonthDay(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatFullDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS_CN[date.getDay()]}`;
}

export function formatWeekRange(dates: Date[]): string {
  if (dates.length === 0) return "";
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first.getMonth() === last.getMonth()) {
    return `${first.getFullYear()}年${first.getMonth() + 1}月 ${first.getDate()}–${last.getDate()}日`;
  }
  return `${first.getFullYear()}年${first.getMonth() + 1}月${first.getDate()}日 – ${last.getMonth() + 1}月${last.getDate()}日`;
}

export function formatMonthTitle(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function relativeDateLabel(key: string): string {
  const target = parseDateKey(key);
  const today = parseDateKey(todayKey());
  const diff = Math.round(
    (target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === 2) return "后天";
  if (diff === -1) return "昨天";
  return `${target.getMonth() + 1}月${target.getDate()}日 ${WEEKDAYS_CN[target.getDay()]}`;
}

export function minutesFromTime(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function timeFromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, total));
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

export function addMinutesToTime(time: string, amount: number): string {
  return timeFromMinutes(minutesFromTime(time) + amount);
}

export function durationBetween(start: string, end: string): number {
  return Math.max(0, minutesFromTime(end) - minutesFromTime(start));
}

export function snapMinutes(value: number, granularity: TimeGranularity): number {
  return Math.round(value / granularity) * granularity;
}

export function snapTime(time: string, granularity: TimeGranularity): string {
  return timeFromMinutes(snapMinutes(minutesFromTime(time), granularity));
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`;
}

export function formatDurationCompact(minutes: number): string {
  if (minutes < 60) return `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小时` : `${hours}时${rest}分`;
}

export function formatDeadline(value?: string): string {
  if (!value) return "";
  const [datePart, timePart] = value.split("T");
  if (!datePart) return "";
  const prefix = relativeDateLabel(datePart);
  return `${prefix}${timePart ? ` ${timePart}` : ""}`;
}

export function nowLocalDateTime(): string {
  const now = new Date();
  return `${toDateKey(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function isWithinDnd(
  time: string,
  dndStart: string,
  dndEnd: string,
): boolean {
  const current = minutesFromTime(time);
  const start = minutesFromTime(dndStart);
  const end = minutesFromTime(dndEnd);
  if (start === end) return false;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

export function timeToDate(dateKey: string, time: string): Date {
  const date = parseDateKey(dateKey);
  const [hours, minutes] = time.split(":").map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function rangeHours(startHour = 6, endHour = 24): number[] {
  return Array.from(
    { length: Math.max(1, endHour - startHour) },
    (_, index) => startHour + index,
  );
}
