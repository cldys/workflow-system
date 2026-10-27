import 'dotenv/config';
import { DataSource } from 'typeorm';

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export default new DataSource({
  type: 'postgres',

  host: requiredEnv('DB_HOST'),
  port: Number(requiredEnv('DB_PORT')),
  username: requiredEnv('DB_USER'),
  password: requiredEnv('DB_PASSWORD'),
  database: requiredEnv('DB_NAME'),

  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/1793104789066-AddWorkflowRelations.ts'],

  synchronize: false,
});
