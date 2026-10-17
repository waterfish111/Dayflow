import type { AppState, ScheduleItem } from "../types";
import {
  isWithinDnd,
  minutesFromTime,
  timeToDate,
  todayKey,
} from "./date";
import {
  loadNotificationMemory,
  saveNotificationMemory,
  type NotificationMemory,
} from "../data/storage";

export function notificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export type NotificationPermissionState =
  | NotificationPermission
  | "unsupported";

export function notificationPermission(): NotificationPermissionState {
  if (!notificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationSupported()) return "unsupported";
  return Notification.requestPermission();
}

export async function showAppNotification(
  title: string,
  body: string,
  tag: string,
): Promise<void> {
  if (!notificationSupported() || Notification.permission !== "granted") {
    return;
  }

  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, {
        body,
        tag,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: "/" },
      });
      return;
    }
  } catch {
    // Fall back to the page-level Notification API.
  }

  new Notification(title, { body, tag, icon: "/icon-192.png" });
}

function activeTodayItems(state: AppState): ScheduleItem[] {
  const today = todayKey();
  return state.tasks.filter((task) => {
    if (task.completed) return false;
    if (task.date === today) return true;
    return task.deadline?.startsWith(today) ?? false;
  });
}

function reminderKey(task: ScheduleItem, type: "start" | "deadline"): string {
  return `${type}:${task.id}:${task.date ?? ""}:${task.start ?? ""}:${task.deadline ?? ""}`;
}

function shouldSkipForDnd(state: AppState): boolean {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
  return isWithinDnd(time, state.settings.dndStart, state.settings.dndEnd);
}

function mark(
  memory: NotificationMemory,
  key: string,
  value: string,
): void {
  memory[key] = value;
  saveNotificationMemory(memory);
}

export async function checkReminders(state: AppState): Promise<void> {
  if (!notificationSupported() || Notification.permission !== "granted") {
    return;
  }

  const now = new Date();
  const memory = loadNotificationMemory();
  const today = todayKey();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const digestMinutes = minutesFromTime(state.settings.digestTime);
  const digestKey = `digest:${today}`;

  if (
    !memory[digestKey] &&
    nowMinutes >= digestMinutes &&
    nowMinutes < digestMinutes + 30
  ) {
    if (shouldSkipForDnd(state)) {
      mark(memory, digestKey, "skipped");
    } else {
      const items = activeTodayItems(state);
      const titles = items.slice(0, 8).map((item) => item.title);
      const body =
        items.length === 0
          ? "今天还没有安排，打开 Dayflow 规划一下。"
          : `${titles.join("、")}${items.length > 8 ? ` 等 ${items.length} 项` : ""}`;
      await showAppNotification("今天的计划", body, digestKey);
      mark(memory, digestKey, "sent");
    }
  }

  for (const task of state.tasks) {
    if (task.completed) continue;

    if (task.date && task.start) {
      const start = timeToDate(task.date, task.start);
      const reminderAt = new Date(start.getTime() - 2 * 60 * 60 * 1000);
      const key = reminderKey(task, "start");
      if (
        !memory[key] &&
        now >= reminderAt &&
        now < start &&
        task.date >= today
      ) {
        if (shouldSkipForDnd(state)) {
          mark(memory, key, "skipped");
        } else {
          await showAppNotification(
            task.kind === "event" ? "会议即将开始" : "日程即将开始",
            `${task.title} · ${task.start} 开始`,
            key,
          );
          mark(memory, key, "sent");
        }
      }
    }

    if (task.deadline) {
      const deadline = new Date(task.deadline);
      const reminderAt = new Date(deadline.getTime() - 2 * 60 * 60 * 1000);
      const key = reminderKey(task, "deadline");
      if (!memory[key] && now >= reminderAt && now < deadline) {
        if (shouldSkipForDnd(state)) {
          mark(memory, key, "skipped");
        } else {
          await showAppNotification(
            "截止时间快到了",
            `${task.title} · ${task.deadline.replace("T", " ")} 截止`,
            key,
          );
          mark(memory, key, "sent");
        }
      }
    }
  }
}

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The app remains usable without service worker support.
    });
  });
}
