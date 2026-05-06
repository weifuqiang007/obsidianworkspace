# Auth 模块业务拆解

## 概述

Auth 模块是 SparkNoteAI 应用的核心认证模块，负责用户的注册、登录、权限验证和安全功能。该模块采用 FastAPI 框架，实现了基于 JWT 的认证机制和双因素认证（2FA）功能。

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Auth 模块架构                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │   API 路由   │    │   认证工具   │    │  用户模型    │      │
│  │  auth.py    │◄──►│  auth.py    │◄──►│ schemas/user│      │
│  └─────────────┘    └─────────────┘    └─────────────┘      │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │ 会话管理    │    │ 双因素认证   │    │  安全日志    │      │
│  │services/    │    │  (TOTP)     │    │  core/logger │      │
│  │user_session │    └─────────────┘    └─────────────┘      │
│  └─────────────┘                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 核心功能模块

### 1. 用户认证流程

#### 1.1 注册流程
- **路径**: `POST /api/auth/register`
- **输入**: UserCreate（用户名、邮箱、密码）
- **处理逻辑**:
  1. 验证用户名唯一性
  2. 验证邮箱唯一性
  3. 密码哈希加密
  4. 创建用户记录
  5. 记录注册日志

**源码实现**:
```python
@router.post("/register", response_model=User)
def register(user: UserCreate, db: Session = Depends(get_db)):
    from app.core.logger import get_logger
    logger = get_logger(__name__)

    # 检查用户名是否已存在
    db_user = db.query(UserModel).filter(UserModel.username == user.username).first()
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )

    # 检查邮箱是否已存在
    db_user = db.query(UserModel).filter(UserModel.email == user.email).first()
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # 创建新用户
    hashed_password = get_password_hash(user.password)
    db_user = UserModel(
        username=user.username,
        email=user.email,
        password_hash=hashed_password
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    logger.info(f"用户注册成功: username={user.username}, email={user.email}, user_id={db_user.id}")
    return db_user
```
需要注意的是：
这里return db_user 不是json数据。是这个model，根据fastapi自己内容实现的model转json。太细节的我们不看。

#### 1.2 登录流程
- **路径**: `POST /api/auth/login`
- **输入**: username, password（Form 数据）
- **处理逻辑**:
  1. 验证用户名和密码
  2. 检查是否启用 2FA
     - 未启用：直接生成 JWT Token
     - 已启用：生成临时 Token，返回 2FA 验证要求
  3. 创建用户会话记录
  4. 记录登录日志

**源码实现**:
```python
@router.post("/login", response_model=Token)
async def login(
    request: Request,
    db: Session = Depends(get_db),
    username: str = Form(...),
    password: str = Form(...),
):
    """
    用户登录接口

    参数:
        username: 用户名
        password: 密码
    """
    from app.core.logger import get_logger
    logger = get_logger(__name__)

    # 查找用户
    user = db.query(UserModel).filter(UserModel.username == username).first()
    if not user or not verify_password(password, user.password_hash):
        ip = get_client_ip(request)
        logger.warning(f"登录失败（用户名或密码错误）: username={username}, ip={ip}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 检查是否启用了 2FA
    if user.two_factor_enabled:
        # 生成临时 token（仅用于 2FA 验证，不能用于访问其他 API）
        temp_token = create_access_token(
            data={"sub": user.username, "temp": True},
            expires_delta=timedelta(minutes=5)  # 5 分钟有效期
        )
        # 返回临时 token，要求用户提供 2FA 验证码
        return {
            "access_token": temp_token,
            "token_type": "bearer",
            "two_factor_required": True,
            "two_factor_secret": user.two_factor_secret
        }

    # 未启用 2FA，直接创建访问令牌和会话
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=access_token_expires
    )

    # 创建用户会话记录
    from app.services.user_session import create_user_session
    from uuid import uuid4

    session_token = str(uuid4())
    user_agent = request.headers.get("User-Agent", "")
    ip_address = get_client_ip(request)

    create_user_session(
        db=db,
        user_id=user.id,
        session_token=session_token,
        user_agent=user_agent,
        ip_address=ip_address
    )

    logger.info(f"用户登录成功: user_id={user.id}, username={user.username}, ip={ip_address}")
    return {"access_token": access_token, "token_type": "bearer"}
```

#### 1.3 双因素认证流程
- **路径**: `POST /api/auth/login/2fa`
- **输入**: username, 2FA code（Form 数据）
- **处理逻辑**:
  1. 验证临时 Token
  2. 验证 TOTP 代码
  3. 生成正式 JWT Token
  4. 创建用户会话记录
  5. 记录 2FA 登录日志

### 2. 权限验证机制

#### 2.1 JWT Token 验证
- **函数**: `get_current_user()`
- **处理逻辑**:
  1. 从 Authorization Header 提取 Token
  2. 解码 JWT Token
  3. 验证 Token 签名
  4. 从数据库查询用户信息
  5. 返回当前用户对象

**源码实现**:
```python
# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# 根据 token 获取当前用户
async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> UserModel:
    from jose import jwt, JWTError
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(UserModel).filter(UserModel.username == username).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user
```

#### 2.2 依赖注入
- **用途**: 为需要权限的路由提供用户认证
- **使用方式**: `current_user: UserModel = Depends(get_current_user)`
- **特点**: 
  - 自动处理认证流程
  - 统一的错误处理
  - 支持所有需要权限的 API

### 3. 用户管理功能

#### 3.1 获取用户信息
- **路径**: `GET /api/auth/me`
- **功能**: 返回当前登录用户的基本信息

**源码实现**:
```python
@router.get("/me", response_model=User)
def get_current_user_info(current_user: UserModel = Depends(get_current_user)):
    """获取当前登录用户信息"""
    return current_user
```

#### 3.2 更新用户信息
- **路径**: `PUT /api/auth/me`
- **输入**: UserUpdate（用户名、邮箱）
- **处理逻辑**:
  1. 验证新用户名唯一性
  2. 验证新邮箱唯一性
  3. 更新用户信息
  4. 提交数据库事务

#### 3.3 修改密码
- **路径**: `PUT /api/auth/me/password`
- **输入**: UserPasswordUpdate（当前密码、新密码）
- **处理逻辑**:
  1. 验证当前密码
  2. 生成新密码哈希
  3. 更新密码
  4. 记录密码修改日志

### 4. 双因素认证（2FA）

#### 4.1 设置 2FA
- **路径**: `POST /api/auth/me/two-factor/setup`
- **处理逻辑**:
  1. 验证用户密码
  2. 生成 TOTP 密钥
  3. 生成二维码 URL
  4. 临时存储密钥（等待验证）

**源码实现**:
```python
@router.post("/me/two-factor/setup")
def setup_two_factor(
    request: TwoFactorEnableRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """设置双因素认证 (生成密钥和二维码 URL)"""
    # 验证密码
    if not verify_password(request.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="密码不正确"
        )

    # 生成 TOTP 密钥
    secret = generate_totp_secret()
    qr_code_url = get_totp_uri(current_user.username, secret)

    # 临时存储密钥（等待验证后正式启用）
    current_user.two_factor_secret = secret
    db.commit()

    return TwoFactorSetupResponse(secret=secret, qr_code_url=qr_code_url)
```

#### 4.2 启用 2FA
- **路径**: `POST /api/auth/me/two-factor/enable`
- **处理逻辑**:
  1. 验证 TOTP 代码
  2. 正式启用 2FA
  3. 永久保存密钥

**源码实现**:
```python
@router.post("/me/two-factor/enable")
def enable_two_factor(
    request: TwoFactorVerifyRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """启用双因素认证 (验证 6 位代码)"""
    if not current_user.two_factor_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请先设置双因素认证"
        )

    # 验证 TOTP 代码
    if not verify_totp_code(current_user.two_factor_secret, request.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码不正确"
        )

    # 正式启用 2FA
    current_user.two_factor_enabled = True
    db.commit()

    return {"message": "双因素认证已启用", "two_factor_enabled": True}
```

#### 4.3 禁用 2FA
- **路径**: `POST /api/auth/me/two-factor/disable`
- **处理逻辑**:
  1. 验证密码
  2. 验证 TOTP 代码
  3. 禁用 2FA
  4. 清除密钥

#### 4.4 安全信息查询
- **路径**: `GET /api/auth/me/security`
- **功能**: 返回用户的安全相关信息（用户名、邮箱、2FA 状态等）

### 5. 安全增强功能

#### 5.1 IP 地址追踪
- **函数**: `get_client_ip()`
- **功能**: 获取客户端真实 IP 地址
- **实现**: 支持 X-Forwarded-For 头部
- **用途**: 登录日志、安全审计

#### 5.2 会话管理
- **关联模块**: `app.services.user_session`
- **功能**: 记录用户登录会话
- **记录信息**: 
  - Session Token
  - User-Agent
  - IP 地址
  - 创建时间

## 模块间依赖关系

### 1. 数据层依赖

| 依赖模块 | 用途 | 关联点 |
|---------|------|--------|
| `app.core.database` | 数据库会话注入 | 所有路由的 `db: Session = Depends(get_db)` |
| `app.core.config` | 配置参数获取 | JWT 签名密钥、Token 过期时间 |
| `app.core.logger` | 日志记录 | 各类操作的安全日志 |

### 2. Schema 依赖

| 依赖模块 | 用途 | 关联点 |
|---------|------|--------|
| `app.schemas.user` | 数据验证模型 | 所有请求/响应的数据结构定义 |
| - UserCreate | 注册请求验证 | `POST /register` |
| - UserUpdate | 更新信息验证 | `PUT /me` |
| - UserPasswordUpdate | 密码修改验证 | `PUT /me/password` |
| - Token | Token 响应模型 | 登录响应 |

### 3. 工具层依赖

| 依赖模块 | 用途 | 关联点 |
|---------|------|--------|
| `app.utils.auth` | 认证工具函数 | 密码验证、JWT 生成、2FA 功能 |
| - verify_password | 密码验证 | 所有涉及密码的操作 |
| - get_password_hash | 密码加密 | 注册、密码修改 |
| - create_access_token | JWT 生成 | 登录、2FA |
| - generate_totp_secret | TOTP 密钥生成 | 2FA 设置 |
| - get_totp_uri | 二维码 URL 生成 | 2FA 设置 |
| - verify_totp_code | TOTP 验证 | 2FA 登录、启用/禁用 |

### 4. 服务层依赖

| 依赖模块 | 用途 | 关联点 |
|---------|------|--------|
| `app.services.user_session` | 会话管理 | 登录成功后的会话创建 |

## 安全设计要点

### 1. 密码安全
- 使用 bcrypt 加密算法
- 密码哈希存储，明文不保存
- 密码修改需要验证当前密码

### 2. Token 安全
- 使用 JWT 进行身份验证
- 设置合理的过期时间
- 支持 Token 自动刷新机制（通过重新登录）

### 3. 2FA 安全
- 基于 TOTP 标准（RFC 6238）
- 支持 Google Authenticator、Authy 等应用
- 临时 Token 机制防止重放攻击

### 4. 日志安全
- 记录关键操作日志
- 敏感信息脱敏处理
- IP 地址追踪用于安全审计

## API 接口详细

### 认证相关接口

| 方法 | 路径 | 描述 | 权限要求 |
|------|------|------|----------|
| POST | /api/auth/register | 用户注册 | 无 |
| POST | /api/auth/login | 用户登录 | 无 |
| POST | /api/auth/login/2fa | 2FA 登录 | 需要 2FA |
| GET | /api/auth/me | 获取当前用户信息 | 已认证 |
| PUT | /api/auth/me | 更新用户信息 | 已认证 |
| PUT | /api/auth/me/password | 修改密码 | 已认证 |
| POST | /api/auth/me/two-factor/setup | 设置 2FA | 已认证 |
| POST | /api/auth/me/two-factor/enable | 启用 2FA | 已认证 |
| POST | /api/auth/me/two-factor/disable | 禁用 2FA | 已认证 |
| GET | /api/auth/me/security | 查询安全信息 | 已认证 |

## 扩展性考虑

### 1. 认证方式扩展
- 支持 OAuth2 第三方登录
- 支持 SAML 认证
- 支持短信验证码

### 2. 安全策略扩展
- 登录失败次数限制
- IP 白名单/黑名单
- 设备指纹识别

### 3. 会话管理扩展
- 支持多设备登录
- 支持设备管理
- 支持强制下线

## 代码重构建议

### 1. 提取公共逻辑
- 将用户验证逻辑提取为装饰器
- 统一错误处理机制
- 提取日志记录装饰器

### 2. 配置化管理
- 将认证相关配置移到配置文件
- 支持不同环境的配置
- 添加配置验证

### 3. 测试覆盖
- 增加单元测试覆盖
- 添加集成测试
- 安全测试

## 相关文档链接

- [[common/utils/auth工具]] - 认证工具函数
- [[common/services/user_session]] - 用户会话管理
- [[common/core/config]] - 应用配置管理
- [[common/core/logger]] - 日志记录系统

## 总结

Auth 模块设计遵循了安全、可靠、可扩展的原则，通过 JWT 实现了无状态认证，通过 2FA 增强了安全性，并通过完善的日志记录实现了安全审计。模块间解耦良好，便于后续扩展和维护。