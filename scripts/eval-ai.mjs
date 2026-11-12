#!/usr/bin/env node
/**
 * AI 解析评测：把自然语言 → 结构化草案的准确率，按字段拆开算。
 *
 * 用法：
 *   pnpm eval:ai --dry-run              只校验题库结构，不花钱
 *   pnpm eval:ai --mock                 用标准答案当模型输出，验证打分逻辑
 *   DEEPSEEK_API_KEY=sk-xxx pnpm eval:ai 真跑（会消耗额度）
 *
 * 为什么要做：LLM 解析是整个链路里唯一不确定的一环，没有评测就只能
 * 靠「我觉得还行」。这里把「日期换算、时间、时长、kind、recurrence」
 * 分开统计，改 prompt 之后能看出到底哪一类退化了。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSchedule } from "../server/ai.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CASES_PATH = path.join(__dirname, "..", "eval", "cases.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const mock = args.includes("--mock");
const today =
  args.find((arg) => arg.startsWith("--today="))?.slice("--today=".length) ??
  new Date().toLocaleDateString("sv-SE");
const keyArg = args.find((arg) => arg.startsWith("--key="))?.slice("--key=".length);
const apiKey = keyArg ?? process.env.DEEPSEEK_API_KEY ?? "";

const settings = {
  workday: {
    wake: "07:00",
    sleep: "23:00",
    maxMinutes: 360,
    blocks: [{ start: "19:00", end: "22:00", label: "晚间专注" }],
  },
  weekend: {
    wake: "08:00",
    sleep: "23:30",
    maxMinutes: 420,
    blocks: [
      { start: "09:00", end: "12:00", label: "上午" },
      { start: "14:00", end: "18:00", label: "下午" },
    ],
  },
  categories: ["工作", "学习", "生活", "运动"],
};

const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

function weekdayOf(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return WEEKDAYS[new Date(year, month - 1, day).getDay()];
}

function loadCases() {
  const raw = JSON.parse(fs.readFileSync(CASES_PATH, "utf8"));
  if (!Array.isArray(raw)) throw new Error("eval/cases.json 必须是数组");
  const ids = new Set();
  for (const item of raw) {
    if (!item?.id) throw new Error("有 case 缺少 id");
    if (ids.has(item.id)) throw new Error(`case id 重复：${item.id}`);
    ids.add(item.id);
    if (!item.text) throw new Error(`${item.id} 缺少 text`);
    if (!item.expect?.items?.length) throw new Error(`${item.id} 缺少 expect.items`);
    if (item.expect.items.length !== item.expect.count) {
      throw new Error(`${item.id} 的 count 与 items 数量不一致`);
    }
  }
  return raw;
}

const FIELDS = [
  "count",
  "kind",
  "date",
  "start",
  "end",
  "minutes",
  "deadline",
  "priority",
  "pool",
  "recurrence",
  "weekdays",
];

const fieldStats = Object.fromEntries(
  FIELDS.map((field) => [field, { hit: 0, total: 0 }]),
);

function compareField(field, expected, actual) {
  if (field === "minutes") return expected === actual.estimatedMinutes;
  if (field === "deadline") {
    const value = String(actual.deadline ?? "").slice(0, 10);
    return value === expected;
  }
  if (field === "recurrence") {
    return (actual.recurrence?.type ?? "none") === expected;
  }
  if (field === "weekdays") {
    const got = [...(actual.recurrence?.weekdays ?? [])].sort().join(",");
    return got === [...expected].sort().join(",");
  }
  if (field === "pool") return Boolean(actual.pool) === expected;
  return actual[field] === expected;
}

function scoreCase(testCase, result) {
  const failures = [];
  const expect = testCase.expect;
  const items = Array.isArray(result.items) ? result.items : [];

  fieldStats.count.total += 1;
  if (items.length === expect.count) fieldStats.count.hit += 1;
  else failures.push(`条数 期望 ${expect.count} 实得 ${items.length}`);

  expect.items.forEach((expectedItem, index) => {
    const actual = items[index];
    if (!actual) return;
    for (const [field, expected] of Object.entries(expectedItem)) {
      const stat = fieldStats[field];
      if (!stat) continue;
      stat.total += 1;
      if (compareField(field, expected, actual)) stat.hit += 1;
      else {
        failures.push(
          `#${index + 1} ${field} 期望 ${JSON.stringify(expected)} 实得 ${JSON.stringify(
            field === "minutes"
              ? actual.estimatedMinutes
              : field === "recurrence"
                ? actual.recurrence?.type
                : actual[field],
          )}`,
        );
      }
    }
  });

  if (expect.questions === "至少一条") {
    fieldStats.questions ??= { hit: 0, total: 0 };
    fieldStats.questions.total += 1;
    if ((result.questions ?? []).length > 0) fieldStats.questions.hit += 1;
    else failures.push("应该提问，但 questions 为空");
  }

  return failures;
}

async function mockParse(testCase) {
  const items = testCase.expect.items.map((expected, index) => ({
    title: `mock-${testCase.id}-${index}`,
    kind: expected.kind ?? "task",
    pool: expected.pool ?? false,
    date: expected.date,
    start: expected.start,
    end: expected.end,
    estimatedMinutes: expected.minutes,
    priority: expected.priority ?? "medium",
    deadline: expected.deadline,
    recurrence: expected.recurrence
      ? { type: expected.recurrence, weekdays: expected.weekdays }
      : { type: "none" },
  }));
  return {
    items,
    questions: testCase.expect.questions === "至少一条" ? ["什么时候方便？"] : [],
    summary: "mock",
  };
}

async function main() {
  const cases = loadCases();
  console.log(`题库：${cases.length} 条，基准日期 ${today}（${weekdayOf(today)}）`);

  if (dryRun) {
    const counts = cases.reduce((acc, item) => {
      acc[item.expect.count] = (acc[item.expect.count] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`条数分布：${JSON.stringify(counts)}`);
    console.log("结构校验通过，加 --mock 可验证打分逻辑，或配 DEEPSEEK_API_KEY 真跑。");
    return;
  }
  if (!mock && !apiKey) {
    console.error("缺少 API Key：设 DEEPSEEK_API_KEY 或传 --key=sk-xxx；只想校验题库请用 --dry-run。");
    process.exitCode = 2;
    return;
  }

  const failuresByCase = [];
  let index = 0;
  for (const testCase of cases) {
    index += 1;
    process.stdout.write(`\r跑第 ${index}/${cases.length} 条…`);
    let result;
    try {
      result = mock
        ? await mockParse(testCase)
        : await parseSchedule(
            {
              text: testCase.text,
              today,
              weekday: weekdayOf(today),
              timezone: "Asia/Shanghai",
              model: "deepseek-chat",
              settings,
            },
            apiKey,
          );
    } catch (error) {
      failuresByCase.push({ id: testCase.id, failures: [`请求失败：${error.message}`] });
      continue;
    }
    const failures = scoreCase(testCase, result);
    if (failures.length) failuresByCase.push({ id: testCase.id, failures });
  }
  process.stdout.write("\r");

  let hit = 0;
  let total = 0;
  const rows = Object.entries(fieldStats).map(([field, stat]) => {
    hit += stat.hit;
    total += stat.total;
    const rate = stat.total ? (stat.hit / stat.total) * 100 : 0;
    return `| ${field} | ${stat.hit}/${stat.total} | ${rate.toFixed(1)}% |`;
  });

  console.log("\n| 字段 | 命中 | 准确率 |");
  console.log("| --- | --- | --- |");
  console.log(rows.join("\n"));
  console.log(`\n总体：${hit}/${total} = ${((hit / total) * 100).toFixed(1)}%`);

  if (failuresByCase.length) {
    console.log(`\n未全对的用例（${failuresByCase.length}）：`);
    for (const item of failuresByCase.slice(0, 12)) {
      console.log(`- ${item.id}: ${item.failures.join("；")}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
