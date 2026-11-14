// 按自然日计数的内存限流器。
// 取舍：单机部署够用，重启后清零，多实例之间不共享。
// 对「给陌生人试用的 demo」来说，这个精度足够了；真要抗刷，应该换 Redis。

const buckets = new Map();
const MAX_BUCKETS = 5000;
const DEFAULT_TIME_ZONE = "Asia/Shanghai";

export function quotaDay(now = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function cleanup(day) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, entry] of buckets) {
    if (entry.day !== day) buckets.delete(key);
  }
}

/**
 * 预留一次配额。路由成功后保留，失败时调用 releaseQuota 回滚。
 * @param {string} id 限流维度，例如 IP
 * @param {number} limit 每天允许的次数
 * @param {Date} now 便于测试注入时间
 * @param {string} timeZone 自然日所在时区
 */
export function reserveQuota(
  id,
  limit,
  now = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
) {
  const normalizedLimit = Math.max(1, Math.floor(Number(limit) || 1));
  const day = quotaDay(now, timeZone);

  cleanup(day);
  if (buckets.size >= MAX_BUCKETS && !buckets.has(id)) {
    return {
      allowed: false,
      reason: "capacity",
      remaining: 0,
      limit: normalizedLimit,
      day,
    };
  }

  const entry = buckets.get(id);
  if (!entry || entry.day !== day) {
    buckets.set(id, { day, count: 1 });
    return {
      allowed: true,
      reason: null,
      remaining: Math.max(0, normalizedLimit - 1),
      limit: normalizedLimit,
      day,
    };
  }

  if (entry.count >= normalizedLimit) {
    return {
      allowed: false,
      reason: "limit",
      remaining: 0,
      limit: normalizedLimit,
      day,
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    reason: null,
    remaining: normalizedLimit - entry.count,
    limit: normalizedLimit,
    day,
  };
}

export function releaseQuota(
  id,
  now = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
  day = quotaDay(now, timeZone),
) {
  const entry = buckets.get(id);
  if (!entry || entry.day !== day || entry.count <= 0) return;
  entry.count -= 1;
  if (entry.count === 0) buckets.delete(id);
}

export function resetQuota() {
  buckets.clear();
}
