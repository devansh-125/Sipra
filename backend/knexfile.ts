import dotenv from 'dotenv';
dotenv.config();

const useSsl = process.env.DATABASE_SSL === 'true';

export default {
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {})
  },
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    directory: './src/db/migrations',
    extension: 'ts'
  },
  seeds: {
    directory: './src/db/seeds',
    extension: 'ts'
  }
};
