import { redis } from "../config/redis.js";
import { env } from "../config/env.js";
import crypto from "crypto";

export interface UpstreamKeyConfig {
  platform: string;
  key: string;
  concurrency: number;
}

// Lua script for atomic borrow: checks cooldown, checks limit, increments in one round trip
const BORROW_SCRIPT = `
local maxConcurrency = tonumber(ARGV[1])
local ttlSeconds = tonumber(ARGV[2])
for i = 1, #KEYS, 2 do
  local counterKey = KEYS[i]
  local cooldownKey = KEYS[i + 1]
  if redis.call("EXISTS", cooldownKey) == 0 then
    local current = tonumber(redis.call("GET", counterKey) or "0")
    if current < maxConcurrency then
      local newCount = redis.call("INCR", counterKey)
      if newCount == 1 then
        redis.call("EXPIRE", counterKey, ttlSeconds)
      end
      if newCount <= maxConcurrency then
        return i
      else
        redis.call("DECR", counterKey)
      end
    end
  end
end
return 0
`;

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

  private getRedisKey(config: UpstreamKeyConfig): string {
    const hash = crypto.createHash("md5").update(config.key).digest("hex").slice(0, 8);
    return `upstream:concurrency:${config.platform}:${hash}`;
  }

  private getCooldownKey(config: UpstreamKeyConfig): string {
    const hash = crypto.createHash("md5").update(config.key).digest("hex").slice(0, 8);
    return `upstream:cooldown:${config.platform}:${hash}`;
  }

  public async borrowKey(platform: string): Promise<UpstreamKeyConfig | null> {
    const platformKeys = this.configs.filter(c => c.platform === platform);

    if (platformKeys.length === 0) return null;

    if (platformKeys.length === 1) {
      // Single key: fast path with simple Lua
      const config = platformKeys[0];
      const counterKey = this.getRedisKey(config);
      const cooldownKey = this.getCooldownKey(config);
      const result = await redis.eval(
        BORROW_SCRIPT, 2,
        counterKey, cooldownKey,
        config.concurrency, 30 * 60
      ) as number;

      return result > 0 ? config : null;
    }

    // Multi-key: build flat KEYS array [counter1, cooldown1, counter2, cooldown2, ...]
    const keys: string[] = [];
    for (const config of platformKeys) {
      keys.push(this.getRedisKey(config));
      keys.push(this.getCooldownKey(config));
    }

    // All keys share the same concurrency limit within the platform for simplicity,
    // but we use each config's own limit per-key. Since the Lua script uses a single
    // maxConcurrency arg, we call per-key for correctness.
    for (let i = 0; i < platformKeys.length; i++) {
      const config = platformKeys[i];
      const counterKey = keys[i * 2];
      const cooldownKey = keys[i * 2 + 1];
      const result = await redis.eval(
        BORROW_SCRIPT, 2,
        counterKey, cooldownKey,
        config.concurrency, 30 * 60
      ) as number;

      if (result > 0) return config;
    }

    return null;
  }

  public hasConfigForPlatform(platform: string): boolean {
    return this.configs.some(c => c.platform === platform);
  }

  public async returnKey(config: UpstreamKeyConfig) {
    const redisKey = this.getRedisKey(config);
    const count = await redis.get(redisKey);
    if (count && parseInt(count) > 0) {
      await redis.decr(redisKey);
    }
  }

  public async cooldownKey(config: UpstreamKeyConfig, seconds: number = 15) {
    const cooldownKey = this.getCooldownKey(config);
    await redis.set(cooldownKey, "1", "EX", seconds);
    await this.returnKey(config);
  }
}

export const upstreamKeyService = UpstreamKeyService.getInstance();
