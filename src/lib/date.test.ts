import { describe, expect, it } from "vitest";
import {
  addDaysKey,
  addMinutesToTime,
  durationBetween,
  formatDuration,
  formatDurationCompact,
  isSameDay,
  isWithinDnd,
  minutesFromTime,
  monthMatrix,
  pad,
  parseDateKey,
  rangeHours,
  snapMinutes,
  startOfWeek,
  timeFromMinutes,
  toDateKey,
  weekDates,
} from "./date";

describe("日期键与周计算", () => {
  it("补零", () => {
    expect(pad(5)).toBe("05");
    expect(pad(12)).toBe("12");
  });

  it("日期键与 Date 互转不发生时区偏移", () => {
    const key = "2026-11-09";
    expect(toDateKey(parseDateKey(key))).toBe(key);
    expect(parseDateKey(key).getDay()).toBe(1); // 周一
  });

  it("跨月加减天数", () => {
    expect(addDaysKey("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysKey("2024-02-28", 1)).toBe("2024-02-29"); // 闰年
  });

  it("一周从周一开始", () => {
    const wednesday = new Date(2026, 10, 11);
    expect(toDateKey(startOfWeek(wednesday))).toBe("2026-11-09");
    expect(weekDates(wednesday)).toHaveLength(7);
    expect(toDateKey(weekDates(wednesday)[6])).toBe("2026-11-15");
  });

  it("周日的周视图仍然从上周一开始", () => {
    const sunday = new Date(2026, 10, 15);
    expect(toDateKey(startOfWeek(sunday))).toBe("2026-11-09");
  });

  it("月视图固定 42 格且从周一开始", () => {
    const matrix = monthMatrix(new Date(2026, 10, 1));
    expect(matrix).toHaveLength(42);
    expect(matrix[0].getDay()).toBe(1);
  });
});

describe("时间换算", () => {
  it("分钟与 HH:mm 互转", () => {
    expect(minutesFromTime("09:30")).toBe(570);
    expect(timeFromMinutes(570)).toBe("09:30");
    expect(timeFromMinutes(0)).toBe("00:00");
  });

  it("时间会被夹在 0 点到 24 点之间", () => {
    expect(timeFromMinutes(-10)).toBe("00:00");
    expect(timeFromMinutes(24 * 60)).toBe("24:00");
    expect(addMinutesToTime("23:30", 60)).toBe("24:00");
  });

  it("时长计算不会出现负数", () => {
    expect(durationBetween("09:00", "10:30")).toBe(90);
    expect(durationBetween("10:30", "09:00")).toBe(0);
  });

  it("按粒度取整", () => {
    expect(snapMinutes(7, 30)).toBe(0);
    expect(snapMinutes(20, 30)).toBe(30);
    expect(snapMinutes(44, 15)).toBe(45);
  });

  it("同一天判断忽略时间部分", () => {
    expect(
      isSameDay(new Date(2026, 10, 9, 1), new Date(2026, 10, 9, 23)),
    ).toBe(true);
    expect(
      isSameDay(new Date(2026, 10, 9), new Date(2026, 10, 10)),
    ).toBe(false);
  });
});

describe("免打扰时段", () => {
  it("跨零点的免打扰区间", () => {
    expect(isWithinDnd("23:30", "23:00", "07:00")).toBe(true);
    expect(isWithinDnd("06:59", "23:00", "07:00")).toBe(true);
    expect(isWithinDnd("12:00", "23:00", "07:00")).toBe(false);
  });

  it("起止相同视为没有免打扰", () => {
    expect(isWithinDnd("23:30", "23:00", "23:00")).toBe(false);
  });
});

describe("展示格式", () => {
  it("时长文案", () => {
    expect(formatDuration(45)).toBe("45 分钟");
    expect(formatDuration(60)).toBe("1 小时");
    expect(formatDuration(90)).toBe("1 小时 30 分钟");
    expect(formatDurationCompact(45)).toBe("45 分");
    expect(formatDurationCompact(90)).toBe("1时30分");
  });

  it("小时刻度范围", () => {
    expect(rangeHours(6, 9)).toEqual([6, 7, 8]);
    expect(rangeHours(6, 24)).toHaveLength(18);
  });
});
