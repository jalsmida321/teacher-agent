/**
 * 成果导出 —— 把生成结果（Markdown）导出为教师常用格式。
 *
 * 支持：Word(.docx) / Excel(.xlsx) / PDF / Markdown(.md)
 * - Word：教师最常用（教案、评语、反思、总结）
 * - Excel：表格类成果（成绩分析、名单）
 * - PDF：打印/上交
 * - Markdown：原始格式（可继续编辑）
 */
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } from "docx";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { FONTS_DIR } from "./paths";

/** 找可用的中文字体（ttf/otf，pdfkit 不支持 ttc）：项目内置 → 系统常见路径 */
function findChineseFont(): string | null {
  const candidates = [
    join(FONTS_DIR, "kaiti.ttf"), // 项目内置楷体（随仓库部署）
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc", // Linux Noto（ttc 可能不支持，仅兜底）
    "C:/Windows/Fonts/STKAITI.TTF", // 楷体
    "C:/Windows/Fonts/simhei.ttf", // 黑体
    "C:/Windows/Fonts/msyh.ttc", // 微软雅黑（ttc，可能不支持）
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

export type ExportFormat = "docx" | "xlsx" | "pdf" | "md";

/** 简单 Markdown → docx 段落（支持 # 标题、- 列表、表格、普通文本） */
function markdownToDocx(md: string): Array<Paragraph | Table> {
  const blocks: Array<Paragraph | Table> = [];
  const lines = md.split("\n");
  let tableBuffer: string[][] | null = null;

  const flushTable = () => {
    if (tableBuffer && tableBuffer.length > 0) {
      const rows = tableBuffer.map(
        (row) =>
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  width: { size: Math.floor(100 / row.length), type: WidthType.PERCENTAGE },
                  children: [new Paragraph({ children: [new TextRun({ text: cell.trim(), size: 20 })] })],
                }),
            ),
          }),
      );
      blocks.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
    }
    tableBuffer = null;
  };

  for (const line of lines) {
    // 表格：| a | b |
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const cells = line
        .trim()
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
      // 跳过分隔行 | --- | --- |
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (!tableBuffer) tableBuffer = [];
      tableBuffer.push(cells);
      continue;
    }
    flushTable();

    const trimmed = line.trim();
    if (!trimmed) continue;

    // 标题
    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = Math.min(heading[1].length, 4);
      const headingStyles = [
        { level: HeadingLevel.HEADING_1, size: 32 },
        { level: HeadingLevel.HEADING_2, size: 28 },
        { level: HeadingLevel.HEADING_3, size: 26 },
        { level: HeadingLevel.HEADING_4, size: 24 },
      ];
      const style = headingStyles[level - 1];
      blocks.push(
        new Paragraph({
          heading: style.level,
          children: [new TextRun({ text: heading[2].replace(/\*\*/g, ""), size: style.size, bold: true })],
          spacing: { before: 240, after: 120 },
        }),
      );
      continue;
    }

    // 列表
    const listItem = /^[-*]\s+(.*)$/.exec(trimmed);
    if (listItem) {
      blocks.push(
        new Paragraph({
          children: [new TextRun({ text: `• ${listItem[1].replace(/\*\*/g, "")}`, size: 22 })],
          indent: { left: 360 },
          spacing: { after: 60 },
        }),
      );
      continue;
    }

    // 加粗行（如 **标题：**内容）
    const bold = /^\*\*(.+?)\*\*\s*(.*)$/.exec(trimmed);
    if (bold) {
      blocks.push(
        new Paragraph({
          children: [new TextRun({ text: bold[1], bold: true, size: 22 }), ...(bold[2] ? [new TextRun({ text: " " + bold[2], size: 22 })] : [])],
          spacing: { after: 80 },
        }),
      );
      continue;
    }

    // 普通段落
    blocks.push(
      new Paragraph({
        children: [new TextRun({ text: trimmed.replace(/\*\*/g, ""), size: 22 })],
        spacing: { after: 80 },
      }),
    );
  }
  flushTable();
  return blocks;
}

/** 导出 Word(.docx)：返回 Buffer */
export async function exportDocx(md: string, title: string): Promise<Buffer> {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Microsoft YaHei", size: 22 },
        },
      },
    },
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun({ text: title, bold: true, size: 36 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
          }),
          ...markdownToDocx(md),
        ],
      },
    ],
  });
  return await Packer.toBuffer(doc);
}

/** 导出 Excel(.xlsx)：把 Markdown 表格/列表转成工作簿；无表格时把全文放第一列 */
export function exportXlsx(md: string, title: string): Buffer {
  const workbook = XLSX.utils.book_new();

  // 提取 Markdown 表格
  const tables: string[][][] = [];
  const lines = md.split("\n");
  let current: string[][] | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (!current) current = [];
      current.push(cells);
    } else {
      if (current) { tables.push(current); current = null; }
    }
  }
  if (current) tables.push(current);

  if (tables.length > 0) {
    tables.forEach((table, index) => {
      const sheetName = (index === 0 ? "结果" : `结果${index + 1}`).slice(0, 31);
      const ws = XLSX.utils.aoa_to_sheet(table);
      XLSX.utils.book_append_sheet(workbook, ws, sheetName);
    });
  } else {
    // 无表格 → 全文放一列
    const rows = md.split("\n").map((line) => [line.replace(/\*\*/g, "")]);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, ws, title.slice(0, 31) || "结果");
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

/** 导出 PDF：文本流式渲染（支持中文，微软雅黑） */
export async function exportPdf(md: string, title: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fontPath = findChineseFont();
    if (fontPath) {
      try {
        doc.font(fontPath);
      } catch {
        doc.font("Helvetica"); // 字体加载失败则降级（中文会乱码，但能出 PDF）
      }
    } else {
      doc.font("Helvetica");
    }

    // 标题
    doc.fontSize(18).text(title, { align: "center" });
    doc.moveDown();

    // 正文（简单渲染：标题/列表/段落）
    doc.fontSize(11);
    const lines = md.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
      if (heading) {
        const sizes: Record<number, number> = { 1: 15, 2: 13, 3: 12 };
        doc.moveDown(0.4).fontSize(sizes[heading[1].length] ?? 12).text(heading[2].replace(/\*\*/g, ""), { bold: true });
        doc.fontSize(11);
        continue;
      }
      const listItem = /^[-*]\s+(.*)$/.exec(trimmed);
      if (listItem) {
        doc.text(`• ${listItem[1].replace(/\*\*/g, "")}`, { indent: 20 });
        continue;
      }
      if (trimmed.startsWith("|")) continue; // 表格简化跳过（PDF 表格较复杂，保留文本行）
      doc.text(trimmed.replace(/\*\*/g, ""), { lineGap: 3 });
    }
    doc.end();
  });
}

/** 统一导出入口：返回 { buffer, mime, ext } */
export async function exportResult(
  md: string,
  title: string,
  format: ExportFormat,
): Promise<{ buffer: Buffer; mime: string; ext: string }> {
  switch (format) {
    case "docx":
      return { buffer: await exportDocx(md, title), mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" };
    case "xlsx":
      return { buffer: exportXlsx(md, title), mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" };
    case "pdf":
      return { buffer: await exportPdf(md, title), mime: "application/pdf", ext: "pdf" };
    case "md":
    default:
      return { buffer: Buffer.from(md, "utf-8"), mime: "text/markdown;charset=utf-8", ext: "md" };
  }
}
