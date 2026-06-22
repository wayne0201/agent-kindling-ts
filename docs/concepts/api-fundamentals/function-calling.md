---
concept: Function Calling
tags: [function-calling, tool-use, core-mechanism]
last_updated: 2026-06-19
---

# 概念：Function Calling

## 📖 一句话定义

Function Calling 是 Chat Completion API 的能力，让模型在对话中"调用"客户端预定义的工具函数——模型决定调用哪个工具、传什么参数，客户端执行后将结果回传，模型基于结果继续生成回复。

## ⚙️ 深入原理

### 四步流程

```
① 客户端注册工具          ② 模型决定调用
   (tools 参数)    ───→     (返回 tool_calls)
                              │
                              ▼
④ 模型生成最终回复  ←───  ③ 客户端执行工具
   (基于工具结果)           (role: "tool" 回传)
```

### 第①步：注册工具

在请求的 `tools` 参数中声明可用工具：

```typescript
tools: [{
  type: 'function',
  function: {
    name: 'get_weather',           // 函数名
    description: '获取城市天气',    // 模型据此判断何时调用
    parameters: {                  // JSON Schema 描述参数
      type: 'object',
      properties: {
        city: { type: 'string', description: '城市名' }
      },
      required: ['city']
    }
  }
}]
```

**关键**：`description` 是模型选择工具的依据，写得好模型选得准。

### 第②步：模型返回 tool_calls

模型决定调用工具时，`finish_reason` 为 `"stop"`，`message.tool_calls` 数组包含调用信息：

```typescript
{
  finish_reason: 'stop',
  message: {
    role: 'assistant',
    tool_calls: [{
      id: 'call_abc123',           // 调用标识，回传时需对应
      type: 'function',
      function: {
        name: 'get_weather',
        arguments: '{"city":"北京"}'  // JSON 字符串，需 JSON.parse()
      }
    }]
  }
}
```

**注意 1**：`arguments` 是 **JSON 字符串**，不是对象，必须 `JSON.parse()` 解析。

**注意 2（重要踩坑）**：`finish_reason: "stop"` **不等于任务完成**——它只表示"模型此轮推理结束"。在工具调用场景下，`"stop"` 意味着"模型本轮决定调用工具，等你回传结果后再继续"，而不是"模型已经答完了"。判断任务是否完成的可靠信号是**检查 `message.tool_calls` 是否为空**：无 `tool_calls` + 有 `content` = 任务完成；有 `tool_calls` = 还需要继续循环。这是 Harness Loop 终止条件设计的核心依据。

### 第③步：客户端执行工具

客户端根据 `name` 查找对应函数，解析 `arguments`，执行后将结果以 `role: "tool"` 回传：

```typescript
messages.push({
  role: 'tool',
  tool_call_id: 'call_abc123',    // 必须与 tool_calls 中的 id 对应
  content: '{"city":"北京","temp":"28°C","condition":"晴"}'
});
```

**关键**：`tool_call_id` 是关联工具调用与结果的纽带，必须严格对应。

### 第④步：模型生成最终回复

将追加了 `tool` 消息的 `messages` 再次发送给模型，模型基于工具结果生成自然语言回复。

### tool_choice 参数

控制模型是否/如何调用工具：

| 值 | 含义 |
|---|---|
| `"auto"`（默认） | 模型自主决定是否调用工具 |
| `"required"` | 强制模型调用至少一个工具 |
| `"none"` | 禁止模型调用工具 |
| `{"type": "function", "function": {"name": "xxx"}}` | 强制调用指定工具 |

### 模型"不执行"工具

**核心认知**：模型不执行任何代码。它只是输出"我想调用 get_weather，参数是 {city: '北京'}"这个意图。真正的执行由客户端完成。这是安全设计——模型永远不能直接操作你的系统。

## 🛠️ 在 Agent 架构中的作用

- **Agent 行动能力的核心**：Stage 1 的 Agent 只会"说话"，Function Calling 让 Agent 能"做事"——查天气、搜新闻、操作数据库。
- **Harness Loop 的"行动"环节**：Agent 的核心循环是"观察 → 思考 → 行动"，Function Calling 对应"行动"——模型决定做什么，客户端执行。但单次 Function Calling 只能走一步，要实现多步自主循环（调用工具 → 看结果 → 再决定），需要 Harness Loop（软件层面的 while 循环）提供多轮执行能力。
- **ReAct 模式的基础**：推理（Reasoning）+ 行动（Acting），Function Calling 是"行动"的标准实现方式。ReAct 模式通过 Prompt 让模型先输出 Thought 再触发 tool_calls（Action），Loop 提供多轮 Thought→Action→Observation 的循环能力。

## 🔗 相关代码落地

- [Stage 2 · Step 1 - Function Calling 初体验](../stages/stage-02/step-01.md)
- [Stage 3 · Step 3 - 文件操作工具集](../stages/stage-03/step-03.md)（真实副作用工具的 Function Calling 落地）
- [Stage 3 · Step 4 - 脚本执行工具](../stages/stage-03/step-04.md)（异步工具的 Function Calling 落地）

## 🧩 关联概念

- [消息角色 (role)](./message-roles.md)（`role: "tool"` 是 Function Calling 新增的角色）
- [Chat Completion API](./chat-completion-api.md)（Function Calling 是该 API 的扩展能力）
- [System Prompt 与结构化输出](./system-prompt-and-structured-output.md)（工具参数是结构化输出的应用）
