# Tesk Backend 部署文档

## 环境要求

| 组件 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | 20+ | 推荐使用 LTS 版本 |
| MySQL | 8.0+ | 需提前创建数据库 |
| Redis | 7.0+ | 必须，用于 BullMQ 队列和限流计数 |

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

### 4. 启动服务

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

### 5. 配置 Nginx 反向代理

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
