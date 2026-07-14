
## 1 关于知识库文件夹的创建（增删改查）

```python
# ──────────────────────────────────────────────  
# 路由定义  
# 角色校验通过路由级依赖实现 AOP 效果，  
# 所有注册在该路由下的接口自动生效，无需手动调用 check_role# ──────────────────────────────────────────────  
knowledge_base_controller = APIRouterPro(  
    prefix='/rag/kb',  
    order_num=20,  
    tags=['RAG管理-知识库'],  
    dependencies=[  
        PreAuthDependency(),  
        RoleInterfaceAuthDependency(['admin', 'teacher', 'student']),  
    ],  
)
```

后面是关于业务的书写。这一块主要是看看fastapi的语法。方便后面阅读源码。

```python
class KnowledgeBaseController:  
    """知识库管理控制器 —— 将增删改查接口以类形式组织"""  
  
    # ── 创建 ──────────────────────────────────    @staticmethod  
    @knowledge_base_controller.post('', summary='创建知识库')  
    async def create(  
        data: KnowledgeBaseCreateModel,  
        query_db: Annotated[AsyncSession, DBSessionDependency()],  
        principal: KbPrincipal = ViewerDependency('rag.knowledge_base'),  
    ):  
        kb = await KnowledgeBaseService.create(query_db, data, principal)  
        return ResponseUtil.success(data={'kb_id': kb.kb_id})  
  
    # ── 列表（按当前用户可见性过滤）─────────────  
    @staticmethod  
    @knowledge_base_controller.get('/list', summary='获取知识库列表')  
    async def get_list(  
        query_db: Annotated[AsyncSession, DBSessionDependency()],  
        principal: KbPrincipal = ViewerDependency('rag.knowledge_base'),  
    ):  
        kb_list = await KnowledgeBaseService.get_list(query_db, principal)  
        return ResponseUtil.success(  
            data=[KnowledgeBaseResponseModel.model_validate(kb).model_dump() for kb in kb_list]  
        )  
  
    # ── 详情（带访问校验）──────────────────────  
    @staticmethod  
    @knowledge_base_controller.get('/{kb_id}', summary='获取知识库详情')  
    async def get_detail(  
        kb_id: Annotated[int, Path(description='知识库ID')],  
        query_db: Annotated[AsyncSession, DBSessionDependency()],  
        principal: KbPrincipal = ViewerDependency('rag.knowledge_base'),  
    ):  
        kb = await KnowledgeBaseService.get_accessible(query_db, kb_id, principal)  
        if not kb:  
            return ResponseUtil.failure(msg='知识库不存在')  
        return ResponseUtil.success(  
            data=KnowledgeBaseResponseModel.model_validate(kb).model_dump()  
        )  
  
    # ── 更新（owner / admin）───────────────────  
    @staticmethod  
    @knowledge_base_controller.put('', summary='更新知识库')  
    async def update(  
        data: KnowledgeBaseUpdateModel,  
        query_db: Annotated[AsyncSession, DBSessionDependency()],  
        principal: KbPrincipal = ViewerDependency('rag.knowledge_base'),  
    ):  
        await KnowledgeBaseService.update(query_db, data, principal)  
        return ResponseUtil.success(msg='更新成功')  
  
    # ── 删除（owner / admin）───────────────────  
    @staticmethod  
    @knowledge_base_controller.delete('/{kb_ids}', summary='删除知识库')  
    async def delete(  
        kb_ids: Annotated[str, Path(description='知识库ID，多个用逗号分隔')],  
        query_db: Annotated[AsyncSession, DBSessionDependency()],  
        principal: KbPrincipal = ViewerDependency('rag.knowledge_base'),  
    ):  
        for kb_id in kb_ids.split(','):  
            await KnowledgeBaseService.delete(query_db, int(kb_id), principal)  
        return ResponseUtil.success(msg='删除成功')
```

fastAPI **依赖注入（Depends）** 写法 ，搭配 Python 3.9+ `Annotated` 类型注解，后端标准写法：

```python
from typing_extensions import Annotated 
from fastapi import Depends

query_db: Annotated[AsyncSession, DBSessionDependency()]

变量名 : Annotated[真实类型, 依赖实例] query_db : Annotated[AsyncSession, DBSessionDependency()]




```

1 **`AsyncSession`**

这是**类型标注**：告诉 IDE / 类型检查工具，`query_db` 这个变量运行时是数据库异步会话对象（SQLAlchemy 异步 DB 会话），你可以调用 `await query_db.execute()`、`query_db.commit()` 等数据库操作方法。

2 **`DBSessionDependency()`**

这是 FastAPI 依赖项（等价 `Depends(xxx)`）：

- `DBSessionDependency` 是你项目封装好的一个依赖类 / 函数；
- FastAPI 在进入 `create` 接口方法前，会自动执行这个依赖，生成一个 `AsyncSession` 数据库连接会话；
- 生成好的会话实例会赋值给 `query_db`，接口内直接用；
- 请求结束自动关闭会话、回收连接，不用手动写创建 / 关闭数据库连接代码。


## `principal: KbPrincipal = ViewerDependency('rag.knowledge_base')`

### 结构说明

- 没有用 `Annotated`，是传统 `Depends` 赋值写法，逻辑同上
- `ViewerDependency('rag.knowledge_base')` = 权限校验依赖

### 分段解释

1. **`KbPrincipal`**
    
    类型注解：`principal` 变量是用户身份主体对象，里面包含：当前登录用户 ID、部门 ID、角色、权限、可见范围等信息；
    
    后续创建知识库时传给 `KnowledgeBaseService.create`，用来填充 `owner_user_id`、`scope_dept_id`、校验 `kb_scope` 权限。
    
2. **`ViewerDependency('rag.knowledge_base')`**
    
    权限校验依赖，逻辑流程：
    
    1. 拦截当前请求，从 token /header 解析登录用户；
    2. 校验该用户是否拥有 `rag.knowledge_base` 模块**查看 / 操作权限**；
    3. 无权限直接返回 403 禁止访问，不会进入接口函数；
    4. 校验通过，把封装好的用户身份 `KbPrincipal` 对象赋值给 `principal`；
    5. 接口里拿 `principal.user_id`、`principal.dept_id` 做数据隔离（个人库 / 班级 / 学校库权限控制）。
    

### 和上面 DB 依赖对比两种写法区别

python

运行

```
# 写法A：Annotated 新式（推荐，类型与依赖分离）
query_db: Annotated[AsyncSession, DBSessionDependency()]

# 写法B：Depends 赋值老式（权限常用）
principal: KbPrincipal = ViewerDependency('rag.knowledge_base')
```

功能完全等价，只是项目编码风格选择。




## ViewerDependency 工厂是在干什么

```python
principal: KbPrincipal = ViewerDependency('rag.knowledge_base'),
```

拆开看就是 Python **函数参数声明 + FastAPI 依赖注入**：

| 片段                                         | 含义                                |
| ------------------------------------------ | --------------------------------- |
| `principal`                                | 参数名                               |
| `: KbPrincipal`                            | 类型注解（给 IDE / 类型检查器看）              |
| `= ViewerDependency('rag.knowledge_base')` | 默认值，是一个 FastAPI `Depends(...)` 对象 |
| 末尾 `,`                                     | 只是函数参数之间的分隔符，没特殊含义                |

关键点：当 FastAPI 看到**默认值是 `Depends(...)`** 时，它不会把 `Depends` 对象当值用，而是**自动执行**这个依赖函数，把**返回值**注入成 `principal`。所以接口里拿到的 `principal` 是一个填好的 `KbPrincipal` 实例，不是 `Depends` 对象。

## 运行时发生了什么

`ViewerDependency` 本身只是个**工厂**，见 [resource_scope.py:77-91](vscode-webview://154u6p70kifhlkttm7dhe918h50edn35fjhr17lkgc13b7u736l8/ruoyi-fastapi-backend/common/aspect/resource_scope.py#L77-L91)：

```python
def ViewerDependency(resource_key: str) -> params.Depends:
    async def _resolve(request, query_db) -> Principal:
        current_user = RequestContext.get_current_user()   # ① 取当前登录用户
        policy = ScopeRegistry.get(resource_key)            # ② 按 key 查策略
        return await policy.build_principal(query_db, current_user)  # ③ 构造主体
    return Depends(_resolve)
```

每个请求进来，FastAPI 跑一遍 `_resolve`：

1. 从 `RequestContext`（前面 `PreAuthDependency` 已经写好了）拿到当前用户；
2. 用 `'rag.knowledge_base'` 去 `ScopeRegistry` 查注册的策略；
3. 调 `policy.build_principal(db, user)` → 返回 `KbPrincipal`，注入成 `principal`。

## 策略在哪里注册的

[kb_scope_policy.py:195](vscode-webview://154u6p70kifhlkttm7dhe918h50edn35fjhr17lkgc13b7u736l8/ruoyi-fastapi-backend/module_rag/service/kb_scope_policy.py#L195) 这行：

```python
ScopeRegistry.register('rag.knowledge_base', KbScopePolicy())
```

模块被 `auto_register_routers` 导入时自动执行，把 `KbScopePolicy` 实例挂到 `'rag.knowledge_base'` 这个 key 上。所以控制器里写 `'rag.knowledge_base'` 就是去查这张表。

`build_principal`（[kb_scope_policy.py:84-120](vscode-webview://154u6p70kifhlkttm7dhe918h50edn35fjhr17lkgc13b7u736l8/ruoyi-fastapi-backend/module_rag/service/kb_scope_policy.py#L84-L120)）做的事：根据当前用户的角色，查 `EduDao` 的组织关系，填进 `KbPrincipal` 的领域字段：

- admin → 啥也不查，直接放行
- student → 填 `class_id` / `school_id`
- teacher → 填 `school_id` / `taught_class_ids`（任课班级）/ `owned_student_ids`（归属学生）/ `school_dept_ids`（同校部门）

填好之后，service 层就能用 `visible_filter`（SQL 过滤列表）和 `can_access`（单条访问判定）做四级作用域（公共 / 学校 / 班级 / 个人）的可见性判断。

## 为什么写得这么绕——机制 vs 规则

这是你这个分支（`feature/kb-permission-scope`）的核心架构思路，和你记忆里的 [[framework-mechanism-vs-policy-split]] 一致：

- **机制层** [common/aspect/resource_scope.py](vscode-webview://154u6p70kifhlkttm7dhe918h50edn35fjhr17lkgc13b7u736l8/ruoyi-fastapi-backend/common/aspect/resource_scope.py)：`Principal` 基类、`ScopePolicy` 抽象、`ScopeRegistry`、`ViewerDependency` —— **不含任何业务词**（school/class/student 都没有）。
- **规则层** [kb_scope_policy.py](vscode-webview://154u6p70kifhlkttm7dhe918h50edn35fjhr17lkgc13b7u736l8/ruoyi-fastapi-backend/module_rag/service/kb_scope_policy.py)：`KbPrincipal` 继承基类扩展教育字段，`KbScopePolicy` 实现四级可见性规则，自己注册自己。

这样写的收益：换一个产品（比如你提到的律师那条线）、换一类资源，**框架层一行不用改**，只要写一个新的 `XxxPolicy` + `XxxPrincipal`，注册一个新 key，控制器里 `= ViewerDependency('xxx.yyy')` 就能复用整套可见性机制。扩展点是「注册一个 Policy」，不是改配置或改框架。

---

一句话总结：这行是 **FastAPI 依赖注入**，用一个 `Depends` 工厂把「当前用户 → 该资源的可见性主体」这套构造过程声明式地塞进参数；框架只管注入机制，业务策略靠注册表挂上去。



