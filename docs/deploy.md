# Tesk Backend 部署文档

本文档为您提供在生产环境中部署 Tesk 后端及管理后台的最佳实践，特别推荐使用 **宝塔面板（BT Panel）** 配合 **本地构建前端** 的分体式部署方案。

## 环境要求

| 组件 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | 20+ | 推荐使用 LTS 版本 |
| MySQL | 8.0+ | 需提前创建数据库 |
| Redis | 7.0+ | 必须，用于 BullMQ 队列和限流计数 |

---

## 环境变量配置 (`.env`)

在项目根目录复制 `.env.example` 并重命名为 `.env`。以下是核心配置项说明：

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `PORT` | ❌ | `4000` | 后端服务监听端口 |
| `DATABASE_URL` | ✅ | - | MySQL 连接字符串 (格式: `mysql://user:pass@host:3306/db`) |
| `REDIS_URL` | ✅ | - | Redis 连接字符串 (格式: `redis://host:6379`) |
| `ADMIN_USER` | ❌ | `admin` | 管理后台登录账号 |
| `ADMIN_PASS` | ❌ | `admin123` | 管理后台登录密码 |
| `ADMIN_API_KEY` | ✅ | - | 管理后台接口鉴权 Key（登录成功后颁发的 Token） |
| `UPSTREAM_CONFIG` | ❌ | `[]` | 上游并发排队配置 (JSON格式) |

### UPSTREAM_CONFIG 示例
用于配置上游 API Key 及并发限制，实现无数据库的高效自动排队与负载均衡：
```json
[
  { "platform": "runninghub", "key": "rh_key_1", "concurrency": 3 },
  { "platform": "runninghub", "key": "rh_key_2", "concurrency": 2 }
]
```

---

## 推荐部署方案：本地构建 + 宝塔部署后端

为了降低服务器构建时的内存消耗并提高稳定性，我们推荐**在本地构建前端产物，然后将产物和后端源码一起上传至服务器**。

### 阶段一：本地构建前端 (Local Machine)

1.  **同步最新 API 文档**：
    将后端的文档同步给前端使用：
    ```bash
    cp docs/api.md admin/public/api.md
    ```
2.  **安装依赖并构建**：
    ```bash
    cd admin
    npm install
    npm run build
    ```
3.  **检查产物**：
    确认生成了 `admin/dist` 文件夹。

### 阶段二：上传至服务器 (Upload)

1.  **上传后端源码**：将项目根目录的内容上传到服务器对应的网站目录（例如 `/www/wwwroot/tesk-backend`）。
    > ⚠️ **注意**：不要上传 `node_modules` 文件夹。
2.  **上传前端产物**：将刚才本地生成的 **`admin/dist`** 文件夹，完整上传到服务器的 `admin/` 目录下（最终路径应为 `/www/wwwroot/tesk-backend/admin/dist`）。

### 阶段三：服务器环境配置与启动 (Server Terminal)

在宝塔面板打开终端，执行以下命令：

1.  **进入项目目录**：
    ```bash
    cd /www/wwwroot/tesk-backend
    ```
2.  **安装生产环境依赖**：
    ```bash
    npm install --production
    ```
3.  **初始化数据库**：
    ```bash
    npx prisma db push
    npx prisma generate
    ```
4.  **编译后端 TypeScript**：
    ```bash
    npm run build
    ```
5.  **建立静态资源链接（最关键一步）**：
    后端在生产环境下寻找 `public` 文件夹来提供管理后台服务。我们需要将上传的 `dist` 链接过去：
    ```bash
    # 如果已存在 public 文件夹请先删除
    rm -rf public
    # 创建软链接：让后端找到前端构建产物
    ln -s /www/wwwroot/tesk-backend/admin/dist /www/wwwroot/tesk-backend/public
    ```

### 阶段四：使用 PM2 启动服务 (宝塔面板)

1.  在宝塔面板进入“网站” -> “Node项目” -> “添加Node项目”。
2.  **项目执行文件**：选择根目录下的 `dist/index.js`。
3.  **项目名称**：`tesk-backend`。
4.  **端口**：填写您 `.env` 中配置的端口（如 `4000`）。
5.  **运行用户**：`www`。
6.  提交后，确保项目状态为“运行中”。

---

## 域名与反向代理配置 (Nginx)

如果您希望通过域名（如 `api.yourdomain.com`）访问服务：

1.  **添加站点**：在宝塔“网站”中添加一个纯静态站点，绑定您的域名。
2.  **配置反向代理**：
    *   点击站点设置 -> “反向代理” -> “添加反向代理”。
    *   **代理名称**：`backend`。
    *   **目标URL**：`http://127.0.0.1:4000`。
3.  **配置 SPA 伪静态**（确保刷新后台页面不报 404）：
    在站点设置的“伪静态”或“配置文件”中加入：
    ```nginx
    location /admin {
        try_files $uri $uri/ /admin/index.html;
    }
    ```

---

## 访问与验证

部署成功后，您可以访问以下地址：

*   **健康检查**：`http://您的域名/health` (预期返回 `{"status":"ok",...}`)
*   **管理后台**：`http://您的域名/admin` (自动跳转登录页，使用 `.env` 中的账号密码登录)

---

## 常见问题排查

### 1. 管理后台白屏或 404
*   确认服务器上是否存在 `/www/wwwroot/tesk-backend/public` 的软链接，且它正确指向了 `admin/dist`。
*   确认您在本地前端执行 `npm run build` 前，后端 `vite.config.ts` 中的 `base` 已经设置为 `/admin/`。

### 2. 登录失败 / 无响应
*   确认后端的 Nginx 反向代理正确配置了 WebSocket/Headers 透传（如果需要）。
*   确认 `.env` 中的 `ADMIN_USER` 和 `ADMIN_PASS` 正确无误。

### 3. 上游并发排队失效 (UpstreamBusy 报错后无动作)
*   请确认 Redis 服务运行正常，并且 `REDIS_URL` 配置正确。并发控制和 BullMQ 均强依赖 Redis。
