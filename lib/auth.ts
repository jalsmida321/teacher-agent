/**
 * 用户身份 —— 以 API Key 哈希作为用户标识（无登录系统的轻量隔离）。
 *
 * 设计：
 * - 客户端每次请求带 apiKey（multipart 的 form 字段或 JSON body）
 * - 服务端对 key 做 SHA-256 哈希 → 作为用户目录名 / 鉴权凭据
 * - **不落盘 key 原文**，只存哈希；日志中也不会出现 key
 *
 * 隔离效果：
 * - 成果目录 = ARTIFACTS_DIR/<keyhash>/，用户之间互不可见
 * - 读取/删除需匹配 keyhash，否则 403
 */

import { createHash } from "node:crypto";

/** 由 API Key 派生用户目录名（SHA-256 前 16 位） */
export function keyToUserId(apiKey: string): string {
  return createHash("sha256").update(apiKey.trim()).digest("hex").slice(0, 16);
}

/** 请求中提取 apiKey：优先 Authorization: Bearer，其次 body（JSON/multipart） */
export async function extractApiKey(request: Request): Promise<string> {
  // 优先 header（GET 用 header 传 key，避免进 URL/日志）
  const auth = request.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return ((form.get("apiKey") as string | null) ?? "").trim();
  }
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as { apiKey?: string };
    return (body.apiKey ?? "").trim();
  }
  return "";
}
