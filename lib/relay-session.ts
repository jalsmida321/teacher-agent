/**
 * pi SDK 会话封装 —— 生产通道（客户自带 Key）。
 *
 * 架构升级（2026-08-08）：
 * - 生产通道从「直连中转站」改为「pi SDK 驱动」，支持思考 + 工具调用
 * - 每个请求：动态注册中转站为 pi provider（带客户 Key）→ 创建 AgentSession
 *   → 注入场景提示词 + 自定义工具 → 流式输出 + 思考 + 工具调用
 * - usage 从 session 最后一条消息取（pi 内部统计，实测可用）
 *
 * 安全边界：不暴露 bash / 文件写工具，只开放白名单自定义工具。
 */
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";
import { RELAY_BASE } from "./relay";
import { curriculumLookupTool, createSaveArtifactTool, teacherToolNames } from "./teacher-tools";
import { APP_ROOT } from "./paths";
import { keyToUserId } from "./auth";

export type PiSessionOptions = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  /** 图片输入（pi ImageContent 格式），用于作文拍照批改 */
  images?: Array<{ type: "image"; data: string; mimeType: string }>;
  /** 思考级别（默认 medium） */
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high";
};

export type PiSessionHandle = {
  session: AgentSession;
  modelRuntime: ModelRuntime;
  dispose: () => void;
};

/** 拉取客户 Key 的可用模型列表（带缓存，60s） */
let modelsCache: { key: string; models: string[]; at: number } | undefined;
export async function fetchRelayModels(apiKey: string): Promise<string[]> {
  if (modelsCache && modelsCache.key === apiKey && Date.now() - modelsCache.at < 60_000) {
    return modelsCache.models;
  }
  const response = await fetch(`${RELAY_BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`AI 服务连接失败（${response.status}），请稍后重试`);
  }
  const json = (await response.json()) as { data?: Array<{ id?: string }> };
  const models = (json.data ?? []).map((m) => m.id ?? "").filter(Boolean);
  modelsCache = { key: apiKey, models, at: Date.now() };
  return models;
}

/**
 * 创建 pi AgentSession（生产通道核心）。
 * 每个请求独立创建：客户 Key、模型、工具都是该请求私有的，互不污染。
 */
export async function createPiSession(opts: PiSessionOptions): Promise<PiSessionHandle> {
  const { apiKey, model, systemPrompt, images, thinkingLevel = "medium" } = opts;

  const modelRuntime = await ModelRuntime.create();

  // 动态注册中转站为 pi provider（带客户 Key + 模型列表）
  let modelIds: string[];
  try {
    modelIds = await fetchRelayModels(apiKey);
  } catch {
    modelIds = [model]; // 拉取失败则只用客户选的模型
  }
  if (!modelIds.includes(model)) modelIds = [model, ...modelIds];

  modelRuntime.registerProvider("relay", {
    name: "AI 服务",
    baseUrl: RELAY_BASE,
    apiKey,
    api: "openai-completions",
    models: modelIds.map((id) => ({
      id,
      name: id,
      reasoning: true,
      input: ["text", "image"],
      // cost 必须提供（pi 计算 cost 时访问 model.cost.tiers）
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 16384,
    })),
  });
  // 等待异步 refresh 落地（registerProvider 内部 refresh 是 fire-and-forget）
  await new Promise((resolve) => setTimeout(resolve, 300));

  const resolvedModel = modelRuntime.getModel("relay", model);
  if (!resolvedModel) {
    throw new Error(`模型 ${model} 不可用，请重新选择`);
  }

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: true },
    retry: { enabled: true, maxRetries: 1 },
  });
  const loader = new DefaultResourceLoader({
    cwd: APP_ROOT,
    agentDir: join(homedir(), ".pi", "agent"),
    settingsManager,
    systemPromptOverride: () => systemPrompt,
  });
  await loader.reload();

  // 按用户隔离：save_artifact 写入 ARTIFACTS_DIR/<keyhash>/（客户 key 哈希，不落盘原文）
  const userId = keyToUserId(apiKey);
  const userTools = [curriculumLookupTool, createSaveArtifactTool(userId)];

  const { session } = await createAgentSession({
    modelRuntime,
    model: resolvedModel,
    thinkingLevel,
    resourceLoader: loader,
    settingsManager,
    sessionManager: SessionManager.inMemory(APP_ROOT),
    // 安全边界：只开放自定义教师工具，不暴露 bash/读写文件
    tools: teacherToolNames,
    customTools: userTools,
  });

  return {
    session,
    modelRuntime,
    dispose: () => {
      session.dispose();
    },
  };
}

/** 从 session 状态取最终 usage（生产计费展示用） */
export function getSessionUsage(session: AgentSession): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} | null {
  const messages = session.agent.state.messages;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    // 只有 assistant 消息带 usage（类型守卫）
    if (message && message.role === "assistant" && message.usage && message.usage.totalTokens > 0) {
      const usage = message.usage;
      return {
        promptTokens: usage.input + usage.cacheRead + usage.cacheWrite,
        completionTokens: usage.output,
        totalTokens: usage.totalTokens,
      };
    }
  }
  return null;
}

/** 解析 data URL（data:image/jpeg;base64,xxx）为 pi 图片输入格式 */
export function parseImageDataUrl(dataUrl: string): { type: "image"; data: string; mimeType: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("图片格式无效（需 data:image/...;base64,...）");
  return { type: "image", mimeType: match[1], data: match[2] };
}

/** 订阅事件 → SSE 转发（思考/文本/工具状态） */
export function pipeSessionEvents(
  session: AgentSession,
  handlers: {
    onText: (text: string) => void;
    onTool: (toolName: string) => void;
    onThinking?: (delta: string) => void;
  },
): void {
  session.subscribe((event: AgentSessionEvent) => {
    if (event.type === "message_update") {
      if (event.assistantMessageEvent.type === "text_delta") {
        handlers.onText(event.assistantMessageEvent.delta);
      } else if (event.assistantMessageEvent.type === "thinking_delta" && handlers.onThinking) {
        handlers.onThinking(event.assistantMessageEvent.delta);
      }
    }
    if (event.type === "tool_execution_start") {
      handlers.onTool(event.toolName);
    }
  });
}
