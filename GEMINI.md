# Tesk-Backend

Tesk-Backend 是一个健壮的任务处理与管理系统，旨在处理异步任务（通常与模型推理相关），并内置了管理后台。该项目采用了 Fastify、Prisma 和 BullMQ 的现代技术栈。

## 项目概述

-   **核心用途**：提供一个分布式的任务队列系统，包含用于提交任务的 API 和用于监控的任务管理后台。
-   **系统架构**：
    -   **API 服务器**：基于 **Fastify** (TypeScript)。负责任务提交、状态查询和后台管理接口。
    -   **任务队列**：由 **BullMQ** 和 **Redis** 驱动，实现可靠的分布式任务处理。
    -   **持久化层**：使用 **Prisma ORM** 配合 **MySQL** 数据库，存储任务元数据、日志和 API 密钥。
    -   **管理后台**：一个基于 **React** 的单页应用（位于 `admin/` 目录），由后端在 `/admin/` 路径下挂载提供。
    -   **Webhook 支持**：任务完成和进度更新时，会自动触发 Webhook 回调。

## 技术栈

-   **运行时**: Node.js (v20+, 开发阶段使用 `tsx`)
-   **后端**: Fastify, TypeScript
-   **数据库**: MySQL, Prisma ORM
-   **队列/缓存**: Redis, BullMQ
-   **管理后台**: React, Vite, Tailwind CSS

## 目录结构

-   `src/`: 后端源代码。
    -   `config/`: Prisma, BullMQ, Redis 及环境变量配置。
    -   `middleware/`: 鉴权 (API Key & Admin Key) 及限流逻辑。
    -   `routes/`: API 端点定义（Jobs & Admin）。
    -   `services/`: 核心业务逻辑（任务创建、超时检查、Webhook）。
    -   `workers/`: BullMQ Worker 实现，负责具体的任务执行。
-   `admin/`: 管理后台源代码 (React + Vite)。
-   `prisma/`: Prisma Schema 定义及数据库迁移文件。
-   `docs/`: API 文档 (`api.md`) 及部署相关文档。

## 构建与运行指南

### 环境准备

1.  **Node.js**: 确保已安装 v20 或更高版本。
2.  **MySQL**: 确保已安装并运行 MySQL 服务，且已创建数据库。
3.  **Redis**: 确保已安装并运行 Redis 服务。

### 初始化步骤

1.  复制环境变量模板并根据实际情况修改：
    ```bash
    cp .env.example .env
    ```
2.  安装所有依赖：
    ```bash
    npm install
    cd admin && npm install && cd ..
    ```
3.  在根目录的 `.env` 中配置正确的 `DATABASE_URL` 和 `REDIS_URL`。

### 本地运行

1.  初始化数据库（同步表结构）：
    ```bash
    npm run init-db
    ```
2.  启动后端服务（开发模式）：
    ```bash
    npm run dev
    ```
3.  启动管理后台（开发模式）：
    ```bash
    cd admin && npm run dev
    ```

### 生产环境构建与部署

1.  构建管理后台：
    ```bash
    cd admin && npm run build && cd ..
    ```
2.  将后台产物链接到后端静态资源目录：
    ```bash
    # 后端默认在根目录的 public 文件夹下寻找静态资源
    # Linux/macOS:
    ln -s admin/dist public
    # Windows:
    mklink /D public admin\dist
    ```
3.  构建后端代码：
    ```bash
    npm run build
    ```
4.  启动生产服务器：
    ```bash
    npm run start
    ```

## 开发约定

-   **鉴权机制**:
    -   **公共 API**: 使用 Bearer Token 鉴权（基于 `ApiKey` 表）。
    -   **管理接口**: 使用环境变量中定义的 `ADMIN_API_KEY`。
-   **任务处理**: 所有长时任务必须通过 `taskService` 加入 BullMQ 队列。
-   **Webhook**: 任务在状态变更（进度、成功、失败）时必须触发 Webhook。
-   **数据库变更**: 所有数据模型变更必须首先在 `prisma/schema.prisma` 中定义。
