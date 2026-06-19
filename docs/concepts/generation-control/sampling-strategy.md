---
concept: 采样策略与随机性
tags: [core-mechanism, sampling]
last_updated: 2026-06-19
---

# 概念：采样策略与随机性

## 📖 一句话定义

大模型生成文本时，从每个位置的概率分布中"挑选"下一个 token 的方法——贪心、top-k、top-p（核采样）、temperature 调整是四种主流策略。

## ⚙️ 深入原理

模型在每个解码步对整个词表输出一个概率分布 P(token)。采样策略决定如何从这个分布取出下一个 token：

### 1. 贪心解码（Greedy / temperature=0）
永远取概率最大的 token（argmax）。输出完全确定、可复现，但容易陷入重复循环，缺乏多样性。

### 2. Temperature 调整
用 temperature 缩放 logits 后重新归一化，改变分布形状再采样。详见 [生成参数](./generation-parameters.md)。

### 3. Top-k 采样
只保留概率最高的 k 个 token，把其余 token 概率置零后重新归一化再采样。
- 问题：k 是固定的，但分布有时很集中（只需少数候选）、有时很平坦（需要更多候选），固定 k 无法自适应。

### 4. Top-p 采样（核采样 / Nucleus Sampling）
按概率降序累加，保留累计概率达到 p 的最小候选集（"核"），其余置零后归一化采样。
- 自适应：分布集中时候选少，分布平坦时候选多，弥补了 top-k 的缺陷。
- 目前是主流默认策略之一。

### 5. Temperature + Top-p 叠加
两者正交：top-p 先裁剪候选集，temperature 再调整剩余候选的分布形状。可叠加使用，但实践中通常只调一个避免参数互相干扰。

```
原始分布 → [top_p 裁剪候选集] → [temperature 调整分布形状] → 采样
```

## 🛠️ 在 Agent 架构中的作用

- **结构化输出环节**用低随机性（贪心 / 低 temperature + 低 top_p），保证 JSON、工具调用参数格式稳定可解析。
- **推理规划环节**可适度放开随机性，避免 Agent 陷入固定思维路径，增加探索性。
- 理解采样策略有助于调参诊断：重复循环往往源于 temperature 过低 + top_p 过窄；格式混乱则可能因随机性过高。

## 🔗 相关代码落地

- [Stage 1 · Step 2 - 掌控核心参数](../stages/stage-01/step-02.md)

## 🧩 关联概念

- [生成参数 temperature / top_p / max_tokens](./generation-parameters.md)
