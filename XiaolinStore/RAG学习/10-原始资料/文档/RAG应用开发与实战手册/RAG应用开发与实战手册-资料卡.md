---
type: source-index
title: RAG 应用开发与实战手册
author: Jimmy Song
source: https://jimmysong.io/book/rag-handbook
captured: 2026-07-13
capture_method: MinerU PDF 转 Markdown
status: 已收录
topics:
  - RAG
  - Cloudflare Vectorize
  - Qwen
tags:
  - source/book
  - RAG学习
---

# RAG 应用开发与实战手册：资料卡

## 原始资料

- 正文：[[RAG应用开发与实战手册-原文]]
- 图片：同目录 `images/`，共 38 张
- 原始 Markdown SHA-256：`426F3E254BC848DFD141BCF14396BE7E3033D305CF3C8FD4E3434CF882893987`
- 学习计划：[[RAG应用开发与实战手册学习计划]]

## 内容定位

全书共 23 章，使用 Cloudflare Workers、Cloudflare Vectorize 和 Qwen 演示一个完整 RAG 应用，内容从基本原理延伸到摄取、向量检索、生成、聊天界面、部署和监控。

## 建议阅读入口

- 基础原理：[[RAG应用开发与实战手册-原文#第 2 章|第 2 章 RAG 原理与核心概念]]
- 总体流水线：[[RAG应用开发与实战手册-原文#第 4 章|第 4 章 RAG 流水线总览]]
- 数据与分块：[[RAG应用开发与实战手册-原文#第 6 章|第 6 章 知识库数据收集]]、[[RAG应用开发与实战手册-原文#第 9 章|第 9 章 Markdown 向量映射]]
- 检索：[[RAG应用开发与实战手册-原文#第 12 章|第 12 章 检索系统实现]]
- 生成：[[RAG应用开发与实战手册-原文#第 15 章|第 15 章 答案生成流程]]
- 工程化：[[RAG应用开发与实战手册-原文#第 21 章|第 21 章 测试、监控与持续改进]]
- 术语速查：[[RAG应用开发与实战手册-原文#第 23 章|第 23 章 术语表]]

## 文本质量说明

原文由 MinerU 转换，保留了若干 OCR/排版问题，例如异体字符、`Cloudfare` 拼写、目录重复、标题层级误判和少量公式占位符。为保证来源可核验，原文不直接修订；提炼知识卡片时应按上下文校正，并在不确定处标注“待核验”。

## 使用边界

这本书适合建立端到端 RAG 的第一张全景图，但实现明显绑定 Cloudflare Vectorize 与 Qwen。学习时应把通用原理和平台 API 分开，不要把某个平台的参数、限制或最佳实践当成 RAG 的普遍规律。参见 [[这本 RAG 手册覆盖什么与缺什么]]。

