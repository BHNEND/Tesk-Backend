import { FastifyInstance } from "fastify";
import { createTask, getTaskInfo, getPublicTaskInfo, previewTask } from "../services/taskService.js";
import { CreateTaskBody } from "../types/task.js";
import { prisma } from "../config/prisma.js";

const createTaskSchema = {
    summary: "创建任务",
    description: "提交一个模型推理或应用处理任务，异步执行后通过 Webhook 回调结果",
    tags: ["任务接口"],
    security: [{ BearerAuth: [] }],
    body: {
        type: "object",
        required: ["callBackUrl", "input"],
        properties: {
            type: { type: "string", description: "任务类型：model (默认) 或 app", enum: ["model", "app"], default: "model" },
            model: { type: "string", description: "模型名称（type 为 model 时必填）", example: "gpt-image-2" },
            appid: { type: "string", description: "应用 ID（type 为 app 时必填）", example: "2040517478593339393" },
            callBackUrl: { type: "string", description: "任务完成后的回调 URL", example: "https://example.com/webhook" },
            progressCallBackUrl: { type: "string", description: "进度回调 URL（可选）" },
            input: {
                type: "object",
                description: "任务输入参数",
                required: ["prompt"],
                properties: {
                    prompt: { type: "string", description: "提示词", example: "A beautiful sunset" },
                    image_urls: { type: "array", items: { type: "string" }, description: "图片 URL 列表" },
                    video_urls: { type: "array", items: { type: "string" }, description: "视频 URL 列表" },
                    audio_urls: { type: "array", items: { type: "string" }, description: "音频 URL 列表" },
                    aspect_ratio: { type: "string", description: "宽高比", example: "auto、1:1、2:3、3:2、3:4、4:3、4:5、5:4、9:16、16:9、21:9、1:4、4:1、1:8、8:1" },
                    resolution: { type: "string", description: "分辨率", example: "480p、720p、1080p、1k、2k、4k" },
                    duration: { type: "number", description: "时长（秒）" },
                    extra: { type: "object", description: "扩展参数，透传特定 Handler 所需的非标准字段", additionalProperties: true },
                },
            },
        },
    },
    response: {
        200: {
            type: "object",
            properties: {
                code: { type: "integer", example: 200 },
                msg: { type: "string", example: "success" },
                data: {
                    type: "object",
                    properties: { taskId: { type: "string", example: "task_1714567890123" } },
                },
            },
        },
    },
};

const previewTaskSchema = {
    summary: "预览任务",
    description: "预览任务参数映射结果，不实际执行",
    tags: ["任务接口"],
    security: [{ BearerAuth: [] }],
    body: createTaskSchema.body,
    response: {
        200: {
            type: "object",
            properties: {
                code: { type: "integer", example: 200 },
                msg: { type: "string", example: "success" },
                data: { type: "object", additionalProperties: true },
            },
        },
    },
};

const recordInfoSchema = {
    summary: "查询任务详情",
    description: "根据 taskId 查询任务状态和结果。resultJson 中包含 resultUrls 数组（输出文件 URL 列表）和 metadata（详细信息）。",
    tags: ["任务接口"],
    security: [{ BearerAuth: [] }],
    querystring: {
        type: "object",
        required: ["taskId"],
        properties: {
            taskId: { type: "string", description: "任务 ID" },
        },
    },
    response: {
        200: {
            type: "object",
            properties: {
                code: { type: "integer", example: 200 },
                msg: { type: "string", example: "success" },
                data: {
                    type: "object",
                    properties: {
                        taskId: { type: "string", description: "任务 ID" },
                        taskType: { type: "string", description: "任务类型：model / app" },
                        model: { type: "string", description: "模型名称" },
                        appid: { type: "string", description: "应用名称" },
                        state: { type: "string", enum: ["PENDING", "RUNNING", "SUCCESS", "FAILED"], description: "任务状态" },
                        param: { type: "object", additionalProperties: true, description: "任务输入参数" },
                        resultJson: { type: "object", additionalProperties: true, description: "任务结果，包含 resultUrls 和 metadata" },
                        failCode: { type: "string", description: "失败错误码" },
                        failMsg: { type: "string", description: "失败错误信息" },
                        costTime: { type: "integer", description: "处理耗时（毫秒）" },
                        createTime: { type: "integer", description: "创建时间戳" },
                        updateTime: { type: "integer", description: "更新时间戳" },
                        completeTime: { type: "integer", description: "完成时间戳" },
                    },
                },
            },
        },
    },
};

export async function jobRoutes(app: FastifyInstance) {
    app.post<{ Body: CreateTaskBody }>("/api/v1/jobs/createTask", { schema: createTaskSchema }, async (request, reply) => {
        const body = request.body;

        if (!body.callBackUrl || !body.input) {
            return reply.status(400).send({
                code: 400,
                msg: "Missing required fields: callBackUrl, input",
            });
        }

        if (body.type === 'app' && !body.appid) {
            return reply.status(400).send({
                code: 400,
                msg: "Missing required fields for app task: appid",
            });
        }

        if ((body.type === 'model' || !body.type) && !(body as any).model) {
            return reply.status(400).send({
                code: 400,
                msg: "Missing required fields for model task: model",
            });
        }

        try {
            const { taskId } = await createTask(body, (request as any).apiKeyData);
            return reply.send({ code: 200, msg: "success", data: { taskId } });
        } catch (err: any) {
            return reply.status(err.status || 500).send({
                code: err.status || 500,
                msg: err.message || "Internal server error",
            });
        }
    });

    app.post<{ Body: CreateTaskBody }>("/api/v1/jobs/previewTask", { schema: previewTaskSchema }, async (request, reply) => {
        try {
            const data = await previewTask(request.body);
            return reply.send({ code: 200, msg: "success", data });
        } catch (err: any) {
            return reply.status(400).send({ code: 400, msg: err.message });
        }
    });

    app.get<{
        Querystring: { taskId: string };
    }>("/api/v1/jobs/recordInfo", { schema: recordInfoSchema }, async (request, reply) => {
        const { taskId } = request.query;

        if (!taskId) {
            return reply.status(400).send({
                code: 400,
                msg: "Missing required query parameter: taskId",
            });
        }

        const taskInfo = await getPublicTaskInfo(taskId);

        if (!taskInfo) {
            return reply.status(404).send({
                code: 404,
                msg: "Task not found",
            });
        }

        return reply.send({ code: 200, msg: "success", data: taskInfo });
    });

    // === Catalog: 可用模型列表 ===
    app.get("/api/v1/jobs/models", {
        schema: {
            summary: "获取可用模型列表",
            description: "查询当前系统中已注册且启用的模型策略，返回每个模型的标识符、名称、描述及参数格式",
            tags: ["模型目录"],
            security: [{ BearerAuth: [] }],
            response: {
                200: {
                    type: "object",
                    properties: {
                        code: { type: "integer", example: 200 },
                        msg: { type: "string", example: "success" },
                        data: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    model: { type: "string", description: "模型标识符，用于 createTask 的 model 字段" },
                                    name: { type: "string", description: "模型显示名称" },
                                    description: { type: "string", description: "模型描述" },
                                    handler: { type: "string", description: "内部处理器标识" },
                                    status: { type: "string", description: "状态：active / disabled" },
                                },
                            },
                        },
                    },
                },
            },
        },
    }, async (_request, reply) => {
        const models = await prisma.modelStrategy.findMany({
            where: { status: "active" },
            select: { modelName: true, modelId: true, name: true, description: true, handler: true, status: true },
            orderBy: { createdAt: "desc" },
        });
        const data = models.map((m) => ({
            model: m.modelName,
            modelId: m.modelId,
            name: m.name,
            description: m.description,
            handler: m.handler,
            status: m.status,
        }));
        return reply.send({ code: 200, msg: "success", data });
    });

    // === Catalog: 可用应用列表 ===
    app.get("/api/v1/jobs/apps", {
        schema: {
            summary: "获取可用应用列表",
            description: "查询当前系统中已注册且启用的应用策略，返回每个应用的标识符、名称、描述及参数格式",
            tags: ["应用目录"],
            security: [{ BearerAuth: [] }],
            response: {
                200: {
                    type: "object",
                    properties: {
                        code: { type: "integer", example: 200 },
                        msg: { type: "string", example: "success" },
                        data: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    appid: { type: "string", description: "应用标识符，用于 createTask 的 appid 字段" },
                                    name: { type: "string", description: "应用显示名称" },
                                    description: { type: "string", description: "应用描述" },
                                    handler: { type: "string", description: "内部处理器标识" },
                                    status: { type: "string", description: "状态：active / disabled" },
                                },
                            },
                        },
                    },
                },
            },
        },
    }, async (_request, reply) => {
        const apps = await prisma.appStrategy.findMany({
            where: { status: "active" },
            select: { appName: true, appId: true, name: true, description: true, handler: true, status: true },
            orderBy: { createdAt: "desc" },
        });
        const data = apps.map((a) => ({
            appid: a.appName,
            appId: a.appId,
            name: a.name,
            description: a.description,
            handler: a.handler,
            status: a.status,
        }));
        return reply.send({ code: 200, msg: "success", data });
    });

    // === GPT Image 2 专用文档端点 ===
    app.post<{ Body: CreateTaskBody }>("/api/v1/jobs/createTask/gpt-image-2", {
        schema: {
            summary: "GPT Image 2 - 图像生成",
            description: "使用 GPT Image 2 模型生成图像。支持文生图，可控制宽高比、分辨率和生成数量。\n\n## 参数说明\n\n| 参数 | 位置 | 说明 |\n|------|------|------|\n| `input.prompt` | body | 提示词，最长 1000 字符 |\n| `input.aspect_ratio` | body | 宽高比：`1:1` `2:3` `3:2` `auto`（默认 auto） |\n| `input.resolution` | body | 分辨率：`1k` `2k` `4k`（默认 1k） |\n| `input.extra.n` | body | 生成数量，1-10（默认 1） |\n\n## 返回结果\n\n`resultJson.images` 数组中每项包含 `url`（图片地址）和 `revised_prompt`（优化后的提示词）。",
            tags: ["模型目录"],
            security: [{ BearerAuth: [] }],
            body: {
                type: "object",
                required: ["callBackUrl", "input"],
                properties: {
                    type: { type: "string", description: "固定为 model", example: "model", default: "model" },
                    model: { type: "string", description: "固定为 gpt-image-2", example: "gpt-image-2", default: "gpt-image-2" },
                    callBackUrl: { type: "string", description: "任务完成后的回调 URL", example: "https://example.com/webhook" },
                    input: {
                        type: "object",
                        required: ["prompt"],
                        properties: {
                            prompt: { type: "string", description: "图像描述提示词（最长 1000 字符）", example: "A cat wearing sunglasses on a beach, photorealistic" },
                            aspect_ratio: { type: "string", description: "宽高比", enum: ["1:1", "2:3", "3:2", "auto"], example: "1:1", default: "auto" },
                            resolution: { type: "string", description: "输出分辨率", enum: ["1k", "2k", "4k"], example: "1k", default: "1k" },
                            extra: {
                                type: "object",
                                description: "扩展参数",
                                properties: {
                                    n: { type: "integer", description: "生成图片数量（1-10）", example: 1, default: 1 },
                                },
                            },
                        },
                    },
                },
            },
            response: {
                200: {
                    type: "object",
                    description: "提交成功，返回 taskId",
                    properties: {
                        code: { type: "integer", example: 200 },
                        msg: { type: "string", example: "success" },
                        data: {
                            type: "object",
                            properties: { taskId: { type: "string", example: "task_1714567890123" } },
                        },
                    },
                },
            },
        },
    }, async (request, reply) => {
        // 复用 createTask 逻辑，自动填充 model
        const body = { ...request.body, type: "model" as const, model: "gpt-image-2" };

        if (!body.callBackUrl || !body.input) {
            return reply.status(400).send({ code: 400, msg: "Missing required fields: callBackUrl, input" });
        }

        try {
            const { taskId } = await createTask(body, (request as any).apiKeyData);
            return reply.send({ code: 200, msg: "success", data: { taskId } });
        } catch (err: any) {
            return reply.status(err.status || 500).send({
                code: err.status || 500,
                msg: err.message || "Internal server error",
            });
        }
    });
}
