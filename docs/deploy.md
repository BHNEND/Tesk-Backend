# Tesk Backend 部署文档

## 环境要求

| 组件 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | 20+ | 推荐使用 LTS 版本 |
| MySQL | 8.0+ | 需提前创建数据库，`max_connections` 建议 500+ |
| Redis | 7.0+ | 用于 BullMQ 队列、限流计数、上游并发管理 |

---

## 环境变量配置 (`.env`)

复制 `.env.example` 为 `.env`，按实际情况填写：

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `PORT` | ❌ | `4000` | 后端服务监听端口 |
| `DATABASE_URL` | ✅ | - | MySQL 连接字符串 (格式: `mysql://user:pass@host:3306/db`) |
| `REDIS_URL` | ✅ | - | Redis 连接字符串 (格式: `redis://host:6379`) |
| `ADMIN_USER` | ❌ | `admin` | 管理后台登录账号 |
| `ADMIN_PASS` | ❌ | `admin123` | 管理后台登录密码 |
| `ADMIN_API_KEY` | ✅ | - | 管理后台接口鉴权 Key |
| `UPSTREAM_CONFIG` | ❌ | `[]` | 上游并发排队配置 (JSON格式) |
| `RUNNINGHUB_API_KEY` | ❌ | - | RunningHub 上游 API Key |
| `GPTIMAGE2_API_KEY` | ❌ | - | GPT Image 2 上游 API Key |
| `GEMINI_API_KEY` | ❌ | - | Gemini 上游 API Key |
| `S3_ENDPOINT` | ❌ | - | S3 对象存储地址 |
| `S3_REGION` | ❌ | `auto` | S3 区域 |
| `S3_ACCESS_KEY` | ❌ | - | S3 Access Key |
| `S3_SECRET_KEY` | ❌ | - | S3 Secret Key |
| `S3_BUCKET` | ❌ | - | S3 Bucket 名称 |

### 调优变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `WORKER_CONCURRENCY` | `20` | 每个 Model Worker 进程的并行任务数 |
| `APP_WORKER_CONCURRENCY` | `4` | 每个 App Worker 进程的并行任务数 |
| `PROCESS_TYPE` | `all` | 进程模式：`all`/`api`/`worker`/`app-worker`/`timeout` |
| `DATABASE_POOL_LIMIT` | `30` | Prisma 数据库连接池大小 |

### UPSTREAM_CONFIG 示例
```json
[
  { "platform": "runninghub", "key": "rh_key_1", "concurrency": 3 },
  { "platform": "runninghub", "key": "rh_key_2", "concurrency": 2 }
]
```

---

## 部署步骤

### 1. 本地打包

```bash
npm run pack
```

自动构建前端 + 后端，生成 `tesk-deploy.tar.gz`。

### 2. 上传到服务器

```bash
# 上传压缩包后解压
mkdir -p /www/wwwroot/tesk-backend
tar -xzf tesk-deploy.tar.gz -C /www/wwwroot/tesk-backend
cd /www/wwwroot/tesk-backend
```

### 3. 安装依赖 & 初始化数据库

```bash
cp .env.example .env && vi .env   # 编辑环境变量
npm install --production
npx prisma db push && npx prisma generate
mkdir -p storage
```

### 4. 调整 MySQL 连接数

默认配置下总 DB 连接数 = API(15) + Worker×5(40×5) + App-Worker×2(10×2) + Timeout(5) = 240。需要调高 MySQL 限制：

```sql
SET GLOBAL max_connections = 600;
```

或永久生效，在 `my.cnf` 中添加：
```ini
[mysqld]
max_connections = 600
```

### 5. 启动服务

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

这会启动 9 个进程：

| 进程名 | 数量 | 说明 | 内存上限 |
|--------|------|------|---------|
| `tesk-api` | 1 | HTTP API 服务 | 1G |
| `tesk-worker` | 5 | Model 任务处理 Worker | 2G |
| `tesk-app-worker` | 2 | App 任务处理 Worker（上游 Key 并发控制） | 1G |
| `tesk-timeout` | 1 | 超时检查器 | 512M |

Model 并发能力 = 5 × 20 (WORKER_CONCURRENCY) = **100 并发 Model 任务**。
App 并发能力 = 2 × 4 (APP_WORKER_CONCURRENCY) = **8 并发 App 任务**（匹配上游 Key 总量）。

### 6. 扩缩 Worker

```bash
pm2 scale tesk-worker 20       # Model Worker 扩到 20 = 400 并发
pm2 scale tesk-worker 5        # 缩回来
pm2 scale tesk-app-worker 4    # App Worker 扩到 4（需要上游 Key 总量同步增加）
```

扩容后注意 DB 连接数也需要相应增加。

### 7. 配置 Nginx 反向代理

在站点 Nginx 配置文件中添加：

```nginx
location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
}
```

> **注意**：SPA fallback 由后端 Fastify 处理，无需配置 Nginx 伪静态。

---

## 监控

```bash
pm2 status                       # 查看所有进程状态、CPU、内存
pm2 logs tesk-worker --lines 50  # 查看 Worker 日志（含内存占用）
pm2 monit                        # 实时 CPU/内存监控面板

# Redis 队列状态
redis-cli LLEN "bull:task-processing:wait"         # Model 等待队列深度
redis-cli ZCARD "bull:task-processing:active"      # Model 执行中任务数
redis-cli LLEN "bull:task-processing-app:wait"     # App 等待队列深度
redis-cli ZCARD "bull:task-processing-app:active"  # App 执行中任务数
redis-cli LLEN "bull:webhook-delivery:wait"        # Webhook 队列深度
redis-cli KEYS "upstream:concurrency:*"            # 上游 Key 并发占用
```

Worker 日志中会输出每个任务的内存增量：
```
[MEM] task=task_xxx handler=runninghub/xxx time=12340ms mem=85→92MB (+7MB)
[MEM] pid=12345 rss=210MB heap=180/250MB ext=12MB   # 每 30 秒进程概览
```

---

## 访问验证

- **健康检查**：`https://您的域名/health` → `{"status":"ok"}`
- **管理后台**：`https://您的域名/admin`

---

## 常见问题

### 管理后台白屏
- 检查 `admin/dist/` 目录下是否有 `index.html`
- 检查 `.env` 中 `ADMIN_USER` / `ADMIN_PASS` 是否正确

### 上游并发排队失效
- 确认 Redis 运行正常，`REDIS_URL` 配置正确

### Worker 频繁重启
- 检查 `pm2 logs tesk-worker`，如果看到内存超限，降低 `WORKER_CONCURRENCY` 或增大 `max_memory_restart`
- 图像类任务内存占用较高（+30~50MB/任务），API 轮询类较低（+5~10MB/任务）

### MySQL 连接数不够
- 报错 `Too many connections`：调高 MySQL `max_connections`，或减少 Worker 实例数 / 降低 `DATABASE_POOL_LIMIT`
