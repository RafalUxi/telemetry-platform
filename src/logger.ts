import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.LOG_PRETTY === '1' ? { target: 'pino-pretty' } : undefined,
});
