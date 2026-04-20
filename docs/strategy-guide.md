# 策略工厂：添加新策略的规范流程

当需要接入一个新的第三方 API（例如：百度千帆、阿里云百炼、Midjourney 等）时，请严格按照以下 4 个步骤进行操作，以确保新策略能够被系统正确识别并在后台进行动态路由分配。

---

## 步骤 1：编写策略执行代码 (Handler)

在后端的 `src/workers/handlers/` 目录下，根据任务类型（`models` 或 `apps`）创建一个新的 TypeScript 文件。

**规范要求：**
1. 必须实现 `TaskHandler` 接口。
2. 必须包含一个 `execute(ctx: TaskHandlerContext)` 方法，该方法负责接收参数、发起真实 HTTP 请求并返回最终结果。
3. 如果有耗时操作，建议在流程中调用 `ctx.updateProgress(进度, "信息")` 汇报进度。

**示例代码 (`src/workers/handlers/models/baiduQianfanHandler.ts`)**：

```typescript
import { TaskHandler, TaskHandlerContext } from "../interface.js";
import { env } from "../../../config/env.js";

export const baiduQianfanHandler: TaskHandler = {
  async execute(ctx: TaskHandlerContext): Promise<any> {
    const { identifier, input, taskId } = ctx;
    
    // 1. 获取密钥 (建议从 env 或后续的全局配置表获取)
    // const apiKey = env.baiduApiKey;
    
    await ctx.updateProgress(10, `开始调用百度千帆 API: ${identifier}`);

    // 2. 发起真实的 HTTP 请求 (此处为伪代码)
    // const response = await fetch(`https://aip.baidubce.com/...`, { ... });
    // if (!response.ok) throw new Error("调用失败");
    // const data = await response.json();

    await ctx.updateProgress(100, "处理完成");

    // 3. 返回结构化的结果数据，这部分数据会被写入数据库的 resultJson 字段
    return {
      success: true,
      data: "这是模拟的百度千帆返回结果"
    };
  }
};
```

---

## 步骤 2：在注册中心 (Registry) 注册该策略

为了让 Worker 能够根据名称找到你刚写的代码，需要将其注册到后端的 `registry.ts` 文件中。

**修改文件：`src/workers/registry.ts`**

1. 引入你刚刚创建的 Handler 文件。
2. 将其添加到 `availableHandlers` 对象中，给它起一个唯一的字符串标识符（通常与变量名一致）。

```typescript
import { TaskHandler } from "./handlers/interface.js";
import { defaultModelHandler } from "./handlers/models/defaultModelHandler.js";
import { defaultAppHandler } from "./handlers/apps/defaultAppHandler.js";
import { runningHubHandler } from "./handlers/apps/runningHubHandler.js";
// 1. 引入新写的 Handler
import { baiduQianfanHandler } from "./handlers/models/baiduQianfanHandler.js"; 

export const availableHandlers: Record<string, TaskHandler> = {
  "defaultModelHandler": defaultModelHandler,
  "defaultAppHandler": defaultAppHandler,
  "runningHubHandler": runningHubHandler,
  // 2. 注册新的标识符
  "baiduQianfanHandler": baiduQianfanHandler, 
};
```

---

## 步骤 3：在 Admin 前端管理后台添加下拉选项

为了让管理员能在界面上选择这个新策略，需要更新前端代码中的可用选项列表。

**修改文件：`admin/src/pages/StrategyManage.tsx`**

找到文件顶部的 `AVAILABLE_HANDLERS` 数组，在其中追加一项。
* `value`: 必须与你在 `registry.ts` 中注册的标识符完全一致（例如 `baiduQianfanHandler`）。
* `label`: 后台下拉框中显示给用户看的可读名称。

```tsx
const AVAILABLE_HANDLERS = [
  { value: 'defaultModelHandler', label: '默认模型处理 (Mock)' },
  { value: 'defaultAppHandler', label: '默认应用处理 (Mock)' },
  { value: 'runningHubHandler', label: '跑马圈 API (RunningHub)' },
  // 追加这一行
  { value: 'baiduQianfanHandler', label: '百度千帆大模型' } 
];
```

修改完成后，重新编译/启动前端（如果处于 `npm run dev` 状态会自动热更新）。

---

## 步骤 4：在 Admin 后台进行动态绑定配置

完成上述代码修改后，你不需要再修改任何代码了。系统已经具备了调用“百度千帆”的能力。

当业务端准备对接一个名为 `ernie-bot-4` 的模型时，管理员需执行以下操作：

1. 登录 Admin 管理后台。
2. 进入 **策略管理** 页面。
3. 切换到对应的 Tab（例如“模型策略”）。
4. 点击 **注册新模型**。
5. 在弹窗中填写：
   * **Model Name (模型标识)**：填写业务端真实请求传过来的值，如 `ernie-bot-4`。
   * **处理策略 (Handler)**：在下拉框中选择刚刚添加的 `百度千帆大模型 (baiduQianfanHandler)`。
   * **展示名称 / 备注**：填写便于记忆的信息。
6. 点击保存。

**大功告成！** 
从现在起，只要业务端发来包含 `"model": "ernie-bot-4"` 的任务，系统就会自动去数据库里查找，发现被绑定了 `baiduQianfanHandler`，然后把任务准确无误地交给步骤 1 中你手写的那段代码去执行！
