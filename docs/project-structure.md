# 项目文件结构说明

本文档描述 Tesk-Backend 项目的完整目录结构与各文件职责。

---

## 根目录

```
Tesk-Backend/
├── admin/                  # 管理后台前端（React SPA）
├── dist/                   # TypeScript 编译输出
├── docs/                   # 项目文档
├── prisma/                 # 数据库 Schema
├── public -> admin/dist    # 符号链接，指向前端构建产物
├── scripts/                # 实用脚本
├── src/                    # 后端源码
├── storage/                # 本地文件存储（如解码后的图片）
├── package.json            # Node.js 项目配置
├── tsconfig.json           # TypeScript 编译配置
├── ecosystem.config.cjs    # PM2 生产部署配置
├── .env.example            # 环境变量模板
└── CLAUDE.md               # Claude Code 辅助指引
```

---

## 后端源码 `src/`

```
src/
├── index.ts                # 服务入口：Fastify 初始化、路由注册、Worker 启动
│
├── config/                 # 配置层
│   ├── env.ts              # 环境变量统一管理
│   ├── prisma.ts           # Prisma 客户端实例
│   ├── redis.ts            # Redis 连接配置
│   ├── bullmq.ts           # BullMQ 队列与 Worker 配置
│   └── s3.ts               # AWS S3 对象存储客户端
│
├── middleware/              # 中间件
│   ├── auth.ts             # API Key 认证（含 IP 白名单、RPM 限流）
│   ├── adminAuth.ts        # Admin API Key 认证
│   └── rateLimit.ts        # Fastify 全局限流配置
│
├── routes/                  # API 路由
│   ├── jobs.ts             # 公开接口：任务创建、查询、取消
│   └── admin.ts            # 管理接口：任务管理、统计、Key 管理、策略配置
│
├── services/                # 业务逻辑层
│   ├── taskService.ts      # 任务创建、状态更新、参数校验
│   ├── webhook.ts          # Webhook 回调通知（含重试机制）
│   ├── timeoutChecker.ts   # 后台超时巡检（超过 30 分钟标记 FAILED）
│   └── upstreamKeyService.ts  # 上游 API Key 动态分配与并发管理
│
├── types/                   # TypeScript 类型定义
│   └── task.ts             # 任务相关接口（TaskJob、标准输入格式等）
│
└── workers/                 # 后台任务处理
    ├── taskWorker.ts       # BullMQ Worker（并发 3，指数退避重试）
    ├── registry.ts         # Handler 注册表（静态映射 + 动态策略查找）
    └── handlers/
        ├── interface.ts    # TaskHandler 接口定义（execute / preview）
        ├── models/         # 模型推理 Handler
        │   ├── defaultModelHandler.ts       # 默认/模拟模型处理
        │   ├── gptimage2Handler.ts          # GPT Image 2
        │   ├── gptimageEditHandler.ts       # GPT Image Edit
        │   ├── gptimage2k4kHandler.ts       # GPT Image 2K/4K 高清
        │   ├── yunwubananaHandler.ts        # Yunwu Banana
        │   ├── yunwubananaproHandler.ts     # Yunwu Banana Pro
        │   ├── yunwubanana2Handler.ts       # Yunwu Banana 2
        │   └── geminiImageUtils.ts          # Gemini 图片处理工具函数
        └── apps/           # 应用类 Handler
            ├── defaultAppHandler.ts         # 默认应用处理
            └── runningHubHandler.ts         # RunningHub 集成
```

### Handler 注册机制

Handler 注册分两层：

1. **静态层** — `registry.ts` 中的 `availableHandlers` 将 Handler 名称映射到实现类
2. **动态层** — 数据库 `ModelStrategy` / `AppStrategy` 表将模型名或 appId 映射到 Handler 名称，运行时通过 `getTaskHandlerDynamic()` 查库后从静态映射中解析

新增 Handler 步骤：创建文件 → 在 `registry.ts` 注册 → 在 `StrategyManage.tsx` 的 `AVAILABLE_HANDLERS` 中添加 → 通过管理后台绑定策略。

---

## 管理后台前端 `admin/`

```
admin/
├── public/
│   └── api.md              # API 文档原文（供前端渲染）
├── src/
│   ├── main.tsx            # React 入口
│   ├── App.tsx             # 路由配置（含登录鉴权守卫）
│   ├── index.css           # 全局样式 + Tailwind 引入
│   ├── api/
│   │   └── index.ts        # Axios 请求封装（含 Auth 拦截器）
│   ├── components/
│   │   ├── Layout.tsx      # 管理后台布局外壳（侧边栏 + 导航）
│   │   └── StatusBadge.tsx # 任务状态徽标组件
│   ├── pages/
│   │   ├── Login.tsx       # 登录页
│   │   ├── Dashboard.tsx   # 仪表盘（统计数据、任务概览）
│   │   ├── TaskList.tsx    # 任务列表（分页、筛选）
│   │   ├── TaskDetail.tsx  # 任务详情（参数、结果完整展示）
│   │   ├── ApiKeyList.tsx  # API Key 管理页
│   │   ├── StrategyManage.tsx  # 策略配置页（模型/应用 → Handler 绑定）
│   │   ├── ApiDocs.tsx     # API 文档查看器
│   │   └── TestClient.tsx  # API 测试工具
│   └── assets/             # 静态资源
├── package.json            # 前端依赖（React 19、Vite 8、Tailwind CSS 4）
├── vite.config.ts          # Vite 构建（base: /admin/，API 代理到 :4000）
└── dist/                   # 构建产物
```

前端通过 `@fastify/static` 以 `/admin/` 路径由后端托管，支持 SPA fallback。

---

## 数据库 `prisma/`

```
prisma/
└── schema.prisma           # Prisma Schema（MySQL）
```

定义四张核心表：

| 表名 | 说明 |
|------|------|
| `TaskJob` | 任务记录（参数、结果、状态追踪） |
| `ApiKey` | 客户端 API Key（含限流、并发配置） |
| `ModelStrategy` | 模型名 → Handler 路由映射 |
| `AppStrategy` | 应用名 → Handler 路由映射（含节点模板） |

---

## 文档 `docs/`

```
docs/
├── api.md                  # 完整 API 文档（含请求示例与参数映射）
├── deploy.md               # 生产部署指南（宝塔面板 + 本地构建方案）
├── strategy-guide.md       # 策略配置指南
└── project-structure.md    # 本文档
```

---

## 脚本 `scripts/`

```
scripts/
├── test-api.js             # API 接口测试脚本
├── seed-key.js             # 初始化 API Key 数据库种子
└── inspect-strategy.js     # 策略配置调试工具
```

---

## 核心数据流

```
客户端请求 → auth 中间件（API Key 校验 + 限流）
           → jobs 路由（参数校验）
           → taskService（创建 TaskJob + 入队 BullMQ）
           → taskWorker（取出任务 → 查询策略 → 解析 Handler）
           → Handler.execute()（调用上游 API）
           → 更新 TaskJob 状态（SUCCESS / FAILED）
           → webhook 回调通知客户端
```
