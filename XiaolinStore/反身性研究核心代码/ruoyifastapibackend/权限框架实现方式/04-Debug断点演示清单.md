---
tags: [ruoyi-fastapi, debug, 断点]
---

# Debug 断点演示清单

## A. 启动阶段

| 顺序 | 文件:行 | 观察内容 |
|---:|---|---|
| 1 | `app.py:10` | Uvicorn 如何使用 factory |
| 2 | `server.py:145` | 进入 `create_app()` |
| 3 | `server.py:175` | 调用 `discover_and_load()` |
| 4 | `common/lifecycle.py:58` | `module_name` 是否扫描到 `module_learning.hooks` |
| 5 | `module_rag/service/kb_scope_policy.py:70` | 默认 Policy 首次注册 |
| 6 | `module_learning/hooks.py:23` | Learning 注册函数被调用 |
| 7 | `module_learning/service/kb_scope_policy.py:169` | Learning Policy 覆盖默认 Policy |

在第 7 个断点执行后查看：

```python
ScopeRegistry._map
type(ScopeRegistry.get('rag.knowledge_base'))
```

期望：

```text
LearningKbScopePolicy
```

## B. 请求阶段

| 顺序 | 文件:行 | 观察内容 |
|---:|---|---|
| 1 | `common/aspect/pre_auth.py:83` | 进入认证依赖 |
| 2 | `common/aspect/pre_auth.py:121` | Authorization header |
| 3 | `module_admin/service/login_service.py:279` | `current_user` 写入 ContextVar |
| 4 | `common/aspect/interface_auth.py:57` | 检查 role keys |
| 5 | `common/aspect/resource_scope.py:83` | 进入 `ViewerDependency._resolve()` |
| 6 | `common/aspect/resource_scope.py:88` | 查看注册表取出的 Policy |
| 7 | `module_learning/service/kb_scope_policy.py:63` | 进入 `build_principal()` |
| 8 | `module_rag/controller/knowledge_base_controller.py:54` | 控制器收到的 Principal |
| 9 | `module_rag/service/knowledge_base_service.py:46` | 生成权限条件 |
| 10 | `module_learning/service/kb_scope_policy.py:106` | 逐分支组装 `visible_filter` |

## C. 调试器 Watch 表达式

```python
type(policy).__name__
ScopeRegistry._map
type(principal).__name__
principal.user_id
principal.role
principal.school_id
principal.class_id
principal.taught_class_ids
principal.owned_student_ids
str(cond)
```

## D. 建议演示请求

1. 用学生 token 请求 `GET /rag/kb/list`，观察 `class_id`。
2. 用教师 token 再请求，观察 `taught_class_ids` 和 `owned_student_ids`。
3. 对比两次 `visible_filter()` 生成的条件。
4. 暂时在调试器中查看 `ScopeRegistry._map`，证明 Controller 的 `KbPrincipal` 标注不决定运行时对象。

> [!tip] 讲解技巧
> 先在 Excalidraw 中只展示上方蓝色启动泳道，证明 Policy 如何进入注册表；再移动到下方绿色请求泳道，证明每次请求如何取出并执行它。

