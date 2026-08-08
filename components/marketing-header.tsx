import { ArrowRight, GraduationCap } from "lucide-react";
import Link from "next/link";

export function MarketingHeader() {
  return (
    <header className="marketing-header">
      <Link className="marketing-brand" href="/" aria-label="师座首页">
        <span><GraduationCap size={20} /></span>
        <strong>师座</strong>
        <small>TeacherDeck</small>
      </Link>
      <nav aria-label="主要导航">
        <Link href="/#tools">教师工具</Link>
        <Link href="/#workflow">使用方法</Link>
        <Link href="/#faq">常见问题</Link>
      </nav>
      <Link className="header-cta" href="/workspace">
        打开工作台 <ArrowRight size={15} />
      </Link>
    </header>
  );
}
