// 按天计数的内存限流器。
// 取舍：单机部署够用，重启后清零，多实例之间不共享。
// 对「给陌生人试用的 demo」来说，这个精度足够了；真要抗刷，应该换 Redis。

const buckets = new Map();
const MAX_BUCKETS = 5000;

function dayKey(now) {
  // 用 UTC 日期做窗口边界，避免服务器时区变化导致计数重置时机漂移。
  return now.toISOString().slice(0, 10);
}

/**
 * 消耗一次配额。
 * @param {string} id 限流维度，例如 IP
 * @param {number} limit 每天允许的次数
 * @param {Date} now 便于测试注入时间
 */
export function consumeQuota(id, limit, now = new Date()) {
  const day = dayKey(now);

  // 条目太多时顺手清理过期窗口，防止 Map 无限增长。
  if (buckets.size > MAX_BUCKETS) {
    for (const [key, entry] of buckets) {
      if (entry.day !== day) buckets.delete(key);
    }
  }

  const entry = buckets.get(id);
  if (!entry || entry.day !== day) {
    buckets.set(id, { day, count: 1 });
    return { allowed: true, remaining: Math.max(0, limit - 1), limit };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, limit };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, limit };
}

export function resetQuota() {
  buckets.clear();
}
