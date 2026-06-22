# 🪵 Agent Kindling TS

> "星火燎原" —— 一个从 0 到 1 走向 AI Agent 工程师的 TypeScript 实战仓库。

本项目旨在通过循序渐进的代码实践，深入理解大模型通信协议、Agent 核心机制以及工程化落地。使用 TypeScript 进行全栈开发，通过 OpenAI 兼容协议接入智谱 GLM / DeepSeek 等模型。

## 🚀 Agent 工程师突围计划

### 一、 核心学习方向规划

攻克四大技术支柱，这是区分"调包侠"和"Agent工程师"的分水岭：

- **底层原理与交互**：LLM 运行机制、Prompt 工程、上下文窗口管理、Harness Loop（执行控制循环）。
- **核心组件与能力**：Function Calling（工具调用）、ReAct 推理模式、短期与长期记忆机制、Skills（技能编排与 SOP 封装）。
- **架构范式**：RAG 检索增强生成、多智能体协作编排、Plan-and-Execute 规划执行。
- **工程化与生态**：异步并发架构、可观测性、安全降级、MCP (Model Context Protocol) 协议生态。

### 二、 12 阶段全景路线图

| 阶段 | 主题 | 关键交付物 |
|------|------|-----------|
| **Phase 1: 筑基期 (手写内核)** | Stage 1: API与Prompt工程 | 具备上下文持久化的多轮对话助手 |
| | Stage 2: Function Calling | 带工具调用的 Agent（能查天气/搜新闻） |
| | Stage 3: Harness Loop (基础版) | "极简自主编码 Agent"，能自主创建并执行本地脚本 |
| **Phase 2: 进阶期 (框架与引擎)** | Stage 4: RAG 基础架构 | 基于本地 PDF 的语义问答脚本 |
| | Stage 5: 高级 RAG 与 Skills编排 | 引入重排序与查询重写，准确率提升 30% 的 RAG 引擎 |
| | Stage 6: LangGraph 状态图实战 | 能在闲聊、查库、查数据库间自主路由的 Web 应用 |
| **Phase 3: 深水区 (协作与生态)** | Stage 7: 多 Agent 角色编排 | 用 CrewAI 搭建的"文案三人组"系统 |
| | Stage 8: MCP 协议开发实战 | 开发自定义 MCP Server，并让 Claude Code 成功调用 |
| | Stage 9: 长程规划与反思机制 | "全栈研发流水线 Agent"，规划-开发-测试全自动 |
| **Phase 4: 生产级 (工程化交付)** | Stage 10: 可观测性与成本控制 | 带完整 Trace 面板的 Agent 系统 |
| | Stage 11: Harness Loop (生产版) | 支持异步任务队列的 Agent API 服务 |
| | Stage 12: 开源与总结复盘 | GitHub 开源项目 + 技术博客 |

### 三、 详细阶段拆解与交付物

#### Phase 1: 筑基期 —— 撕掉框架面具，手写 Agent 内核 (Stage 1-3)

- **目标**：不依赖任何重框架，用最基础的代码跑通 Agent 的核心逻辑。
- **Stage 1**：吃透 API 与 Prompt。交付物：具备上下文持久化的多轮对话助手。
- **Stage 2**：解锁 Function Calling。交付物：带工具调用的 Agent（能查天气/搜新闻）。
- **Stage 3 (关键)**：手撕 Harness Loop（基础版）。理解 状态->LLM->解析->执行 循环。交付物："极简自主编码 Agent"，能自主创建并执行本地脚本。

#### Phase 2: 进阶期 —— 掌握框架与 RAG 引擎 (Stage 4-6)

- **目标**：攻克企业级应用的核心痛点——私域知识与工作流编排。
- **Stage 4**：向量检索与 RAG 基础。交付物：基于本地 PDF 的语义问答脚本。
- **Stage 5 (关键)**：高级 RAG 与 Skills（技能封装）。将复杂工作流打包为 SOP。交付物：引入重排序与查询重写，准确率提升 30% 的 RAG 引擎。
- **Stage 6**：LangGraph 状态图框架。交付物：能在闲聊、查库、查数据库间自主路由的 Web 应用。

#### Phase 3: 深水区 —— 多 Agent 协作与协议生态 (Stage 7-9)

- **目标**：从单打独斗走向团队协作，接入标准化协议生态。
- **Stage 7**：多 Agent 角色编排。交付物：用 CrewAI 搭建的"文案三人组"系统。
- **Stage 8 (关键)**：理解并实践 MCP 协议。交付物：开发自定义 MCP Server（如连接内部数据库），并让 Claude Code 成功调用。
- **Stage 9**：长程任务规划与反思。交付物："全栈研发流水线 Agent"，规划-开发-测试全自动。

#### Phase 4: 生产级 —— 工程化、可观测与开源 (Stage 10-12)

- **目标**：让 Agent 能在真实环境中稳定运行，建立个人技术影响力。
- **Stage 10**：可观测性与成本控制（LangSmith 接入）。交付物：带完整 Trace 面板的 Agent 系统。
- **Stage 11 (关键)**：异步架构与 Harness Loop（生产级加固，加沙箱/熔断）。交付物：支持异步任务队列的 Agent API 服务。
- **Stage 12**：开源与复盘。交付物：GitHub 开源项目 + 技术博客。

### 四、 保证目标达成的辅助措施

- **模型降本**：使用智谱 GLM 兼容协议配置 Claude Code 作为日常辅助。
- **费曼学习法**：每学完一个硬核概念（如 MCP、Harness），强制写一篇"降维解释"博客。
- **破坏性测试**：每周花 1 小时进行 Prompt 注入攻击，训练防御加固能力。
- **控制上下文爆炸**：从 Stage 3 起，强制实现"历史对话滑动窗口截断"机制。

---

## 📂 阶段计划索引

> 每个阶段拆分两个核心文档：`stage-begin.md`（规划与环节清单）和 `stage-end.md`（总结与复盘），统一维护在 `docs/stages/` 下。模板详见 `docs/_templates/stage-begin-template.md` 和 `stage-end-template.md`。

| 阶段 | 主题 | 阶段总纲 |
|------|------|----------|
| Stage 1 | API 与 Prompt 工程 | [规划](./docs/stages/stage-01/stage-begin.md) · [总结](./docs/stages/stage-01/stage-end.md) |
| Stage 2 | Function Calling | [规划](./docs/stages/stage-02/stage-begin.md) · [总结](./docs/stages/stage-02/stage-end.md) |
| Stage 3 | Harness Loop（基础版） | [规划](./docs/stages/stage-03/stage-begin.md) · [总结](./docs/stages/stage-03/stage-end.md) |
| Stage 4-12 | 待推进 | — |

---

## 🛠️ 技术栈

- **语言**: TypeScript (ES Module)
- **包管理**: pnpm
- **运行环境**: Node.js + tsx
- **LLM SDK**: OpenAI SDK (兼容协议接入多模型)
- **代码规范**: ESLint + Prettier + EditorConfig

## 📁 项目结构

```
agent-kindling-ts/
├── docs/                          # 📚 知识库与文档沉淀区
│   ├── _templates/                # 📐 文档规范模板 (供 AI 学习参照)
│   │   ├── stage-begin-template.md   # 📋 阶段规划模板
│   │   ├── stage-end-template.md     # 📋 阶段总结模板
│   │   ├── step-template.md        # 📝 环节学习记录模板
│   │   └── concept-template.md    # 🧠 概念字典模板
│   ├── concepts/                  # 🧠 知识点概念字典 (持久沉淀)
│   └── stages/                    # 📂 各阶段文档 (按阶段子目录组织)
│       ├── stage-01/
│       │   ├── stage-begin.md      # 📋 阶段规划 (目标 / 环节清单 / 验收标准)
│       │   ├── stage-end.md        # 🔄 阶段总结 (学习路径 / 代码资产 / 核心认知)
│       │   └── step-01.md ~ step-06.md
│       ├── stage-02/
│       │   ├── stage-begin.md
│       │   ├── stage-end.md
│       │   └── step-01.md ~ step-06.md
│       └── stage-03/
│           ├── stage-begin.md
│           └── step-01.md ~ step-06.md
├── demos/                         # 💻 代码实战区 (按阶段划分)
│   ├── common/
│   │   └── config.ts              # ⚙️ 统一 LLM 配置 (支持 glm / deepseek 切换)
│   ├── stage-01/
│   │   ├── step-01/hello-glm.ts
│   │   ├── step-02/core-params.ts
│   │   ├── step-03/stream-chat.ts
│   │   ├── step-04/structured-output.ts
│   │   ├── step-05/multi-turn-chat.ts
│   │   └── step-06/persistent-chat.ts
│   ├── stage-02/
│   │   ├── step-01/function-calling-basics.ts
│   │   ├── step-02/_shared.ts + tool-selection.ts + tool-choice-param.ts
│   │   ├── step-03/tool-error-handling.ts
│   │   ├── step-04/stream-function-calling.ts
│   │   ├── step-05/interactive-tool-agent.ts
│   │   └── step-06/weather-news-agent.ts
│   └── stage-03/
│       ├── workspace/             # 📁 Agent 沙箱工作目录 (文件/脚本操作的真实落点)
│       ├── step-01/harness-loop.ts
│       ├── step-02/react-agent.ts
│       ├── step-03/file-tools.ts
│       ├── step-04/run-script.ts
│       ├── step-05/context-window.ts
│       └── step-06/coding-agent.ts
├── .env                           # 🔑 环境变量 (含 API Key，已忽略)
├── package.json
└── tsconfig.json
```

## 🚀 快速开始

1. 安装依赖: `pnpm install`
2. 配置环境变量: `cp .env.example .env` 并填入 API Key（支持智谱 GLM / DeepSeek）
3. 运行任意一个环节的 Demo: `pnpm dev demos/stage-01/step-01/hello-glm.ts`
