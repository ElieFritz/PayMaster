import 'dotenv/config';

import { DataSource } from 'typeorm';

import { buildTypeOrmOptions } from './typeorm-options';

export default new DataSource(buildTypeOrmOptions(process.env, { includeMigrations: true }));
