"use client";

import {
  ArrowUp,
  BarChart3,
  BookOpen,
  Bot,
  ClipboardCheck,
  FileSpreadsheet,
  GraduationCap,
  LoaderCircle,
  MessageSquareText,
  MessagesSquare,
  NotebookPen,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_CONTEXT,
  GRADES,
  STAGES,
  SUBJECTS,
  TASK_TEMPLATES,
  TEXTBOOKS,
  lookupCurriculum,
  type Stage,
  type TeacherContext,
} from "@/lib/teacher-data";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  mode?: "pi" | "demo";
  model?: string;
};

type Artifact = { name: string; size: number; modified: string };

const INITIAL_MESSAGES: Message[] = [
  {
    id: 1,
    role: "assistant",
    content:
      "你好，我是你的 AI 教师助手，覆盖幼教、小学、初中、高中、职教、大学全学段。\n\n在左侧选择学段、学科、年级和教材版本，然后可以直接让我：生成教案、出试卷、设计作业讲评、做学情分析、写家校沟通话术……",
  },
];

const ICONS: Record<string, typeof BookOpen> = {
  BookOpen,
  FileSpreadsheet,
  ClipboardCheck,
  BarChart3,
  MessagesSquare,
  NotebookPen,
};

function parseSseBlock(block: string) {
  const line = block.split("\n").find((item) => item.startsWith("data: "));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(6)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export default function Home() {
  const [context, setContext] = useState<TeacherContext>(DEFAULT_CONTEXT);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamStatus, setStreamStatus] = useState("");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [showDelete, setShowDelete] = useState<string | null>(null);
  const hydrated = useRef(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  const curriculum = useMemo(() => lookupCurriculum(context), [context]);

  useEffect(() => {
    const saved = localStorage.getItem("teacher-agent-state");
    if (saved) {
      try {
        const state = JSON.parse(saved) as { context?: TeacherContext; messages?: Message[] };
        if (state.context) setContext(state.context);
        if (state.messages) setMessages(state.messages);
      } catch {
        localStorage.removeItem("teacher-agent-state");
      }
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    localStorage.setItem("teacher-agent-state", JSON.stringify({ context, messages }));
  }, [context, messages]);

  useEffect(() => {
    void fetchArtifacts();
  }, []);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  async function fetchArtifacts() {
    try {
      const response = await fetch("/api/artifacts");
      if (response.ok) {
        const data = (await response.json()) as { files: Artifact[] };
        setArtifacts(data.files);
      }
    } catch {
      // 忽略列表加载失败
    }
  }

  async function deleteArtifact(name: string) {
    try {
      await fetch(`/api/artifacts?name=${encodeURIComponent(name)}`, { method: "DELETE" });
      setShowDelete(null);
      void fetchArtifacts();
    } catch {
      // 忽略
    }
  }

  function sendTemplate(template: (typeof TASK_TEMPLATES)[number]) {
    void sendMessage(template.prompt);
  }

  async function sendMessage(text = input) {
    const message = text.trim();
    if (!message || isStreaming) return;

    const userMessage: Message = { id: Date.now(), role: "user", content: message };
    const assistantId = Date.now() + 1;
    setMessages((current) => [...current, userMessage, { id: assistantId, role: "assistant", content: "" }]);
    setInput("");
    setIsStreaming(true);
    setStreamStatus("正在准备教学上下文");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: messages.slice(-8).map(({ role, content }) => ({ role, content })),
          context,
        }),
      });
      if (!response.ok || !response.body) throw new Error(`请求失败：${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let meta: Pick<Message, "mode" | "model"> = {};

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const payload = parseSseBlock(block);
          if (!payload) continue;
          if (payload.type === "status") setStreamStatus(String(payload.label ?? "正在处理"));
          if (payload.type === "meta") {
            meta = {
              mode: payload.mode === "demo" ? "demo" : "pi",
              model: typeof payload.model === "string" ? payload.model : undefined,
            };
            setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, ...meta } : item));
          }
          if (payload.type === "delta") {
            const delta = String(payload.text ?? "");
            setMessages((current) => current.map((item) => item.id === assistantId
              ? { ...item, ...meta, content: item.content + delta }
              : item));
          }
          if (payload.type === "error") throw new Error(String(payload.message ?? "AI 请求失败"));
        }
      }
      void fetchArtifacts();
    } catch (error) {
      setMessages((current) => current.map((item) => item.id === assistantId
        ? { ...item, content: `无法完成本次请求：${error instanceof Error ? error.message : String(error)}` }
        : item));
    } finally {
      setIsStreaming(false);
      setStreamStatus("");
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><GraduationCap size={19} /></div>
          <div><strong>师座</strong><span>TeacherDeck</span></div>
        </div>

        <nav className="nav-list" aria-label="学段选择">
          <p className="nav-caption">选择学段</p>
          {STAGES.map((stage) => (
            <button
              key={stage}
              className={context.stage === stage ? "active" : ""}
              onClick={() => setContext((current) => ({
                ...current,
                stage,
                subject: SUBJECTS[stage][0],
                grade: GRADES[stage][0],
                textbook: "",
              }))}
            >
              <span className="stage-dot" />{stage}
            </button>
          ))}
        </nav>

        <div className="sidebar-section context-fields">
          <p>教学上下文</p>
          <label>学科
            <select
              value={context.subject}
              onChange={(event) => setContext((current) => ({ ...current, subject: event.target.value }))}
            >
              {SUBJECTS[context.stage].map((subject) => <option key={subject}>{subject}</option>)}
            </select>
          </label>
          <label>年级
            <select
              value={context.grade}
              onChange={(event) => setContext((current) => ({ ...current, grade: event.target.value }))}
            >
              {GRADES[context.stage].map((grade) => <option key={grade}>{grade}</option>)}
            </select>
          </label>
          <label>教材版本
            <select
              value={context.textbook}
              onChange={(event) => setContext((current) => ({ ...current, textbook: event.target.value }))}
            >
              <option value="">未指定</option>
              {(TEXTBOOKS[context.stage] ?? []).map((book) => <option key={book}>{book}</option>)}
            </select>
          </label>
        </div>

        <div className="sidebar-footer">
          <button title="当前课标" onClick={() => void sendMessage(`请先确认我对当前课标的理解是否正确，再给一个本单元的教学建议：${curriculum}`)}>
            <Sparkles size={17} />课标速览
          </button>
          <button title="新对话" onClick={() => setMessages(INITIAL_MESSAGES)}><Plus size={17} />新对话</button>
          <div className="avatar">师</div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">教师工作台 / 当前上下文</p>
            <h1>{context.grade} · {context.subject} · {context.stage}</h1>
          </div>
          <div className="topbar-actions">
            <span className="status"><i />全学段覆盖</span>
          </div>
        </header>

        <div className="content-scroll">
          <section className="project-summary">
            <div className="summary-copy">
              <span className="section-kicker">当前教学上下文</span>
              <h2>{context.grade}{context.subject}（{context.textbook || "未指定教材"}）的 AI 备课助手</h2>
              <p>{curriculum}</p>
            </div>
            <div className="progress-block">
              <div className="progress-value"><strong>{artifacts.length}</strong><span>已保存成果</span></div>
              <div className="progress-track"><i style={{ width: `${Math.min(artifacts.length * 20, 100)}%` }} /></div>
              <small>教案、试卷、分析报告都会存到工作区 artifacts 目录</small>
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <div><span className="section-kicker">常用任务</span><h2>选择一个场景，直接开始</h2></div>
              <span className="approval-note"><MessageSquareText size={14} />内容符合当前学段与课标</span>
            </div>
            <div className="template-grid">
              {TASK_TEMPLATES.map((template) => {
                const Icon = ICONS[template.icon] ?? BookOpen;
                return (
                  <button
                    className="template-card"
                    key={template.id}
                    onClick={() => sendTemplate(template)}
                    disabled={isStreaming}
                  >
                    <span className="template-icon"><Icon size={18} /></span>
                    <strong>{template.label}</strong>
                    <small>{template.description}</small>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <div><span className="section-kicker">成果工作区</span><h2>最近保存的成果</h2></div>
              <span className="approval-note">{artifacts.length} 个文件 · artifacts/</span>
            </div>
            {artifacts.length === 0 ? (
              <div className="empty-state">还没有保存成果。让 AI 生成教案或试卷后，它会自动调用「保存成果」工具写入这里。</div>
            ) : (
              <div className="artifact-list">
                {artifacts.map((artifact) => (
                  <article className="artifact-row" key={artifact.name}>
                    <span className="artifact-file"><FileSpreadsheet size={15} /></span>
                    <div>
                      <strong>{artifact.name}</strong>
                      <small>{new Date(artifact.modified).toLocaleString("zh-CN")} · {(artifact.size / 1024).toFixed(1)} KB</small>
                    </div>
                    <button
                      className="icon-btn danger"
                      title="删除"
                      onClick={() => setShowDelete(artifact.name)}
                    ><Trash2 size={14} /></button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>

      <aside className="assistant-panel">
        <header className="assistant-header">
          <div className="assistant-title">
            <span><Bot size={18} /></span>
            <div><strong>AI 教师助手</strong><small><i />Pi 运行时</small></div>
          </div>
          <button className="icon-btn" title="新对话" onClick={() => setMessages(INITIAL_MESSAGES)}><Plus size={18} /></button>
        </header>

        <div className="quick-prompts">
          {["写一份教案", "出一张单元卷", "设计作业讲评", "写家长沟通话术"].map((prompt) => (
            <button key={prompt} onClick={() => void sendMessage(prompt)}>{prompt}</button>
          ))}
        </div>

        <div className="chat-list">
          {messages.map((message) => (
            <div className={`message ${message.role}`} key={message.id}>
              {message.role === "assistant" && <div className="message-avatar"><Sparkles size={14} /></div>}
              <div className="message-body">
                {message.role === "assistant" && message.mode && (
                  <span className={`mode-label ${message.mode}`}>{message.mode === "pi" ? message.model ?? "Pi" : "演示模式"}</span>
                )}
                <p>{message.content || (isStreaming ? "" : "暂无内容")}</p>
              </div>
            </div>
          ))}
          {isStreaming && <div className="stream-status"><LoaderCircle size={14} />{streamStatus || "正在思考"}</div>}
          <div ref={chatEnd} />
        </div>

        <div className="composer-wrap">
          <div className="composer">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder={`为 ${context.grade}${context.subject} 备课…`}
              rows={3}
            />
            <div className="composer-footer">
              <span><MessageSquareText size={14} />基于当前学段与课标</span>
              <button onClick={() => void sendMessage()} disabled={!input.trim() || isStreaming} title="发送"><ArrowUp size={17} /></button>
            </div>
          </div>
          <small>AI 生成内容仅供参考，最终以教师专业判断为准。</small>
        </div>
      </aside>

      {showDelete && (
        <div className="modal-backdrop" onMouseDown={() => setShowDelete(null)}>
          <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div><span className="section-kicker">删除成果</span><h2>确认删除 {showDelete}？</h2></div>
              <button className="icon-btn" onClick={() => setShowDelete(null)}><Plus size={17} className="rotate-45" /></button>
            </div>
            <p className="modal-note">删除后不可恢复，文件将从 artifacts 目录移除。</p>
            <div className="modal-actions">
              <button onClick={() => setShowDelete(null)}>取消</button>
              <button className="danger" onClick={() => void deleteArtifact(showDelete)}>删除</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
