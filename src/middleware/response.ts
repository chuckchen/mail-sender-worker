import { Context, Next } from 'hono';

export interface ApiResponse<T = any> {
	success: boolean;
	code: number;
	message: string;
	data?: T;
}

// 统一响应格式中间件
export const responseHandler = async (c: Context, next: Next) => {
	try {
		await next();
	} catch (error: any) {
		c.status(500);
		return c.json({
			success: false,
			code: 500,
			message: `Internal Server Error: ${error.message}`,
		});
	}
};

// 统一错误处理中间件
export const errorHandler = async (err: Error, c: Context) => {
	console.error(`Error processing request: ${err.message}`);
	c.status(500);
	return c.json({
		success: false,
		code: 500,
		message: `Internal Server Error: ${err.message}`,
	});
};

// 令牌桶速率限制器配置
interface RateLimiterConfig {
	capacity: number; // 令牌桶容量
	refillRate: number; // 令牌补充速率（每秒）
	tokenAmount: number; // 每个请求消耗的令牌数
}

class TokenBucket {
	private tokens: number;
	private lastRefillTimestamp: number;
	private readonly config: RateLimiterConfig;

	constructor(config: RateLimiterConfig) {
		this.tokens = config.capacity;
		this.lastRefillTimestamp = Date.now();
		this.config = config;
	}

	refill() {
		const now = Date.now();
		const timePassed = (now - this.lastRefillTimestamp) / 1000; // 转换为秒
		const tokensToAdd = timePassed * this.config.refillRate;

		this.tokens = Math.min(this.config.capacity, this.tokens + tokensToAdd);
		this.lastRefillTimestamp = now;
	}

	tryConsume(tokens: number): boolean {
		this.refill();

		if (this.tokens >= tokens) {
			this.tokens -= tokens;
			return true;
		}

		return false;
	}
}

// 创建全局令牌桶实例
const globalBucket = new TokenBucket({
	capacity: 100, // 最多100个令牌
	refillRate: 10, // 每秒补充10个令牌
	tokenAmount: 1, // 每个请求消耗1个令牌
});

// 请求速率限制中间件
export const rateLimiter = async (c: Context, next: Next) => {
	if (!globalBucket.tryConsume(1)) {
		c.status(429);
		return c.json({
			success: false,
			code: 429,
			message: 'Too Many Requests',
		});
	}

	await next();
};
