# Tesk Backend API 文档

## 基础信息

- **Base URL:** `http://<host>:<port>`
- **健康检查:** `GET /health` → `{ "status": "ok" }`
- **默认端口:** 3000

---

## 鉴权方式

### 普通 API（任务相关接口）

使用 **Bearer Token** 鉴权，Token 为通过管理后台创建的 API Key。

```
Authorization: Bearer <your-api-key>
```

> 未携带或 API Key 无效/已禁用，返回 `401`。

### 管理后台 API

使用独立的 **Admin API Key** 鉴权（通过环境变量 `ADMIN_API_KEY` 配置）。

```
Authorization: Bearer <admin-api-key>
```

> Admin API Key 无效返回 `403`。

### Rate Limiting

`createTask` 接口限制：单 API Key 每秒最多 **10 次**请求，超出返回 `429 Too Many Requests`。

---

## 任务状态

| 状态 | 说明 |
|------|------|
| `PENDING` | 任务已提交，等待处理 |
| `RUNNING` | 任务正在执行中 |
| `SUCCESS` | 任务执行成功 |
| `FAILED` | 任务执行失败 |

> 任务 RUNNING 超过 **30 分钟**将自动熔断为 FAILED，failMsg 为 `"Timeout Exception"`。

---

## 公共响应格式

所有接口返回统一 JSON 格式：

```json
{
  "code": 200,
  "msg": "success",
  "data": { ... }
}
```

错误时 `code` 为对应 HTTP 状态码（400/401/404/500），`msg` 描述错误原因。

---

## 一、任务接口

### 1. 创建任务

```
POST /api/v1/jobs/createTask
```

**Headers:**
```
Authorization: Bearer <api-key>
Content-Type: application/json
```

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | ❌ | 任务类型：`model` (默认) 或 `app` |
| `model` | string | 条件 | 当 `type` 为 `model` 时必填。模型名称（如 `"flux-kontext"`） |
| `appid` | string | 条件 | 当 `type` 为 `app` 时必填。应用 ID（如 `"12345"`） |
| `callBackUrl` | string | ✅ | 任务完成后的回调 URL |
| `progressCallBackUrl` | string | ❌ | 进度回调 URL |
| `input` | object | ✅ | 任务输入参数（详见下方 StandardTaskInput） |

**StandardTaskInput 说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `prompt` | string | 提示词 |
| `image_urls` | string[] | 图片 URL 列表 |
| `video_urls` | string[] | 视频 URL 列表 |
| `audio_urls` | string[] | 音频 URL 列表 |
| `aspect_ratio` | string | 宽高比（如 `"16:9"`） |
| `resolution` | string | 分辨率（如 `"1024x1024"`） |
| `duration` | number | 时长（秒） |
| `extra` | object | 扩展参数，用于透传特定 Handler 所需的非标准字段 |

**请求示例 (Model 任务)：**

```json
{
  "type": "model",
  "model": "flux-kontext",
  "callBackUrl": "https://example.com/webhook",
  "input": {
    "prompt": "A beautiful sunset",
    "aspect_ratio": "16:9"
  }
}
```

**请求示例 (App 任务 - RunningHub)：**

```json
{
  "type": "app",
  "appid": "67890",
  "callBackUrl": "https://example.com/webhook",
  "input": {
    "prompt": "A futuristic city",
    "image_urls": ["https://example.com/init.jpg"],
    "extra": {
      "negative_prompt": "low quality, blurry"
    }
  }
}
```

**成功响应（200）：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task_1714567890123"
  }
}
```

**错误响应（400）：**

```json
{
  "code": 400,
  "msg": "Missing required fields: model, callBackUrl, input.prompt"
}
```

---

### 2. 查询任务详情

```
GET /api/v1/jobs/recordInfo?taskId=<taskId>
```

**Headers:**
```
Authorization: Bearer <api-key>
```

**查询参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `taskId` | string | ✅ | 任务 ID |

**成功响应（200）：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "id": "uuid",
    "taskNo": "task_1714567890123",
    "model": "flux-kontext",
    "state": "SUCCESS",
    "param": { "prompt": "..." },
    "resultJson": { ... },
    "callBackUrl": "https://example.com/webhook",
    "progressCallBackUrl": null,
    "failCode": null,
    "failMsg": null,
    "costTime": 8500,
    "createdAt": "2026-04-01T10:00:00.000Z",
    "updatedAt": "2026-04-01T10:02:25.000Z",
    "completedAt": "2026-04-01T10:02:25.000Z"
  }
}
```

**错误响应（404）：**

```json
{
  "code": 404,
  "msg": "Task not found"
}
```

---

## 二、Webhook 回调

任务状态变为 `SUCCESS` 或 `FAILED` 后，系统会自动 POST 结果到创建任务时指定的 `callBackUrl`。

**回调请求：**

```
POST <callBackUrl>
Content-Type: application/json
```

**回调 Payload：**

```json
{
  "taskNo": "task_1714567890123",
  "model": "flux-kontext",
  "state": "SUCCESS",
  "param": { "prompt": "..." },
  "resultJson": { ... },
  "failCode": null,
  "failMsg": null,
  "costTime": 8500,
  "createdAt": "2026-04-01T10:00:00.000Z",
  "completedAt": "2026-04-01T10:02:25.000Z"
}
```

**重试机制：**

| 策略 | 说明 |
|------|------|
| 超时时间 | 5 秒 |
| 重试次数 | 最多 3 次 |
| 退避策略 | 指数退避：10s → 30s → 60s |
| 最终失败 | 记录错误日志，不改变任务状态 |

> Webhook 接收端应返回 HTTP 2xx 状态码表示成功。

---

## 三、管理后台接口

> 所有管理接口需要 Admin API Key 鉴权。

### 1. 任务列表

```
GET /api/v1/admin/tasks
```

**查询参数：**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `page` | number | ❌ | 1 | 页码 |
| `pageSize` | number | ❌ | 20 | 每页数量 |
| `state` | string | ❌ | - | 按状态筛选（PENDING/RUNNING/SUCCESS/FAILED） |
| `startTime` | string | ❌ | - | 起始时间（ISO 8601） |
| `endTime` | string | ❌ | - | 结束时间（ISO 8601） |

**成功响应（200）：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "list": [ ... ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

---

### 2. 任务详情

```
GET /api/v1/admin/tasks/:taskId
```

**成功响应（200）：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "id": "uuid",
    "taskNo": "task_1714567890123",
    "model": "flux-kontext",
    "state": "SUCCESS",
    "param": { ... },
    "resultJson": { ... },
    "callBackUrl": "...",
    "progressCallBackUrl": null,
    "failCode": null,
    "failMsg": null,
    "costTime": 8500,
    "createdAt": "2026-04-01T10:00:00.000Z",
    "updatedAt": "2026-04-01T10:02:25.000Z",
    "completedAt": "2026-04-01T10:02:25.000Z"
  }
}
```

**错误响应（404）：**

```json
{
  "code": 404,
  "msg": "Task not found"
}
```

---

### 3. 统计数据

```
GET /api/v1/admin/stats
```

**成功响应（200）：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "total": 1000,
    "byState": {
      "PENDING": 10,
      "RUNNING": 5,
      "SUCCESS": 900,
      "FAILED": 85
    },
    "todayNew": 42,
    "avgCostTime": 7200
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `total` | number | 总任务数 |
| `byState` | object | 各状态任务数 |
| `todayNew` | number | 今日新增任务数 |
| `avgCostTime` | number | 成功任务平均耗时（毫秒） |

---

### 4. 创建 API Key

```
POST /api/v1/admin/apikeys
```

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | API Key 名称 |

**请求示例：**

```json
{
  "name": "production-client"
}
```

**成功响应（200）：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "id": "uuid",
    "key": "a1b2c3d4e5f6...",
    "name": "production-client",
    "status": "active",
    "createdAt": "2026-04-01T10:00:00.000Z"
  }
}
```

> ⚠️ `key` 仅在创建时返回一次，请妥善保存。

---

### 5. API Key 列表

```
GET /api/v1/admin/apikeys
```

**成功响应（200）：**

```json
{
  "code": 200,
  "msg": "success",
  "data": [
    {
      "id": "uuid",
      "key": "a1b2c3d4e5f6...",
      "name": "production-client",
      "status": "active",
      "createdAt": "2026-04-01T10:00:00.000Z"
    }
  ]
}
```

---

### 6. 更新 API Key

```
PATCH /api/v1/admin/apikeys/:id
```

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `status` | string | ❌ | 状态：`active` 或 `disabled` |
| `name` | string | ❌ | 新名称 |

**请求示例：**

```json
{
  "status": "disabled"
}
```

**成功响应（200）：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "id": "uuid",
    "key": "a1b2c3d4e5f6...",
    "name": "production-client",
    "status": "disabled",
    "createdAt": "2026-04-01T10:00:00.000Z"
  }
}
```

---

## 四、参数映射规范 (Parameter Mapping)

本系统采用一套标准化的输入格式 (`StandardTaskInput`)，通过策略处理器（Handler）将其映射到第三方平台的具体参数中。

### 1. RunningHub 参数映射规则

RunningHub 处理器采用 **基于节点描述 (Description) 的精确匹配** 机制。系统会遍历 RunningHub 工作流中的 `nodeInfoList`，根据节点的 `description` 字段来填充 `fieldValue`。

#### 1.1 基础字段映射
| 任务系统标准字段 (input) | RunningHub 节点描述 (description) |
|:---|:---|
| `prompt` | `prompt` |
| `aspect_ratio` | `aspect_ratio` |
| `resolution` | `resolution` |
| `duration` | `duration` |

#### 1.2 媒体文件映射 (索引规则)
对于图片、视频和音频数组，系统支持通过 `描述符+索引` 的方式进行自动匹配（索引从 1 开始）：

*   **图片**: `image_urls[0]` 对应 `image1`，`image_urls[1]` 对应 `image2` ...
*   **视频**: `video_urls[0]` 对应 `video1`，`video_urls[1]` 对应 `video2` ...
*   **音频**: `audio_urls[0]` 对应 `audio1`，`audio_urls[1]` 对应 `audio2` ...

#### 1.3 自定义参数映射 (Extra)
当标准字段无法满足特定工作流的需求时，可以使用 `extra` 对象进行透传。系统会将 `extra` 中的 **Key** 与节点的 **description** 进行精确匹配：

*   **请求示例**: `"input": { "extra": { "negative_prompt": "low quality" } }`
*   **映射逻辑**: 查找 `description` 为 `"negative_prompt"` 的节点，并填充其值为 `"low quality"`。

---

## 五、任务状态与回调

### 1. 任务状态说明
- `PENDING`: 任务已进入队列，等待处理。
- `RUNNING`: 任务正在执行中。
- `SUCCESS`: 任务执行成功。
- `FAILED`: 任务执行失败。

### 2. 回调 Payload
任务状态变更（成功或失败）后，系统会 POST 如下格式的数据到 `callBackUrl`：

```json
{
  "taskNo": "...",
  "state": "SUCCESS",
  "resultJson": { ... },
  "failMsg": "...",
  "costTime": 1234
}
```
