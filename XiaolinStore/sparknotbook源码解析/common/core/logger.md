# 日志记录系统

## 概述

日志记录系统为 SparkNoteAI 应用提供统一的日志管理功能，包括日志分类、格式化、输出和轮转等功能。支持结构化日志，便于后续的日志分析和监控。采用集中式日志配置，支持上下文信息注入和日志降噪处理。

## 系统架构

```
┌─────────────────────────────────────────────────────┐
│                    日志系统                          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────┐  │
│  │  应用日志   │    │  安全日志   │    │  错误日志 │  │
│  │  (INFO)     │    │  (WARNING)  │    │(ERROR)   │  │
│  └─────────────┘    └─────────────┘    └─────────┘  │
│           │                  │                  │   │
│  ┌─────────────────────────────────────────────┐   │
│  │              日志处理器                      │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## 核心功能

### 1. 日志适配器 (ContextAdapter)

```python
class ContextAdapter(logging.LoggerAdapter):
    """
    日志适配器，自动注入 user_id 等上下文信息

    用法：
        logger = get_logger(__name__)
        logger.info("用户登录", user_id=123)
    """
```
**源码实现**:
```python
class ContextAdapter(logging.LoggerAdapter):
    """
    日志适配器，自动注入 user_id 等上下文信息

    用法：
        logger = get_logger(__name__)
        logger.info("用户登录", user_id=123)
    """

    def process(self, msg: str, kwargs: dict) -> tuple[str, dict]:
        extra = kwargs.get("extra", {})
        # 合并 adapter 级别的 extra 和调用级别的 extra
        extra.update(self.extra)

        user_id = extra.pop("user_id", None)
        context = ""
        if user_id is not None:
            context = f" [user_id={user_id}]"

        # 将 extra 传回，确保其他组件（如 JSON handler）能拿到
        kwargs["extra"] = extra
        return f"{context} {msg}", kwargs
```

- **用途**: 自动注入上下文信息到日志中
- **特性**: 
  - 支持 user_id 自动注入
  - 合并不同级别的 extra 信息
  - 保持原有日志功能不变

### 2. 日志工厂

```python
def get_logger(name: str) -> ContextAdapter:
    """
    获取 Logger 实例

    Args:
        name: 模块名，通常传入 __name__

    Returns:
        ContextAdapter 实例
    """
```
**源码实现**:
```python
def get_logger(name: str) -> ContextAdapter:
    """
    获取 Logger 实例

    Args:
        name: 模块名，通常传入 __name__

    Returns:
        ContextAdapter 实例
    """
    return ContextAdapter(logging.getLogger(name), {})
```

- **用途**: 创建带上下文功能的日志器
- **返回**: ContextAdapter 实例

### 3. 日志配置

```python
def setup_logging(level: str = "INFO") -> None:
    """
    配置根 Logger 的格式化和输出

    在应用启动时调用一次（main.py 中）。

    日志配置：
    - 控制台输出：所有级别
    - 文件输出：logs/app.log（所有级别），10MB 轮转，保留 10 个切片
    - 错误文件：logs/error.log（仅 ERROR 及以上），10MB 轮转，保留 10 个切片
    """
```
**源码实现**:
```python
def setup_logging(level: str = "INFO") -> None:
    """
    配置根 Logger 的格式化和输出

    在应用启动时调用一次（main.py 中）。

    日志配置：
    - 控制台输出：所有级别
    - 文件输出：logs/app.log（所有级别），10MB 轮转，保留 10 个切片
    - 错误文件：logs/error.log（仅 ERROR 及以上），10MB 轮转，保留 10 个切片
    """
    log_level = getattr(logging, level.upper(), logging.INFO)

    # 统一格式：时间 | 级别 | 模块 | 消息
    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-7s | %(name)-40s |%(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # 确保日志目录存在
    log_dir = "logs"
    os.makedirs(log_dir, exist_ok=True)

    # 控制台处理器
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.setLevel(log_level)

    # 文件处理器（所有日志）
    file_handler = RotatingFileHandler(
        filename=os.path.join(log_dir, "app.log"),
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=10,              # 保留 10 个切片
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(log_level)

    # 错误文件处理器（仅 ERROR 及以上）
    error_handler = RotatingFileHandler(
        filename=os.path.join(log_dir, "error.log"),
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=10,              # 保留 10 个切片
        encoding="utf-8",
    )
    error_handler.setFormatter(formatter)
    error_handler.setLevel(logging.ERROR)

    # 配置根 logger
    root = logging.getLogger()
    root.setLevel(log_level)
    root.addHandler(console_handler)
    root.addHandler(file_handler)
    root.addHandler(error_handler)

    # 第三方库降噪
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
```

- **用途**: 配置日志格式、输出和处理器
- **配置特点**:
  - 控制台输出：所有级别日志
  - 文件输出：app.log（所有级别，10MB 轮转）
  - 错误文件：error.log（仅 ERROR+，10MB 轮转）
  - 统一格式：`时间 | 级别 | 模块 | 消息`
- **降噪处理**: 降低第三方库日志级别

### 4. 使用示例

```python
from app.core.logger import get_logger

# 获取日志器
logger = get_logger(__name__)

# 基本日志
logger.info("用户登录成功")
logger.warning("检测到异常登录")
logger.error("数据库连接失败")

# 带上下文的日志
logger.info("用户注册成功", user_id=123, username="testuser")
logger.warning("登录失败", extra={
    "username": "testuser",
    "ip_address": "192.168.1.1",
    "action": "login_failed"
})

# 记录异常信息
try:
    # 可能出错的代码
    pass
except Exception as e:
    logger.error("操作失败", exc_info=True)
```

## 日志级别

| 级别 | 用途 | 示例场景 |
|------|------|----------|
| DEBUG | 调试信息 | 开发阶段的详细日志 |
| INFO | 一般信息 | 正常业务流程记录 |
| WARNING | 警告信息 | 潜在问题或异常情况 |
| ERROR | 错误信息 | 业务错误或系统异常 |
| CRITICAL | 严重错误 | 系统级故障 |

## 在认证模块中的应用

### 1. 用户注册日志

```python
@router.post("/register", response_model=User)
def register(user: UserCreate, db: Session = Depends(get_db)):
    logger = get_logger(__name__)
    
    # ... 注册逻辑 ...
    
    # 记录成功注册
    logger.info(
        "用户注册成功",
        extra={
            "event": "user_register",
            "user_id": db_user.id,
            "username": user.username
        }
    )
```

### 2. 登录日志

```python
@router.post("/login", response_model=Token)
async def login(request: Request, ...):
    logger = get_logger(__name__)
    
    # 登录失败日志
    logger.warning(
        "登录失败（用户名或密码错误）",
        extra={
            "event": "login_failed",
            "username": username,
            "ip_address": ip
        }
    )
    
    # 登录成功日志
    logger.info(
        "用户登录成功",
        extra={
            "event": "login_success",
            "user_id": user.id,
            "username": user.username,
            "ip_address": ip_address
        }
    )
```

### 3. 安全事件日志

```python
# 密码修改
logger.info(
    "密码已更新",
    extra={
        "event": "password_changed",
        "user_id": current_user.id
    }
)

# 2FA 启用
logger.info(
    "双因素认证已启用",
    extra={
        "event": "2fa_enabled",
        "user_id": current_user.id
    }
)

# 2FA 禁用
logger.warning(
    "双因素认证已禁用",
    extra={
        "event": "2fa_disabled",
        "user_id": current_user.id
    }
)
```

## 日志文件管理

### 1. 文件轮转
- 按大小轮转：单个文件最大 10MB
- 保留备份：最多保留 10 个历史文件
- 自动创建：自动创建不存在的日志目录

### 2. 日志目录结构
```
logs/
├── app.log          # 主日志文件
├── app.log.1       # 第一个备份
├── app.log.2       # 第二个备份
├── error.log       # 错误日志
└── error.log.1     # 错误日志备份
```

## 日志格式说明

### 1. 标准格式
```
2024-01-01 12:00:00 | INFO     | app.api.auth               | 用户登录成功 [user_id=123]
```

### 2. 格式说明
- `2024-01-01 12:00:00`: 时间戳（YYYY-MM-DD HH:MM:SS）
- `INFO`: 日志级别（7字符宽度）
- `app.api.auth`: 模块名（40字符宽度）
- `用户登录成功 [user_id=123]`: 日志消息

### 3. 上下文信息
- 自动添加 user_id 信息
- 支持 extra 字段扩展
- 保持格式一致

## 源码依赖

### 核心依赖
```python
# 主要依赖说明
import logging              # Python 标准日志库
from logging.handlers import RotatingFileHandler  # 日志轮转处理器
import os                  # 操作系统接口
import sys                 # 系统参数
```

## 相关文档链接

- [[auth模块/auth模块业务拆解]] - 认证模块的日志使用示例
- [[common/core/config]] - 应用配置管理（日志级别配置）

## 扩展建议

### 1. 日志聚合
- 集成 ELK/Loki 日志系统
- 支持日志收集和转发
- 实现分布式日志追踪

### 2. 实时监控
- 日志实时流处理
- 异常模式检测
- 自动告警机制

### 3. 日志搜索
- 全文检索支持
- 条件过滤功能
- 时间范围查询