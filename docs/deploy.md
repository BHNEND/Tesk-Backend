# Tesk Backend 部署文档

## 环境要求

| 组件 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | 18+ | 推荐 20 LTS |
| MySQL | 8.0+ | 需提前创建数据库 |
| Redis | 7.0+ | BullMQ 队列依赖 |
| npm | 9+ | 随 Node.js 安装 |
| Docker | 20+ | 仅 Docker 部署方式需要 |
| Docker Compose | 2.0+ | 仅 Docker 部署方式需要 |

---

## 环境变量说明

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `PORT` | ❌ | `3000` | 服务监听端口 |
| `DATABASE_URL` | ✅ | - | MySQL 连接字符串 |
| `REDIS_URL` | ✅ | - | Redis 连接字符串 |
| `ADMIN_API_KEY` | ✅ | `admin-secret-key-change-in-production` | 管理后台 API Key |

### DATABASE_URL 格式

```
mysql://<用户名>:<密码>@<主机>:<端口>/<数据库名>
```

示例：
```
DATABASE_URL="mysql://root:your_password@localhost:3306/tesk"
```

### REDIS_URL 格式

```
redis://<主机>:<端口>
```

示例：
```
REDIS_URL="redis://localhost:6379"
```

---

## 方式一：Docker Compose 部署（推荐）

### 1. 克隆仓库

```bash
git clone https://github.com/BHNEND/Tesk-Backend.git
cd Tesk-Backend
```

### 2. 配置环境变量

```bash
cp .env.docker .env
```

编辑 `.env` 文件，修改数据库密码、Admin API Key 等敏感配置。

### 3. 一键启动

```bash
docker compose up -d
```

这会启动 3 个服务：

| 服务 | 端口映射 | 说明 |
|------|---------|------|
| `app` | `3000:3000` | Tesk Backend + 管理后台前端 |
| `db` | `3307:3306` | MySQL 8.0 |
| `redis` | `6379:6379` | Redis 7 |

### 4. 初始化数据库

首次启动后，在 app 容器内执行数据库迁移：

```bash
docker compose exec app npx prisma db push
```

### 5. 验证服务

```bash
# 健康检查
curl http://localhost:3000/health
# 预期输出: {"status":"ok"}
```

### 常用命令

```bash
# 查看日志
docker compose logs -f app

# 重启服务
docker compose restart app

# 停止所有服务
docker compose down

# 停止并清除数据卷（⚠️ 会丢失数据）
docker compose down -v
```

---

## 方式二：手动部署

### 1. 克隆仓库

```bash
git clone https://github.com/BHNEND/Tesk-Backend.git
cd Tesk-Backend
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
DATABASE_URL="mysql://root:your_password@localhost:3306/tesk"
REDIS_URL="redis://localhost:6379"
PORT=3000
ADMIN_API_KEY="your-secure-admin-key"
```

### 4. 创建数据库

在 MySQL 中创建数据库：

```sql
CREATE DATABASE IF NOT EXISTS tesk DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 5. 数据库迁移

```bash
npx prisma db push
```

### 6. 构建管理后台前端（可选）

```bash
cd admin
npm install
npm run build
cd ..
```

> 构建产物会输出到 `admin/dist/`，由 Fastify 静态托管。不构建不影响 API 功能。

### 7. 启动服务

**开发模式（热重载）：**

```bash
npm run dev
```

**生产模式：**

```bash
npm run build
npm start
```

### 8. 验证服务

```bash
curl http://localhost:3000/health
```

---

## Prisma 常用命令

| 命令 | 说明 |
|------|------|
| `npx prisma db push` | 同步 Schema 到数据库（开发用） |
| `npx prisma migrate dev` | 创建迁移文件（生产推荐） |
| `npx prisma migrate deploy` | 执行迁移（生产环境） |
| `npx prisma generate` | 重新生成 Prisma Client |
| `npx prisma studio` | 打开数据库可视化工具 |

---

## 管理后台访问

部署成功后，管理后台前端通过 Fastify 静态托管：

```
http://<host>:<port>/admin/
```

> 如果没有构建管理后台前端，此路径不可用。API 接口不受影响。

---

## 常见问题

### Q: 启动报错 `Access denied for user`

检查 `DATABASE_URL` 中的用户名和密码是否正确，确保 MySQL 已创建对应数据库。

### Q: Redis 连接失败

确认 Redis 服务已启动：`redis-cli ping`，预期返回 `PONG`。

### Q: Worker 没有处理任务

Worker 随主进程启动，确认日志中有 `Worker started` 输出。检查 BullMQ 队列连接是否正常。

### Q: Webhook 回调失败

检查 `callBackUrl` 是否可从服务器访问（公网可达），目标服务是否正常响应 POST 请求。
