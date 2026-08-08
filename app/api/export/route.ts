/**
 * 成果导出端点：把生成结果导出为 Word / Excel / PDF / Markdown。
 *
 * GET /api/export?format=docx&title=...&content=<urlencoded markdown>
 * 返回：文件下载
 */
import { exportResult, type ExportFormat } from "@/lib/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "md") as ExportFormat;
  const title = url.searchParams.get("title") ?? "师座生成结果";
  const content = url.searchParams.get("content") ?? "";

  if (!content.trim()) {
    return Response.json({ error: "没有可导出的内容" }, { status: 400 });
  }
  if (!["docx", "xlsx", "pdf", "md"].includes(format)) {
    return Response.json({ error: "不支持的格式" }, { status: 400 });
  }

  try {
    const { buffer, mime, ext } = await exportResult(content, title, format);
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle)}.${ext}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
