import { describe, expect, it } from "vitest";
import type { ScheduleItem, Settings } from "../types";
import {
  autoSchedule,
  expandRecurrence,
  isTaskScheduled,
  taskDuration,
} from "./scheduler";

const TODAY = "2026-11-09"; // 周一

function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    workday: { wake: "09:00", sleep: "18:00", maxMinutes: 480, blocks: [] },
    weekend: { wake: "09:00", sleep: "18:00", maxMinutes: 480, blocks: [] },
    granularity: 30,
    defaultView: "week",
    bufferMinutes: 0,
    dndStart: "23:00",
    dndEnd: "07:00",
    digestTime: "08:00",
    categories: ["工作"],
    aiModel: "deepseek-chat",
    ...overrides,
  };
}

let seq = 0;
function task(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `任务 ${seq}`,
    kind: "task",
    estimatedMinutes: 60,
    priority: "medium",
    category: "工作",
    locked: false,
    completed: false,
    source: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function slotOf(tasks: ScheduleItem[], id: string) {
  const found = tasks.find((item) => item.id === id);
  return found ? `${found.date} ${found.start}-${found.end}` : "missing";
}

describe("autoSchedule / 空档搜索", () => {
  it("空日历把任务放在第一个可用时间块的起点", () => {
    const settingsWithBlock = settings({
      workday: {
        wake: "07:00",
        sleep: "23:00",
        maxMinutes: 360,
        blocks: [{ start: "19:00", end: "22:00" }],
      },
    });
    const { tasks, warnings } = autoSchedule([task({ id: "a" })], settingsWithBlock, {
      today: TODAY,
    });

    expect(slotOf(tasks, "a")).toBe("2026-11-09 19:00-20:00");
    expect(warnings).toHaveLength(0);
  });

  it("没有时间块时回退到起床到睡觉的整段", () => {
    const { tasks } = autoSchedule([task({ id: "b" })], settings(), {
      today: TODAY,
    });
    expect(slotOf(tasks, "b")).toBe("2026-11-09 09:00-10:00");
  });

  it("跳过已被占用的时段", () => {
    const busy = task({ id: "busy", date: TODAY, start: "09:00", end: "10:00" });
    const { tasks } = autoSchedule([busy, task({ id: "new" })], settings(), {
      today: TODAY,
    });
    expect(slotOf(tasks, "new")).toBe("2026-11-09 10:00-11:00");
  });

  it("任务之间的缓冲时间会让开始时间后移", () => {
    const busy = task({ id: "busy", date: TODAY, start: "09:00", end: "10:00" });
    const { tasks } = autoSchedule(
      [busy, task({ id: "new" })],
      settings({ bufferMinutes: 5 }),
      { today: TODAY },
    );
    // 10:00 + 5 分钟缓冲 = 10:05，按 30 分钟粒度向上取整到 10:30
    expect(slotOf(tasks, "new")).toBe("2026-11-09 10:30-11:30");
  });

  it("首选开始时间会尝试对齐，并向上取整到粒度", () => {
    const { tasks } = autoSchedule(
      [task({ id: "new", preferredStart: "14:20" })],
      settings(),
      { today: TODAY },
    );
    expect(slotOf(tasks, "new")).toBe("2026-11-09 14:30-15:30");
  });

  it("当天剩余额度不足时顺延到下一天", () => {
    const full = task({ id: "full", date: TODAY, start: "09:00", end: "10:00" });
    const { tasks } = autoSchedule(
      [full, task({ id: "new" })],
      settings({
        workday: { wake: "09:00", sleep: "18:00", maxMinutes: 60, blocks: [] },
      }),
      { today: TODAY },
    );
    expect(slotOf(tasks, "new")).toBe("2026-11-10 09:00-10:00");
  });

  it("截止时间会截断当天的可用结束时间", () => {
    const { tasks } = autoSchedule(
      [task({ id: "new", estimatedMinutes: 120, deadline: `${TODAY}T12:00` })],
      settings(),
      { today: TODAY },
    );
    expect(slotOf(tasks, "new")).toBe("2026-11-09 09:00-11:00");
  });
});

describe("autoSchedule / 边界与失败路径", () => {
  it("已经指定日期的任务不会跨到别的日期，只回待办池", () => {
    const busy = task({ id: "busy", date: TODAY, start: "09:00", end: "18:00" });
    const pinned = task({ id: "pinned", date: TODAY });
    const { tasks, warnings } = autoSchedule([busy, pinned], settings(), {
      today: TODAY,
    });

    const result = tasks.find((item) => item.id === "pinned");
    expect(result?.date).toBe(TODAY);
    expect(result?.start).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0].taskId).toBe("pinned");
    expect(warnings[0].message).toContain("14 天内没有找到合适的空档");
  });

  it("截止时间早于今天时不排期，直接给出警告", () => {
    const { warnings } = autoSchedule(
      [task({ id: "late", deadline: "2026-11-08T23:59" })],
      settings(),
      { today: TODAY },
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].taskId).toBe("late");
  });

  it("horizonDays 会出现在警告文案里", () => {
    const { warnings } = autoSchedule(
      [task({ id: "late", deadline: "2026-11-01T23:59" })],
      settings(),
      { today: TODAY, horizonDays: 3 },
    );
    expect(warnings[0].message).toContain("接下来 3 天");
  });
});

describe("autoSchedule / 排序与重排", () => {
  it("高优先级任务先占位，低优先级任务顺延", () => {
    const { tasks } = autoSchedule(
      [
        task({ id: "low", priority: "low" }),
        task({ id: "high", priority: "high" }),
      ],
      settings(),
      { today: TODAY },
    );
    expect(slotOf(tasks, "high")).toBe("2026-11-09 09:00-10:00");
    expect(slotOf(tasks, "low")).toBe("2026-11-09 10:00-11:00");
  });

  it("不传 taskIds 时已排期的任务保持不动", () => {
    const kept = task({ id: "keep", date: TODAY, start: "09:00", end: "10:00" });
    const { tasks } = autoSchedule([kept], settings(), { today: TODAY });
    expect(slotOf(tasks, "keep")).toBe("2026-11-09 09:00-10:00");
  });

  it("传入 taskIds 时只重排选中的任务，并释放它原来的时段", () => {
    const moving = task({
      id: "A",
      date: TODAY,
      start: "13:00",
      end: "14:00",
    });
    const fixed = task({ id: "B", date: TODAY, start: "09:00", end: "10:00" });
    const { tasks } = autoSchedule([moving, fixed], settings(), {
      today: TODAY,
      taskIds: ["A"],
    });
    expect(slotOf(tasks, "B")).toBe("2026-11-09 09:00-10:00");
    // A 原来的 13:00-14:00 不在忙碌集合里，所以能回到 10:00
    expect(slotOf(tasks, "A")).toBe("2026-11-09 10:00-11:00");
  });

  it("event 占用时段但不计入每日任务上限", () => {
    const event = task({
      id: "ev",
      kind: "event",
      date: TODAY,
      start: "09:00",
      end: "10:00",
    });
    const { tasks } = autoSchedule(
      [event, task({ id: "new" })],
      settings({
        workday: { wake: "09:00", sleep: "18:00", maxMinutes: 60, blocks: [] },
      }),
      { today: TODAY },
    );
    expect(slotOf(tasks, "new")).toBe("2026-11-09 10:00-11:00");
  });
});

describe("taskDuration / isTaskScheduled", () => {
  it("有开始和结束时间时按时间差计算，取时间差与预估时长的较大值", () => {
    expect(
      taskDuration(task({ start: "09:00", end: "10:30", estimatedMinutes: 10 })),
    ).toBe(90);
    expect(
      taskDuration(task({ start: "09:00", end: "09:10", estimatedMinutes: 0 })),
    ).toBe(15);
  });

  it("没有时间时使用预估时长，默认 30 分钟", () => {
    expect(taskDuration(task({ estimatedMinutes: 45 }))).toBe(45);
    expect(taskDuration(task({ estimatedMinutes: 0 }))).toBe(30);
  });

  it("只有三个时间字段齐全才算已排期", () => {
    expect(isTaskScheduled(task({ date: TODAY }))).toBe(false);
    expect(isTaskScheduled(task({ date: TODAY, start: "09:00" }))).toBe(false);
    expect(
      isTaskScheduled(task({ date: TODAY, start: "09:00", end: "10:00" })),
    ).toBe(true);
  });
});

describe("expandRecurrence", () => {
  const base = {
    date: "2026-11-09",
    start: "09:00",
    end: "10:00",
  };

  it("重复规则为 none 或缺少时间时原样返回", () => {
    const plain = task({ id: "p" });
    expect(expandRecurrence(plain, 7)).toEqual([plain]);

    const noTime = task({
      id: "nt",
      date: "2026-11-09",
      recurrence: { type: "daily" },
    });
    expect(expandRecurrence(noTime, 7)).toEqual([noTime]);
  });

  it("每天重复会生成以起始日开头的连续日期，并复用同一个分组 id", () => {
    const result = expandRecurrence(
      task({ id: "r", ...base, recurrence: { type: "daily" } }),
      5,
    );

    expect(result.map((item) => item.date)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
    ]);
    expect(result.map((item) => item.id)).toEqual([
      "r",
      "r_r1",
      "r_r2",
      "r_r3",
      "r_r4",
      "r_r5",
    ]);
    expect(new Set(result.map((item) => item.recurrenceGroupId))).toEqual(
      new Set(["r"]),
    );
  });

  it("每周重复只保留指定星期", () => {
    const result = expandRecurrence(
      task({
        id: "w",
        ...base,
        recurrence: { type: "weekly", weekdays: [1, 3] },
      }),
      14,
    );

    expect(result.map((item) => item.date)).toEqual([
      "2026-11-09", // 周一
      "2026-11-11", // 周三
      "2026-11-16",
      "2026-11-18",
      "2026-11-23",
    ]);
  });

  it("每 N 天重复按天数差取模", () => {
    const result = expandRecurrence(
      task({
        id: "i",
        ...base,
        recurrence: { type: "interval", intervalDays: 3 },
      }),
      7,
    );

    expect(result.map((item) => item.date)).toEqual([
      "2026-11-09",
      "2026-11-12",
      "2026-11-15",
    ]);
  });

  it("until 早于展开上限时提前结束", () => {
    const result = expandRecurrence(
      task({
        id: "u",
        ...base,
        recurrence: { type: "daily", until: "2026-11-11" },
      }),
      30,
    );

    expect(result.at(-1)?.date).toBe("2026-11-11");
  });
});
