# Stage 1 · Phase 1 筑基期 —— 吃透 API 与 Prompt

> 本阶段是「撕掉框架面具、手写 Agent 内核」的起点。

## 🎯 阶段目标

抛弃所有重框架，用**原生 TypeScript** 调用智谱 GLM API，深刻理解大模型的输入输出机制，并完成第一个具备状态管理的对话程序。

- 吃透 Chat Completion API 的基本结构（`messages` 列表、`role` 类型）。
- 掌控核心生成参数（`temperature` / `top_p` / `max_tokens`）。
- 理解流式输出（SSE）、System Prompt 人格设定与结构化输出。
- 理解大模型的无状态特性，用代码构造「多轮上下文」。
- 落地一个跨重启仍能保持记忆的持久化对话助手。

## 📋 环节清单

| 环节 | 主题 | 验收标准 | 代码 / 文档 |
|------|------|----------|-------------|
| **Step 1** ✅ | 环境破冰与初次调用 | 终端成功输出模型的回复，并打印 Token 消耗 | [code](../../demos/stage-01/step-01/hello-glm.ts) · [doc](./step-01.md) |
| **Step 2** ✅ | 掌控核心参数（`temperature`/`top_p`/`max_tokens`） | 能用自己的话解释三个参数的区别 | [code](../../demos/stage-01/step-02/core-params.ts) · [doc](./step-02.md) |
| **Step 3** ✅ | 流式输出的艺术（SSE 打字机） | 正确处理 chunk 数据拼接，不漏字 | [code](../../demos/stage-01/step-03/stream-chat.ts) · [doc](./step-03.md) |
| **Step 4** ✅ | System Prompt 与结构化输出 | 模型严格遵守 XML/JSON 格式，代码成功提取字段 | [code](../../demos/stage-01/step-04/structured-output.ts) · [doc](./step-04.md) |
| Step 5 | 上下文管理（多轮对话基础） | 程序能记住上一句话的上下文（代词指代正确） | — |
| Step 6 | 持久化对话助手（`chat_history.json` + `/clear`） | 跨进程重启后依然保持记忆，代码提交至仓库 | — |

> ✅ 表示已实现；其余环节待后续逐步补全。

## 📝 各环节要点速览

### Step 1：环境破冰与初次调用
- **学习**：了解 Chat Completion API 的基本结构（`messages` 列表、`role` 类型）。
- **任务**：配置 Node.js 环境，使用 openai 兼容 SDK。写出第一行代码：向 GLM 发送请求，并打印返回结果。
- **验收**：终端成功输出模型的回复。

### Step 2：掌控核心参数
- **学习**：深入理解 `temperature`、`top_p`、`max_tokens` 对生成结果的影响。
- **任务**：编写测试脚本，用相同 Prompt，分别用 `temperature=0.1` 和 `0.9` 请求 5 次，观察差异。
- **验收**：能用自己的话解释参数区别。

### Step 3：流式输出的艺术
- **学习**：理解 Server-Sent Events (SSE)，掌握 `stream: true` 参数。
- **任务**：改造 Step 1 代码，使用流式请求，实现终端「打字机」效果逐字打印。
- **验收**：正确处理 chunk 数据拼接，不漏字。

### Step 4：System Prompt 与结构化输出
- **学习**：System Prompt 的人格设定，利用 XML 或 JSON 标签约束输出格式。
- **任务**：设定毒舌审查员 Prompt，要求输出 `<评价>...</评价><修改建议>...</修改建议>`，并用代码解析提取。
- **验收**：模型严格遵守格式，代码成功提取字段。

### Step 5：上下文管理（多轮对话基础）
- **学习**：理解大模型无状态特性，记忆的本质是重发历史对话。
- **任务**：维护一个 TypeScript 数组 `messages`，编写 `while(true)` 循环接收输入，追加并调用 API。
- **验收**：程序能记住上一句话的上下文（代词指代正确）。

### Step 6：交付物开发 —— 持久化对话助手
- **目标**：解决重启即失忆问题。
- **任务**：引入 `fs` 模块，每次对话后将 `messages` 序列化保存到 `chat_history.json`。启动时检查并加载历史记录。实现 `/clear` 指令。
- **验收**：跨进程重启后依然保持记忆，代码提交至仓库。

---

← 返回 [项目总览](../../README.md)
