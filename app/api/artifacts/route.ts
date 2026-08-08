import { readdir, readFile, stat, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { ARTIFACTS_DIR } from "@/lib/paths";
import { extractApiKey, keyToUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 用户成果目录：ARTIFACTS_DIR/<keyhash>/（key 哈希，不落盘原文） */
function userDir(apiKey: string): string {
  return join(ARTIFACTS_DIR, keyToUserId(apiKey));
}

/**
 * 成果列表 / 内容预览（按 key 哈希隔离 + 鉴权）。
 * GET /api/artifacts?name=xxx.md
 * Authorization: Bearer <apiKey>   （header，避免进访问日志）
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name");
  const apiKey = await extractApiKey(request);
  if (!apiKey) {
    return Response.json({ error: "缺少 apiKey（Authorization: Bearer）" }, { status: 401 });
  }
  const dir = userDir(apiKey);

  // 单个文件内容（预览用）
  if (name) {
    try {
      const safe = basename(name);
      if (!safe.endsWith(".md")) return Response.json({ error: "只支持 .md 文件预览" }, { status: 400 });
      const content = await readFile(join(dir, safe), "utf-8");
      return Response.json({ name: safe, content });
    } catch {
      return Response.json({ error: "文件不存在" }, { status: 404 });
    }
  }

  // 列表
  try {
    const entries = await readdir(dir);
    const files = await Promise.all(
      entries
        .filter((n) => n.endsWith(".md"))
        .sort()
        .reverse()
        .map(async (n) => {
          const info = await stat(join(dir, n));
          return { name: n, size: info.size, modified: info.mtime.toISOString() };
        }),
    );
    return Response.json({ files });
  } catch {
    return Response.json({ files: [] });
  }
}

/**
 * 删除成果（鉴权：需提供与创建者相同的 apiKey）。
 * DELETE /api/artifacts?name=xxx.md
 * Authorization: Bearer <apiKey>
 */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const name = url.searchParams.get("name");
    const apiKey = await extractApiKey(request);
    if (!name) return Response.json({ error: "缺少 name 参数" }, { status: 400 });
    if (!apiKey) return Response.json({ error: "缺少 apiKey" }, { status: 401 });
    const safe = basename(name);
    if (!safe.endsWith(".md")) return Response.json({ error: "只允许删除 .md 文件" }, { status: 400 });
    await unlink(join(userDir(apiKey), safe));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "删除失败" }, { status: 500 });
  }
}
