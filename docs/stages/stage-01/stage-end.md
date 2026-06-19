# Stage 1 总结

> 本阶段是「撕掉框架面具、手写 Agent 内核」的起点。

## 六步阶梯

```
Step 1 ─── 第一次"说话"              调用 API，配置环境，看到模型回复
    │
    ▼
Step 2 ─── 控制"怎么说"              temperature / top_p / max_tokens 如何影响输出
    │
    ▼
Step 3 ─── "打字机"体验              stream: true + SSE，逐字流式输出
    │
    ▼
Step 4 ─── 让模型"听话"              System Prompt 设定人格 + XML/JSON 结构化解锁可编程性
    │
    ▼
Step 5 ─── 打破"失忆"               messages 数组 = 手动记忆，LLM 无状态的本质
    │
    ▼
Step 6 ─── 记忆"落地"               fs + chat_history.json，跨重启持久化
```

每一步建立在上一层之上，**Step 6 的 `persistent-chat.ts` 整合了前五步的全部能力**，是本阶段的终极交付物。

## 代码资产

| 文件 | 核心能力 |
|------|---------|
| `step-01/hello-glm.ts` | OpenAI SDK + 兼容协议 + 防呆配置 |
| `step-02/core-params.ts` | 参数对比实验（温度 / 核采样 / 截断） |
| `step-03/stream-chat.ts` | 流式输出 + 打字机效果 |
| `step-04/structured-output.ts` | XML / JSON 结构化提取 |
| `step-05/multi-turn-chat.ts` | 交互式多轮对话 + token 统计 |
| `step-06/persistent-chat.ts` | 🎯 最终交付物：持久化对话助手 |
| `common/config.ts` | 统一 LLM 配置（支持 glm / deepseek 切换） |

## 沉淀的概念文档

| 分类 | 文档 |
|------|------|
| API 基础 | [Chat Completion API](../concepts/api-fundamentals/chat-completion-api.md) · [消息角色](../concepts/api-fundamentals/message-roles.md) · [流式输出与 SSE](../concepts/api-fundamentals/streaming-and-sse.md) · [OpenAI 兼容协议](../concepts/api-fundamentals/openai-compatible-protocol.md) · [System Prompt 与结构化输出](../concepts/api-fundamentals/system-prompt-and-structured-output.md) · [多轮对话与上下文管理](../concepts/api-fundamentals/multi-turn-context.md) |
| 生成控制 | [生成参数](../concepts/generation-control/generation-parameters.md) · [采样策略与随机性](../concepts/generation-control/sampling-strategy.md) · [Token 与上下文窗口](../concepts/generation-control/token-and-context-window.md) |
| 工程实践 | [环境变量与防呆设计](../concepts/engineering-practice/env-and-fail-fast.md) · [对话持久化](../concepts/engineering-practice/chat-persistence.md) |

## 三条核心认知

> **1. LLM 就是一个函数：`messages → response`，无状态、无记忆、无魔法。**

> **2. 一切你感知到的"智能行为"——记忆、推理、工具调用——都是 *你* 在代码里编排的，LLM 只负责输入转输出。**

> **3. 从 `hello-glm.ts` 到 `persistent-chat.ts`，难度递增的不是 LLM 用法的复杂度，而是 *你管理状态的能力*。**

## 下一阶段

**Stage 2（Function Calling）**：让模型能调用你的函数（查天气、搜新闻），补上 Harness Loop 的"执行动作"环节。

---

← 阶段规划：[stage-begin.md](./stage-begin.md)
