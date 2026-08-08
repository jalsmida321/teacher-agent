import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "师座 | AI 教师工作台",
  description: "专注教师 AI 场景：幼教、小学、初中、高中、职教、大学全学段覆盖",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
