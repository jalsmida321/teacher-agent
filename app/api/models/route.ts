/**
 * 客户 Key 拉取中转站可用模型列表。
 *
 * GET /api/models?apiKey=sk-xxx
 * 响应: { "models": ["gpt-5.5", "gpt-5.6", ...], "default": "gpt-5.5" }
 */
import { RELAY_MODEL, listModels } from "@/lib/relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const apiKey = url.searchParams.get("apiKey")?.trim();

  if (!apiKey) {
    return Response.json({ error: "缺少 apiKey 参数" }, { status: 400 });
  }

  try {
    const models = await listModels({ apiKey, signal: request.signal });
    // 默认模型优先取 RELAY_MODEL；不在列表里则取第一个
    const fallback = models.includes(RELAY_MODEL) ? RELAY_MODEL : (models[0] ?? RELAY_MODEL);
    return Response.json({ models, default: fallback });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 502 });
  }
}
