import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAiResult,
  selectModel,
} from "./ai.mjs";

test("AI 输出会清洗非法日期、时间和数值", () => {
  const result = normalizeAiResult({
    items: [
      {
        title: "  写报告  ",
        kind: "task",
        date: "2026-02-30",
        start: "99:99",
        end: "25:00",
        estimatedMinutes: 90.4,
        priority: "unknown",
        deadline: "2026-02-29T23:59",
        confidence: 2,
      },
    ],
    questions: ["   ", "什么时候开始？"],
    summary: " 草案 ",
  });

  assert.equal(result.items[0].title, "写报告");
  assert.equal(result.items[0].date, undefined);
  assert.equal(result.items[0].start, undefined);
  assert.equal(result.items[0].end, undefined);
  assert.equal(result.items[0].estimatedMinutes, 90);
  assert.equal(result.items[0].priority, "medium");
  assert.equal(result.items[0].deadline, undefined);
  assert.equal(result.items[0].confidence, 1);
  assert.deepEqual(result.questions, ["什么时候开始？"]);
  assert.equal(result.summary, "草案");
});

test("待办池条目不会残留日期和时间", () => {
  const result = normalizeAiResult({
    items: [
      {
        title: "先记下来",
        kind: "event",
        pool: true,
        date: "2026-11-14",
        start: "09:00",
        end: "10:00",
        deadline: "2026-11-15T23:59",
        recurrence: { type: "weekly", weekdays: [] },
      },
    ],
    questions: [],
  });

  assert.equal(result.items[0].date, undefined);
  assert.equal(result.items[0].start, undefined);
  assert.equal(result.items[0].end, undefined);
  assert.equal(result.items[0].deadline, undefined);
  assert.deepEqual(result.items[0].recurrence, { type: "none" });
});

test("模型使用白名单，演示模式强制低成本模型", () => {
  assert.equal(selectModel("deepseek-reasoner", false), "deepseek-reasoner");
  assert.equal(selectModel("unknown-model", false), "deepseek-chat");
  assert.equal(selectModel("deepseek-reasoner", true), "deepseek-chat");
});
