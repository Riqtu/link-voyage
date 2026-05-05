import { Provider } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export const RedisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: () => {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    return new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  },
};
