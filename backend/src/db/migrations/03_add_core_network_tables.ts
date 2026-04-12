export async function up(knex) {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.string('email').notNullable().unique();
    table.string('password_hash').notNullable();
    table.enu('role', ['admin', 'operator', 'viewer'], {
      useNative: true,
      enumName: 'user_role'
    }).notNullable().defaultTo('viewer');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('carriers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.string('code').notNullable().unique();
    table.decimal('reliability_score', 5, 2).notNullable().defaultTo(0.5);
    table.jsonb('transport_modes').notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['name']);
  });

  await knex.raw('ALTER TABLE carriers ADD CONSTRAINT carriers_reliability_score_check CHECK (reliability_score >= 0 AND reliability_score <= 1)');
  await knex.raw("ALTER TABLE carriers ADD CONSTRAINT carriers_transport_modes_array_check CHECK (jsonb_typeof(transport_modes) = 'array')");

  await knex.schema.createTable('network_nodes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.enu('type', ['warehouse', 'hub', 'port', 'checkpoint'], {
      useNative: true,
      enumName: 'network_node_type'
    }).notNullable();
    table.string('city').notNullable();
    table.string('state');
    table.string('country').notNullable();
    table.decimal('latitude', 10, 7).notNullable();
    table.decimal('longitude', 10, 7).notNullable();
    table.specificType('location', 'geography(Point, 4326)').notNullable();
    table.decimal('capacity_score', 5, 2).notNullable().defaultTo(0);
    table.decimal('congestion_score', 5, 2).notNullable().defaultTo(0);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['type']);
    table.index(['is_active']);
    table.index(['city']);
    table.index(['country']);
  });

  await knex.raw('CREATE INDEX network_nodes_location_gix ON network_nodes USING GIST (location)');
  await knex.raw('ALTER TABLE network_nodes ADD CONSTRAINT network_nodes_latitude_check CHECK (latitude >= -90 AND latitude <= 90)');
  await knex.raw('ALTER TABLE network_nodes ADD CONSTRAINT network_nodes_longitude_check CHECK (longitude >= -180 AND longitude <= 180)');
  await knex.raw('ALTER TABLE network_nodes ADD CONSTRAINT network_nodes_capacity_score_check CHECK (capacity_score >= 0 AND capacity_score <= 1)');
  await knex.raw('ALTER TABLE network_nodes ADD CONSTRAINT network_nodes_congestion_score_check CHECK (congestion_score >= 0 AND congestion_score <= 1)');

  await knex.schema.createTable('network_edges', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('from_node_id').notNullable().references('id').inTable('network_nodes').onDelete('CASCADE');
    table.uuid('to_node_id').notNullable().references('id').inTable('network_nodes').onDelete('CASCADE');
    table.enu('transport_mode', ['road', 'rail', 'sea', 'air'], {
      useNative: true,
      enumName: 'transport_mode'
    }).notNullable();
    table.decimal('distance_km', 10, 2).notNullable();
    table.integer('base_duration_min').notNullable();
    table.decimal('base_cost', 12, 2).notNullable();
    table.decimal('base_risk_score', 5, 2).notNullable().defaultTo(0);
    table.decimal('current_risk_score', 5, 2).notNullable().defaultTo(0);
    table.boolean('is_blocked').notNullable().defaultTo(false);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.jsonb('geometry_json').defaultTo(knex.raw("'[]'::jsonb"));
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['from_node_id']);
    table.index(['to_node_id']);
    table.index(['transport_mode']);
    table.index(['is_blocked']);
    table.index(['is_active']);
    table.index(['from_node_id', 'to_node_id']);
  });

  await knex.raw('ALTER TABLE network_edges ADD CONSTRAINT network_edges_distinct_nodes_check CHECK (from_node_id <> to_node_id)');
  await knex.raw('ALTER TABLE network_edges ADD CONSTRAINT network_edges_distance_check CHECK (distance_km >= 0)');
  await knex.raw('ALTER TABLE network_edges ADD CONSTRAINT network_edges_duration_check CHECK (base_duration_min >= 0)');
  await knex.raw('ALTER TABLE network_edges ADD CONSTRAINT network_edges_cost_check CHECK (base_cost >= 0)');
  await knex.raw('ALTER TABLE network_edges ADD CONSTRAINT network_edges_base_risk_check CHECK (base_risk_score >= 0 AND base_risk_score <= 1)');
  await knex.raw('ALTER TABLE network_edges ADD CONSTRAINT network_edges_current_risk_check CHECK (current_risk_score >= 0 AND current_risk_score <= 1)');
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('network_edges');
  await knex.schema.dropTableIfExists('network_nodes');
  await knex.schema.dropTableIfExists('carriers');
  await knex.schema.dropTableIfExists('users');

  await knex.raw('DROP TYPE IF EXISTS transport_mode');
  await knex.raw('DROP TYPE IF EXISTS network_node_type');
  await knex.raw('DROP TYPE IF EXISTS user_role');
}
