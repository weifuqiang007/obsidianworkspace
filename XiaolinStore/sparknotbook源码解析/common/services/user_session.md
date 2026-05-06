# 用户会话管理模块

## 概述

用户会话管理模块负责记录和管理用户的登录会话信息，包括会话创建、查询和跟踪功能。该模块为安全审计和用户行为分析提供数据支持。

## 核心功能

### 1. 创建用户会话

```python
def create_user_session(
    db: Session,
    user_id: int,
    session_token: str,
    user_agent: str,
    ip_address: str
) -> UserSession:
    """创建用户会话"""
```
**源码实现**:
```python
def create_user_session(
    db: Session,
    user_id: int,
    session_token: str,
    user_agent: str,
    ip_address: str
) -> UserSession:
    """创建用户会话"""
    # 解析 User-Agent
    ua_info = parse_user_agent(user_agent)

    # 生成设备名称
    device_name = generate_device_name(ua_info['browser'], ua_info['os'], ua_info['device_type'])

    # 获取位置
    location = get_location_from_ip(ip_address)

    # 设置过期时间（7 天）
    expires_at = datetime.utcnow() + timedelta(days=7)

    # 将当前用户的其他会话设为非当前
    db.execute(
        update(UserSession)
        .where(UserSession.user_id == user_id)
        .values(is_current=False)
    )

    # 创建新会话
    session = UserSession(
        user_id=user_id,
        session_token=session_token,
        device_type=ua_info['device_type'],
        device_name=device_name,
        browser=ua_info['browser'],
        os=ua_info['os'],
        ip_address=ip_address,
        location=location,
        is_current=True,
        expires_at=expires_at
    )

    db.add(session)
    db.commit()
    db.refresh(session)

    return session
```

- **用途**: 记录用户成功登录的会话信息
- **输入参数**:
  - `db`: 数据库会话
  - `user_id`: 用户 ID
  - `session_token`: 会话令牌
  - `user_agent`: 浏览器 User-Agent 字符串
  - `ip_address`: 客户端 IP 地址
- **返回**: UserSession 对象
- **处理流程**:
  1. 解析 User-Agent 获取设备信息
  2. 生成设备名称
  3. 获取 IP 地址对应的位置
  4. 设置会话过期时间（7 天）
  5. 将用户的其他会话设为非当前
  6. 创建新会话记录

### 2. 查询用户会话

```python
def get_user_sessions(db: Session, user_id: int) -> list[UserSession]:
    """获取用户的所有会话"""
```
**源码实现**:
```python
def get_user_sessions(db: Session, user_id: int) -> list[UserSession]:
    """获取用户的所有会话"""
    stmt = (
        select(UserSession)
        .where(UserSession.user_id == user_id)
        .order_by(UserSession.last_active_at.desc())
    )
    return db.execute(stmt).scalars().all()
```

- **用途**: 获取用户的登录历史
- **输入参数**:
  - `db`: 数据库会话
  - `user_id`: 用户 ID
- **返回**: UserSession 对象列表
- **特点**: 按最后活跃时间倒序排列
- **使用位置**: 用户安全中心、登录历史查询

### 3. 会话管理

#### 注销指定会话
```python
def revoke_session(db: Session, session_id: int, user_id: int) -> bool:
    """注销指定会话"""
```
**源码实现**:
```python
def revoke_session(db: Session, session_id: int, user_id: int) -> bool:
    """注销指定会话"""
    session = db.get(UserSession, session_id)
    if session and session.user_id == user_id:
        db.delete(session)
        db.commit()
        return True
    return False
```

- **用途**: 注销指定的会话（如强制下线某个设备）
- **输入参数**:
  - `session_id`: 要注销的会话 ID
  - `user_id`: 用户 ID（所有权验证）
- **返回**: bool - 是否成功注销
- **安全措施**: 验证会话所有权，防止误删

#### 注销所有其他会话
```python
def revoke_all_other_sessions(db: Session, user_id: int, current_session_id: int) -> int:
    """注销所有其他会话，返回注销的数量"""
```
**源码实现**:
```python
def revoke_all_other_sessions(db: Session, user_id: int, current_session_id: int) -> int:
    """注销所有其他会话，返回注销的数量"""
    stmt = (
        select(UserSession)
        .where(UserSession.user_id == user_id)
        .where(UserSession.id != current_session_id)
    )
    sessions = db.execute(stmt).scalars().all()
    count = len(sessions)
    for session in sessions:
        db.delete(session)
    db.commit()
    return count
```

- **用途**: 用户可以注销所有其他设备的登录会话（如发现账户被盗）
- **输入参数**:
  - `user_id`: 用户 ID
  - `current_session_id`: 当前会话 ID（保留）
- **返回**: int - 注销的会话数量
- **应用场景**: "一键下线所有设备"功能

### 4. 会话维护

#### 更新会话活跃时间
```python
def update_session_activity(db: Session, session_id: int) -> None:
    """更新会话最后活跃时间"""
```
**源码实现**:
```python
def update_session_activity(db: Session, session_id: int) -> None:
    """更新会话最后活跃时间"""
    session = db.get(User_id)
    if session:
        session.last_active_at = datetime.utcnow()
        db.commit()
```

- **用途**: 更新会话的最后活跃时间，用于会话超时判断
- **应用**: 在用户每次请求时调用

#### 清理过期会话
```python
def cleanup_expired_sessions(db: Session) -> int:
    """清理过期会话，返回清理数量"""
```
**源码实现**:
```python
def cleanup_expired_sessions(db: Session) -> int:
    """清理过期会话，返回清理数量"""
    stmt = select(UserSession).where(UserSession.expires_at < datetime.utcnow())
    sessions = db.execute(stmt).scalars().all()
    count = len(sessions)
    for session in sessions:
        db.delete(session)
    db.commit()
    return count
```

- **用途**: 定期清理过期会话，保持数据库整洁
- **返回**: int - 清理的会话数量
- **执行策略**: 可以通过定时任务或手动触发
- **性能影响**: 减少数据库存储空间

## 数据模型

### 1. 数据模型 (UserSession)

```python
class UserSession(Base):
    """用户会话表 - 记录用户登录设备信息"""
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # 会话标识
    session_token = Column(String(255), unique=True, index=True, nullable=False)

    # 设备信息
    device_type = Column(String(50), nullable=False)  # desktop, mobile, tablet
    device_name = Column(String(100), nullable=False)  # Chrome on Mac, Safari on iPhone
    browser = Column(String(50))  # Chrome, Safari, Firefox
    os = Column(String(50))  # macOS, Windows, iOS, Android

    # 网络和位置
    ip_address = Column(String(50), nullable=False)
    location = Column(String(100))  # 北京，中国

    # 会话状态
    is_current = Column(Boolean, default=False)
    last_active_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True))

    # 关联用户
    user = relationship("User", back_populates="sessions")
```

**核心字段说明**:

| 字段 | 类型 | 描述 |
|------|------|------|
| id | int | 主键 |
| user_id | int | 关联用户 ID |
| session_token | str | 会话唯一标识符 |
| device_type | str | 设备类型（desktop, mobile, tablet） |
| device_name | str | 设备名称（"Chrome on Mac"） |
| browser | str | 浏览器类型 |
| os | str | 操作系统 |
| ip_address | str | 客户端 IP |
| location | str | 地理位置 |
| is_current | bool | 是否为当前会话 |
| last_active_at | datetime | 最后活跃时间 |
| created_at | datetime | 创建时间 |
| expires_at | datetime | 过期时间 |

### 2. 数据模型 (Schema)

#### UserSessionBase
```python
class UserSessionBase(BaseModel):
    device_type: str
    device_name: str
    browser: Optional[str] = None
    os: Optional[str] = None
    ip_address: str
    location: str
```

#### UserSessionResponse
```python
class UserSessionResponse(UserSessionBase):
    id: int
    user_id: int
    is_current: bool
    last_active_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True
```

#### 请求模型
```python
class SessionRevokeRequest(BaseModel):
    """注销会话请求（可选密码验证）"""
    password: Optional[str] = None

class SessionRevokeAllRequest(BaseModel):
    """注销所有其他会话请求"""
    password: str = Field(..., description="需要验证当前密码")
```

## 安全考虑

### 1. 敏感信息处理
- IP 地址可能包含地理位置信息
- User-Agent 可能包含设备指纹
- 定期清理历史数据，避免长期存储

### 2. 会话管理
- 每个登录会话生成唯一的 Token
- 支持多设备同时登录
- 会话过期时间可配置

### 3. 审计追踪
- 记录所有登录活动
- 支持异常登录检测
- 提供会话历史查询接口

## 使用场景

### 1. 安全审计
- 监控异常登录行为
- 追踪账户安全事件
- 支持安全调查分析

### 2. 用户体验
- 显示最近登录设备
- 提供会话管理功能
- 支持强制下线功能

### 3. 业务分析
- 分析用户登录习惯
- 识别活跃用户
- 统计登录频率

## 相关文档链接

- [[auth模块/auth模块业务拆解]] - 使用本模块的登录流程
- [[common/core/config]] - 配置管理（会话配置）

## 辅助功能

### 1. User-Agent 解析
```python
def parse_user_agent(user_agent: str) -> dict:
    """解析 User-Agent 获取设备和浏览器信息"""
    result = {
        'device_type': 'desktop',
        'browser': 'Unknown',
        'os': 'Unknown'
    }

    # 检测设备类型
    if re.search(r'Mobile|Android|iPhone|iPad', user_agent):
        if re.search(r'iPad', user_agent):
            result['device_type'] = 'tablet'
        else:
            result['device_type'] = 'mobile'

    # 检测浏览器
    if re.search(r'Edg/', user_agent):
        result['browser'] = 'Edge'
    elif re.search(r'Chrome/', user_agent):
        result['browser'] = 'Chrome'
    elif re.search(r'Safari/', user_agent):
        result['browser'] = 'Safari'
    elif re.search(r'Firefox/', user_agent):
        result['browser'] = 'Firefox'
    elif re.search(r'MSIE|Trident/', user_agent):
        result['browser'] = 'Internet Explorer'

    # 检测操作系统
    if re.search(r'Windows', user_agent):
        result['os'] = 'Windows'
    elif re.search(r'Mac OS X', user_agent):
        result['os'] = 'macOS'
    elif re.search(r'Linux', user_agent):
        result['os'] = 'Linux'
    elif re.search(r'iOS', user_agent):
        result['os'] = 'iOS'
    elif re.search(r'Android', user_agent):
        result['os'] = 'Android'

    return result
```

### 2. 设备名称生成
```python
def generate_device_name(browser: str, os: str, device_type: str) -> str:
    """生成设备名称"""
    if device_type == 'mobile':
        return f"{browser} on Mobile"
    elif device_type == 'tablet':
        return f"{browser} on Tablet"
    else:
        return f"{browser} on {os}"
```

### 3. IP 地址解析
```python
def get_location_from_ip(ip_address: str) -> str:
    """根据 IP 地址获取位置信息（简化版，实际可接入 IP 库）"""
    # 本地 IP
    if ip_address.startswith('192.168.') or ip_address.startswith('10.') or ip_address.startswith('172.'):
        return '本地网络'

    # 简化处理：默认返回未知
    # 实际项目中可以接入 MaxMind GeoIP 或 IP2Region
    return '未知位置'
```

## 扩展建议

1. **会话增强**
   - 设备指纹识别
   - 异常登录提醒
   - 会话共享管理

2. **性能优化**
   - Redis 缓存热门会话
   - 分区表存储历史数据
   - 异步清理机制

3. **功能扩展**
   - 支持会话备注
   - 会话标签分类
   - 登录统计分析