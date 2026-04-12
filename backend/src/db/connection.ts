import knex from 'knex';
import config from '../../knexfile.ts';

const db = knex(config);

export default db;
