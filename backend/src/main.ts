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

  const frontendOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: frontendOrigins.length > 0 ? frontendOrigins : true,
    credentials: true,
  });

  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
}

bootstrap();
