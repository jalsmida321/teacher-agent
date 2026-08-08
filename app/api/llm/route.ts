/**
 * 生产调用端点（pi SDK 驱动）：客户自带 Key + 思考 + 工具调用 + 附件解析。
 *
 * 两种请求方式：
 *
 * A. multipart/form-data（推荐，带文件上传）：
 *   scenario, message, apiKey, model?, thinkingLevel?,
 *   files: 多个文件（图片→视觉；docx/pdf/xlsx/txt→服务端解析成文本）
 *
 * B. application/json（纯文本/图片 dataURL）：
 *   { scenario, message, imageDataUrl?, apiKey, model?, thinkingLevel? }
 *
 * 流程：场景提示词 → pi AgentSession（动态注册中转站 provider + 客户 Key）
 *   → 思考 + 工具调用 → 流式输出 → usage 展示。
 *
 * SSE 事件流：status / meta / delta / thinking / tool / usage / done
 */
import { SCENARIOS, type ScenarioId } from "@/lib/scenarios";
import { RELAY_MODEL } from "@/lib/relay";
import { createPiSession, getSessionUsage, parseImageDataUrl, pipeSessionEvents } from "@/lib/relay-session";
import { isImageFile, parseUpload } from "@/lib/file-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
function event(type: string, data: Record<string, unknown> = {}) {
  return encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`);
}

type JsonBody = {
  scenario?: ScenarioId;
  message?: string;
  imageDataUrl?: string;
  apiKey?: string;
  model?: string;
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high";
  customPrompt?: string;
};

/** 从 formData 或 json 解析请求参数 */
async function parseRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return {
      scenario: (form.get("scenario") as ScenarioId | null) ?? undefined,
      message: (form.get("message") as string | null) ?? "",
      apiKey: (form.get("apiKey") as string | null) ?? "",
      model: (form.get("model") as string | null) ?? undefined,
      thinkingLevel: (form.get("thinkingLevel") as RequestBody["thinkingLevel"]) ?? undefined,
      customPrompt: (form.get("customPrompt") as string | null) ?? undefined,
      files: form.getAll("files") as File[],
    };
  }

  const body = (await request.json()) as JsonBody;
  return {
    scenario: body.scenario,
    message: body.message ?? "",
    apiKey: body.apiKey ?? "",
    model: body.model,
    thinkingLevel: body.thinkingLevel,
    customPrompt: body.customPrompt,
    imageDataUrl: body.imageDataUrl,
    files: [] as File[],
  };
}

type RequestBody = {
  scenario?: ScenarioId;
  message?: string;
  imageDataUrl?: string;
  apiKey?: string;
  model?: string;
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high";
  files?: File[];
  customPrompt?: string;
};

export async function POST(request: Request) {
  let parsed: Awaited<ReturnType<typeof parseRequest>>;
  try {
    parsed = await parseRequest(request);
  } catch {
    return Response.json({ error: "请求内容无效" }, { status: 400 });
  }

  const scenario = parsed.scenario;
  const message = parsed.message?.trim();
  const apiKey = parsed.apiKey?.trim();
  const files = parsed.files ?? [];
  const customPrompt = parsed.customPrompt?.trim();

  // 自定义任务：直接用用户提示词；否则必须是内置场景
  if (!customPrompt && (!scenario || !SCENARIOS[scenario])) {
    return Response.json({ error: "scenario 必填：essay/comment/exam/reflection/parent/analysis（或提供 customPrompt）" }, { status: 400 });
  }
  if (!message) {
    return Response.json({ error: "message 必填" }, { status: 400 });
  }
  if (!apiKey) {
    return Response.json({ error: "请先填入你的 API Key" }, { status: 400 });
  }

  // 系统提示词：自定义任务优先，否则用内置场景
  const systemPrompt = customPrompt || (scenario ? SCENARIOS[scenario].systemPrompt : "");
  const model = parsed.model?.trim() || RELAY_MODEL;
  const thinkingLevel = parsed.thinkingLevel ?? "medium";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let handle: Awaited<ReturnType<typeof createPiSession>> | undefined;
      try {
        controller.enqueue(event("status", { label: `正在准备${files.length > 0 ? ` ${files.length} 个附件` : ""}…` }));

        // 解析附件：图片→视觉，办公文件→文本
        const images: Array<{ type: "image"; data: string; mimeType: string }> = [];
        const textParts: string[] = [];
        const unsupported: string[] = [];

        for (const file of files) {
          const buffer = Buffer.from(await file.arrayBuffer());
          if (isImageFile(file.name)) {
            const parsedFile = await parseUpload(buffer, file.name);
            if (parsedFile.kind === "image") {
              const m = /^data:([^;]+);base64,(.+)$/.exec(parsedFile.data);
              if (m) images.push({ type: "image", mimeType: m[1], data: m[2] });
            }
          } else {
            const parsedFile = await parseUpload(buffer, file.name);
            if (parsedFile.kind === "text") {
              textParts.push(`【附件：${parsedFile.name}】\n${parsedFile.text}`);
            } else {
              unsupported.push(file.name);
            }
          }
        }

        if (unsupported.length > 0) {
          controller.enqueue(event("error", {
            message: `暂不支持的文件：${unsupported.join("、")}。支持：图片 / Word(.docx) / PDF / Excel(.xlsx) / 文本`,
          }));
          controller.close();
          return;
        }

        // 组装最终 message：用户输入 + 附件文本
        let fullMessage = message;
        if (textParts.length > 0) {
          fullMessage = `${message}\n\n以下是附件内容：\n\n${textParts.join("\n\n")}`;
        }

        handle = await createPiSession({
          apiKey,
          model,
          systemPrompt,
          images: images.length > 0 ? images : undefined,
          thinkingLevel,
        });

        controller.enqueue(event("meta", { model, thinkingLevel, attachments: files.length }));

        pipeSessionEvents(handle.session, {
          onText: (text) => controller.enqueue(event("delta", { text })),
          onTool: (toolName) => controller.enqueue(event("tool", { name: toolName })),
          onThinking: (delta) => controller.enqueue(event("thinking", { delta })),
        });

        await handle.session.prompt(fullMessage, { images: images.length > 0 ? images : undefined });

        // 取最终 usage（pi 内部统计）
        const usage = getSessionUsage(handle.session);
        controller.enqueue(event("usage", {
          promptTokens: usage?.promptTokens ?? 0,
          completionTokens: usage?.completionTokens ?? 0,
          totalTokens: usage?.totalTokens ?? 0,
        }));

        controller.enqueue(event("done"));
        controller.close();
      } catch (error) {
        controller.enqueue(event("error", {
          message: error instanceof Error ? error.message : String(error),
        }));
        controller.close();
      } finally {
        handle?.dispose();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
