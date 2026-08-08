/**
 * 教师 agent 的自定义 Pi 工具（defineTool）。
 * 这些工具会被注入 AgentSession，LLM 可以按需调用。
 *
 * 安全边界：
 * - 不暴露 bash / 文件系统写工具
 * - save_artifact 只写入当前用户的隔离目录（ARTIFACTS_DIR/<userId>/）
 * - 单文件大小上限（防滥用）
 */
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { mkdir, writeFile } from "node:fs/promises";
import { join, normalize, basename } from "node:path";
import { lookupCurriculum, type TeacherContext } from "./teacher-data";
import { ARTIFACTS_DIR } from "./paths";

/** 单个成果文件大小上限（1MB，防滥用） */
const MAX_ARTIFACT_BYTES = 1024 * 1024;

/** 工具 1：课标查询 —— 生成教案/试卷/学情分析前先查课标，保证不超纲、不虚构（无状态，可复用） */
export const curriculumLookupTool = defineTool({
  name: "curriculum_lookup",
  label: "课标查询",
  description:
    "查询指定学段、学科、年级的课程标准要点与核心知识点。生成教案、试卷、学情分析等教学成果前应当调用，避免内容超纲或与课标不符。",
  parameters: Type.Object({
    stage: Type.String({ description: "学段：幼教/小学/初中/高中/职教/大学" }),
    subject: Type.String({ description: "学科名称，如：数学" }),
    grade: Type.String({ description: "年级，如：五年级" }),
    topic: Type.String({ description: "课题或知识点（可选），用于定位更精确的课标要求", default: "" }),
  }),
  execute: async (_toolCallId, params) => {
    const summary = lookupCurriculum({
      stage: params.stage as TeacherContext["stage"],
      subject: params.subject,
      grade: params.grade,
      textbook: "",
    });
    const topicLine = params.topic ? `\n相关课题/知识点：${params.topic}` : "";
    return {
      content: [
        {
          type: "text" as const,
          text: `【课标要点】${params.stage} · ${params.subject} · ${params.grade}${topicLine}\n\n${summary}`,
        },
      ],
      details: {},
    };
  },
});

/**
 * 工具 2：保存成果 —— 按用户隔离写入 ARTIFACTS_DIR/<userId>/。
 * 工厂函数：每个请求用当前用户的 key 哈希创建独立工具，用户之间互不可见。
 */
export function createSaveArtifactTool(userId: string) {
  const userDir = join(ARTIFACTS_DIR, userId);
  return defineTool({
    name: "save_artifact",
    label: "保存成果",
    description:
      "把生成的教案、试卷、学情分析报告等成果保存为 Markdown 文件，存入你自己的成果库，方便随时取用。文件名应包含学段、学科、课题。",
    parameters: Type.Object({
      filename: Type.String({ description: "文件名，必须以 .md 结尾，例如：五年级数学-分数除法-教案.md" }),
      content: Type.String({ description: "完整 Markdown 内容" }),
    }),
    execute: async (_toolCallId, params) => {
      const raw = params.filename.trim();
      if (!raw.endsWith(".md")) {
        return {
          content: [{ type: "text" as const, text: "文件名必须以 .md 结尾。" }],
          details: {},
        };
      }
      const safeName = basename(raw);
      if (params.content.length > MAX_ARTIFACT_BYTES) {
        return {
          content: [{ type: "text" as const, text: "成果超过 1MB 限制，未保存。" }],
          details: {},
        };
      }
      // 路径安全：只允许写入当前用户目录下的普通文件名
      await mkdir(userDir, { recursive: true });
      const target = normalize(join(userDir, safeName));
      if (!target.startsWith(normalize(userDir))) {
        return {
          content: [{ type: "text" as const, text: "文件名不合法，已拒绝写入。" }],
          details: {},
        };
      }
      await writeFile(target, params.content, "utf-8");
      return {
        content: [{ type: "text" as const, text: `已保存到你的成果库：${safeName}` }],
        details: {},
      };
    },
  });
}

/** 无状态工具（课标查询 + 保存成果工厂由 relay-session 按用户创建） */
export const teacherTools = [curriculumLookupTool];
export const teacherToolNames = ["curriculum_lookup", "save_artifact"];
