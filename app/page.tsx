import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  FileImage,
  FileSpreadsheet,
  FileText,
  KeyRound,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { SITE_URL, TOOL_PAGES } from "@/lib/marketing";

export const metadata: Metadata = {
  title: "AI 教师工作台 - 作文批改、期末评语与出题组卷 | 师座",
  description: "师座是教师自己的 AI 工作台，提供作文批改、期末评语、出题组卷、教学反思和家校沟通工具，支持图片、Word、Excel、PDF 输入与多格式导出。",
  alternates: { canonical: "/" },
};

const faq = [
  {
    question: "师座适合哪些教师使用？",
    answer: "师座面向幼儿园、小学、初中、高中、职教和大学教师。内置任务覆盖作文批改、学生评语、出题组卷、教学反思与家校沟通，也可以保存自己的提示词作为自定义任务。",
  },
  {
    question: "使用师座需要什么？",
    answer: "你需要在 AI 服务平台创建自己的 API Key，并在工作台中保存。Key 仅保存在当前浏览器，师座服务端不会把 Key 原文写入数据库或文件。",
  },
  {
    question: "可以处理哪些文件？",
    answer: "支持常见图片、Word（.docx）、Excel（.xlsx/.xls）、PDF，以及 TXT、Markdown、CSV、TSV 和 JSON 文本文件。不同场景可组合文字说明和附件。",
  },
  {
    question: "生成结果能导出吗？",
    answer: "可以导出为 Word、Excel、PDF 和 Markdown。工作台还支持将成果保存到当前 Key 对应的独立目录，方便再次查看。",
  },
  {
    question: "AI 结果可以直接发给学生或家长吗？",
    answer: "不建议未经检查直接使用。AI 提供的是工作初稿，教师应核对事实、评价标准、答案、隐私与表达方式，并结合学校制度和真实学情作最终判断。",
  },
];

export default function Home() {
  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "师座 TeacherDeck",
    url: SITE_URL,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    description: metadata.description,
    offers: { "@type": "Offer", price: "0", priceCurrency: "CNY", description: "工作台本身免费，用户自备 AI 服务 Key" },
    featureList: ["AI 作文批改", "AI 期末评语", "AI 出题组卷", "AI 教学反思", "AI 家校沟通", "Word、Excel、PDF 导入导出"],
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <main className="marketing-page">
      <MarketingHeader />

      <section className="marketing-hero">
        <div className="hero-copy">
          <p className="marketing-eyebrow"><Sparkles size={15} /> 教师自己的 AI 工作台</p>
          <h1>把重复的文字工作交给 AI，把判断留给教师</h1>
          <p className="hero-lead">从作文批改、期末评语到出题组卷，师座把教师高频任务整理成可直接使用的专业工作流。支持图片和 Office 文件，结果可以复核、修改并导出。</p>
          <div className="hero-actions">
            <Link className="marketing-primary" href="/workspace">免费打开工作台 <ArrowRight size={17} /></Link>
            <Link className="marketing-secondary" href="#tools">查看教师工具</Link>
          </div>
          <ul className="hero-trust">
            <li><Check size={14} />无需注册师座账号</li>
            <li><Check size={14} />Key 仅保存于浏览器</li>
            <li><Check size={14} />成果按 Key 隔离</li>
          </ul>
        </div>

        <div className="workspace-preview" aria-label="师座工作台界面预览">
          <div className="preview-topbar"><span /><span /><span /><strong>师座 · 作文批改</strong></div>
          <div className="preview-body">
            <aside>
              <b>师座</b>
              {TOOL_PAGES.map((tool, index) => <span className={index === 0 ? "active" : ""} key={tool.slug}>{tool.shortName}</span>)}
              <span>自定义任务 +</span>
            </aside>
            <section>
              <small>AI 教师工作台</small>
              <h2>作文批改</h2>
              <div className="preview-input">
                <strong>输入</strong>
                <p>上传作文照片、Word 或粘贴正文，补充年级和训练重点……</p>
                <div><FileImage size={15} /> 作文照片.jpg <span>开始生成</span></div>
              </div>
              <div className="preview-output">
                <strong>生成结果</strong>
                <h3>一、分维度评分</h3>
                <p><i style={{ width: "86%" }} /> 内容与立意 86</p>
                <p><i style={{ width: "81%" }} /> 结构与条理 81</p>
                <p><i style={{ width: "88%" }} /> 语言与表达 88</p>
              </div>
            </section>
          </div>
        </div>
      </section>

      <section className="proof-strip" aria-label="产品能力">
        <div><strong>5</strong><span>个教师高频场景</span></div>
        <div><strong>8+</strong><span>种文件输入格式</span></div>
        <div><strong>4</strong><span>种成果导出格式</span></div>
        <div><strong>BYOK</strong><span>自己的 Key，自己掌控</span></div>
      </section>

      <section className="marketing-section" id="tools">
        <div className="section-intro">
          <p className="marketing-eyebrow">教师 AI 工具</p>
          <h2>从今天最耗时的任务开始</h2>
          <p>每个场景都有独立的专业提示词、输入要求和结果结构，不需要教师从空白对话框里反复解释任务。</p>
        </div>
        <div className="tool-marketing-grid">
          {TOOL_PAGES.map((tool, index) => {
            const Icon = tool.icon;
            return (
              <article className={index === 0 ? "tool-featured" : ""} key={tool.slug}>
                <span className="tool-number">0{index + 1}</span>
                <div className="tool-marketing-icon"><Icon size={22} /></div>
                <p>{tool.eyebrow}</p>
                <h3>{tool.name}</h3>
                <div>{tool.summary}</div>
                <Link href={`/tools/${tool.slug}`}>了解这个工具 <ArrowRight size={15} /></Link>
              </article>
            );
          })}
        </div>
      </section>

      <section className="format-band">
        <div>
          <p className="marketing-eyebrow">文件不是障碍</p>
          <h2>从老师已有的材料开始，不必重新录入</h2>
          <p>作文照片、学生 Excel、现有 Word 教案和 PDF 试卷都可以成为任务上下文。生成后继续用熟悉的文件格式交付。</p>
        </div>
        <div className="format-list">
          <span><FileImage size={24} /><b>图片</b><small>拍照作文、试卷扫描</small></span>
          <span><FileText size={24} /><b>Word / PDF</b><small>教案、总结、试卷</small></span>
          <span><FileSpreadsheet size={24} /><b>Excel</b><small>学生名单、成绩数据</small></span>
        </div>
      </section>

      <section className="marketing-section workflow-section" id="workflow">
        <div className="section-intro">
          <p className="marketing-eyebrow">三步完成</p>
          <h2>AI 负责起草，教师掌握最后决定</h2>
        </div>
        <ol className="workflow-grid">
          <li><span>1</span><KeyRound size={23} /><h3>连接自己的 AI</h3><p>创建并粘贴自己的 API Key，模型和费用由教师自行选择与掌控。</p></li>
          <li><span>2</span><Sparkles size={23} /><h3>选择任务并提供材料</h3><p>使用内置场景或自定义提示词，上传文件并补充学段、目标和限制。</p></li>
          <li><span>3</span><ShieldCheck size={23} /><h3>复核、修改、导出</h3><p>检查事实、答案、评分与措辞，再导出 Word、Excel、PDF 或 Markdown。</p></li>
        </ol>
      </section>

      <section className="marketing-section faq-section" id="faq">
        <div className="section-intro">
          <p className="marketing-eyebrow">常见问题</p>
          <h2>开始使用前，你可能想知道</h2>
        </div>
        <div className="faq-list">
          {faq.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}
        </div>
      </section>

      <section className="final-cta">
        <div><p className="marketing-eyebrow">开始一项真实任务</p><h2>不用学习复杂提示词，直接从教师场景开始</h2></div>
        <Link className="marketing-primary" href="/workspace">打开师座工作台 <ArrowRight size={17} /></Link>
      </section>

      <MarketingFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
    </main>
  );
}
