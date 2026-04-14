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
    min: 0,
    max: 5,
    acquireTimeoutMillis: 30_000,
    createTimeoutMillis: 30_000,
    idleTimeoutMillis: 10_000,
    reapIntervalMillis: 3_000,
    propagateCreateError: false,
    afterCreate: (conn: any, done: (err: Error | null, conn: any) => void) => {
      conn.query('SET statement_timeout = 15000;', (err: Error | null) => {
        done(err, conn);
      });
    },
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
