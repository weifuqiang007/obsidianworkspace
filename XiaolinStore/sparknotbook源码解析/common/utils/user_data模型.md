# 用户数据模型定义

## 概述

用户数据模型定义了 SparkNoteAI 应用中所有与用户相关的数据结构和验证规则。基于 Pydantic 实现数据验证和序列化，确保数据的一致性和安全性。

## 模型架构

```
┌─────────────────────────────────────────────────────────────┐
│                    用户数据模型                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │  基础模型   │    │  业务模型   │    │  请求模型   │      │
│  │ UserBase    │    │   User      │    │ UserCreate  │      │
│  └─────────────┘    └─────────────┘    └─────────────┘      │
│           │                  │                  │           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  辅助模型                           │   │
│  │     Token, TwoFactor*Request/Response              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 核心模型详解

### 1. 基础模型 (UserBase)

```python
class UserBase(BaseModel):
    username: str
    email: EmailStr
```

**用途**: 所有用户相关模型的基类，定义了用户的基本信息字段

**字段说明**:
- `username`: 用户名（字符串，必填）
- `email`: 邮箱地址（使用 EmailStr 验证，必填）

**验证规则**:
- EmailStr: 确保符合邮箱格式
- Pydantic 自动类型检查

### 2. 创建用户模型 (UserCreate)

```python
class UserCreate(UserBase):
    password: str = Field(..., min_length=6, description="密码至少需要 6 个字符")
```

**用途**: 用户注册时的数据验证

**继承自**: UserBase

**新增字段**:
- `password`: 密码（至少 6 个字符，必填）

**验证规则**:
- min_length=6: 密码最小长度 6 位
- Field(...): 必填字段

### 3. 更新用户模型 (UserUpdate)

```python
class UserUpdate(BaseModel):
    """更新用户信息（不包括密码）"""
    username: Optional[str] = Field(None, min_length=2, max_length=50)
    email: Optional[EmailStr] = None
```

**用途**: 更新用户基本信息时的数据验证

**特点**:
- 所有字段都是可选的（Optional）
- 保持 EmailStr 的邮箱格式验证

**验证规则**:
- username: 2-50 字符长度（可选）
- email: 必须是有效邮箱格式（可选）

### 4. 密码更新模型 (UserPasswordUpdate)

```python
class UserPasswordUpdate(BaseModel):
    """修改密码"""
    current_password: str = Field(..., description="当前密码")
    new_password: str = Field(..., min_length=6, description="新密码至少需要 6 个字符")
```

**用途**: 修改用户密码时的数据验证

**字段说明**:
- `current_password`: 当前密码（必填）
- `new_password`: 新密码（至少 6 位，必填）

**安全考虑**:
- 需要验证当前密码的正确性
- 新密码需要满足长度要求

### 5. 完整用户模型 (User)

```python
class User(UserBase):
    id: int
    is_active: bool
    two_factor_enabled: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
```

**用途**: 从数据库查询用户信息时的响应模型

**继承自**: UserBase

**新增字段**:
- `id`: 用户唯一标识符（整数）
- `is_active`: 账户是否激活（布尔值）
- `two_factor_enabled`: 是否启用双因素认证（默认 False）
- `created_at`: 创建时间（ datetime）
- `updated_at`: 更新时间（可选 datetime）

**Config 配置**:
- `from_attributes = True`: 允许从 ORM 模型赋值

### 6. 认证相关模型

#### Token
```python
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    two_factor_required: bool = False
    two_factor_secret: Optional[str] = None
```

**用途**: 登录响应的数据结构

**字段说明**:
- `access_token`: JWT 访问令牌
- `token_type`: 令牌类型（默认 "bearer"）
- `two_factor_required`: 是否需要 2FA 验证
- `two_factor_secret`: 2FA 密钥（可选）

#### TokenData
```python
class TokenData(BaseModel):
    username: Optional[str] = None
```

**用途**: JWT Token 解析后的数据模型

### 7. 双因素认证模型

#### TwoFactorEnableRequest
```python
class TwoFactorEnableRequest(BaseModel):
    """启用 2FA 请求"""
    password: str = Field(..., description="当前密码验证")
```

**用途**: 启用 2FA 前的密码验证

#### TwoFactorVerifyRequest
```python
class TwoFactorVerifyRequest(BaseModel):
    """验证 2FA 代码"""
    code: str = Field(..., min_length=6, max_length=6, description="6 位验证码")
```

**用途**: 验证 2FA 验证码

**验证规则**:
- 必须是 6 位数字
- 使用 min_length 和 max_length 确保长度

#### TwoFactorSetupResponse
```python
class TwoFactorSetupResponse(BaseModel):
    """2FA 设置响应"""
    secret: str
    qr_code_url: str
```

**用途**: 2FA 设置完成后的响应

#### TwoFactorDisableRequest
```python
class TwoFactorDisableRequest(BaseModel):
    """禁用 2FA 请求"""
    code: str = Field(..., min_length=6, max_length=6, description="6 位验证码")
    password: str = Field(..., description="当前密码验证")
```

**用途**: 禁用 2FA 时的验证请求

#### TwoFactorLoginRequest
```python
class TwoFactorLoginRequest(BaseModel):
    """2FA 登录请求（密码验证通过后）"""
    username: str
    code: str = Field(..., min_length=6, max_length=6, description="6 位验证码")
```

**用途**: 2FA 登录阶段的请求验证

## 数据验证特性

### 1. 类型安全
- 使用 Pydantic 进行运行时类型检查
- 自动类型转换和验证
- 错误信息清晰明确

### 2. 字段验证
```python
# 长度验证
username: str = Field(..., min_length=2, max_length=50)

# 格式验证
email: EmailStr

# 必填验证
password: str = Field(...)

# 可选字段
email: Optional[str] = None
```

### 3. 自定义验证
- 可以添加自定义验证器
- 支持异步验证
- 复杂业务规则验证

## 使用示例

### 1. 注册请求验证
```python
from app.schemas.user import UserCreate

# 创建请求
request_data = UserCreate(
    username="testuser",
    email="test@example.com",
    password="123456"
)

# 自动验证
try:
    user_create = UserCreate(**request_data)
    print("验证通过")
except ValidationError as e:
    print("验证失败:", e.errors)
```

### 2. 响应序列化
```python
from app.schemas.user import User

# 从数据库模型创建
db_user = UserModel(id=1, username="test", email="test@example.com", ...)
user_response = User(**db_user.__dict__)

# 转换为字典
user_dict = user_response.model_dump()
```

### 3. API 请求处理
```python
@router.post("/register", response_model=User)
def register(user: UserCreate, db: Session = Depends(get_db)):
    # Pydantic 自动完成验证
    # 直接使用 user 对象
    pass
```

## 源码实现细节

### 1. 导入依赖
```python
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
```

### 2. 模型配置
```python
class Config:
    from_attributes = True  # 允许从 ORM 模型赋值
```

### 3. 字段验证
- 使用 `Field()` 定义详细验证规则
- 提供清晰的错误提示信息
- 支持自定义描述和示例

## 最佳实践

### 1. 模型设计原则
- 单一职责：每个模型只负责一种场景
- 继复用：通过继承减少重复代码
- 可扩展：预留扩展字段和验证规则

### 2. 安全考虑
- 密码字段不参与序列化响应
- 敏感信息使用 Optional 避免强制暴露
- 验证规则严格防止数据注入

### 3. 性能优化
- 合理使用字段缓存
- 避免过度嵌套
- 使用合理的类型注解

## 相关文档链接

- [[common/utils/auth工具]] - 认证工具函数
- [[auth模块/auth模块业务拆解]] - 使用本模块的业务逻辑
- [[common/core/config]] - 应用配置管理

## 扩展建议

### 1. 增强验证
- 添加密码复杂度验证
- 用户名格式要求
- 邮箱域名白名单

### 2. 多语言支持
- 错误信息国际化
- 字段描述多语言
- 验证规则本地化

### 3. 版本控制
- API 版本管理
- 向后兼容支持
- 模型版本迁移