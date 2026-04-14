import knex from 'knex';
import dotenv from 'dotenv';
dotenv.config();

const db = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  }
});

async function main() {
  try {
    // Check existing tables
    const { rows: existingTables } = await db.raw(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
    );
    console.log('Existing tables:', existingTables.map(r => r.tablename));

    // Check if knex_migrations has the stale record
    const { rows: knexTables } = await db.raw(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'knex%'"
    );
    
    if (knexTables.length > 0) {
      const { rows: migrations } = await db.raw('SELECT * FROM knex_migrations ORDER BY id');
      console.log('Existing migration records:', migrations.map(r => r.name));
      
      // Drop the stale migration tracking tables
      await db.raw('DROP TABLE IF EXISTS knex_migrations CASCADE');
      await db.raw('DROP TABLE IF EXISTS knex_migrations_lock CASCADE');
      console.log('Dropped stale knex_migrations tables');
    } else {
      console.log('No knex migration tables found');
    }

    // Also drop all existing application tables to start fresh
    const appTables = existingTables
      .map(r => r.tablename)
      .filter(t => !t.startsWith('knex_') && t !== 'spatial_ref_sys');
    
    if (appTables.length > 0) {
      for (const table of appTables) {
        await db.raw(`DROP TABLE IF EXISTS "${table}" CASCADE`);
      }
      console.log('Dropped application tables:', appTables);
    }

    console.log('Database cleaned. Ready for fresh migrations.');
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await db.destroy();
  }
}

main();
