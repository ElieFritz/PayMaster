import 'dotenv/config';

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { buildTypeOrmOptions } from './database/typeorm-options';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { WebhooksModule } from './webhooks/webhooks.module';

function resolveRedisEnabled(): boolean {
  if (process.env.REDIS_ENABLED === undefined) {
    return process.env.NODE_ENV === 'production';
  }

  return process.env.REDIS_ENABLED.toLowerCase() === 'true';
}

const redisEnabled = resolveRedisEnabled();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildTypeOrmOptions({
          NODE_ENV: configService.get<string>('NODE_ENV', 'development'),
          DATABASE_URL: configService.get<string>('DATABASE_URL'),
          DATABASE_SSL: configService.get<string>('DATABASE_SSL'),
          DATABASE_HOST: configService.get<string>('DATABASE_HOST', 'localhost'),
          DATABASE_PORT: configService.get<string>('DATABASE_PORT', '5432'),
          DATABASE_USER: configService.get<string>('DATABASE_USER', 'postgres'),
          DATABASE_PASSWORD: configService.get<string>('DATABASE_PASSWORD', 'postgres'),
          DATABASE_NAME: configService.get<string>('DATABASE_NAME', 'paymaster'),
          TYPEORM_SYNCHRONIZE: configService.get<string>('TYPEORM_SYNCHRONIZE'),
        }),
    }),
    InvoicesModule,
    PaymentsModule,
    WebhooksModule,
    ...(redisEnabled
      ? [
          BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
              connection: {
                host: configService.get<string>('REDIS_HOST', 'localhost'),
                port: Number(configService.get<string>('REDIS_PORT', '6379')),
                password: configService.get<string>('REDIS_PASSWORD') || undefined,
              },
            }),
          }),
          ReceiptsModule,
        ]
      : []),
  ],
})
export class AppModule {}
