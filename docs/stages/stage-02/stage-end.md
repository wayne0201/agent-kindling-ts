# Stage 2 总结

> 本阶段让 Agent 从"只会说话"进化到"能动手"——Function Calling 是 Agent 自主行动的基石。

## 六步阶梯

```
Step 1 ─── 第一次"动手"            注册工具 → 模型返回 tool_calls → 执行 → 回传
    │
    ▼
Step 2 ─── "多工具选择"            tools 数组 + tool_choice，模型自主选择
    │
    ▼
Step 3 ─── "容错与自愈"            参数校验 + 错误回传，模型基于错误重试
    │
    ▼
Step 4 ─── "流式动手"              流式 tool_calls 增量拼接，按 index 聚合
    │
    ▼
Step 5 ─── "Agent 内核"            多轮对话 + 工具调用循环，while 驱动
    │
    ▼
Step 6 ─── "实用 Agent"            天气+新闻 Agent，System Prompt 约束行为
```

每一步建立在上一层之上，**Step 6 的 `weather-news-agent.ts` 整合了前五步的全部能力**，是本阶段的终极交付物。

## 代码资产

| 文件 | 核心能力 |
|------|---------|
| `step-01/function-calling-basics.ts` | Function Calling 四步流程 + toolMap 映射 |
| `step-02/` (_shared.ts + tool-selection.ts + tool-choice-param.ts) | 多工具注册 + tool_choice 对比实验 |
| `step-03/tool-error-handling.ts` | 参数校验 + 错误回传 + 重试循环 |
| `step-04/stream-function-calling.ts` | 流式 tool_calls 增量拼接器 |
| `step-05/interactive-tool-agent.ts` | 交互式 Agent + 工具调用 while 循环 |
| `step-06/weather-news-agent.ts` | 🎯 最终交付物：天气+新闻 Agent |

## 沉淀的概念文档

| 分类 | 文档 |
|------|------|
| API 基础 | [Function Calling](../concepts/api-fundamentals/function-calling.md) |

## 三条核心认知

> **1. 模型不执行代码，只输出"调用意图"——真正的执行权永远在客户端手中。**

> **2. Function Calling 的四步流程（注册 → 决策 → 执行 → 回传）是所有 Agent 行动能力的标准范式。**

> **3. Agent 的核心循环是"观察 → 行动 → 观察"的 while 循环——Step 5 的 `processTurn()` 就是 Harness Loop 的雏形。**

## 下一阶段

**Stage 3（ReAct 思考模式）**：在"行动"前加入"思考"环节，让 Agent 能拆解复杂任务、规划多步行动、基于观察结果反思调整。从"单步反射"进化为"多步推理"。

---

← 阶段规划：[stage-begin.md](./stage-begin.md)
