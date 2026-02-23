import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Request, Response, json, urlencoded } from 'express';

import { AppModule } from './app.module';

type RequestWithRawBody = Request & { rawBody?: Buffer };

function rawBodySaver(req: RequestWithRawBody, _res: Response, buffer: Buffer): void {
  if (buffer.length > 0) {
    req.rawBody = buffer;
  }
}

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesOrigin(origin: string, pattern: string): boolean {
  if (!pattern.includes('*')) {
    return origin === pattern;
  }

  const expression = new RegExp(`^${escapeRegex(pattern).replace(/\\\*/g, '.*')}$`, 'i');
  return expression.test(origin);
}

function resolveAllowedOrigins(): string[] {
  const rawOrigins = [process.env.CORS_ALLOWED_ORIGINS, process.env.FRONTEND_URL]
    .filter((value): value is string => typeof value === 'string')
    .flatMap((value) => value.split(','))
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);

  return Array.from(new Set(rawOrigins));
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.use(json({ verify: rawBodySaver }));
  app.use(urlencoded({ extended: true, verify: rawBodySaver }));

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const allowedOrigins = resolveAllowedOrigins();

  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.length === 0) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);
      const isAllowed = allowedOrigins.some((allowedOrigin) =>
        matchesOrigin(normalizedOrigin, allowedOrigin),
      );

      if (isAllowed) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
}

bootstrap();
