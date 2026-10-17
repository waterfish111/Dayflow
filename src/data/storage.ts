import { createInitialState, DEFAULT_SETTINGS } from "./defaults";
import type { AppState } from "../types";

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
