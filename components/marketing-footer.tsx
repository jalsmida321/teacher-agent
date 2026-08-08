import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { TOOL_PAGES } from "@/lib/marketing";

export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div className="footer-brand">
        <span><GraduationCap size={18} /></span>
        <div><strong>师座 TeacherDeck</strong><small>教师自己的 AI 工作台</small></div>
      </div>
      <div>
        <strong>教师工具</strong>
        {TOOL_PAGES.map((tool) => <Link key={tool.slug} href={`/tools/${tool.slug}`}>{tool.shortName}</Link>)}
      </div>
      <div>
        <strong>开始使用</strong>
        <Link href="/workspace">打开工作台</Link>
        <a href="https://api.sublyx.org/token" target="_blank" rel="noreferrer">创建 AI 服务 Key</a>
      </div>
      <p>AI 生成内容仅作为教师工作初稿，请结合学情与教学规范复核后使用。</p>
    </footer>
  );
}
