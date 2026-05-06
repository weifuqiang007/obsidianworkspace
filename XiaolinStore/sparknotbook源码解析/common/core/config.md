# 应用配置管理模块

## 概述

配置管理模块负责统一管理和应用的所有配置参数，包括数据库连接、认证设置、安全策略等。采用集中式配置管理，便于维护和环境切换。使用 Pydantic Settings 实现类型安全的配置管理。

## 配置结构

### 1. 基础配置

```python
class Settings(BaseSettings):
    """应用配置

    赋值优先级：
    1. 环境变量（Docker 注入）
    2. 代码默认值（仅开发环境兜底）
    """
```
**源码实现**:
```python
class Settings(BaseSettings):
    """应用配置

    赋值优先级：
    1. 环境变量（Docker 注入）
    2. 代码默认值（仅开发环境兜底）
    """
    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=None,  # 不读取 .env 文件，仅使用环境变量
    )

    # 应用
    APP_NAME: str = "SparkNoteAI"
    APP_VERSION: str = "dev"
    BUILD_NUMBER: str = "unknown"
    DEBUG: bool = False

    API_BASE_URL: str = "http://localhost:8000"
```

- **用途**: 应用基础配置管理
- **配置优先级**: 环境变量 > 代码默认值
- **特点**: 
  - case_sensitive=True: 环境变量区分大小写
  - env_file=None: 不读取 .env 文件，仅使用环境变量
- **字段说明**:
  - `APP_NAME`: 应用名称
  - `APP_VERSION`: 应用版本
  - `BUILD_NUMBER`: 构建编号
  - `DEBUG`: 调试模式
  - `API_BASE_URL`: API 基础 URL

### 2. 数据库和缓存配置

```python
# 数据库 / 缓存
# 开发环境默认直连 localhost（Docker 环境会覆盖为 db 主机名）
DATABASE_URL: str = "postgresql://sparknoteai:sparknoteai123@localhost:5432/sparknoteai"
REDIS_URL: str = "redis://:sparknoteai123@localhost:6379/0"
```
**源码实现**:
```python
# 数据库 / 缓存
# 开发环境默认直接 localhost（Docker 环境会覆盖为 db 主机名）
DATABASE_URL: str = "postgresql://sparknoteai:sparknoteai123@localhost:5432/sparknoteai"
REDIS_URL: str = "redis://:sparknoteai123@localhost:6379/0"
```

- **用途**: 数据库和缓存连接配置
- **DATABASE_URL**: PostgreSQL 数据库连接字符串
- **REDIS_URL**: Redis 缓存连接字符串

### 3. 认证和安全配置

```python
# JWT
# 开发环境默认 key，生产环境必须通过环境变量覆盖
SECRET_KEY: str = "dev-secret-key-change-in-production"
ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 天
```
**源码实现**:
```python
# JWT
# 开发环境默认 key，生产环境必须通过环境变量覆盖
SECRET_KEY: str = "dev-secret-key-change-in-production"
ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 天
```

- **用途**: JWT 认证配置
- **SECURITY**: 重要 - 生产环境必须通过环境变量覆盖
- **字段说明**:
  - `SECRET_KEY`: JWT 签名密钥（生产环境必须更换）
  - `ALGORITHM`: 签名算法（HS256）
  - `ACCESS_TOKEN_EXPIRE_MINUTES`: Token 过期时间（7 天）

# 加密密钥
ENCRYPTION_KEY: str = "0mcgyRBQCP6VQRPAMarqRiJ_7eGyDHv-DVHm4L3gZsY="
```
**源码实现**:
```python
# 加密密钥（开发环境使用有效的 Fernet key，生产环境必须通过环境变量覆盖）
ENCRYPTION_KEY: str = "0mcgyRBQCP6VQRPAMarqRiJ_7eGyDHv-DVHm4L3gZsY="
```

- **用途**: 数据加密密钥（用于敏感数据加密）
- **注意**: 生产环境必须通过环境变量覆盖

### 4. CORS 配置

```python
# CORS（存为字符串，通过 property 转为 list 供外界使用）
CORS_ORIGINS: str = (
    "http://localhost:8081,"
    "http://localhost:19000,"
    "http://localhost:19001,"
    "http://localhost:19002,"
    "http://127.0.0.1:8081,"
    "http://127.0.0.1:19000,"
    "http://127.0.0.1:19001,"
    "http://127.0.0.1:19002,"
    "http://127.0.0.1,"
    "http://localhost"
)
```
**源码实现**:
```python
# CORS（存为字符串，通过 property 转为 list 供外界使用）
CORS_ORIGINS: str = (
    "http://localhost:8081,"
    "http://localhost:19000,"
    "http://localhost:19001,"
    "http://localhost:19002,"
    "http://127.0.0.1:8081,"
    "http://127.0.0.1:19000,"
    "http://127.0.0.1:19001,"
    "http://127.0.0.1:19002,"
    "http://127.0.0.1,"
    "http://localhost"
)

@property
def cors_origins(self) -> List[str]:
    return [url.strip() for url in self.CORS_ORIGINS.split(",") if url.strip()]
```

- **用途**: 跨域资源共享配置
- **存储方式**: 存储为字符串，通过 property 转换为列表
- **用途**: FastAPI 的 CORS 中间件使用

### 5. 其他配置

```python
# 兼容的客户端版本
COMPATIBLE_CLIENT_VERSIONS: str = ""

# Neo4j
NEO4J_URI: str = "bolt://localhost:7687"
NEO4J_USER: str = "neo4j"
NEO4J_PASSWORD: str = "sparknoteai123"

# 管理员账号
ADMIN_USERNAME: str = "admin"
ADMIN_PASSWORD: str = "admin123"
ADMIN_EMAIL: str = "admin@example.com"
```
**源码实现**:
```python
# 兼容的客户端版本
COMPATIBLE_CLIENT_VERSIONS: str = ""

# Neo4j
NEO4J_URI: str = "bolt://localhost:7687"
NEO4J_USER: str = "neo4j"
NEO4J_PASSWORD: str = "sparknoteai123"

# 管理员账号
ADMIN_USERNAME: str = "admin"
ADMIN_PASSWORD: str = "admin123"
ADMIN_EMAIL: str = "admin@example.com"
```

- **用途**:
  - `COMPATIBLE_CLIENT_VERSIONS`: 兼容的客户端版本列表
  - `NEO4J_*`: Neo4j 图数据库连接配置
  - `ADMIN_*`: 默认管理员账号信息

## 配置加载机制

## 配置加载机制

### 1. 配置优先级
```python
model_config = SettingsConfigDict(
    case_sensitive=True,      # 环境变量区分大小写
    env_file=None,           # 不读取 .env 文件，仅使用环境变量
)
```

### 2. 配置解析
```python
# 实例化全局配置对象
settings = Settings()
```

### 3. 特殊配置处理

#### CORS 原始字符串转换
```python
@property
def cors_origins(self) -> List[str]:
    """将 CORS_ORIGINS 字符串转换为列表"""
    return [url.strip() for url in self.CORS_ORIGINS.split(",") if url.strip()]
```

**使用示例**:
```python
# 在代码中使用
from app.core.config import settings

# 获取 CORS 允许的源
allowed_origins = settings.cors_origins

# 使用示例
origins = settings.cors_origins
```

## 配置验证

### 1. 自动验证机制
- Pydantic 自动进行类型验证
- 必填字段验证（`: str` 等类型注解）
- 运行时类型检查

### 2. 配置验证示例

#### 环境变量验证
```python
# SECRET_KEY 必须存在且足够长
SECRET_KEY: str = "dev-secret-key-change-in-production"
# 如果环境变量不存在，将使用默认值
# 如果类型不匹配，Pydantic 会抛出 ValidationError

# 整数值验证
ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
# 自动将字符串转换为整数（如果可能）
```

### 3. 错误处理
```python
from pydantic import ValidationError

try:
    settings = Settings()
except ValidationError as e:
    print("配置验证失败:", e.errors)
```

## 配置使用示例

### 1. 在认证模块中使用
```python
from app.core.config import settings

# 创建 JWT Token
access_token = create_access_token(
    data={"sub": user.username},
    expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
)
```

### 2. 在应用初始化中使用
```python
from app.core.config import settings

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    debug=settings.DEBUG
)
```

### 3. 在中间件中使用
```python
from app.core.config import settings

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## 环境配置文件示例

### .env.development
```env
DEBUG=True
DATABASE_URL=sqlite:///./app.db
SECRET_KEY=development-secret-key
LOG_LEVEL=DEBUG
```

### .env.production
```env
DEBUG=False
DATABASE_URL=postgresql://user:pass@localhost/sparknoteai
SECRET_KEY=production-secret-key-32-characters-long
LOG_LEVEL=INFO
```

## 配置最佳实践

### 1. 安全性
- 敏感信息使用环境变量
- 生产环境使用强密钥
- 定期轮换密钥

### 2. 维护性
- 配置分类管理
- 清晰的文档说明
- 版本控制管理

### 3. 扩展性
- 支持动态配置更新
- 配置热加载支持
- 环境隔离设计

## 相关文档链接

- [[auth模块/auth模块业务拆解]] - 使用本模块的认证配置
- [[common/utils/auth工具]] - JWT 配置使用
- [[common/core/logger]] - 日志配置

## 扩展建议

1. **配置中心化**
   - 支持 Apollo/Nacos 配置中心
   - 配置版本管理
   - 配置变更通知

2. **动态配置**
   - 配置热更新
   - 灰度发布支持
   - 配置回滚机制

3. **监控告警**
   - 配置变更审计
   - 异常配置检测
   - 配置健康检查