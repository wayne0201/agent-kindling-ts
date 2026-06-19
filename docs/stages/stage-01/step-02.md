---
title: 掌控核心参数
date: 2026-06-19
stage: 1
step: 2
tags: [api-basics, sampling, parameters]
status: done
related_demo: ../../demos/stage-01/step-02/core-params.ts
---

# Step 2: 掌控核心参数

## 🎯 本环节目标

深入理解 `temperature`、`top_p`、`max_tokens` 三个核心生成参数对输出结果的影响。通过控制变量实验，直观感受随机性与确定性的权衡，并理解参数背后的采样原理。

## 💡 核心原理速记

- **temperature（温度）**：控制采样的随机性。值越低输出越确定、重复；值越高越发散、多样。范围通常 0~2，0 等价于贪心解码。详见 [生成参数](../../concepts/generation-control/generation-parameters.md)。
- **top_p（核采样）**：从概率累积达 p 的候选 token 中采样，动态裁剪长尾低概率选项。与 temperature 正交，可叠加使用。详见 [采样策略与随机性](../../concepts/generation-control/sampling-strategy.md)。
- **max_tokens**：硬性限制输出的最大 token 数。超出则输出被截断，`finish_reason` 标记为 `length`。详见 [Token 与上下文窗口](../../concepts/generation-control/token-and-context-window.md)。
- **控制变量法**：对比参数影响时，固定 Prompt、固定其他参数，只变一个变量，才能归因。

## 💻 落地内容与代码

**代码实现**: [demos/stage-01/step-02/core-params.ts](../../demos/stage-01/step-02/core-params.ts)

**核心逻辑简述**:
1. 定义固定的 `messages`（system + user），刻意选用开放性 Prompt（"描述夜晚的星空"）以放大参数差异。
2. 实验 1：用 `temperature=0.1` 和 `temperature=0.9` 各请求 5 次，`Promise.all` 并行执行。
3. 打印每条回复，并统计去重数量——低 temperature 趋于重复，高 temperature 趋于多样。
4. 实验 2：设 `max_tokens=15` 请求一个本应很长的回答，观察输出被生硬截断，`finish_reason` 变为 `length`。

**代码亮点**:
- 用 `Set` 去重量化"多样性"，把主观感受变成可比较的数字。
- 检查 `finish_reason` 区分"自然结束"（`stop`）与"被截断"（`length`），这是生产环境判断输出完整性的关键。

## 🧠 相关知识点沉淀

- [生成参数 temperature / top_p / max_tokens](../../concepts/generation-control/generation-parameters.md)
- [采样策略与随机性](../../concepts/generation-control/sampling-strategy.md)
- [Token 与上下文窗口](../../concepts/generation-control/token-and-context-window.md)

## 🐞 踩坑记录与思考

- **观察**: `temperature=0.1` 时 5 次回复几乎完全相同，`temperature=0.9` 时差异明显但仍可能偶发重复。
  - **思考**: 即使 temperature 很低，只要不为 0，理论上仍可能采到非最大概率 token；temperature=0 才是严格贪心。模型厂商对 temperature 的实际映射可能不完全线性。
- **思考**: `top_p` 与 `temperature` 都影响随机性，但不冲突——`top_p` 先裁剪候选集，`temperature` 再在剩余候选中调整概率分布。实践中通常只调一个，另一个保持默认（如 `temperature=0.7, top_p=1` 或 `temperature=1, top_p=0.9`）。
- **思考**: `max_tokens` 是输出侧的预算上限，与输入侧的上下文窗口是两回事，但两者共享同一个模型的总 token 预算。
