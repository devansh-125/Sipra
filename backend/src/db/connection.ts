import knex from 'knex';
import config from '../../knexfile.ts';

const db = knex(config);

// Verify connectivity on startup; log but don't crash
db.raw('SELECT 1')
  .then(() => console.log('[db] Connected to database'))
  .catch((err: Error) => console.error('[db] Initial connection check failed:', err.message));

export default db;
