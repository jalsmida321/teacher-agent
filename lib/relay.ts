/**
 * 中转站直连客户端 —— 客户自带 key 的调用通道。
 *
 * 商业模式（无自建支付）：
 * - 客户在 api.sublyx.org 注册、充值、创建自己的 API key（中转站 token）
 * - 客户把 key 填入本应用 → 应用透传给中转站调用 → 余额/扣费全在中转站
 * - 本应用不做任何支付、余额、扣费，只做「壳 + 教师场景」并展示 token 用量
 *
 * 中转站地址（端口）内置：https://api.sublyx.org/v1
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const RELAY_BASE = process.env.RELAY_BASE ?? "https://api.sublyx.org/v1";
export const RELAY_MODEL = process.env.RELAY_MODEL ?? "gpt-5.5";

export type RelayContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } } // data:image/jpeg;base64,...
    >;

export type RelayMessage = {
  role: "system" | "user" | "assistant";
  content: RelayContent;
};

export type RelayUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

/** 解析 key：优先用客户传入的，回退到环境变量 / 本地 models.json（开发调试用） */
export async function resolveApiKey(apiKey?: string): Promise<string> {
  if (apiKey && apiKey.trim()) return apiKey.trim();
  if (process.env.SUBLYX_API_KEY) return process.env.SUBLYX_API_KEY;
  try {
    const raw = await readFile(join(homedir(), ".pi", "agent", "models.json"), "utf-8");
    const conf = JSON.parse(raw) as { providers?: Record<string, { apiKey?: string }> };
    const key = conf.providers?.["new-provider"]?.apiKey;
    if (typeof key === "string" && key.startsWith("sk-")) return key;
  } catch {
    // 忽略
  }
  return "";
}

export type RelayStreamEvent =
  | { type: "delta"; text: string }
  | { type: "usage"; usage: RelayUsage }
  | { type: "error"; message: string };

/**
 * 拉取客户 Key 在中转站可用的模型列表（透传 /v1/models）。
 * 实测：带 Key 调用返回 10 个可用模型。
 */
export async function listModels(opts: { apiKey?: string; signal?: AbortSignal } = {}): Promise<string[]> {
  const key = await resolveApiKey(opts.apiKey);
  if (!key) {
    throw new Error("请先填入你在 api.sublyx.org 创建的 API Key");
  }

  const response = await fetch(`${RELAY_BASE}/models`, {
    headers: {
      Authorization: `Bearer ${key}`,
    },
    signal: opts.signal,
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`AI 服务返回错误（${response.status}），请稍后重试`);
  }

  const json = (await response.json()) as {
    data?: Array<{ id?: string }>;
  };
  return (json.data ?? []).map((model) => model.id ?? "").filter(Boolean);
}

/**
 * 非流式调用：一次返回完整内容 + 准确的 usage（中转站计费依据，仅展示用）。
 * 实测流式（尤其带图片时）偶发丢失 usage；非流式必定返回。
 */
export async function chatCompletion(
  messages: RelayMessage[],
  opts: { model?: string; apiKey?: string; signal?: AbortSignal } = {},
): Promise<{ content: string; usage: RelayUsage }> {
  const key = await resolveApiKey(opts.apiKey);
  if (!key) {
    throw new Error("请先在右上角填入你在 api.sublyx.org 创建的 API Key（或设置 SUBLYX_API_KEY 环境变量）");
  }

  const response = await fetch(`${RELAY_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: opts.model ?? RELAY_MODEL,
      messages,
      stream: false,
    }),
    signal: opts.signal,
  });

  if (!response.ok) {
    await response.body?.cancel();
    // 上游 502/503 通常是该模型暂不可用，给出可读提示
    if (response.status >= 500) {
      throw new Error(`模型 ${opts.model ?? RELAY_MODEL} 上游暂时不可用（HTTP ${response.status}），请换一个模型试试`);
    }
    throw new Error(`AI 服务返回错误（${response.status}），请稍后重试`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const usage = {
    prompt_tokens: json.usage?.prompt_tokens ?? 0,
    completion_tokens: json.usage?.completion_tokens ?? 0,
    total_tokens: json.usage?.total_tokens ?? 0,
  };
  return { content: json.choices?.[0]?.message?.content ?? "", usage };
}

/**
 * 流式调用（可选）：逐字返回 delta。
 * 注意：流式可能不返回 usage；要展示准确用量请用 chatCompletion()。
 */
export async function* streamChat(
  messages: RelayMessage[],
  opts: { model?: string; apiKey?: string; signal?: AbortSignal } = {},
): AsyncGenerator<RelayStreamEvent> {
  const key = await resolveApiKey(opts.apiKey);
  if (!key) {
    throw new Error("请先在右上角填入你在 api.sublyx.org 创建的 API Key（或设置 SUBLYX_API_KEY 环境变量）");
  }

  const response = await fetch(`${RELAY_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: opts.model ?? RELAY_MODEL,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal: opts.signal,
  });

  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`AI 服务返回错误（${response.status}），请稍后重试`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let usage: RelayUsage | undefined;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as {
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          choices?: Array<{ delta?: { content?: string } }>;
        };
        if (json.usage) {
          usage = {
            prompt_tokens: json.usage.prompt_tokens ?? 0,
            completion_tokens: json.usage.completion_tokens ?? 0,
            total_tokens: json.usage.total_tokens ?? 0,
          };
        }
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          yield { type: "delta", text: delta };
        }
      } catch {
        // 忽略个别畸形数据块
      }
    }
  }

  if (usage) {
    yield { type: "usage", usage };
  } else {
    yield {
      type: "error",
      message: "本次用量暂时无法统计。",
    };
  }
}
