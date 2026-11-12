/**
 * 排期引擎基准测试。
 *
 * 用法：pnpm bench
 * 输出：每个规模下 autoSchedule 的 p50 / p95 / 平均耗时，以及排进率。
 *
 * 为什么要有这个：简历上写「贪心 first-fit，确定性排期」，面试官会问
 * 「规模上去还顶得住吗」。这里给的是可复现的数字，而不是感觉。
 */
import { autoSchedule } from "../src/lib/scheduler.ts";
import { DEFAULT_SETTINGS } from "../src/data/defaults.ts";
import { addDaysKey, todayKey } from "../src/lib/date.ts";
import type { Priority, ScheduleItem } from "../src/types.ts";

const SIZES = [20, 200, 1000, 5000];
const ROUNDS = 5;
const HORIZON_DAYS = 14;
const PRIORITIES: Priority[] = ["high", "medium", "low"];
const TITLES = ["写周报", "代码评审", "需求评审", "跑步", "读书", "复盘", "回邮件", "整理笔记"];

function makeTask(index: number, today: string): ScheduleItem {
  const duration = [15, 30, 45, 60, 90, 120][index % 6];
  const priority = PRIORITIES[index % 3];
  const createdAt = new Date(Date.now() - index * 60_000).toISOString();
  // 三成任务带截止日，其余是「本周内找空档」。
  const withDeadline = index % 10 < 3;
  return {
    id: `bench_${index}`,
    title: `${TITLES[index % TITLES.length]} ${index}`,
    kind: "task",
    estimatedMinutes: duration,
    priority,
    category: "工作",
    deadline: withDeadline
      ? addDaysKey(today, 1 + (index % HORIZON_DAYS))
      : undefined,
    locked: false,
    completed: false,
    source: "manual",
    createdAt,
    updatedAt: createdAt,
  };
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function run(size: number, today: string) {
  const tasks = Array.from({ length: size }, (_, index) => makeTask(index, today));
  const times: number[] = [];
  let scheduled = 0;
  let warnings = 0;

  for (let round = 0; round < ROUNDS; round += 1) {
    const started = performance.now();
    const result = autoSchedule(tasks, DEFAULT_SETTINGS, {
      horizonDays: HORIZON_DAYS,
      today,
    });
    const elapsed = performance.now() - started;
    times.push(elapsed);
    if (round === 0) {
      scheduled = result.tasks.filter((task) => task.date && task.start && task.end).length;
      warnings = result.warnings.length;
    }
  }

  return {
    size,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    avg: times.reduce((sum, value) => sum + value, 0) / times.length,
    scheduled,
    warnings,
  };
}

const today = todayKey();
const rows = SIZES.map((size) => run(size, today));

const header = ["任务数", "p50", "p95", "平均", "已排入", "未排入"];
const lines = [
  `| ${header.join(" | ")} |`,
  `| ${header.map(() => "---").join(" | ")} |`,
  ...rows.map(
    (row) =>
      `| ${row.size} | ${row.p50.toFixed(1)} ms | ${row.p95.toFixed(1)} ms | ${row.avg.toFixed(1)} ms | ${row.scheduled} | ${row.size - row.scheduled} |`,
  ),
];

console.log(`排期基准（${ROUNDS} 轮取分位，horizon=${HORIZON_DAYS} 天，默认设置）\n`);
console.log(lines.join("\n"));
console.log(
  "\n注：14 天内可用容量有限，几千条任务时「未排入」是容量问题，不是算法卡住。",
);
console.log("\nJSON:");
console.log(JSON.stringify(rows, null, 2));
