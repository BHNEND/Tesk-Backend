import { redis } from "../config/redis.js";
import { env } from "../config/env.js";
import crypto from "crypto";

export interface UpstreamKeyConfig {
  platform: string;
  key: string;
  concurrency: number;
}

export class UpstreamKeyService {
  private static instance: UpstreamKeyService;
  private configs: UpstreamKeyConfig[] = [];

  private constructor() {
    try {
      this.configs = JSON.parse(env.upstreamConfig);
    } catch (e) {
      console.error("[UpstreamKeyService] Failed to parse UPSTREAM_CONFIG:", e);
      this.configs = [];
    }
  }

  public static getInstance(): UpstreamKeyService {
    if (!UpstreamKeyService.instance) {
      UpstreamKeyService.instance = new UpstreamKeyService();
    }
    return UpstreamKeyService.instance;
  }

  /**
   * 生成用于 Redis 计数的 Key
   */
  private getRedisKey(config: UpstreamKeyConfig): string {
    const hash = crypto.createHash("md5").update(config.key).digest("hex").slice(0, 8);
    return `upstream:concurrency:${config.platform}:${hash}`;
  }

  /**
   * 生成用于熔断冷却的 Key
   */
  private getCooldownKey(config: UpstreamKeyConfig): string {
    const hash = crypto.createHash("md5").update(config.key).digest("hex").slice(0, 8);
    return `upstream:cooldown:${config.platform}:${hash}`;
  }

  /**
   * 尝试借用一个可用的 Key
   * @returns 返回选中的配置，如果没有空闲则返回 null
   */
  public async borrowKey(platform: string): Promise<UpstreamKeyConfig | null> {
    const platformKeys = this.configs.filter(c => c.platform === platform);
    
    // 如果没有配置任何 Key，则返回 null (由具体业务决定是否使用默认 Key)
    if (platformKeys.length === 0) return null;

    for (const config of platformKeys) {
      const redisKey = this.getRedisKey(config);
      const cooldownKey = this.getCooldownKey(config);

      // 1. 检查是否处于熔断冷却期
      const isCooldown = await redis.get(cooldownKey);
      if (isCooldown) continue;

      // 2. 乐观并发检查
      const current = await redis.get(redisKey);
      if (current && parseInt(current) >= config.concurrency) {
        continue;
      }

      // 3. 原子借用 (+1)
      const newCount = await redis.incr(redisKey);
      if (newCount === 1) {
        // 设置 TTL 防止死锁 (兜底 30 分钟)
        await redis.expire(redisKey, 30 * 60);
      }

      // 双重检查，防止正好在 incr 时被别人抢占导致超过
      if (newCount > config.concurrency) {
        await redis.decr(redisKey);
        continue;
      }

      return config;
    }

    return null;
  }

  /**
   * 检查是否配置了某个平台的 Key
   */
  public hasConfigForPlatform(platform: string): boolean {
    return this.configs.some(c => c.platform === platform);
  }

  /**
   * 归还 Key 的并发名额
   */
  public async returnKey(config: UpstreamKeyConfig) {
    const redisKey = this.getRedisKey(config);
    const count = await redis.get(redisKey);
    if (count && parseInt(count) > 0) {
      await redis.decr(redisKey);
    }
  }

  /**
   * 将 Key 设为冷却状态（通常是在收到 429 报错时）
   */
  public async cooldownKey(config: UpstreamKeyConfig, seconds: number = 15) {
    const cooldownKey = this.getCooldownKey(config);
    await redis.set(cooldownKey, "1", "EX", seconds);
    // 同时也归还当前占用的并发位
    await this.returnKey(config);
  }
}

export const upstreamKeyService = UpstreamKeyService.getInstance();
