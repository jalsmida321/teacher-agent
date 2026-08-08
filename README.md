# 师座（TeacherDeck）· AI 教师工作台

基于 **Pi SDK**（`@earendil-works/pi-coding-agent`）和 **Next.js** 的教师 AI 工作台，
专注教师场景，覆盖 **幼教、小学、初中、高中、职教、大学** 全学段。

包含两套通道：
- **/（教师工作台）**：走 pi AgentSession，用于开发调试、工具编排
- **/billing-demo（教师AI · 自带 Key）**：客户填入自己的 `api.sublyx.org` key 即可使用，无自建支付

## 商业模式：客户自带 Key（无自建支付）

客户在 `api.sublyx.org` 注册 → 充值 → 令牌 → 新建 API key，填入本应用即可使用。
**余额、扣费、账单全在中转站**，本应用不做任何支付/余额/流水，只做「壳 + 教师场景」。

```
教师浏览器 → 填自己的 key → /api/llm (场景模板) → api.sublyx.org/v1 (客户 key)
                  └─ 返回内容 + usage(token 用量，仅展示)
```

| 文件 | 作用 |
|------|------|
| `lib/relay.ts` | 中转站直连封装（地址内置 `https://api.sublyx.org/v1`，支持客户 key 透传 + 模型列表拉取） |
| `lib/scenarios.ts` | 6 个刚需场景的专业提示词模板（产品壁垒） |
| `app/api/llm/route.ts` | 调用端点：场景 + 客户 key + 所选模型 → 中转站 → 返回内容 + usage |
| `app/api/models/route.ts` | 客户 key 拉取可用模型列表（实测 10 个） |
| `app/billing-demo/page.tsx` | 自带 Key 页面：填 key（存 localStorage）→ 自动加载模型下拉 → 选场景 → 调用 → 看 token 用量 |

关键点：
- key 只存在客户自己浏览器的 localStorage，后端不落盘、只透传
- 中转站地址内置在 `lib/relay.ts` 的 `RELAY_BASE`，客户无需填
- 实测：非流式调用必定返回准确 usage；流式（尤其带图）偶发缺失，故默认非流式 + 前端打字机效果
- 中转站未暴露余额查询接口，余额/充值引导客户到中转站网页查看

## 运行

```bash
npm install --ignore-scripts
npm run dev
```

打开 http://127.0.0.1:30300

应用默认读取 `~/.pi/agent` 中已有的 Pi 模型和认证配置。
没有可用模型时，聊天接口会进入演示模式，其余功能仍可使用。

## 核心定制点（对照"专注教师 AI 场景"）

| 定制点 | 实现位置 | 说明 |
|--------|---------|------|
| 教师系统提示词 | `app/api/chat/route.ts` → `buildSystemPrompt()` | 教师助手人格 + 当前学段/学科/年级/教材上下文 + 课标参考 |
| 教学上下文 | `lib/teacher-data.ts` | 学段/学科/年级/教材版本数据 + 6 类任务模板 + 内置课标要点 |
| 自定义工具 | `lib/teacher-tools.ts` | `curriculum_lookup`（课标查询）、`save_artifact`（保存成果到 artifacts/） |
| 安全边界 | `app/api/chat/route.ts` → `tools: teacherToolNames` | 只开放两个自定义工具，**不暴露 bash / 读写文件** |
| 教师 UI | `app/page.tsx` | 学段选择、学科/年级/教材下拉、任务模板卡片、成果工作区、对话面板 |
| 计费场景 | `lib/scenarios.ts` + `app/api/llm/route.ts` | 6 个刚需场景模板 + 直连中转站 + 客户自带 Key |

## 系统架构

```
浏览器（教师工作台 UI）
  │  SSE 流式
  ▼
Next.js API route（/api/chat）
  │  createAgentSession（Pi SDK）
  ▼
AgentSession（模型推理）
  ├─ systemPromptOverride → 教师系统提示词
  ├─ customTools → curriculum_lookup / save_artifact
  └─ tools 白名单 → 仅自定义工具（无 bash/文件工具）
```

## 路线图：从 MVP 到完整产品

- [x] **MVP**：教师工作台 + 学段/学科/年级上下文 + 教案/试卷/讲评/学情/家校/反思模板 + 成果保存
- [x] **自带 Key 模式**：客户填自己的 api.sublyx.org key 即可用，中转站地址内置，无自建支付
- [ ] **作文拍照批改**：接入视觉模型，`/api/llm` 已支持 imageDataUrl 图片输入（billing-demo 已可拍照上传）
- [ ] **题库与试卷**：接入题目数据（或自建题库文件），支持按知识点/难度抽题组卷
- [ ] **学情数据接入**：导入成绩表（Excel/CSV）→ 自动生成学情分析报告
- [ ] **多学科模板**：为语文/英语/物理/艺术等学科定制专属教案与作业模板
- [ ] **会话持久化**：用 `SessionManager.create(cwd)` 替换 in-memory，接入 pi 会话文件（可被 pi-web 读取）
- [ ] **部署**：服务端 + 反向代理 + 用户体系（参考 pi-web 的 Basic Auth / 密码方案）

## 复用参考

- 本项目的模式来自 `../ai-project-assistant`（Pi SDK + Next.js + SSE + 演示模式）
- 想要完整会话树、文件浏览、模型管理界面，可 fork `../pi-web-0.8.7`（路线 A）
- Pi SDK 文档：`node_modules/@earendil-works/pi-coding-agent/docs/sdk.md`
