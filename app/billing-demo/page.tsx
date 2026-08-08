"use client";

import {
  ArrowUp,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Coins,
  Download,
  ExternalLink,
  Eye,
  FileText,
  GraduationCap,
  HelpCircle,
  KeyRound,
  LoaderCircle,
  MessagesSquare,
  NotebookPen,
  Plus,
  RefreshCcw,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SCENARIOS, SCENARIO_ORDER, type ScenarioId } from "@/lib/scenarios";

const RELAY_WEB_URL = "https://api.sublyx.org";
const RELAY_TOKEN_URL = "https://api.sublyx.org/token";

type UsageLogItem = {
  time: string;
  scenario: ScenarioId;
  totalTokens: number;
};

type Artifact = { name: string; modified: string };

type CustomTask = {
  id: string;
  name: string;
  description: string;
  prompt: string; // 系统提示词
  createdAt: number;
};

const TASKS_STORAGE = "teacher-agent-custom-tasks";

/** 预置示例任务（证明自定义任务的价值） */
const DEFAULT_TASKS: CustomTask[] = [
  {
    id: "demo-task-1",
    name: "公开课说课稿",
    description: "按说课标准生成公开课说课稿",
    prompt: `你是一名教学能手，擅长写公开课说课稿。请按以下框架生成：

## 一、说教材（本课在单元中的地位、课标要求）
## 二、说学情（学生已有知识基础、认知特点）
## 三、说教学目标与重难点（含核心素养目标）
## 四、说教法学法（体现新课程理念）
## 五、说教学过程（时间分配、设计意图）
## 六、说板书设计

要求：结合给定课题与学段，内容具体不空话，可直接用于说课比赛。`,
    createdAt: 0,
  },
  {
    id: "demo-task-2",
    name: "家长会发言稿",
    description: "生成家长会班主任发言稿",
    prompt: `你是一名资深班主任，请生成家长会发言稿。要求：
1. 开场感谢与班级整体情况介绍
2. 本阶段学习/习惯方面亮点与问题
3. 给家长的具体配合建议（可操作）
4. 安全教育与注意事项
5. 结尾互动与答疑预告

语气真诚、有温度，适合当面讲或发到家长群。`,
    createdAt: 0,
  },
];


const SCENARIO_ICONS: Record<ScenarioId, typeof FileText> = {
  essay: BookOpenCheck,
  comment: ClipboardList,
  exam: FileText,
  reflection: NotebookPen,
  parent: MessagesSquare,
};

const SCENARIO_SAMPLES: Record<ScenarioId, string> = {
  essay: "请批改这篇作文（粘贴正文或拍照上传）：\n\n我的妈妈\n\n我的妈妈是个普通的上班族，她每天很早起床给我做早饭……",
  comment: "请为以下 5 名学生生成期末评语：\n1. 小明，男生，数学好但语文弱，上课爱走神\n2. 小红，女生，班长，负责但有时急躁\n3. 小刚，男生，体育特长，作业常不交\n4. 小丽，女生，文静，爱看书，不举手发言\n5. 小强，男生，幽默，但容易和同学起冲突",
  exam: "请出一份小学五年级数学《分数除法》单元测试卷，满分100分，时长60分钟。",
  reflection: "请帮我写本学期的教学反思。我这学期教五年级数学，用了小组合作和游戏化练习，期末平均分从78提到了84，但优生吃不饱、后进生跟不上。",
  parent: "写一条班级群通知：明天下午 3 点开家长会，提醒家长准时到校，带好笔和本子，并说明校门口停车安排。",
};

const KEY_STORAGE = "teacher-agent-api-key";
const LOG_STORAGE = "teacher-agent-usage-log";

function parseSseBlock(block: string) {
  const line = block.split("\n").find((item) => item.startsWith("data: "));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(6)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 下载文本为本地文件（教师保存成果用） */
function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function TeacherDeckPage() {
  // 当前工作模式：内置场景 or 自定义任务
  const [activeMode, setActiveMode] = useState<"builtin" | "custom">("builtin");
  const [scenario, setScenario] = useState<ScenarioId>("essay");
  const [customTasks, setCustomTasks] = useState<CustomTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskName, setTaskName] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [showKeyGuide, setShowKeyGuide] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Array<{ name: string; file?: File }>>([]);
  const [output, setOutput] = useState("");
  const [outputName, setOutputName] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState("");
  const [usage, setUsage] = useState<{ promptTokens: number; completionTokens: number; totalTokens: number } | null>(null);
  const [log, setLog] = useState<UsageLogItem[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [preview, setPreview] = useState<{ name: string; content: string } | null>(null);
  const [toolCalls, setToolCalls] = useState<string[]>([]);
  const chatEnd = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // 当前任务信息：内置场景 or 自定义任务
  const activeTask = activeMode === "custom"
    ? customTasks.find((t) => t.id === activeTaskId) ?? null
    : null;
  const activeTitle = activeTask ? activeTask.name : SCENARIOS[scenario].label;
  const activeDesc = activeTask ? activeTask.description : SCENARIOS[scenario].description;
  const outputPreview = useMemo(() => {
    if (!output) return null;
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
    );
  }, [output]);

  // 启动时恢复 key / 用量 / 成果 / 自定义任务
  useEffect(() => {
    const savedKey = localStorage.getItem(KEY_STORAGE) ?? "";
    setApiKey(savedKey);
    const saved = localStorage.getItem(LOG_STORAGE);
    if (saved) {
      try {
        setLog(JSON.parse(saved) as UsageLogItem[]);
      } catch {
        localStorage.removeItem(LOG_STORAGE);
      }
    }
    const savedTasks = localStorage.getItem(TASKS_STORAGE);
    if (savedTasks) {
      try {
        setCustomTasks(JSON.parse(savedTasks) as CustomTask[]);
      } catch {
        localStorage.removeItem(TASKS_STORAGE);
        setCustomTasks(DEFAULT_TASKS);
      }
    } else {
      setCustomTasks(DEFAULT_TASKS);
      localStorage.setItem(TASKS_STORAGE, JSON.stringify(DEFAULT_TASKS));
    }
    if (savedKey) void loadModels(savedKey);
    void loadArtifacts(savedKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { if (typeTimer.current) clearInterval(typeTimer.current); }, []);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [output, isStreaming]);

  async function loadModels(key: string) {
    const trimmed = key.trim();
    if (!trimmed) return;
    setModelsLoading(true);
    setModelsError("");
    try {
      // POST + body：避免 API Key 进访问日志（GET query 会被 Nginx/CF 记录）
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: trimmed }),
      });
      const data = (await response.json()) as { models?: string[]; default?: string; error?: string };
      if (!response.ok || !data.models) throw new Error(data.error ?? `请求失败：${response.status}`);
      setModels(data.models);
      setModel((current) => {
        if (current && data.models!.includes(current)) return current;
        return data.default ?? data.models![0] ?? "";
      });
    } catch (error) {
      setModelsError(error instanceof Error ? error.message : String(error));
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }

  async function loadArtifacts(keyOverride?: string) {
    const key = (keyOverride ?? apiKey).trim();
    if (!key) return;
    try {
      // GET + Authorization header：key 不进 URL/访问日志，且按用户隔离
      const response = await fetch("/api/artifacts", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (response.ok) {
        const data = (await response.json()) as { files: Artifact[] };
        setArtifacts(data.files);
      }
    } catch {
      // 忽略
    }
  }

  async function previewArtifact(name: string) {
    const key = apiKey.trim();
    if (!key) return;
    try {
      const response = await fetch(`/api/artifacts?name=${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (response.ok) {
        const data = (await response.json()) as { name: string; content: string };
        setPreview(data);
      }
    } catch {
      // 忽略
    }
  }

  async function deleteArtifact(name: string) {
    const key = apiKey.trim();
    if (!key) return;
    try {
      await fetch(`/api/artifacts?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${key}` },
      });
      setPreview(null);
      void loadArtifacts();
    } catch {
      // 忽略
    }
  }

  function saveKey() {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      localStorage.removeItem(KEY_STORAGE);
      setKeySaved(false);
      setModels([]);
      return;
    }
    localStorage.setItem(KEY_STORAGE, trimmed);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 1500);
    void loadModels(trimmed);
  }

  function appendLog(entry: UsageLogItem) {
    setLog((current) => {
      const next = [entry, ...current].slice(0, 50);
      localStorage.setItem(LOG_STORAGE, JSON.stringify(next));
      return next;
    });
  }

  function typewriter(fullText: string) {
    if (typeTimer.current) clearInterval(typeTimer.current);
    let shown = 0;
    setOutput("");
    typeTimer.current = setInterval(() => {
      shown += 4;
      setOutput(fullText.slice(0, shown));
      if (shown >= fullText.length && typeTimer.current) {
        clearInterval(typeTimer.current);
        typeTimer.current = null;
      }
    }, 12);
  }

  function useSample() {
    setInput(SCENARIO_SAMPLES[scenario]);
  }

  function onFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setAttachments((current) => [
      ...current.filter((a) => a.name !== file.name),
      { name: file.name, file },
    ]);
    // 图片通常配作文批改场景
    if (file.type.startsWith("image/")) setScenario("essay");
    event.target.value = ""; // 允许重复选择同一文件
  }

  function removeAttachment(name: string) {
    setAttachments((current) => current.filter((a) => a.name !== name));
  }

  /* ===== 自定义任务 CRUD ===== */
  function persistTasks(tasks: CustomTask[]) {
    setCustomTasks(tasks);
    localStorage.setItem(TASKS_STORAGE, JSON.stringify(tasks));
  }

  function openNewTask() {
    setEditingTaskId(null);
    setTaskName("");
    setTaskDesc("");
    setTaskPrompt("");
    setTaskModalOpen(true);
  }

  function openEditTask(task: CustomTask) {
    setEditingTaskId(task.id);
    setTaskName(task.name);
    setTaskDesc(task.description);
    setTaskPrompt(task.prompt);
    setTaskModalOpen(true);
  }

  function saveTask() {
    const name = taskName.trim();
    if (!name) return;
    if (editingTaskId) {
      // 编辑
      persistTasks(customTasks.map((t) =>
        t.id === editingTaskId ? { ...t, name, description: taskDesc.trim(), prompt: taskPrompt.trim() } : t,
      ));
    } else {
      // 新建
      const task: CustomTask = {
        id: `task-${Date.now()}`,
        name,
        description: taskDesc.trim(),
        prompt: taskPrompt.trim(),
        createdAt: Date.now(),
      };
      persistTasks([...customTasks, task]);
      setActiveMode("custom");
      setActiveTaskId(task.id);
    }
    setTaskModalOpen(false);
  }

  function deleteTask(id: string) {
    const remaining = customTasks.filter((t) => t.id !== id);
    persistTasks(remaining);
    if (activeTaskId === id) {
      setActiveTaskId(null);
      setActiveMode("builtin");
    }
  }

  function selectTask(id: string) {
    setActiveMode("custom");
    setActiveTaskId(id);
    setOutput("");
    setInput("");
    setAttachments([]);
    setUsage(null);
  }

  function selectScenario(id: ScenarioId) {
    setActiveMode("builtin");
    setScenario(id);
    setOutput("");
    setInput("");
    setAttachments([]);
    setUsage(null);
  }

  /** 根据场景生成默认文件名 */
  function defaultFilename(scenarioId: ScenarioId): string {
    const stamp = new Date().toISOString().slice(0, 10);
    const map: Record<ScenarioId, string> = {
      essay: `作文批改-${stamp}.md`,
      comment: `期末评语-${stamp}.md`,
      exam: `单元测试卷-${stamp}.md`,
      reflection: `教学反思-${stamp}.md`,
      parent: `家校沟通-${stamp}.md`,
    };
    return map[scenarioId];
  }

  /** 自定义任务的默认文件名 */
  function customFilename(): string {
    const stamp = new Date().toISOString().slice(0, 10);
    const base = activeTask ? activeTask.name.replace(/[\\/:*?"<>|]/g, "_") : "自定义任务";
    return `${base}-${stamp}.md`;
  }

  function saveOutput() {
    if (!output) return;
    // 统一走服务端导出（支持 md/docx/xlsx/pdf）
    const base = (outputName || defaultFilename(scenario)).replace(/\.(md|docx|xlsx|pdf)$/i, "");
    window.location.href = `/api/export?format=md&title=${encodeURIComponent(base)}&content=${encodeURIComponent(output)}`;
  }

  function exportAs(format: "docx" | "xlsx" | "pdf" | "md") {
    if (!output) return;
    setExportOpen(false);
    const base = (outputName || defaultFilename(scenario)).replace(/\.(md|docx|xlsx|pdf)$/i, "");
    window.location.href = `/api/export?format=${format}&title=${encodeURIComponent(base)}&content=${encodeURIComponent(output)}`;
  }

  async function run() {
    const message = input.trim();
    const key = apiKey.trim();
    if (!message || isStreaming) return;
    if (!key) {
      setOutput("请先在左侧「连接 AI」里填入你的 Key。\n\n还没 Key？点击「如何获取 Key」查看三步引导。");
      return;
    }
    setIsStreaming(true);
    setOutput("");
    setUsage(null);
    setToolCalls([]);
    setOutputName(activeTask ? customFilename() : defaultFilename(scenario));
    setStatus(`正在生成${activeTitle}…`);

    // multipart 上传：文件交给后端解析（图片→视觉，docx/pdf/xlsx→文本）
    const form = new FormData();
    form.append("scenario", scenario);
    form.append("message", message);
    form.append("apiKey", key);
    form.append("model", model);
    // 自定义任务：直接带用户提示词；内置场景则不带
    if (activeTask) form.append("customPrompt", activeTask.prompt);
    for (const attachment of attachments) {
      if (attachment.file) form.append("files", attachment.file);
    }

    try {
      const response = await fetch("/api/llm", {
        method: "POST",
        body: form,
      });
      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error ?? `请求失败：${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let finalUsage: typeof usage = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const payload = parseSseBlock(block);
          if (!payload) continue;
          if (payload.type === "status") setStatus(String(payload.label ?? ""));
          if (payload.type === "delta") {
            const delta = String(payload.text ?? "");
            fullText += delta;
            if (delta.length > 100) typewriter(fullText);
            else setOutput((current) => current + delta);
          }
          if (payload.type === "tool") {
            setToolCalls((current) => [...current, String(payload.name ?? "")]);
          }
          if (payload.type === "usage") {
            finalUsage = {
              promptTokens: Number(payload.promptTokens ?? 0),
              completionTokens: Number(payload.completionTokens ?? 0),
              totalTokens: Number(payload.totalTokens ?? 0),
            };
            setUsage(finalUsage);
          }
          if (payload.type === "error") throw new Error(String(payload.message ?? "调用失败"));
        }
      }
      if (finalUsage) {
        appendLog({ time: new Date().toISOString(), scenario, totalTokens: finalUsage.totalTokens });
      }
      void loadArtifacts();
    } catch (error) {
      setOutput(`生成失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsStreaming(false);
      setStatus("");
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><GraduationCap size={19} /></div>
          <div><strong>师座</strong><span>教师 AI 工作台</span></div>
        </div>

        {/* 连接 AI（Key 管理 + 引导） */}
        <div className="sidebar-section context-fields">
          <p>连接 AI</p>
          <div className="key-box">
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="粘贴你的 Key（sk- 开头）"
            />
            <button onClick={saveKey} title="保存到本机浏览器" disabled={!apiKey.trim()}>
              <Save size={14} />{keySaved ? "已保存" : "保存"}
            </button>
          </div>
          <button className="guide-toggle" onClick={() => setShowKeyGuide((v) => !v)}>
            <HelpCircle size={13} />{showKeyGuide ? "收起帮助" : "如何获取 Key？"}
          </button>
          {showKeyGuide && (
            <div className="key-guide">
              <ol>
                <li><a href={RELAY_WEB_URL} target="_blank" rel="noreferrer">打开 API 平台 <ExternalLink size={11} /></a>，注册并登录</li>
                <li>在「令牌 / Token」页面新建一个令牌</li>
                <li>复制 <code>sk-</code> 开头的 Key，粘贴到上方输入框并保存</li>
              </ol>
              <a className="guide-cta" href={RELAY_TOKEN_URL} target="_blank" rel="noreferrer">
                去创建 Key <ExternalLink size={12} />
              </a>
              <p>充值、余额、账单都在平台上查看。</p>
            </div>
          )}
          {models.length > 0 && <small className="key-hint">已连接 · 共 {models.length} 个模型可用</small>}
          {modelsError && <small className="key-hint error">连接失败：{modelsError}</small>}
        </div>

        {/* 模型选择 */}
        <div className="sidebar-section context-fields">
          <p>模型</p>
          <select
            className="model-select"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            disabled={modelsLoading || models.length === 0}
          >
            {models.length === 0 && <option value="">{modelsLoading ? "加载中…" : modelsError ? "加载失败" : "先保存 Key"}</option>}
            {models.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>

        {/* 场景 */}
        <nav className="nav-list" aria-label="场景选择">
          <p className="nav-caption">工作场景</p>
          {SCENARIO_ORDER.map((id) => {
            const Icon = SCENARIO_ICONS[id];
            const isActive = activeMode === "builtin" && scenario === id;
            return (
              <button key={id} className={isActive ? "active" : ""} onClick={() => selectScenario(id)}>
                <span className="stage-dot" />{SCENARIOS[id].label}
              </button>
            );
          })}
        </nav>

        {/* 自定义任务（proven 模式：类似 pi-web 会话列表） */}
        <nav className="nav-list task-list" aria-label="自定义任务">
          <div className="nav-caption-row">
            <p className="nav-caption">自定义任务</p>
            <button className="add-task-btn" onClick={openNewTask} title="新建自定义任务">
              <Plus size={13} />
            </button>
          </div>
          <div className="task-scroll">
            {customTasks.length === 0 && <p className="task-empty">还没有自定义任务，点 + 新建</p>}
            {customTasks.map((task) => (
              <button
                key={task.id}
                className={`task-item ${activeMode === "custom" && activeTaskId === task.id ? "active" : ""}`}
                onClick={() => selectTask(task.id)}
                title={task.description}
              >
                <span className="stage-dot" />
                <span className="task-item-name">{task.name}</span>
                <span className="task-item-actions">
                  <span className="task-edit" onClick={(e) => { e.stopPropagation(); openEditTask(task); }} title="编辑">
                    <FileText size={11} />
                  </span>
                  <span className="task-del" onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }} title="删除">
                    <X size={11} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </nav>

        <div className="sidebar-footer">
          <button onClick={useSample}><Sparkles size={17} />示例</button>
          <button onClick={() => void loadArtifacts()}><RefreshCcw size={17} />成果</button>
          <div className="avatar">师</div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">师座 · 教师 AI 工作台{activeTask ? " · 自定义任务" : ""}</p>
            <h1>{activeTitle}</h1>
          </div>
          <div className="topbar-actions">
            {model && <span className="status"><i />{model}</span>}
            {apiKey && <span className="status key-status"><CheckCircle2 size={12} />已连接</span>}
          </div>
        </header>

        <div className="content-scroll">
          {/* 场景说明 */}
          <section className="project-summary">
            <div className="summary-copy">
              <span className="section-kicker">{activeDesc}</span>
              <h2>{activeTitle}</h2>
              <p>{activeTask ? "这是一个自定义任务：AI 会按你编写的提示词要求执行。点击左侧 ✏️ 可修改提示词。" : "把内容填在下面，点击「开始生成」，结果会显示在右侧并可保存为文件。"}</p>
            </div>
            <div className="progress-block">
              <div className="progress-value">
                <strong>{usage ? usage.totalTokens.toLocaleString() : "--"}</strong>
                <span>本次用量</span>
              </div>
              <div className="progress-track"><i style={{ width: `${Math.min(usage ? usage.totalTokens / 200 : 0, 100)}%` }} /></div>
              <small>{usage ? `共 ${usage.totalTokens.toLocaleString()} tokens · 费用以平台账单为准` : "尚未生成"}</small>
            </div>
          </section>

          {/* 输入区 */}
          <section className="section">
            <div className="section-head">
              <div><span className="section-kicker">输入</span><h2>粘贴内容</h2></div>
              <div className="topbar-actions">
                <button className="text-btn" onClick={() => fileRef.current?.click()}>📎 上传附件</button>
                <button className="text-btn" onClick={useSample}>填入示例</button>
              </div>
            </div>
            <input ref={fileRef} type="file" hidden onChange={onFilePicked} />
            <textarea
              className="billing-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={activeTask ? `在「${activeTask.name}」任务下输入内容…` : activeDesc}
              rows={6}
            />
            {attachments.length > 0 && (
              <div className="attachment-list">
                {attachments.map((attachment) => (
                  <span className="attachment-chip" key={attachment.name}>
                    📄 {attachment.name}
                    <button onClick={() => removeAttachment(attachment.name)} title="移除"><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            <p className="attach-hint">支持：图片 / Word(.docx) / Excel(.xlsx) / PDF / 文本(.txt .csv .md)</p>
            <div className="billing-actions">
              <button className="primary-billing" onClick={() => void run()} disabled={!input.trim() || isStreaming}>
                {isStreaming ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}
                {isStreaming ? "生成中…" : "开始生成"}
              </button>
              {status && <span className="stream-status"><LoaderCircle size={13} />{status}</span>}
            </div>
          </section>

          {/* 输出区 */}
          <section className="section">
            <div className="section-head">
              <div><span className="section-kicker">输出</span><h2>生成结果</h2></div>
              <div className="topbar-actions">
                {toolCalls.length > 0 && <span className="approval-note">{toolCalls.length} 项智能检查</span>}
                {usage && (
                  <span className="approval-note">{usage.totalTokens.toLocaleString()} tokens</span>
                )}
                {output && (
                  <>
                    <button className="text-btn" onClick={() => setOutput("")} title="清空"><X size={13} />清空</button>
                    <div className="export-menu-wrap">
                      <button className="primary-billing small" onClick={() => setExportOpen((v) => !v)}>
                        <Download size={14} />导出
                      </button>
                      {exportOpen && (
                        <div className="export-menu">
                          <button onClick={() => exportAs("docx")}><FileText size={13} />Word (.docx)</button>
                          <button onClick={() => exportAs("xlsx")}><ClipboardList size={13} />Excel (.xlsx)</button>
                          <button onClick={() => exportAs("pdf")}><FileText size={13} />PDF</button>
                          <button onClick={() => exportAs("md")}><NotebookPen size={13} />Markdown (.md)</button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
            {output ? (
              <div className="billing-output preview">{outputPreview}</div>
            ) : (
              <div className="empty-output">{isStreaming ? "正在生成…" : "生成结果会显示在这里。"}</div>
            )}
            <div ref={chatEnd} />
          </section>

          {/* 已保存成果 */}
          <section className="section">
            <div className="section-head">
              <div><span className="section-kicker">资料库</span><h2>已保存的成果</h2></div>
              <span className="approval-note">{artifacts.length} 个文件</span>
            </div>
            {artifacts.length === 0 ? (
              <div className="empty-state">还没有保存的成果。生成结果后点击「保存到本机」即可下载。</div>
            ) : (
              <div className="artifact-list">
                {artifacts.map((artifact) => (
                  <article className="artifact-row" key={artifact.name}>
                    <span className="artifact-file"><FileText size={15} /></span>
                    <button className="artifact-name" onClick={() => void previewArtifact(artifact.name)}>
                      <strong>{artifact.name}</strong>
                      <small>{new Date(artifact.modified).toLocaleString("zh-CN")}</small>
                    </button>
                    <div className="artifact-actions">
                      <button className="icon-btn" title="预览" onClick={() => void previewArtifact(artifact.name)}><Eye size={14} /></button>
                      <button className="icon-btn danger" title="删除" onClick={() => void deleteArtifact(artifact.name)}><Trash2 size={14} /></button>
                    </div>
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
            <span><Coins size={18} /></span>
            <div><strong>用量记录</strong><small><i />仅本机保存</small></div>
          </div>
          <button className="icon-btn" title="清空记录" onClick={() => setLog([])}><RefreshCcw size={17} /></button>
        </header>
        <div className="chat-list">
          {log.length === 0 && <p className="empty-state">还没有生成记录。选一个场景开始吧。</p>}
          {log.map((entry, index) => {
            const Icon = SCENARIO_ICONS[entry.scenario] ?? FileText;
            return (
              <article className="log-row" key={`${entry.time}-${index}`}>
                <span className="log-icon"><Icon size={15} /></span>
                <div>
                  <strong>{SCENARIOS[entry.scenario].label}</strong>
                  <small>{new Date(entry.time).toLocaleTimeString("zh-CN")}</small>
                </div>
                <div className="log-cost"><strong>{entry.totalTokens.toLocaleString()} tok</strong></div>
              </article>
            );
          })}
          <div ref={chatEnd} />
        </div>
        <div className="composer-wrap">
          <div className="balance-card wide">
            <span><KeyRound size={13} /> AI 服务</span>
            <strong>已连接</strong>
            <small>余额与充值请到 API 平台查看</small>
          </div>
          <small className="billing-hint">师座 · 你的 AI 工作台</small>
        </div>
      </aside>

      {/* 成果预览弹窗 */}
      {preview && (
        <div className="modal-backdrop" onMouseDown={() => setPreview(null)}>
          <div className="modal preview-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div><span className="section-kicker">预览</span><h2>{preview.name}</h2></div>
              <button className="icon-btn" onClick={() => setPreview(null)}><X size={17} /></button>
            </div>
            <div className="preview-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview.content}</ReactMarkdown>
            </div>
            <div className="modal-actions">
              <button onClick={() => void deleteArtifact(preview.name)}>删除</button>
              <button className="primary" onClick={() => {
                const base = preview.name.replace(/\.md$/i, "");
                window.location.href = `/api/export?format=docx&title=${encodeURIComponent(base)}&content=${encodeURIComponent(preview.content)}`;
              }}><Download size={14} />导出 Word</button>
            </div>
          </div>
        </div>
      )}

      {/* 新建/编辑自定义任务弹窗 */}
      {taskModalOpen && (
        <div className="modal-backdrop" onMouseDown={() => setTaskModalOpen(false)}>
          <div className="modal task-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div><span className="section-kicker">{editingTaskId ? "编辑任务" : "新建任务"}</span><h2>{editingTaskId ? "修改自定义任务" : "创建自定义任务"}</h2></div>
              <button className="icon-btn" onClick={() => setTaskModalOpen(false)}><X size={17} /></button>
            </div>
            <div className="task-form">
              <label>任务名称
                <input value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="如：公开课说课稿" />
              </label>
              <label>任务说明（可选）
                <input value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} placeholder="一句话说明这个任务做什么" />
              </label>
              <label>提示词（告诉 AI 怎么干，支持 Markdown）
                <textarea
                  value={taskPrompt}
                  onChange={(e) => setTaskPrompt(e.target.value)}
                  placeholder={`你是…请按以下框架生成：\n## 一、…\n## 二、…`}
                  rows={9}
                />
              </label>
              <p className="task-tip">提示词越具体，AI 输出越稳定。可参考内置场景的做法：明确角色 + 输出格式 + 要求。</p>
            </div>
            <div className="modal-actions">
              <button onClick={() => setTaskModalOpen(false)}>取消</button>
              <button className="primary" onClick={saveTask} disabled={!taskName.trim()}>保存任务</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
