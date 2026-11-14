import { AiError, bodyFromRequest, parseSchedule } from "../../server/ai.mjs";
import {
  releaseRequestKey,
  resolveRequestKey,
} from "../../server/demo.mjs";

export const config = {
  maxDuration: 60,
};

function applyHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
}

export default async function handler(req, res) {
  applyHeaders(res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "只支持 POST 请求。" });
  }

  let access = null;
  try {
    const payload = bodyFromRequest(req.body);
    // 先做不花钱的校验，避免空输入也扣掉演示额度。
    const text = String(payload?.text ?? "").trim();
    if (!text) throw new AiError(400, "请先输入一段计划。");
    if (text.length > 4000) {
      throw new AiError(400, "输入太长了，请控制在 4000 字以内。");
    }

    access = resolveRequestKey(req);
    const result = await parseSchedule(payload, access.key, {
      isDemo: access.isDemo,
    });
    if (access.isDemo) {
      return res.status(200).json({
        ...result,
        demo: { remaining: access.remaining, limit: access.limit },
      });
    }
    return res.status(200).json(result);
  } catch (error) {
    releaseRequestKey(access);
    if (error instanceof AiError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(502).json({ error: "解析失败，请稍后重试。" });
  }
}
