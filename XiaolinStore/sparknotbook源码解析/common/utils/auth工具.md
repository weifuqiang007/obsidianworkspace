# Auth 工具模块

## 概述

Auth 工具模块是 SparkNoteAI 应用中的核心认证工具集合，提供了密码加密、JWT 生成、双因素认证等功能。这些工具函数被多个业务模块使用，是认证系统的基石。

## 核心功能

### 1. 密码处理

#### verify_password()
```python
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return pwd_context.verify(plain_password, hashed_password)
```
**源码实现**:
```python
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return pwd_context.verify(plain_password, hashed_password)
```

- **用途**: 验证用户输入的密码是否正确
- **实现**: 使用 bcrypt 算法进行安全验证
- **使用位置**: 登录验证、密码修改、2FA 启用等
- **返回**: bool - 密码是否正确

#### get_password_hash()
```python
def get_password_hash(password: str) -> str:
    """生成密码哈希"""
    return pwd_context.hash(password)
```
**源码实现**:
```python
def get_password_hash(password: str) -> str:
    """生成密码哈希"""
    return pwd_context.hash(password)
```

- **用途**: 将明文密码转换为哈希值存储
- **实现**: 使用 bcrypt 算法进行单向加密
- **使用位置**: 用户注册、密码修改
- **返回**: str - 密码的哈希值

### 2. JWT Token 处理

#### create_access_token()
```python
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建 JWT Token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt
```
**源码实现**:
```python
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建 JWT Token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt
```

- **用途**: 生成 JWT 访问令牌
- **参数**: 
  - `data`: Token 载荷数据（如用户名）
  - `expires_delta`: 可选的过期时间
- **使用位置**: 用户登录、2FA 验证
- **返回**: str - JWT 令牌字符串

#### decode_token()
```python
def decode_token(token: str) -> Optional[dict]:
    """解码 JWT Token"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None
```
**源码实现**:
```python
def decode_token(token: str) -> Optional[dict]:
    """解码 JWT Token"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None
```

- **用途**: 解析并验证 JWT Token
- **返回**: Token 载荷数据或 None（无效时）
- **使用位置**: Token 验证中间件

### 3. 双因素认证 (2FA)

#### generate_totp_secret()
```python
def generate_totp_secret() -> str:
    """生成 TOTP 密钥"""
    return pyotp.random_base32()
```
**源码实现**:
```python
def generate_totp_secret() -> str:
    """生成 TOTP 密钥"""
    return pyotp.random_base32()
```

- **用途**: 生成 TOTP（基于时间的一次性密码）密钥
- **实现**: 使用 pyotp 库生成随机 Base32 密钥
- **使用位置**: 2FA 设置流程
- **返回**: str - TOTP 密钥字符串

#### get_totp_uri()
```python
def get_totp_uri(username: str, secret: str, issuer: str = "SparkNoteAI") -> str:
    """获取 TOTP URI (用于生成二维码)"""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=username, issuer_name=issuer)
```
**源码实现**:
```python
def get_totp_uri(username: str, secret: str, issuer: str = "SparkNoteAI") -> str:
    """获取 TOTP URI (用于生成二维码)"""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=username, issuer_name=issuer)
```

- **用途**: 生成用于扫码配置的 TOTP URI
- **参数**:
  - `username`: 用户名
  - `secret`: TOTP 密钥
  - `issuer`: 发行者名称（默认 "SparkNoteAI"）
- **返回**: 符合 OTP 标准的 QR 码 URL
- **使用位置**: 2FA 设置页面显示

#### verify_totp_code()
```python
def verify_totp_code(secret: str, code: str) -> bool:
    """验证 TOTP 代码"""
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)  # 允许前后 1 个时间窗口的误差
```
**源码实现**:
```python
def verify_totp_code(secret: str, code: str) -> bool:
    """验证 TOTP 代码"""
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)  # 允许前后 1 个时间窗口的误差
```

- **用途**: 验证用户输入的 2FA 验证码
- **参数**: 
  - `secret`: TOTP 密钥
  - `code`: 用户输入的 6 位验证码
- **特点**: 支持 1 个时间窗口的容错
- **使用位置**: 2FA 登录、启用/禁用验证
- **返回**: bool - 验证码是否正确

## 源码依赖

### 核心依赖
```python
# 主要依赖说明
from jose import JWTError, jwt          # JWT 令牌处理
from passlib.context import CryptContext  # 密码加密
import pyotp                          # TOTP 实现
from ..core.config import settings    # 应用配置
```

### 配置依赖
- **SECRET_KEY**: JWT 签名密钥
- **ALGORITHM**: 签名算法（默认 HS256）
- **ACCESS_TOKEN_EXPIRE_MINUTES**: Token 过期时间

## 相关文档链接

- [[auth模块/auth模块业务拆解]] - 使用本模块的业务逻辑
- [[common/core/config]] - 配置管理（JWT 配置）
- [[common/services/user_session]] - 用户会话管理

## 扩展建议

1. **支持更多认证方式**
   - SMS 验证码
   - 邮箱验证码
   - 生物识别

2. **增强安全特性**
   - 密码策略检查
   - 登录尝试限制
   - 设备指纹识别

3. **性能优化**
   - Token 缓存机制
   - 异步处理支持