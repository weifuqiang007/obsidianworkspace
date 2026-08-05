---
tags: [ruoyi-fastapi, FastAPI, 启动流程, Policy]
---

# 应用启动与 Policy 注册链

## 先看结论

```text
app.py
→ Uvicorn 调用 server.create_app()
→ create_app() 扫描 module_*/hooks.py
→ 导入 module_learning/hooks.py
→ 先导入 RAG 默认 Policy
→ 注册 DefaultKbScopePolicy
→ Learning hooks 注册 LearningKbScopePolicy
→ 同一 key 被教育 Policy 覆盖
→ 之后进入 lifespan 初始化 Redis/DB/MinIO 等
```

## 1. 启动入口 `app.py`

```python
if __name__ == '__main__':
    uvicorn.run(
        app='server:create_app',
        ...,
        factory=True,
    )
```

`factory=True` 表示 Uvicorn 要调用 `server.create_app()` 工厂函数，而不是直接使用一个已创建的 `app` 对象。

## 2. `server.create_app()` 构建应用

核心顺序：

```python
app = FastAPI(lifespan=lifespan, ...)
handle_sub_applications(app)
handle_middleware(app)
handle_exception(app)
LifecycleHooks.discover_and_load()
auto_register_routers(app)
return app
```

`discover_and_load()` 发生在路由自动注册之前。

## 3. 扫描 hooks

`common/lifecycle.py` 中：

```python
pattern = os.path.join(project_root, '*', 'hooks.py')
for file_path in sorted(glob.glob(pattern)):
    importlib.import_module(module_name)
```

它会导入 `module_learning/hooks.py`。导入 Python 模块时，模块顶层语句会立即执行。

## 4. 默认 RAG Policy 注册

`module_learning/service/kb_scope_policy.py` 需要：

```python
from module_rag.service.kb_scope_policy import KbPrincipal
```

因此 Python 先导入 RAG Policy 模块。该文件末尾的顶层语句立即执行：

```python
ScopeRegistry.register(
    'rag.knowledge_base',
    DefaultKbScopePolicy(),
)
```

此时：

```python
ScopeRegistry._map == {
    'rag.knowledge_base': DefaultKbScopePolicy(),
}
```

## 5. Learning Policy 覆盖默认 Policy

`module_learning/hooks.py` 顶层直接执行：

```python
register_learning_kb_scope_policy()
```

函数内部：

```python
ScopeRegistry.register(
    'rag.knowledge_base',
    LearningKbScopePolicy(),
)
```

`ScopeRegistry.register()` 只是对字典赋值：

```python
cls._map[resource_key] = policy
```

因为 key 相同，后一次赋值覆盖前一次。最终：

```python
ScopeRegistry._map == {
    'rag.knowledge_base': LearningKbScopePolicy(),
}
```

## 6. `create_app()` 与 `lifespan()` 的区别

| 函数 | 主要职责 | 本权限策略在哪里注册 |
|---|---|---|
| `create_app()` | 构建 FastAPI、注册中间件/异常/路由、导入 hooks | 在这里导入 hooks 时完成 |
| `lifespan()` | 初始化 Redis、DB、MinIO、Scheduler，管理停机清理 | 不是本 Policy 的注册点 |

> [!important]
> `register_learning_kb_scope_policy()` 是在导入 `module_learning/hooks.py` 时同步执行的，不是 `LifecycleHooks.run_startup()` 执行的异步 startup hook。

