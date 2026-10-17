import type { AppState, Settings } from "../types";

export const DEFAULT_SETTINGS: Settings = {
  workday: {
    wake: "07:00",
    sleep: "23:00",
    maxMinutes: 360,
    blocks: [
      { start: "19:00", end: "22:00", label: "晚间专注" },
    ],
  },
  weekend: {
    wake: "08:00",
    sleep: "23:30",
    maxMinutes: 420,
    blocks: [
      { start: "09:00", end: "12:00", label: "上午专注" },
      { start: "14:00", end: "18:00", label: "下午专注" },
      { start: "19:30", end: "22:00", label: "晚间复盘" },
    ],
  },
  granularity: 30,
  defaultView: "week",
  bufferMinutes: 5,
  dndStart: "23:00",
  dndEnd: "07:00",
  digestTime: "08:00",
  categories: ["工作", "学习", "生活", "运动"],
  aiModel: "deepseek-chat",
};

export function createInitialState(): AppState {
  return {
    version: 1,
    tasks: [],
    settings: DEFAULT_SETTINGS,
    updatedAt: new Date().toISOString(),
  };
}
