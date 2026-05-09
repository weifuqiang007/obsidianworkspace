# Note 模块业务拆解

## 概述

Note 模块是 SparkNoteAI 应用的核心笔记管理模块，负责笔记的创建、编辑、搜索、标签管理和导出等功能。该模块支持多种来源平台的笔记导入，具备自动摘要生成和标签提取功能，并集成了知识图谱系统。

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Note 模块架构                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │   API 路由   │    │   数据模型   │    │   服务层     │      │
│  │  note.py    │◄──►│ models/    │◄──►│ services/   │      │
│  └─────────────┘    └─────────────┘    └─────────────┘      │
│           │                  │                  │           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │  摘要生成   │    │   标签管理   │    │  知识图谱    │      │
│  │summary_gen │    │   tags API  │    │   graph     │      │
│  └─────────────┘    └─────────────┘    └─────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 核心功能模块

### 1. 笔记管理流程

#### 1.1 创建笔记
- **路径**: `POST /api/notes/`
- **输入**: NoteCreate（标题、内容、摘要、标签 ID、平台、来源 URL）
- **处理逻辑**:
  1. 创建笔记基础信息
  2. 处理用户指定的标签关联
  3. 异步生成摘要（如果未提供且开启自动摘要）
  4. 异步提取标签（如果开启自动提取）
  5. 触发知识图谱增量更新

**源码实现**:
```python
@router.post("/", response_model=NoteResponse)
async def create_note(
    note_data: NoteCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建新笔记（立即返回，摘要和标签异步生成）"""
    db_note = Note(
        title=note_data.title,
        content=note_data.content,
        summary=note_data.summary or "",
        user_id=current_user.id,
    )
    db.add(db_note)
    db.commit()
    db.refresh(db_note)

    note_id = db_note.id

    # 添加用户指定的标签关联
    if note_data.tag_ids:
        for tag_id in note_data.tag_ids:
            note_tag = NoteTag(note_id=note_id, tag_id=tag_id)
            db.add(note_tag)
        db.commit()
        db.refresh(db_note)

    logger.info(f"笔记创建成功: note_id={note_id}, user_id={current_user.id}, title={db_note.title}")

    # 如果未提供摘要且开启了自动总结，异步生成
    if not note_data.summary and note_data.content:
        background_tasks.add_task(
            _generate_note_summary_and_tags,
            note_id=note_id,
            user_id=current_user.id,
            content=note_data.content,
        )

    # 后台触发知识图谱构建（只更新当前笔记的概念）
    background_tasks.add_task(trigger_graph_update_for_note, current_user.id, db_note.id)

    return NoteResponse.from_orm(db_note)
```

#### 1.2 获取笔记列表
- **路径**: `GET /api/notes/`
- **参数**: page（页码）、size（页大小）、search（搜索关键词）、tag（标签筛选）
- **处理逻辑**:
  1. 构建基础查询（用户笔记）
  2. 应用搜索条件（标题和内容模糊匹配）
  3. 应用标签筛选
  4. 计算分页信息
  5. 预加载标签关联避免 N+1 查询

**源码实现**:
```python
@router.get("/", response_model=NoteListResponse)
def get_notes(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    tag: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取笔记列表（支持分页、搜索、标签筛选）"""
    query = db.query(Note).filter(Note.user_id == current_user.id)

    if search:
        query = query.filter(
            (Note.title.ilike(f"%{search}%")) | (Note.content.ilike(f"%{search}%"))
        )

    if tag:
        query = (
            query.join(NoteTag)
            .join(Tag)
            .filter(Tag.name.ilike(f"%{tag}%"))
        )

    total = query.count()
    pages = (total + size - 1) // size

    notes = query.order_by(Note.updated_at.desc()).offset((page - 1) * size).limit(size).all()

    # 手动加载 tags 关联以避免 N+1 查询
    for note in notes:
        _ = note.tag_names  # 预加载标签

    return NoteListResponse(
        items=[NoteResponse.from_orm(note) for note in notes],
        total=total,
        page=page,
        size=size,
        pages=pages,
    )
```

#### 1.3 获取单个笔记
- **路径**: `GET /api/notes/{note_id}`
- **功能**: 获取笔记详情，包含标签信息

#### 1.4 更新笔记
- **路径**: `PUT /api/notes/{note_id}`
- **输入**: NoteUpdate（可选更新字段）
- **处理逻辑**:
  1. 更新笔记基础信息
  2. 更新标签关联（删除旧关联，添加新关联）
  3. 触发知识图谱增量更新

**源码实现**:
```python
@router.put("/{note_id}", response_model=NoteResponse)
def update_note(
    note_id: int,
    note_data: NoteUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新笔记"""
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == current_user.id).first()
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")

    # 更新字段
    update_data = note_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field != "tag_ids":
            setattr(note, field, value)

    # 更新标签关联
    if "tag_ids" in update_data:
        # 删除旧关联
        db.query(NoteTag).filter(NoteTag.note_id == note_id).delete()
        db.commit()  # 先提交删除操作
        # 添加新关联
        for tag_id in note_data.tag_ids or []:
            note_tag = NoteTag(note_id=note_id, tag_id=tag_id)
            db.add(note_tag)

    db.commit()  # 提交更改
    db.refresh(note)  # 刷新对象

    # 重新加载 tags 关系
    _ = note.tags  # 加载关联

    logger.info(f"笔记更新成功: note_id={note_id}, user_id={current_user.id}, title={note.title}")

    # 后台触发知识图谱构建（只更新当前笔记的概念）
    background_tasks.add_task(trigger_graph_update_for_note, current_user.id, note_id)

    return NoteResponse.from_orm(note)
```

#### 1.5 删除笔记
- **路径**: `DELETE /api/notes/{note_id}`
- **处理逻辑**:
  1. 删除笔记记录
  2. 后台清理知识图谱中的关联节点

**源码实现**:
```python
@router.delete("/{note_id}")
def delete_note(
    note_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除笔记"""
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == current_user.id).first()
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")

    logger.info(f"笔记删除中: note_id={note_id}, user_id={current_user.id}, title={note.title}")
    db.delete(note)
    db.commit()

    # 后台触发知识图谱清理
    background_tasks.add_task(cleanup_graph_after_note_delete, current_user.id, note_id)

    return {"message": "笔记已删除"}
```

### 2. 标签管理功能

#### 2.1 获取所有标签
- **路径**: `GET /api/notes/tags`
- **功能**: 获取用户标签和系统标签
- **特点**: 支持用户自定义标签和系统预设标签

**源码实现**:
```python
@router.get("/tags", response_model=List[TagResponse])
def get_tags(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取所有标签"""
    # 获取用户标签和系统标签
    tags = db.query(Tag).filter((Tag.user_id == current_user.id) | (Tag.user_id.is_(None))).all()
    return tags
```

#### 2.2 创建标签
- **路径**: `POST /api/notes/tags`
- **输入**: TagCreate（名称、颜色）
- **处理逻辑**: 检查重名，创建新标签

**源码实现**:
```python
@router.post("/tags", response_model=TagResponse)
def create_tag(
    tag_data: TagCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建新标签"""
    # 检查是否已存在
    existing = db.query(Tag).filter(Tag.name == tag_data.name, Tag.user_id == current_user.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="标签已存在")

    db_tag = Tag(
        name=tag_data.name,
        color=tag_data.color,
        user_id=current_user.id,
    )
    db.add(db_tag)
    db.commit()
    db.refresh(db_tag)
    return db_tag
```

#### 2.3 删除标签
- **路径**: `DELETE /api/notes/tags/{tag_id}`
- **处理逻辑**: 删除标签及其所有关联关系（级联删除）

### 3. 摘要生成功能

#### 3.1 异步摘要生成
- **触发条件**: 笔记创建时未提供摘要且开启了自动摘要
- **实现方式**: 使用 BackgroundTasks 异步执行
- **LLM 集成**: 支持配置大模型进行智能摘要

**源码实现**:
```python
async def _generate_note_summary_and_tags(note_id: int, user_id: int, content: str):
    """后台异步生成笔记摘要和提取标签"""
    from ..services.summary_generator import generate_summary, extract_tags_with_llm
    from ..models.integration import FeatureSetting
    from ..core.database import SessionLocal

    db = SessionLocal()
    try:
        notes_feature = db.query(FeatureSetting).filter(
            FeatureSetting.user_id == user_id,
            FeatureSetting.feature_id == "notes"
        ).first()

        # 生成摘要
        auto_summarize = True
        if notes_feature and notes_feature.custom_settings:
            auto_summarize = notes_feature.custom_settings.get("auto_summarize", True)

        if auto_summarize:
            summary = await generate_summary(db, user_id, content)
            if summary:
                # 硬性截断保护：确保不超过数据库 varchar(500) 限制
                if len(summary) > 500:
                    summary = summary[:500].rstrip() + "..."
                note = db.query(Note).filter(Note.id == note_id).first()
                if note:
                    note.summary = summary
                    db.commit()
                    logger.info(f"笔记摘要生成成功（异步）: note_id={note_id}, len={len(summary)}")
```

#### 3.2 标签自动提取
- **触发条件**: 开启自动提取标签功能
- **实现**: 使用 LLM 从内容中提取关键词
- **配置**: 可配置提取数量（默认 3 个）

### 4. 笔记导出功能

#### 4.1 导出为 ZIP
- **路径**: `GET /api/notes/export`
- **格式**: Markdown 文件打包成 ZIP
- **内容结构**: 包含 Front Matter（标题、来源、标签、摘要）

**源码实现**:
```python
@router.get("/export")
def export_notes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """导出所有笔记为 ZIP 压缩包"""
    # 查询当前用户的所有笔记
    notes = db.query(Note).filter(Note.user_id == current_user.id).all()

    if not notes:
        raise HTTPException(status_code=404, detail="暂无笔记可导出")

    # 在内存中创建 ZIP 文件
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for note in notes:
            # 生成 Markdown 内容（包含 Front Matter）
            md_content = f"# {note.title}\n\n"
            if note.source_url:
                md_content += f"来源：{note.source_url}\n\n"
            if note.tag_names:
                md_content += f"标签：{', '.join(note.tag_names)}\n\n"
            if note.summary:
                md_content += f"摘要：{note.summary}\n\n"
            md_content += note.content

            # 创建安全的文件名（移除非法字符）
            safe_title = "".join(c for c in note.title if c not in r'\/:*?"<>|')
            safe_title = safe_title.strip() or f"note_{note.id}"
            filename = f"{safe_title}.md"

            # 添加到 ZIP
            zip_file.writestr(filename, md_content)

    zip_buffer.seek(0)

    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": "attachment; filename=sparknoteai_notes_export.zip"
        }
    )
```

### 5. 知识图谱集成

#### 5.1 增量更新
- **触发时机**: 笔记创建、更新时
- **功能**: 更新知识图谱中的概念和关系
- **异步处理**: 使用 BackgroundTasks 后台执行

**源码实现**:
```python
async def trigger_graph_update_for_note(user_id: int, note_id: int):
    """后台任务：更新单个笔记的知识图谱概念和关系"""
    from app.core.database import SessionLocal
    from app.services.knowledge_graph import KnowledgeGraphService
    from app.models.integration import Integration, FeatureSetting
    from app.models.note import Note as NoteModel

    db = SessionLocal()
    try:
        note = db.query(NoteModel).filter(NoteModel.id == note_id).first()
        if not note:
            logger.warning(f"知识图谱更新跳过：笔记不存在, note_id={note_id}")
            return

        # 获取 LLM 集成配置
        feature_setting = db.query(FeatureSetting).filter(
            FeatureSetting.user_id == user_id,
            FeatureSetting.feature_id == "knowledge_graph"
        ).first()

        integration = None
        if feature_setting and feature_setting.integration_refs:
            llm_key = feature_setting.integration_refs.get("llm")
            if llm_key:
                integration = db.query(Integration).filter(
                    Integration.user_id == user_id,
                    Integration.integration_type == "llm",
                    Integration.config_key == llm_key,
                    Integration.is_enabled == True
                ).first()

        if not integration or not integration.config or not integration.config.get("api_key"):
            logger.info(f"知识图谱更新跳过：LLM 配置不存在, note_id={note_id}, user_id={user_id}")
            return

        # 使用服务执行增量更新
        logger.info(f"开始知识图谱增量更新: note_id={note_id}, user_id={user_id}")
        service = KnowledgeGraphService(db, user_id)
        await service.incremental_update_for_note(note, integration)
        logger.info(f"知识图谱增量更新完成: note_id={note_id}, user_id={user_id}")

    except Exception as e:
        logger.error(f"知识图谱更新异常: note_id={note_id}, user_id={user_id}, error={e}", exc_info=True)
    finally:
        db.close()
```

#### 5.2 清理功能
- **触发时机**: 笔记删除时
- **功能**: 清理知识图谱中的孤立节点

## 数据模型

### 1. Note 模型
```python
class Note(Base):
    """笔记模型"""
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False, default="无标题")
    content = Column(Text, default="")
    summary = Column(String(500), default="")  # 内容摘要，自动生成
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    platform = Column(String(50), default="original")  # 来源平台
    source_url = Column(Text, nullable=True)  # 来源链接
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    
    # 关联
    user = relationship("User", back_populates="notes")
    tags = relationship("NoteTag", back_populates="note", cascade="all, delete-orphan")
    
    @property
    def tag_names(self) -> List[str]:
        """返回标签名称列表"""
        return [tag.tag.name for tag in self.tags]
```

### 2. Tag 模型
```python
class Tag(Base):
    """标签模型"""
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False, index=True)
    color = Column(String(7), default="#666666")  # 十六进制颜色
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # None 表示系统标签
    
    # 关联
    user = relationship("User", back_populates="tags")
    note_tags = relationship("NoteTag", back_populates="tag", cascade="all, delete-orphan")
```

### 3. NoteTag 关联模型
```python
class NoteTag(Base):
    """笔记 - 标签关联表（多对多）"""
    id = Column(Integer, primary_key=True, index=True)
    note_id = Column(Integer, ForeignKey("notes.id"), nullable=False)
    tag_id = Column(Integer, ForeignKey("tags.id"), nullable=False)
    
    # 关联
    note = relationship("Note", back_populates="tags")
    tag = relationship("Tag", back_populates="note_tags")
```

## API 接口详细

| 方法 | 路径 | 描述 | 权限要求 |
|------|------|------|----------|
| POST | /api/notes/ | 创建笔记 | 已认证 |
| GET | /api/notes/ | 获取笔记列表（支持分页、搜索） | 已认证 |
| GET | /api/notes/{note_id} | 获取单个笔记详情 | 已认证 |
| PUT | /api/notes/{note_id} | 更新笔记 | 已认证 |
| DELETE | /api/notes/{note_id} | 删除笔记 | 已认证 |
| GET | /api/notes/tags | 获取所有标签 | 已认证 |
| POST | /api/notes/tags | 创建标签 | 已认证 |
| DELETE | /api/notes/tags/{tag_id} | 删除标签 | 已认证 |
| GET | /api/notes/export | 导出所有笔记 | 已认证 |

## 平台支持

| 平台 | 标识 | 说明 |
|------|------|------|
| 原创 | original | 用户原创内容 |
| 微信公众号 | wechat | 微信公众号文章 |
| 小红书 | xiaohongshu | 小红书笔记 |
| B站 | bilibili | B站视频/文章 |
| YouTube | youtube | YouTube 视频 |
| 其他 | other | 其他来源平台 |

## 异步任务说明

### 1. 摘要生成任务
- **执行时机**: 笔记创建时，未提供摘要且有内容
- **处理逻辑**: 检查用户配置，调用 LLM 生成摘要
- **异常处理**: 捕获异常并记录日志，不影响主流程

### 2. 标签提取任务
- **执行时机**: 笔记创建时，开启自动提取标签
- **处理逻辑**: 调用 LLM 提取关键词，创建标签关联
- **配置**: 可控制是否开启及提取数量

### 3. 知识图谱更新任务
- **执行时机**: 笔记创建或更新时
- **处理逻辑**: 增量更新知识图谱
- **依赖**: 需要 LLM 集成配置

### 4. 知识图谱清理任务
- **执行时机**: 笔记删除时
- **处理逻辑**: 清理孤立节点

## 性能优化

### 1. N+1 查询避免
- 预加载标签关联：`_ = note.tag_names`
- 批量查询优化

### 2. 异步处理
- 非核心功能异步执行
- 后台任务不影响响应速度

### 3. 分页机制
- 默认每页 20 条，最多 100 条
- 数据库层面分页，减少内存使用

## 相关文档链接

- [[common/utils/加密工具]] - API 密钥加密解密
- [[common/core/logger]] - 日志记录系统
- [[common/core/config]] - 配置管理系统
- [[auth模块/auth模块业务拆解]] - 用户认证相关
- [[common/services/knowledge_graph]] - 知识图谱服务

## 扩展建议

### 1. 功能扩展
- 支持富文本编辑
- 添加笔记分享功能
- 支持笔记模板
- 添加笔记版本管理

### 2. 性能优化
- Redis 缓存热门笔记
- 全文搜索引擎集成
- 数据库分表策略

### 3. 用户体验
- 添加笔记拖拽排序
- 支持笔记导入/导出更多格式
- 添加笔记协作功能