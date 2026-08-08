import type { Metadata } from "next";
import "./globals.css";
import "./marketing.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://teacherdeck.org"),
  title: {
    default: "AI 教师工作台 | 师座 TeacherDeck",
    template: "%s",
  },
  description: "师座是教师自己的 AI 工作台，提供作文批改、期末评语、出题组卷、教学反思和家校沟通工具。",
  applicationName: "师座 TeacherDeck",
  keywords: ["AI 教师工具", "AI 教师工作台", "作文批改", "期末评语", "出题组卷", "教学反思", "家校沟通"],
  authors: [{ name: "师座 TeacherDeck" }],
  creator: "师座 TeacherDeck",
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: "https://teacherdeck.org",
    siteName: "师座 TeacherDeck",
    title: "AI 教师工作台 | 师座 TeacherDeck",
    description: "作文批改、期末评语、出题组卷、教学反思与家校沟通，教师高频任务从这里开始。",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI 教师工作台 | 师座 TeacherDeck",
    description: "教师自己的 AI 工作台：作文批改、期末评语、出题组卷、教学反思与家校沟通。",
  },
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
