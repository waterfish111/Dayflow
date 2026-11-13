import { Capacitor } from "@capacitor/core";
import {
  LocalNotifications,
  type LocalNotificationSchema,
} from "@capacitor/local-notifications";
import type { ScheduleItem } from "../types";

/** 只有装进 App 才走系统通知；网页继续用页面内轮询。 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

const CHANNEL_ID = "dayflow-reminders";
/** 提前多少分钟提醒（下一步会做成可配置）。 */
export const REMINDER_LEAD_MINUTES = 10;
/** 一次最多排这么多条，避免把系统闹钟队列占满。 */
const MAX_NOTIFICATIONS = 60;

function hashId(value: string): number {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) || 1;
}

function startDate(task: ScheduleItem): Date | null {
  if (!task.date || !task.start) return null;
  const date = new Date(`${task.date}T${task.start}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

let channelReady = false;
let lastError = "";

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function initNativeNotifications(): Promise<void> {
  if (!isNativeApp() || channelReady) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: "任务提醒",
      description: "任务开始前的提醒",
      importance: 5,
      visibility: 1,
      vibration: true,
    });
    channelReady = true;
  } catch {
    // 渠道已存在或系统不支持，忽略即可。
  }
}

export async function nativePermissionGranted(): Promise<boolean> {
  if (!isNativeApp()) return false;
  const status = await LocalNotifications.checkPermissions();
  return status.display === "granted";
}

/** 申请通知权限；Android 12+ 顺带检查「精确闹钟」，没有就引导去开。 */
export async function ensureNativePermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  await initNativeNotifications();
  let status = await LocalNotifications.checkPermissions();
  if (status.display !== "granted") {
    status = await LocalNotifications.requestPermissions();
  }
  if (status.display !== "granted") return false;

  try {
    const exact = await LocalNotifications.checkExactNotificationSetting();
    if (exact.exact_alarm !== "granted") {
      await LocalNotifications.changeExactNotificationSetting();
    }
  } catch {
    // 低版本 Android 没有这个开关，忽略。
  }
  return true;
}

function toNotification(task: ScheduleItem, id: number): LocalNotificationSchema | null {
  const startsAt = startDate(task);
  if (!startsAt) return null;
  const trigger = new Date(startsAt.getTime() - REMINDER_LEAD_MINUTES * 60_000);
  if (trigger.getTime() <= Date.now() + 5_000) return null;
  return {
    id,
    title: task.title,
    body: `${REMINDER_LEAD_MINUTES} 分钟后开始 · ${task.category}`,
    schedule: { at: trigger, allowWhileIdle: true },
    extra: { taskId: task.id, date: task.date },
  };
}

function desiredNotifications(tasks: ScheduleItem[]): Map<number, LocalNotificationSchema> {
  const desired = new Map<number, LocalNotificationSchema>();
  for (const task of tasks) {
    if (task.completed) continue;
    if (desired.size >= MAX_NOTIFICATIONS) break;
    let id = hashId(task.id);
    while (desired.has(id)) id = (id + 1) % 2_147_483_647;
    const notification = toNotification(task, id);
    if (!notification) continue;
    desired.set(id, notification);
  }
  return desired;
}

function triggerTime(notification: LocalNotificationSchema): number {
  const at = notification.schedule?.at;
  if (!at) return 0;
  const value = at instanceof Date ? at.getTime() : new Date(at).getTime();
  return Number.isNaN(value) ? 0 : value;
}

/**
 * 只做增量同步：删掉已经不需要的，补上还没有的，剩下的原样不动。
 * 千万不要「全部取消再重排」——App 一进后台 WebView 会被挂起，
 * 取消跑完了、重排没跑完，锁屏之后就没有任何提醒了。
 */
export async function syncNativeReminders(tasks: ScheduleItem[]): Promise<number> {
  if (!isNativeApp()) return 0;
  await initNativeNotifications();

  try {
    const desired = desiredNotifications(tasks);
    const pending = await LocalNotifications.getPending();
    const pendingById = new Map(pending.notifications.map((item) => [item.id, item]));

    const drop: { id: number }[] = [];
    for (const item of pending.notifications) {
      const next = desired.get(item.id);
      if (!next) {
        drop.push({ id: item.id });
        continue;
      }
      // 同一条任务改了时间，提醒也要跟着换。
      if (triggerTime(item) !== triggerTime(next)) {
        drop.push({ id: item.id });
      }
    }
    if (drop.length > 0) {
      await LocalNotifications.cancel({ notifications: drop });
    }

    const droppedIds = new Set(drop.map((item) => item.id));
    const add = [...desired.values()].filter(
      (item) => !pendingById.has(item.id) || droppedIds.has(item.id),
    );
    if (add.length > 0) {
      await LocalNotifications.schedule({ notifications: add });
    }

    lastError = "";
    return desired.size;
  } catch (error) {
    lastError = describeError(error);
    return 0;
  }
}

/** 当前系统里排了多少条，用来在设置里显示状态。 */
export async function pendingReminderCount(): Promise<number> {
  if (!isNativeApp()) return 0;
  try {
    const pending = await LocalNotifications.getPending();
    return pending.notifications.length;
  } catch {
    return 0;
  }
}

/** 10 秒后发一条，用来验证权限、渠道和系统设置。 */
export async function sendTestNotification(delayMs = 10_000): Promise<boolean> {
  if (!isNativeApp()) return false;
  const granted = await ensureNativePermission();
  if (!granted) {
    lastError = "通知权限未授予";
    return false;
  }
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 999_999,
          title: "Dayflow 测试提醒",
          body: "看到这条，说明锁屏提醒已经打通了。",
          schedule: { at: new Date(Date.now() + Math.max(delayMs, 500)), allowWhileIdle: true },
        },
      ],
    });
    lastError = "";
    return true;
  } catch (error) {
    lastError = describeError(error);
    return false;
  }
}

/** 把权限、渠道、排队情况一次性读出来，贴给开发者就能定位问题。 */
export async function diagnoseReminders(): Promise<string[]> {
  const lines: string[] = [`构建：${__APP_BUILD__}`];
  lines.push(`平台：${Capacitor.getPlatform()}｜原生：${isNativeApp() ? "是" : "否"}`);
  if (!isNativeApp()) return lines;

  try {
    const permission = await LocalNotifications.checkPermissions();
    lines.push(`通知权限：${permission.display}`);
  } catch (error) {
    lines.push(`通知权限：读取失败（${describeError(error)}）`);
  }

  try {
    const exact = await LocalNotifications.checkExactNotificationSetting();
    lines.push(`精确闹钟：${exact.exact_alarm}`);
  } catch {
    lines.push("精确闹钟：系统没有这个开关");
  }

  try {
    const channels = await LocalNotifications.listChannels();
    const mine = channels.channels.find((channel) => channel.id === CHANNEL_ID);
    lines.push(
      mine
        ? `通知渠道：${mine.id}（重要度 ${mine.importance}）`
        : "通知渠道：还没创建",
    );
  } catch (error) {
    lines.push(`通知渠道：读取失败（${describeError(error)}）`);
  }

  try {
    const pending = await LocalNotifications.getPending();
    lines.push(`已排入：${pending.notifications.length} 条`);
    const next = pending.notifications[0];
    const at = next?.schedule?.at;
    if (at) lines.push(`下一条：${new Date(at).toLocaleString()}`);
  } catch (error) {
    lines.push(`已排入：读取失败（${describeError(error)}）`);
  }

  lines.push(`最近错误：${lastError || "无"}`);
  return lines;
}

/**
 * 启动自检：排一条 60 秒后的通知。装好 App 打开一次、锁屏，等一分钟，
 * 收到就说明系统提醒链路是通的，收不到就是权限/系统后台限制。
 */
export async function scheduleStartupProbe(): Promise<boolean> {
  if (!isNativeApp()) return false;
  await initNativeNotifications();
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 999_998,
          title: "自检提醒 · 60 秒后",
          body: `锁屏也能收到这条，说明提醒链路通了（构建 ${__APP_BUILD__}）`,
          schedule: { at: new Date(Date.now() + 60_000), allowWhileIdle: true },
        },
      ],
    });
    lastError = "";
    return true;
  } catch (error) {
    lastError = describeError(error);
    return false;
  }
}
