export async function up(knex) {
  
  await knex.schema.createTable('shipments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('origin').notNullable();
    table.string('destination').notNullable();
    table.enu('status', ['pending', 'in_transit', 'delayed', 'delivered', 'cancelled'], {
      useNative: true,
      enumName: 'shipment_status'
    }).notNullable().defaultTo('pending');
    table.enu('priority', ['low', 'medium', 'high', 'critical'], {
      useNative: true,
      enumName: 'shipment_priority'
    }).notNullable().defaultTo('medium');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.specificType('current_location', 'geography(Point, 4326)');
    table.timestamp('estimated_delivery', { useTz: true });
    table.timestamp('actual_delivery', { useTz: true });
    table.string('carrier_id').notNullable();

    table.index(['status']);
    table.index(['priority']);
    table.index(['carrier_id']);
    table.index(['estimated_delivery']);
  });

  await knex.raw('CREATE INDEX shipments_current_location_gix ON shipments USING GIST (current_location)');
  await knex.raw('ALTER TABLE shipments ADD CONSTRAINT shipments_estimated_after_created_check CHECK (estimated_delivery IS NULL OR estimated_delivery >= created_at)');
  await knex.raw('ALTER TABLE shipments ADD CONSTRAINT shipments_actual_after_created_check CHECK (actual_delivery IS NULL OR actual_delivery >= created_at)');

  await knex.schema.createTable('warehouses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable().unique();
    table.specificType('location', 'geography(Point, 4326)').notNullable();
    table.integer('capacity').notNullable();
    table.integer('current_load').notNullable().defaultTo(0);
    table.enu('operational_status', ['operational', 'limited', 'offline'], {
      useNative: true,
      enumName: 'warehouse_operational_status'
    }).notNullable().defaultTo('operational');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['operational_status']);
  });

  await knex.raw('CREATE INDEX warehouses_location_gix ON warehouses USING GIST (location)');
  await knex.raw('ALTER TABLE warehouses ADD CONSTRAINT warehouses_load_capacity_check CHECK (current_load >= 0 AND current_load <= capacity)');

  await knex.schema.createTable('disruptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.enu('type', ['weather', 'operational', 'traffic'], {
      useNative: true,
      enumName: 'disruption_type'
    }).notNullable();
    table.integer('severity').notNullable();
    table.specificType('location', 'geography(Point, 4326)').notNullable();
    table.decimal('affected_radius_km', 8, 2).notNullable();
    table.timestamp('start_time', { useTz: true }).notNullable();
    table.timestamp('end_time', { useTz: true });
    table.text('description');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['type']);
    table.index(['severity']);
    table.index(['start_time']);
    table.index(['end_time']);
  });

  await knex.raw('CREATE INDEX disruptions_location_gix ON disruptions USING GIST (location)');
  await knex.raw('ALTER TABLE disruptions ADD CONSTRAINT disruptions_severity_check CHECK (severity >= 1 AND severity <= 10)');
  await knex.raw('ALTER TABLE disruptions ADD CONSTRAINT disruptions_radius_check CHECK (affected_radius_km >= 0)');
  await knex.raw('ALTER TABLE disruptions ADD CONSTRAINT disruptions_end_after_start_check CHECK (end_time IS NULL OR end_time >= start_time)');

  await knex.schema.createTable('routes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('shipment_id').notNullable().references('id').inTable('shipments').onDelete('CASCADE');
    table.jsonb('waypoints').notNullable();
    table.decimal('distance_km', 10, 2).notNullable();
    table.decimal('estimated_time_hours', 10, 2).notNullable();
    table.decimal('weather_risk_score', 5, 2).notNullable().defaultTo(0);
    table.decimal('traffic_risk_score', 5, 2).notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['shipment_id']);
    table.index(['weather_risk_score']);
    table.index(['traffic_risk_score']);
  });

  await knex.raw('ALTER TABLE routes ADD CONSTRAINT routes_distance_check CHECK (distance_km >= 0)');
  await knex.raw('ALTER TABLE routes ADD CONSTRAINT routes_estimated_time_check CHECK (estimated_time_hours >= 0)');
  await knex.raw('ALTER TABLE routes ADD CONSTRAINT routes_weather_risk_check CHECK (weather_risk_score >= 0 AND weather_risk_score <= 1)');
  await knex.raw('ALTER TABLE routes ADD CONSTRAINT routes_traffic_risk_check CHECK (traffic_risk_score >= 0 AND traffic_risk_score <= 1)');
  await knex.raw("ALTER TABLE routes ADD CONSTRAINT routes_waypoints_array_check CHECK (jsonb_typeof(waypoints) = 'array')");

  await knex.schema.createTable('predictions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('shipment_id').notNullable().references('id').inTable('shipments').onDelete('CASCADE');
    table.decimal('predicted_delay_hours', 10, 2).notNullable();
    table.decimal('confidence_score', 5, 2).notNullable();
    table.jsonb('factors').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['shipment_id']);
    table.index(['created_at']);
  });

  await knex.raw('ALTER TABLE predictions ADD CONSTRAINT predictions_confidence_check CHECK (confidence_score >= 0 AND confidence_score <= 1)');
  await knex.raw('ALTER TABLE predictions ADD CONSTRAINT predictions_delay_non_negative_check CHECK (predicted_delay_hours >= 0)');
  await knex.raw("ALTER TABLE predictions ADD CONSTRAINT predictions_factors_object_check CHECK (jsonb_typeof(factors) = 'object')");

  await knex.schema.createTable('alternate_routes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('shipment_id').notNullable().references('id').inTable('shipments').onDelete('CASCADE');
    table.uuid('original_route_id').references('id').inTable('routes').onDelete('SET NULL');
    table.jsonb('alternative_waypoints').notNullable();
    table.decimal('time_difference', 10, 2).notNullable();
    table.decimal('cost_difference', 12, 2).notNullable();
    table.decimal('recommendation_score', 5, 2).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['shipment_id']);
    table.index(['original_route_id']);
    table.index(['recommendation_score']);
  });

  await knex.raw('ALTER TABLE alternate_routes ADD CONSTRAINT alternate_routes_recommendation_check CHECK (recommendation_score >= 0 AND recommendation_score <= 1)');
  await knex.raw("ALTER TABLE alternate_routes ADD CONSTRAINT alternate_routes_waypoints_array_check CHECK (jsonb_typeof(alternative_waypoints) = 'array')");
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('alternate_routes');
  await knex.schema.dropTableIfExists('predictions');
  await knex.schema.dropTableIfExists('routes');
  await knex.schema.dropTableIfExists('disruptions');
  await knex.schema.dropTableIfExists('warehouses');
  await knex.schema.dropTableIfExists('shipments');

  await knex.raw('DROP TYPE IF EXISTS disruption_type');
  await knex.raw('DROP TYPE IF EXISTS warehouse_operational_status');
  await knex.raw('DROP TYPE IF EXISTS shipment_priority');
  await knex.raw('DROP TYPE IF EXISTS shipment_status');
}