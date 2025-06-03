import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../schema';
import config from '../config/config';

// Подключение к PostgreSQL
const connectionString = config.dbUrl || '';
const client = postgres(connectionString);

// Инициализация Drizzle ORM
export const db = drizzle(client, { schema });
