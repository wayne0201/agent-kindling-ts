# Stage 3 总结

> 本阶段把 Stage 2 "能跑但说不清"的 while 循环，升级为显式状态驱动的 Harness Loop，并给 Agent 装上"真实之手"——文件读写与脚本执行。Agent 从"只会说话"进化到"能自主写码、运行、修复"。

## 六步阶梯

```
Step 1 ─── "给循环命名"           Stage 2 的隐式 while → 显式 Harness Loop（状态机 + 轨迹）
    │
    ▼
Step 2 ─── "先想再做"             ReAct 模式：Thought → Action → Observation，决策基于观察
    │
    ▼
Step 3 ─── "真实之手（读/写）"     文件工具：read_file / write_file / list_dir，路径限制防越界
    │
    ▼
Step 4 ─── "真实之手（执行）"      脚本执行：run_script，超时控制 + 输出截断
    │
    ▼
Step 5 ─── "记忆有界"             滑动窗口截断：token 估算 + 保留 system + 最近 N 条
    │
    ▼
Step 6 ─── "自主编码闭环"          整合五步：写码 → 执行 → 看报错 → 修复 → 再执行
```

每一步建立在上一层之上，**Step 6 的 `coding-agent.ts` 整合了前五步的全部能力**，是本阶段也是 Phase 1 筑基期的终极交付物。

## 代码资产

| 文件 | 核心能力 |
|------|---------|
| `step-01/harness-loop.ts` | Harness Loop 状态机（AgentState + HarnessStep + 三种终止条件） |
| `step-02/react-agent.ts` | ReAct 推理模式（对比实验：反射式 vs 先思考再行动） |
| `step-03/file-tools.ts` | 真实副作用工具：文件读写 + 路径限制（path restriction） |
| `step-04/run-script.ts` | 脚本执行工具：execFile + 超时 + 输出截断 |
| `step-05/context-window.ts` | 滑动窗口截断：token 估算 + tool_calls 配对保留 |
| `step-06/coding-agent.ts` | 🎯 最终交付物：极简自主编码 Agent |
| `demos/common/config.ts` | 统一 LLM 配置（支持 glm / deepseek 切换） |

## 沉淀的概念文档

| 分类 | 文档 |
|------|------|
| Agent 内核 | [Harness Loop](../concepts/agent-core/harness-loop.md) · [ReAct 推理模式](../concepts/agent-core/react.md) |
| API 基础（本阶段补充） | [Function Calling](../concepts/api-fundamentals/function-calling.md)（补充 `finish_reason` 踩坑 + Loop 上下文）· [多轮对话与上下文管理](../concepts/api-fundamentals/multi-turn-context.md)（补充 Agent 场景 tool 消息膨胀） |

## 三条核心认知

> **1. 我们不设计流程，我们只提供容器。** Harness Loop 里的"下一步做什么"不是写死的 `if/else`，而是 LLM 每步实时推理出来的。开发者只控制三件事：执行、回传、判断是否停。这是 Agent 编程与传统编程的本质区别。

> **2. Prompt 决定模型"会不会先想"，Loop 决定模型"能不能想多轮"——两者缺一不可。** ReAct 不是"写好提示词就行"，它是上层策略（Prompt）+ 下层基础设施（Loop）的组合。骨架不变，换工具集即可扩展能力。

> **3. 上下文是有界的，记忆是有代价的。** Agent 的 tool 消息（尤其脚本 stdout）膨胀最快，滑动窗口截断保住了"继续运行"，但代价是丢失早期记忆——这正是 Stage 4 RAG 要解决的外部记忆问题。

## 关键工程经验

- **`finish_reason: "stop"` 不等于任务完成**——判断 `done` 的可靠依据是 `tool_calls` 是否为空
- **"沙箱"措辞要诚实**：本阶段的 `workspace/` 只是路径限制（防 `../` 穿越），不是进程级隔离。符号链接、TOCTOU 竞态均可绕过。真正的容器级沙箱是 Stage 11 的主题
- **`execFile` 而非 `exec`**：避免 shell 注入，参数以数组传递不被 shell 解析
- **截断不能打破 tool_calls / tool 配对**：孤立的 tool 消息会让 API 报 400，截断后需扫描清理

## 下一阶段

**Stage 4（RAG 检索增强）**：Stage 3 暴露了一个问题——滑动窗口截断后 Agent 忘了早期信息。Stage 4 引入向量数据库与检索，让 Agent 能从外部记忆中"召回"相关信息，突破上下文窗口的硬上限。从"易失的工作记忆"走向"可检索的长期记忆"。

---

← 阶段规划：[stage-begin.md](./stage-begin.md)
