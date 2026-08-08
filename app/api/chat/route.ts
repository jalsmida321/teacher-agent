import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { lookupCurriculum, type TeacherContext } from "@/lib/teacher-data";
import { teacherTools, teacherToolNames } from "@/lib/teacher-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = { role: "user" | "assistant"; content: string };
type RequestBody = {
  message?: string;
  history?: ChatMessage[];
  context?: TeacherContext;
};

const encoder = new TextEncoder();
function event(type: string, data: Record<string, unknown> = {}) {
  return encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`);
}

/** 教师系统提示词：这是"专注教师 AI 场景"的核心定制点 */
function buildSystemPrompt(ctx: TeacherContext) {
  const curriculum = lookupCurriculum(ctx);
  return `你是一位专业的 AI 教师助手，服务覆盖幼教、小学、初中、高中、职业教育和大学各学段的老师。

当前教学上下文：
- 学段：${ctx.stage}
- 学科：${ctx.subject}
- 年级：${ctx.grade}
- 教材版本：${ctx.textbook || "未指定"}

课标参考：
${curriculum}

你的核心能力：
1. 教案生成：按课标要求输出完整教案（教学目标/重难点/教学准备/教学过程含时间分配/板书设计/分层作业设计）。
2. 试卷出题：按知识点与难度分布（基础:中等:提高 ≈ 6:3:1）出题，标注考查知识点与预估用时，附参考答案和评分标准。
3. 作业批改与讲评：分类呈现典型错误、归因分析、变式练习、补差建议。
4. 学情分析：从数据定位薄弱知识点，输出学生分层画像与分层教学建议。
5. 家校沟通：生成得体、有依据、语气真诚的沟通话术。
6. 课堂与活动设计：互动环节、小组合作、游戏化设计。

回答要求：
1. 使用简洁中文，面向一线教师，成果可直接使用；长成果用 Markdown 结构化输出（标题/表格/列表）。
2. 内容必须符合当前学段学生的认知水平，不超纲；拿不准的课标要求先调用 curriculum_lookup。
3. 不虚构政策、文件、数据、日期；信息不足时最多提出三个关键问题。
4. 生成教案、试卷等成品后，调用 save_artifact 保存到工作区 artifacts 目录，并告知文件名。
5. 不执行 shell、不访问外部系统；除 artifacts 目录外不写任何文件。`;
}

/** 无 Pi 模型凭据时的演示回复（保证界面可体验） */
function demoReply(message: string, ctx: TeacherContext) {
  return `当前没有可用的 Pi 模型凭据，已进入演示模式。\n\n针对「${message}」，作为 ${ctx.grade}${ctx.subject}（${ctx.textbook || "未指定教材"}）的教师助手，我可以帮你：\n\n1. 生成完整教案（目标/重难点/教学过程/板书/分层作业）\n2. 按 6:3:1 难度出一份单元测试卷，附答案与评分标准\n3. 设计作业讲评课与学情分析\n4. 写家校沟通话术\n\n配置 Pi 模型登录或 API Key 后，这里会返回真实 AI 生成内容。`;
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "请求内容不是有效 JSON" }, { status: 400 });
  }

  const message = body.message?.trim();
  const ctx = body.context;
  if (!message || !ctx?.stage || !ctx?.subject || !ctx?.grade) {
    return Response.json({ error: "message 和教学上下文（学段/学科/年级）为必填项" }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let dispose: (() => void) | undefined;
      try {
        controller.enqueue(event("status", { label: "正在连接 Pi" }));

        const modelRuntime = await ModelRuntime.create();
        const available = await modelRuntime.getAvailable();

        // 无模型凭据 → 演示模式
        if (available.length === 0) {
          controller.enqueue(event("meta", { mode: "demo" }));
          const reply = demoReply(message, ctx);
          for (const paragraph of reply.split("\n\n")) {
            controller.enqueue(event("delta", { text: `${paragraph}\n\n` }));
            await new Promise((resolve) => setTimeout(resolve, 90));
          }
          controller.enqueue(event("done"));
          controller.close();
          return;
        }

        const settingsManager = SettingsManager.inMemory({
          compaction: { enabled: true },
          retry: { enabled: true, maxRetries: 2 },
        });
        const loader = new DefaultResourceLoader({
          cwd: process.cwd(),
          agentDir: getAgentDir(),
          settingsManager,
          systemPromptOverride: () => buildSystemPrompt(ctx),
        });
        await loader.reload();

        const { session } = await createAgentSession({
          modelRuntime,
          model: available[0],
          resourceLoader: loader,
          settingsManager,
          sessionManager: SessionManager.inMemory(process.cwd()),
          // 安全边界：只开放两个自定义教师工具，不暴露 bash/读写文件
          tools: teacherToolNames,
          customTools: teacherTools,
          thinkingLevel: "medium",
        });
        dispose = () => session.dispose();

        const history = (body.history ?? []).slice(-8);
        const context = history.length
          ? `以下是最近对话，仅作为上下文：\n${history.map((item) => `${item.role === "user" ? "用户" : "助理"}：${item.content}`).join("\n")}\n\n用户的新请求：${message}`
          : message;

        session.subscribe((sessionEvent) => {
          if (
            sessionEvent.type === "message_update" &&
            sessionEvent.assistantMessageEvent.type === "text_delta"
          ) {
            controller.enqueue(event("delta", { text: sessionEvent.assistantMessageEvent.delta }));
          }
          if (sessionEvent.type === "tool_execution_start") {
            controller.enqueue(event("status", { label: `正在调用 ${sessionEvent.toolName}` }));
          }
        });

        controller.enqueue(event("meta", {
          mode: "pi",
          model: `${available[0].provider}/${available[0].id}`,
        }));

        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            session.prompt(context),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => {
                void session.abort();
                reject(new Error("模型在 90 秒内没有响应，请检查 Pi 模型配置或网络连接"));
              }, 90_000);
            }),
          ]);
        } finally {
          if (timeout) clearTimeout(timeout);
        }
        controller.enqueue(event("done"));
        controller.close();
      } catch (error) {
        controller.enqueue(event("error", {
          message: error instanceof Error ? error.message : String(error),
        }));
        controller.close();
      } finally {
        dispose?.();
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
