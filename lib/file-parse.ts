/**
 * 附件解析 —— 把教师上传的文件转成可喂给模型的内容。
 *
 * 支持：
 * - 图片（jpg/png/...）→ 原样返回 base64，走视觉多模态
 * - .docx → mammoth 转纯文本（Word 最常用）
 * - .pdf → pdf-parse 提取文本（文本型 PDF；扫描件需 OCR，暂不支持）
 * - .xlsx/.xls → xlsx 读取所有工作表，转成"表格文本"
 * - .txt/.md/.csv/.tsv/.json → 直接文本
 *
 * 返回：{ kind: "image"|"text", name, data?, text? }
 */
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";

export type ParsedAttachment =
  | { kind: "image"; name: string; data: string } // base64 data URL
  | { kind: "text"; name: string; text: string }
  | { kind: "unsupported"; name: string };

const IMAGE_TYPES = /\.(jpe?g|png|gif|webp|bmp|heic)$/i;
const TEXT_TYPES = /\.(txt|md|csv|tsv|json)$/i;

export function isImageFile(name: string): boolean {
  return IMAGE_TYPES.test(name);
}
export function isTextFile(name: string): boolean {
  return TEXT_TYPES.test(name);
}
export function isOfficeFile(name: string): boolean {
  return /\.(docx|pdf|xlsx|xls)$/i.test(name);
}

/**
 * 解析上传文件（Buffer）为可喂给模型的内容。
 * @param file 原始文件 Buffer
 * @param name 文件名（含扩展名，用于判断类型）
 */
export async function parseUpload(file: Buffer, name: string): Promise<ParsedAttachment> {
  const lower = name.toLowerCase();

  // 图片 → base64 data URL（视觉）
  if (IMAGE_TYPES.test(lower)) {
    const mime = mimeFromName(lower);
    return {
      kind: "image",
      name,
      data: `data:${mime};base64,${file.toString("base64")}`,
    };
  }

  // .docx → 文本
  if (lower.endsWith(".docx")) {
    try {
      const result = await mammoth.extractRawText({ buffer: file });
      const text = result.value.trim();
      return {
        kind: "text",
        name,
        text: text || "（Word 文档为空或无法提取文本）",
      };
    } catch (error) {
      return {
        kind: "text",
        name,
        text: `（Word 解析失败：${error instanceof Error ? error.message : "未知错误"}）`,
      };
    }
  }

  // .pdf → 文本
  if (lower.endsWith(".pdf")) {
    try {
      const parser = new PDFParse({ data: file });
      try {
        const result = await parser.getText();
        const text = (result?.text ?? "").trim();
        return {
          kind: "text",
          name,
          text: text || "（PDF 未提取到文本，可能是扫描件，暂不支持 OCR）",
        };
      } finally {
        await parser.destroy().catch(() => {});
      }
    } catch (error) {
      return {
        kind: "text",
        name,
        text: `（PDF 解析失败：${error instanceof Error ? error.message : "未知错误"}）`,
      };
    }
  }

  // .xlsx/.xls → 表格文本（每个工作表：表名 + 行列文本）
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    try {
      const workbook = XLSX.read(file, { type: "buffer" });
      const parts: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        parts.push(`【工作表：${sheetName}】\n${csv}`);
      }
      const text = parts.join("\n\n").trim();
      return {
        kind: "text",
        name,
        text: text || "（Excel 为空）",
      };
    } catch (error) {
      return {
        kind: "text",
        name,
        text: `（Excel 解析失败：${error instanceof Error ? error.message : "未知错误"}）`,
      };
    }
  }

  // 其它（.doc 老格式、PPT 等）
  return { kind: "unsupported", name };
}

function mimeFromName(name: string): string {
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".bmp")) return "image/bmp";
  return "image/jpeg";
}
