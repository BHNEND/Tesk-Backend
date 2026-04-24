import { redis } from "../config/redis.js";

const WINDOW_MS = 10 * 60 * 1000; // 10 分钟统计窗口
const COOLDOWN_MS = 5 * 60 * 1000; // 5 分钟熔断冷却
const MIN_TASKS = 30;              // 最小样本量
const FAIL_RATE_THRESHOLD = 0.3;   // 成功率 < 30% 熔断

type CircuitState = "closed" | "open" | "half-open";

function taskKey(modelName: string, keyIndex: number): string {
  return `cb:${modelName}:key${keyIndex}:tasks`;
}

function stateKey(modelName: string, keyIndex: number): string {
  return `cb:${modelName}:key${keyIndex}:state`;
}

// 标记曾经熔断过，用于冷却结束后区分"首次评估"和"冷却恢复"
function trippedKey(modelName: string, keyIndex: number): string {
  return `cb:${modelName}:key${keyIndex}:tripped`;
}

function makeMember(taskId: string, success: boolean): string {
  return `${Date.now()}:${taskId}:${success ? "ok" : "fail"}`;
}

/**
 * 记录一次任务结果（同一 taskId 对同一 key 只记最后一次）
 */
export async function recordAttempt(
  modelName: string,
  keyIndex: number,
  taskId: string,
  success: boolean,
): Promise<void> {
  const key = taskKey(modelName, keyIndex);
  const now = Date.now();
  const member = makeMember(taskId, success);

  // 清理窗口外的旧记录
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, "-inf", now - WINDOW_MS);
  // 移除该 taskId 的旧记录（同一任务只保留最终结果）
  const members = await redis.zrangebyscore(key, now - WINDOW_MS, "+inf");
  for (const m of members) {
    if (m.includes(`:${taskId}:`)) {
      pipeline.zrem(key, m);
    }
  }
  pipeline.zadd(key, now, member);
  // 整个 key 的 TTL 设为窗口的 2 倍，避免无限增长
  pipeline.expire(key, Math.ceil(WINDOW_MS / 1000) * 2);
  await pipeline.exec();
}

/**
 * 检查并更新熔断状态，返回当前状态
 *
 * 状态机：
 *   closed → open    （达到熔断条件）
 *   open → half-open （冷却期结束，有 tripped 标记）
 *   half-open → closed （探测成功，closeCircuit）
 *   half-open → open   （探测失败，tripAgain）
 */
export async function getCircuitState(
  modelName: string,
  keyIndex: number,
): Promise<CircuitState> {
  const sKey = stateKey(modelName, keyIndex);

  // 检查是否在 open/half-open 状态
  const state = await redis.get(sKey);
  if (state === "open") return "open";
  if (state === "half-open") return "half-open";

  // state key 不存在 → 检查是否刚从冷却中恢复
  const wasTripped = await redis.get(trippedKey(modelName, keyIndex));
  if (wasTripped) {
    // 冷却结束，进入半开状态（允许尝试）
    await redis.set(sKey, "half-open", "PX", 15 * 60 * 1000);
    console.log(`[CircuitBreaker] ${modelName} key${keyIndex} → half-open (cooldown ended)`);
    return "half-open";
  }

  // 正常 closed 状态，检查是否应该触发熔断
  const key = taskKey(modelName, keyIndex);
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // 清理旧记录
  await redis.zremrangebyscore(key, "-inf", windowStart);

  const members = await redis.zrangebyscore(key, windowStart, "+inf");
  const total = members.length;

  if (total < MIN_TASKS) return "closed";

  let successes = 0;
  for (const m of members) {
    if (m.endsWith(":ok")) successes++;
  }

  const successRate = successes / total;
  if (successRate < FAIL_RATE_THRESHOLD) {
    // 触发熔断：state 设为 open + 标记 tripped
    const pipeline = redis.pipeline();
    pipeline.set(sKey, "open", "PX", COOLDOWN_MS);
    // tripped 标记存活时间 = 窗口期，确保冷却后能被发现
    pipeline.set(trippedKey(modelName, keyIndex), "1", "PX", WINDOW_MS);
    await pipeline.exec();
    console.log(
      `[CircuitBreaker] ${modelName} key${keyIndex} TRIPPED: ${successes}/${total} success (${(successRate * 100).toFixed(1)}%)`
    );
    return "open";
  }

  return "closed";
}

/**
 * 是否应该跳过该 key（open 状态跳过，half-open 允许尝试）
 */
export async function shouldSkipKey(
  modelName: string,
  keyIndex: number,
): Promise<boolean> {
  const state = await getCircuitState(modelName, keyIndex);
  return state === "open";
}

/**
 * 半开状态下探测成功 → 解除熔断，清除失败记录
 */
export async function closeCircuit(
  modelName: string,
  keyIndex: number,
): Promise<void> {
  const sKey = stateKey(modelName, keyIndex);
  const tKey = taskKey(modelName, keyIndex);
  const trKey = trippedKey(modelName, keyIndex);
  await redis.del(sKey, tKey, trKey);
  console.log(`[CircuitBreaker] ${modelName} key${keyIndex} RECOVERED`);
}

/**
 * 半开状态下探测失败 → 重新熔断
 */
export async function tripAgain(
  modelName: string,
  keyIndex: number,
): Promise<void> {
  const sKey = stateKey(modelName, keyIndex);
  await redis.set(sKey, "open", "PX", COOLDOWN_MS);
  console.log(`[CircuitBreaker] ${modelName} key${keyIndex} re-TRIPPED (half-open probe failed)`);
}

/**
 * 手动重置熔断状态（管理后台用）
 */
export async function resetCircuit(
  modelName: string,
  keyIndex: number,
): Promise<void> {
  const sKey = stateKey(modelName, keyIndex);
  const tKey = taskKey(modelName, keyIndex);
  const trKey = trippedKey(modelName, keyIndex);
  await redis.del(sKey, tKey, trKey);
  console.log(`[CircuitBreaker] ${modelName} key${keyIndex} RESET`);
}

/**
 * 获取所有熔断状态（管理后台用）
 */
export async function getAllCircuitStates(): Promise<
  Record<string, { keyIndex: number; state: string; total: number; successes: number }[]>
> {
  const keys = await redis.keys("cb:*:state");
  const result: Record<string, { keyIndex: number; state: string; total: number; successes: number }[]> = {};

  for (const k of keys) {
    const parts = k.split(":");
    if (parts.length !== 4) continue;
    const modelName = parts[1];
    const keyIndexStr = parts[2].replace("key", "");
    const keyIndex = parseInt(keyIndexStr, 10);
    const state = (await redis.get(k)) || "closed";

    // 统计窗口内任务数据
    const tKey = taskKey(modelName, keyIndex);
    const now = Date.now();
    await redis.zremrangebyscore(tKey, "-inf", now - WINDOW_MS);
    const members = await redis.zrangebyscore(tKey, now - WINDOW_MS, "+inf");
    let successes = 0;
    for (const m of members) {
      if (m.endsWith(":ok")) successes++;
    }

    if (!result[modelName]) result[modelName] = [];
    result[modelName].push({ keyIndex, state, total: members.length, successes });
  }

  return result;
}
