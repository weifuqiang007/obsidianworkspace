---
tags: [ruoyi-fastapi, Python, dataclass, 多态]
---

# `KbPrincipal` 为什么是空的

## 原代码

位置：`module_rag/service/kb_scope_policy.py:19-22`

```python
@dataclass
class KbPrincipal(Principal):
    """知识库请求主体；领域扩展数据放入 Principal.attrs。"""
```

## 逐行解释

### `@dataclass`

Python 为该类生成 `__init__`、`__repr__` 等方法。子类会继承 dataclass 父类字段。

### `class KbPrincipal(Principal)`

读作：“`KbPrincipal` 是一种 `Principal`”。它从父类继承了如下字段：

```python
@dataclass
class Principal:
    user_id: int
    is_admin: bool
    role: str
    role_keys: list[str] = field(default_factory=list)
    attrs: dict[str, Any] = field(default_factory=dict)
```

所以下面的构造是合法的：

```python
principal = KbPrincipal(
    user_id=1,
    is_admin=False,
    role='student',
    role_keys=['student'],
)
```

### 类体只有 docstring

类体并非完全空白，它有 docstring。Python 允许这种写法，因此不需要再写 `pass`。

## 这个“空子类”有什么用

### 1. 表达类型语义

`Principal` 是任意资源的请求主体；`KbPrincipal` 则明确表示“知识库资源的请求主体”。

### 2. 作为业务扩展点

教育产品可以继续扩展：

```python
@dataclass
class LearningKbPrincipal(KbPrincipal):
    school_id: int | None = None
    class_id: int | None = None
    taught_class_ids: list[int] = field(default_factory=list)
    owned_student_ids: list[int] = field(default_factory=list)
    school_dept_ids: list[int] = field(default_factory=list)
```

完整继承树：

```text
Principal
└─ KbPrincipal
   └─ LearningKbPrincipal
```

`LearningKbPrincipal` 同时是 `KbPrincipal` 和 `Principal`：

```python
isinstance(learning_principal, KbPrincipal)  # True
isinstance(learning_principal, Principal)    # True
```

## 最容易误读的地方

控制器中的：

```python
principal: KbPrincipal = ViewerDependency('rag.knowledge_base')
```

不等价于：

```python
principal = KbPrincipal(...)
```

`KbPrincipal` 只是类型标注。对象由 `ViewerDependency` 找到的 Policy 创建。当注册表里是 `LearningKbScopePolicy` 时，它返回的就是 `LearningKbPrincipal`。

> [!note] 设计取舍
> 如果 RAG 模块确定永远只服务当前教育产品，这个空子类可能显得多余。它的价值是让 `module_rag` 保持产品无关，同时允许 `module_learning` 增加学校、班级和师生关系。

