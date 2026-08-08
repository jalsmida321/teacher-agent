import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "教师 AI 工作台",
  description: "使用自己的 AI 服务 Key，在师座完成作文批改、期末评语、出题组卷、教学反思和家校沟通任务。",
  robots: { index: false, follow: false, nocache: true },
};

export default function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
