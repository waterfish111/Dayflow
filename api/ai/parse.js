import {
  AiError,
  bodyFromRequest,
  keyFromHeaders,
  parseSchedule,
} from "../../server/ai.mjs";

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "只支持 POST 请求。" });
  }

  try {
    const payload = bodyFromRequest(req.body);
    const key = keyFromHeaders(req.headers);
    const result = await parseSchedule(payload, key);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof AiError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(502).json({
      error: `解析失败：${String(error?.message || error).slice(0, 180)}`,
    });
  }
}
