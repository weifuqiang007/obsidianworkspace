---
title: 用 WorkBuddy、Codex 和 Obsidian 搭建自生长个人知识库实战
type: source-card
project: 运营助手
source: https://mp.weixin.qq.com/s/6pkU-Ggx1KkM_7Blgpbdhw
author: 苍何
published: 2026-08-09
captured: 2026-08-11
status: 已整理
capture_scope: 页面可见正文的结构化摘录与转述，不含全文复制
topics:
  - LLM Wiki
  - Obsidian
  - Agent 知识管理
tags: [source/web, LLM-Wiki, Obsidian]
---

# 用 WorkBuddy / Codex + Obsidian 搭建自生长的个人知识库实战

## 来源信息

- 原文：[微信公众号文章](https://mp.weixin.qq.com/s/6pkU-Ggx1KkM_7Blgpbdhw)
- 作者：苍何
- 发布日期：2026-08-09
- 收录日期：2026-08-11
- 收录范围：标题、章节结构、核心观点、目录示例和操作规则的结构化转述。

> [!note] 版权与证据边界
> 本页不是原文全文备份。需要核对措辞、案例或图片时，应返回原链接；库内结论通过本页和来源摘要追溯。

## 原文提出的问题

传统 RAG 或文件上传式问答每次都从碎片临时拼答案，回答结束后知识本身没有变化。文章希望把知识管理改成持续维护：每次加入资料，Agent 都应给知识库留下可复用的增量结果。

## 原文核心模型

- Raw：文章、论文、书籍、AI 对话、随手记和会议等原始证据。
- Wiki：来源摘要、概念、实体和跨来源主题。
- Schema：规定 Agent 如何搜索、归档、引用、更新、处理冲突和记录日志。
- Agent：读取 Vault、对照已有 Wiki、增量更新页面、维护双链和索引。
- Obsidian：本地 Markdown 存储、人机界面、双链和图谱观察窗口。

## 文章强调的增量流程

1. 新资料进入 Raw。
2. Agent 先检索已有 Wiki。
3. 已有知识被补充，新概念建立新页。
4. 不同观点同时保留来源、时间与适用范围。
5. 建立双链，更新索引和只追加日志。
6. 查询时优先检索 Wiki，再沿链接回到 Raw。

## 三种落地方式

1. 直接让 WorkBuddy 或 Codex 按 `AGENTS.md` 搭建和维护。
2. 使用 `claude-obsidian` 封装的 ingest/retrieve 等能力。
3. 使用 WeSight 在 Obsidian 内完成知识库初始化、入库、更新和查询；文章注明知识大脑功能当时仍为会员小范围内测。

## 文章的关键边界

- 自生长不等于完全自动化。
- 人负责选择高价值资料、设定规则和处理关键判断。
- Agent 适合承担重复、耗时、结构化的维护工作。
- 最好的起点不是追求完美，而是用一份真实资料跑通第一次增量更新。

## 本库采用的适配

文章使用 `raw/`、`wiki/` 英文目录；本库为兼容现有内容，将其映射为：

- Raw → `10-原始资料/`
- Wiki 节点 → `20-知识卡片/`
- Wiki Topic → `30-主题地图/`
- Schema → 根目录及项目目录的 `AGENTS.md`

## 关联页面

- [[自生长个人知识库实战-来源摘要]]
- [[LLM Wiki]]
- [[Raw-Wiki-Schema 三层知识架构]]
- [[LLM Wiki 项目知识库地图]]
