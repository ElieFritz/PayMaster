import { DataSourceOptions } from 'typeorm';

import { Invoice } from '../invoices/invoice.entity';
import { PaymentTransaction } from '../payments/payment-transaction.entity';

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === 'true';
}

export function buildTypeOrmOptions(
  env: NodeJS.ProcessEnv,
  options: { includeMigrations?: boolean } = {},
): DataSourceOptions {
  const hasDatabaseUrl = Boolean(env.DATABASE_URL);
  const useSsl = parseBoolean(env.DATABASE_SSL, hasDatabaseUrl);
  const includeMigrations = options.includeMigrations ?? false;

  return {
    type: 'postgres',
    ...(hasDatabaseUrl
      ? { url: env.DATABASE_URL as string }
      : {
          host: env.DATABASE_HOST || 'localhost',
          port: Number(env.DATABASE_PORT || 5432),
          username: env.DATABASE_USER || 'postgres',
          password: env.DATABASE_PASSWORD || 'postgres',
          database: env.DATABASE_NAME || 'paymaster',
        }),
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    entities: [Invoice, PaymentTransaction],
    ...(includeMigrations
      ? {
          migrations: ['dist/src/database/migrations/*.js', 'src/database/migrations/*.ts'],
        }
      : {}),
    synchronize: parseBoolean(env.TYPEORM_SYNCHRONIZE, false),
  };
}
