/**
 * 客户 Key 拉取中转站可用模型列表。
 *
 * 安全说明：用 **POST + body**（不用 GET query）——避免 API Key 出现在
 * Nginx/Cloudflare 等访问日志中。
 *
 * POST /api/models  body: { "apiKey": "sk-xxx" }
 * 响应: { "models": [...], "default": "..." }
 */
import { RELAY_MODEL, listModels } from "@/lib/relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { apiKey?: string };
  try {
    body = (await request.json()) as { apiKey?: string };
  } catch {
    return Response.json({ error: "请求内容不是有效 JSON" }, { status: 400 });
  }

  const apiKey = body.apiKey?.trim();
  if (!apiKey) {
    return Response.json({ error: "缺少 apiKey" }, { status: 400 });
  }

  try {
    const models = await listModels({ apiKey, signal: request.signal });
    const fallback = models.includes(RELAY_MODEL) ? RELAY_MODEL : (models[0] ?? RELAY_MODEL);
    return Response.json({ models, default: fallback });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 502 });
  }
}
