# 师座（TeacherDeck）· 教师自己的 AI 工作台

> 像 Codex 之于程序员，师座之于教师：填上你的 API Key，AI 帮你**批改作文、写期末评语、出试卷、做成绩分析、写教学反思、家校沟通**，成果可直接导出 Word / Excel / PDF。

- 技术栈：**Next.js 16 + Pi SDK（`@earendil-works/pi-coding-agent`）+ React 19**
- 覆盖学段：幼教、小学、初中、高中、职教、大学
- 商业模式：**BYOK**（客户自带 api.sublyx.org Key，无自建支付）

---

## 快速开始

```bash
npm install --ignore-scripts
npm run dev
```

打开 **http://127.0.0.1:30300/**（根路径自动跳转到主页面）

> ⚠️ 注意：需在 `NODE_ENV=development` 下安装（生产模式 npm 会跳过 devDependencies 导致缺 typescript）。
> 本机若 `NODE_ENV=production`，请先 `NODE_ENV=development npm install`。

### 使用三步

1. 左侧「连接 AI」填入你在 **api.sublyx.org** 创建的 Key（点「如何获取 Key」有直达链接引导）
2. 选一个**工作场景**（内置 5 个）或**自定义任务**（自建提示词）
3. 填内容 / 上传附件 → 「开始生成」→ 结果可预览、导出、保存

---

## 功能总览

| 模块 | 说明 | 位置 |
|------|------|------|
| **场景工作台** | 5 个内置刚需场景（作文批改/期末评语/出题组卷/教学反思/家校沟通），每场景 = 专业提示词 | `lib/scenarios.ts` |
| **自定义任务** | 用户自建任务（名称+提示词），持久化 localStorage，可编辑/删除；附 2 个教师示例 | `app/billing-demo/page.tsx` |
| **附件上传** | 图片→视觉多模态；Word(.docx)/PDF/Excel(.xlsx)/文本→服务端解析喂模型 | `lib/file-parse.ts` |
| **多格式导出** | 生成结果导出 Word(.docx)/Excel(.xlsx)/PDF/Markdown | `lib/export.ts` + `app/api/export/route.ts` |
| **成果资料库** | 已保存成果列表、Markdown 预览、下载、删除 | `app/api/artifacts/route.ts` |
| **模型选择** | 保存 Key 后自动拉取客户可用模型列表，下拉选择 | `app/api/models/route.ts` |
| **用量展示** | 每次调用显示 token 用量（费用以平台账单为准） | `app/billing-demo/page.tsx` |

---

## 系统架构

生产通道走 **pi SDK（AgentSession）**：思考 + 工具调用 + 附件解析。

```
浏览器（教师工作台 /billing-demo）
  │  multipart 上传 + SSE 流式
  ▼
/api/llm（Next.js Node 运行时）
  ├─ 附件解析（图片/Word/PDF/Excel/文本）
  ├─ createPiSession（pi SDK）
  │    ├─ 动态注册中转站 provider（客户 Key + 模型列表）
  │    ├─ 场景/自定义提示词 → systemPromptOverride
  │    ├─ 思考（thinkingLevel）+ 工具（curriculum_lookup / save_artifact）
  │    └─ usage 提取（token 用量）
  ▼
api.sublyx.org（客户 Key）→ 上游模型（gpt-5.x / deepseek …）
```

### 关键文件

| 文件 | 作用 |
|------|------|
| `lib/relay-session.ts` | **pi SDK 会话封装**：动态注册中转站 provider + AgentSession + 思考/工具/图片/usage |
| `lib/relay.ts` | 中转站直连客户端（`RELAY_BASE` 内置、`listModels` 拉模型、`resolveApiKey` 客户 Key 透传） |
| `lib/scenarios.ts` | 5 个刚需场景的专业提示词模板（产品壁垒） |
| `lib/teacher-tools.ts` | 自定义 Pi 工具：`curriculum_lookup`（课标查询）、`save_artifact`（保存成果） |
| `lib/file-parse.ts` | 附件解析：图片/Word/PDF/Excel/文本 → 可喂模型的内容 |
| `lib/export.ts` | 成果导出：Markdown → docx / xlsx / pdf / md（内置楷体字体） |
| `lib/paths.ts` | 路径配置：`ARTIFACTS_DIR`（成果目录，可用环境变量覆盖） |
| `app/api/llm/route.ts` | 生产调用端点（multipart 上传 + SSE：思考/文本/工具/usage） |
| `app/api/export/route.ts` | 导出端点（docx/xlsx/pdf/md 文件下载） |
| `app/api/models/route.ts` | 客户 Key 拉取可用模型列表 |
| `app/api/artifacts/route.ts` | 成果列表 / 内容预览 / 删除 |
| `app/api/chat/route.ts` | ⚠️ 旧版开发调试通道（Pi AgentSession 全工具），生产不用 |
| `app/billing-demo/page.tsx` | **主页面**：Key 管理 + 场景/自定义任务 + 输入/附件 + 生成 + 导出 + 成果库 |
| `app/page.tsx` | 根路径 → 重定向到主页面 |

---

## 部署

详见 **`docs/cloudflare-setup.md`** 与 **`deploy/`** 脚本。

**重要**：师座**不能**部署到 Cloudflare Pages/Workers（pi SDK + 文件系统需要真实 Node 运行时）。
正确组合：**Cloudflare 只做域名/DNS/HTTPS/CDN 门面，应用本体跑在海外 VPS（Node + PM2）**。

```bash
# 服务器上一键部署
bash deploy/setup.sh https://github.com/<你>/shizuo.git teacherdeck.org

# 后续更新
bash deploy/update.sh
```

| 部署项 | 说明 |
|--------|------|
| 环境变量 | `ARTIFACTS_DIR`（成果目录）、`SUBLYX_API_KEY`（可选，开发用）、`PORT`（默认 3000），见 `.env.example` |
| 依赖 | Next.js 16 / Node 22+ / Pi SDK 0.84 / mammoth / pdf-parse / xlsx / docx / pdfkit |
| 生产验证 | `npm run build` + `next start` 已实测通过（页面/API/导出全 200） |
| 数据目录 | 成果存 `ARTIFACTS_DIR`（生产建议 `/var/data/shizuo/artifacts`，不随代码进 git） |

---

## 路线图

- [x] **MVP**：5 场景 + 自定义任务 + BYOK + 附件解析 + 多格式导出 + 成果库
- [x] **生产通道 pi SDK**：思考 + 工具调用 + 图片识别 + usage
- [x] **部署改造**：路径环境变量化 + .gitignore + 一键部署脚本 + Cloudflare 接入文档
- [ ] **成绩分析场景**（`analysis`，方案 A）：成绩 Excel → 学情报告（附件解析已就绪）
- [ ] **作文拍照批改实测**（视觉模型 gpt-5.6-sol/terra 质量对比）
- [ ] **题库与试卷**：接入题目数据，按知识点/难度抽题组卷
- [ ] **会话持久化**：`SessionManager.create` 替换 in-memory（可被 pi-web 读取）
- [ ] **多用户**：登录注册 + Key 绑定（加密存服务端）
- [ ] **Electron 桌面版**：解锁「在文件浏览器中打开」（评估见 `docs/electron-eval.md`）

---

## 技术要点（实测）

- **pi SDK 动态注册中转站**：每请求 `modelRuntime.registerProvider("relay", { baseUrl, apiKey: 客户Key, models })` + 等 refresh，模型/Key 请求私有互不污染
- **注册模型必须带 cost**：缺 cost 时工具调用路径 `calculateCost` 访问 `model.cost.tiers` 崩溃
- **图片格式**：pi 用 `{type:"image", data, mimeType}`（base64），不是 OpenAI 的 `image_url`
- **PDF 中文**：内置楷体 `assets/fonts/kaiti.ttf`（跨平台部署可用），系统字体兜底；pdfkit 不支持 .ttc
- **附件解析**：pdf-parse v2 用 `new PDFParse({data}).getText()` 类 API

## 复用参考

- 项目模式来自 `../ai-project-assistant`（Pi SDK + Next.js + SSE）
- 界面参考 pi-web 布局（会话列表式自定义任务）
- Pi SDK 文档：`node_modules/@earendil-works/pi-coding-agent/docs/sdk.md`
