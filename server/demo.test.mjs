import assert from "node:assert/strict";
import test from "node:test";
import { AiError } from "./ai.mjs";
import {
  releaseQuota,
  reserveQuota,
  resetQuota,
  quotaDay,
} from "./ratelimit.mjs";
import {
  releaseRequestKey,
  resolveRequestKey,
} from "./demo.mjs";

test("额度按上海自然日切换", () => {
  assert.equal(
    quotaDay(new Date("2026-11-13T15:59:00Z"), "Asia/Shanghai"),
    "2026-11-13",
  );
  assert.equal(
    quotaDay(new Date("2026-11-13T16:01:00Z"), "Asia/Shanghai"),
    "2026-11-14",
  );
});

test("预留的额度可以回滚", () => {
  resetQuota();
  const now = new Date("2026-11-14T04:00:00Z");
  assert.equal(reserveQuota("test-ip", 1, now).allowed, true);
  assert.equal(reserveQuota("test-ip", 1, now).allowed, false);
  releaseQuota("test-ip", now);
  assert.equal(reserveQuota("test-ip", 1, now).allowed, true);
});

test("演示 Key 失败时可通过 releaseRequestKey 恢复额度", () => {
  resetQuota();
  const req = {
    headers: {},
    ip: "203.0.113.8",
    socket: { remoteAddress: "203.0.113.8" },
  };
  const env = {
    DEMO_KEY: "sk-test",
    DEMO_DAILY_LIMIT: "1",
    DEMO_GLOBAL_LIMIT: "2",
    DEMO_TIME_ZONE: "Asia/Shanghai",
  };

  const access = resolveRequestKey(req, env);
  assert.equal(access.isDemo, true);
  assert.equal(access.limit, 1);
  assert.throws(
    () => resolveRequestKey(req, env),
    (error) => error instanceof AiError && error.status === 429,
  );

  releaseRequestKey(access);
  assert.doesNotThrow(() => resolveRequestKey(req, env));
});
