---
concept: 生成参数 temperature / top_p / max_tokens
tags: [api-basics, parameters, core-mechanism]
last_updated: 2026-06-19
---

# 概念：生成参数 temperature / top_p / max_tokens

## 📖 一句话定义

Chat Completion API 中控制输出"随机性"与"长度"的三个核心参数：`temperature` 调整概率分布的陡峭程度，`top_p` 动态裁剪候选集，`max_tokens` 硬性截断输出长度。

## ⚙️ 深入原理

大模型在每个位置并非给出唯一答案，而是对词表所有 token 输出一个**概率分布**。生成参数控制如何从这个分布中"挑"出下一个 token。

### temperature（温度）
将原始 logits 除以 temperature 后再 softmax。temperature 趋近 0 时，最大概率 token 的相对优势被放大，分布变"尖"，几乎总是选最高概率项（贪心）；temperature 增大时分布变"平"，低概率 token 也有机会被选中，输出更发散。
- 范围通常 0~2。
- `temperature=0` 等价于贪心解码（严格取 argmax）。
- 适用场景：代码生成/抽取任务用低值（0~0.3），创意写作/头脑风暴用高值（0.7~1.2）。

### top_p（核采样 / Nucleus Sampling）
不改变概率分布形状，而是**截断候选集**：把 token 按概率从高到低累加，只保留累计概率达到 p 的最小集合，其余长尾 token 直接排除，再在保留的集合中按概率采样。
- `top_p=0.1`：候选极窄，趋近贪心。
- `top_p=0.9`：保留大部分合理候选，保留多样性。
- 与 temperature 正交：top_p 先裁剪候选集，temperature 再在剩余候选中调整分布。实践中通常只调其一，另一个保持默认。

### max_tokens
限制**输出侧**的最大 token 数。一旦生成达到上限即停止，`finish_reason` 置为 `length`（区别于自然结束的 `stop`）。
- 是成本控制的硬手段：token 直接计费。
- 注意它只管输出，不管输入；输入受模型上下文窗口限制（见 [Token 与上下文窗口](./token-and-context-window.md)）。

## 🛠️ 在 Agent 架构中的作用

- **确定性 vs 创造性**：Agent 中工具调用、JSON 结构化输出需要低 temperature（保证格式稳定）；而规划、头脑风暴环节可适当提高。同一个 Agent 不同步骤可用不同参数。
- **成本与完整性**：`max_tokens` 过小会导致关键输出被截断（如 JSON 不闭合解析失败），生产环境需结合 `finish_reason` 判断是否重试或续写。
- **防幻觉**：低 temperature + 低 top_p 能降低随机"胡说"概率，但并非根治，仍需 RAG / 约束解码等手段。

## 🔗 相关代码落地

- [Stage 1 · Step 2 - 掌控核心参数](../stages/stage-01/step-02.md)

## 🧩 关联概念

- [采样策略与随机性](./sampling-strategy.md)
- [Token 与上下文窗口](./token-and-context-window.md)
