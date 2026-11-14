import { demoStatus } from "../server/demo.mjs";

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "只支持 GET 请求。" });
  }
  return res.status(200).json({
    ok: true,
    service: "dayflow",
    ...demoStatus(),
  });
}
