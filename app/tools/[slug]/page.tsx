import type { Metadata } from "next";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { SITE_URL, TOOL_PAGE_MAP, TOOL_PAGES } from "@/lib/marketing";

export function generateStaticParams() {
  return TOOL_PAGES.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tool = TOOL_PAGE_MAP[slug];
  if (!tool) return {};
  return {
    title: `${tool.title} | 师座`,
    description: tool.description,
    alternates: { canonical: `/tools/${slug}` },
    openGraph: {
      type: "website",
      url: `${SITE_URL}/tools/${slug}`,
      title: `${tool.title} | 师座`,
      description: tool.description,
    },
  };
}

export default async function ToolLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = TOOL_PAGE_MAP[slug];
  if (!tool) notFound();
  const Icon = tool.icon;
  const related = TOOL_PAGES.filter((item) => item.slug !== tool.slug).slice(0, 3);
  const workbenchHref = `/workspace?scenario=${encodeURIComponent(tool.slug)}`;
  const appJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: tool.name,
    url: `${SITE_URL}/tools/${tool.slug}`,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    description: tool.description,
    isPartOf: { "@type": "WebSite", name: "师座 TeacherDeck", url: SITE_URL },
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: tool.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <main className="marketing-page tool-landing-page">
      <MarketingHeader />
      <nav className="breadcrumbs" aria-label="面包屑">
        <Link href="/">首页</Link><ChevronRight size={13} /><span>{tool.name}</span>
      </nav>

      <section className="tool-hero">
        <div>
          <p className="marketing-eyebrow"><Icon size={15} /> {tool.eyebrow}</p>
          <h1>{tool.name}</h1>
          <p>{tool.summary}</p>
          <div className="hero-actions">
            <Link className="marketing-primary" href={workbenchHref}>打开工具 <ArrowRight size={17} /></Link>
            <Link className="marketing-secondary" href="#how">查看使用方法</Link>
          </div>
          <small>工作台本身免费 · 使用自己的 AI 服务 Key · 无需注册师座账号</small>
        </div>
        <aside className="tool-output-card">
          <div><span>输入材料</span><p>{tool.input}</p></div>
          <strong>得到一份可复核的工作初稿</strong>
          <ul>{tool.output.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul>
        </aside>
      </section>

      <section className="marketing-section tool-benefits">
        <div className="section-intro"><p className="marketing-eyebrow">解决什么问题</p><h2>不是代替教师，而是减少从零起稿</h2></div>
        <div>{tool.benefits.map((benefit, index) => <article key={benefit.title}><span>0{index + 1}</span><h3>{benefit.title}</h3><p>{benefit.text}</p></article>)}</div>
      </section>

      <section className="tool-how-band" id="how">
        <div className="section-intro"><p className="marketing-eyebrow">使用方法</p><h2>三步完成一次{tool.shortName}任务</h2></div>
        <ol>{tool.steps.map((step, index) => <li key={step.title}><span>{index + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></li>)}</ol>
      </section>

      <section className="marketing-section audience-section">
        <div className="section-intro"><p className="marketing-eyebrow">适用教师</p><h2>把场景说清楚，结果才真正有用</h2></div>
        <ul>{tool.audience.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul>
      </section>

      <section className="marketing-section faq-section">
        <div className="section-intro"><p className="marketing-eyebrow">常见问题</p><h2>关于{tool.shortName}</h2></div>
        <div className="faq-list">{tool.faq.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div>
      </section>

      <section className="marketing-section related-tools">
        <div className="section-intro"><p className="marketing-eyebrow">继续使用</p><h2>更多教师 AI 工具</h2></div>
        <div>{related.map((item) => { const RelatedIcon = item.icon; return <Link key={item.slug} href={`/tools/${item.slug}`}><RelatedIcon size={20} /><span><strong>{item.name}</strong><small>{item.description}</small></span><ArrowRight size={16} /></Link>; })}</div>
      </section>

      <section className="final-cta">
        <div><p className="marketing-eyebrow">现在开始</p><h2>打开师座，完成一次{tool.shortName}任务</h2></div>
        <Link className="marketing-primary" href={workbenchHref}>打开工具 <ArrowRight size={17} /></Link>
      </section>
      <MarketingFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
    </main>
  );
}
