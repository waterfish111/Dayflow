// 演示额度的服务端策略：Key 从哪来、每天还能用几次。
// 规则很简单：
//   1. 请求头带了用户自己的 Key → 用用户的，不计入演示额度；
//   2. 否则用服务端配置的 DEMO_KEY（或旧的 DEEPSEEK_API_KEY），按 IP 每天限次；
//   3. 都没配 → 让用户去设置里填自己的 Key。
import { AiError, resolveKey } from "./ai.mjs";
import { consumeQuota } from "./ratelimit.mjs";

const DEFAULT_DAILY_LIMIT = 20;

export function demoDailyLimit(env = process.env) {
  const value = Number(env.DEMO_DAILY_LIMIT ?? DEFAULT_DAILY_LIMIT);
  return Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : DEFAULT_DAILY_LIMIT;
}

export function hasDemoKey(env = process.env) {
  return Boolean(
    String(env.DEMO_KEY ?? env.DEEPSEEK_API_KEY ?? "").trim(),
  );
}

export function demoStatus(env = process.env) {
  return { demo: hasDemoKey(env), demoLimit: demoDailyLimit(env) };
}

function clientIp(req, env) {
  // Vercel 会写 x-forwarded-for；直连部署时这个头可以被伪造，
  // 所以只有确认在平台上时才采用它。
  if (env.VERCEL) {
    const forwarded = req.headers?.["x-forwarded-for"];
    const first = Array.isArray(forwarded) ? forwarded[0] : String(forwarded ?? "");
    const ip = first.split(",")[0].trim();
    if (ip) return ip;
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/**
 * 解析本次请求该用哪个 Key，并在用演示 Key 时扣减额度。
 * 额度用完会抛 429。
 */
export function resolveRequestKey(req, env = process.env) {
  const { key, isDemo } = resolveKey(req.headers, env);

  if (!isDemo) {
    return { key, isDemo: false, remaining: null, limit: null };
  }

  const limit = demoDailyLimit(env);
  const quota = consumeQuota(clientIp(req, env), limit);
  if (!quota.allowed) {
    throw new AiError(
      429,
      `今天的演示额度用完了（每天 ${quota.limit} 次）。打开设置填入你自己的 DeepSeek Key，可以继续不限量使用。`,
    );
  }

  return { key, isDemo: true, remaining: quota.remaining, limit: quota.limit };
}
