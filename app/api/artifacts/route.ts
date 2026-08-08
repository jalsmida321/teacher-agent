import { readdir, readFile, stat, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { ARTIFACTS_DIR } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 列出教师工作区成果目录里已保存的成果（教案/试卷/报告） */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name");
  const dir = ARTIFACTS_DIR;

  // GET /api/artifacts?name=xxx.md → 返回单个文件内容（预览用）
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

  // GET /api/artifacts → 列表
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

/** 删除一个成果文件（仅限成果目录内，路径安全） */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const name = url.searchParams.get("name");
    if (!name) return Response.json({ error: "缺少 name 参数" }, { status: 400 });
    const safe = basename(name);
    if (!safe.endsWith(".md")) return Response.json({ error: "只允许删除 .md 文件" }, { status: 400 });
    await unlink(join(ARTIFACTS_DIR, safe));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "删除失败" }, { status: 500 });
  }
}
