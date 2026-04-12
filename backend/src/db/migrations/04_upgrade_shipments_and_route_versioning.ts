export async function up(knex) {
  await knex.schema.alterTable('shipments', (table) => {
    table.string('tracking_number').unique();
    table.uuid('origin_node_id').references('id').inTable('network_nodes').onDelete('SET NULL');
    table.uuid('destination_node_id').references('id').inTable('network_nodes').onDelete('SET NULL');
    table.uuid('current_node_id').references('id').inTable('network_nodes').onDelete('SET NULL');
    table.string('cargo_type');
    table.decimal('weight_kg', 12, 2);
    table.timestamp('planned_departure', { useTz: true });
    table.timestamp('planned_arrival', { useTz: true });
    table.timestamp('actual_departure', { useTz: true });
    table.timestamp('actual_arrival', { useTz: true });
    table.decimal('current_latitude', 10, 7);
    table.decimal('current_longitude', 10, 7);
    table.decimal('progress_percentage', 5, 2).notNullable().defaultTo(0);
    table.timestamp('current_eta', { useTz: true });
    table.decimal('delay_probability', 5, 2);
    table.integer('predicted_delay_min');
    table.enu('risk_level', ['low', 'medium', 'high', 'critical'], {
      useNative: true,
      enumName: 'shipment_risk_level'
    }).notNullable().defaultTo('low');
    table.uuid('active_route_plan_id');
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['tracking_number']);
    table.index(['origin_node_id']);
    table.index(['destination_node_id']);
    table.index(['current_node_id']);
    table.index(['active_route_plan_id']);
  });

  await knex.raw('ALTER TABLE shipments ALTER COLUMN carrier_id DROP NOT NULL');
  await knex.raw(
    "ALTER TABLE shipments ALTER COLUMN carrier_id TYPE uuid USING (CASE WHEN carrier_id IS NULL THEN NULL WHEN carrier_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN carrier_id::uuid ELSE NULL END)"
  );
  await knex.raw('ALTER TABLE shipments ADD CONSTRAINT shipments_carrier_id_fkey FOREIGN KEY (carrier_id) REFERENCES carriers(id) ON DELETE SET NULL');

  await knex.raw('ALTER TABLE shipments ADD CONSTRAINT shipments_weight_non_negative_check CHECK (weight_kg IS NULL OR weight_kg >= 0)');
  await knex.raw('ALTER TABLE shipments ADD CONSTRAINT shipments_current_latitude_check CHECK (current_latitude IS NULL OR (current_latitude >= -90 AND current_latitude <= 90))');
  await knex.raw('ALTER TABLE shipments ADD CONSTRAINT shipments_current_longitude_check CHECK (current_longitude IS NULL OR (current_longitude >= -180 AND current_longitude <= 180))');
  await knex.raw('ALTER TABLE shipments ADD CONSTRAINT shipments_progress_percentage_check CHECK (progress_percentage >= 0 AND progress_percentage <= 100)');
  await knex.raw('ALTER TABLE shipments ADD CONSTRAINT shipments_delay_probability_check CHECK (delay_probability IS NULL OR (delay_probability >= 0 AND delay_probability <= 1))');
  await knex.raw('ALTER TABLE shipments ADD CONSTRAINT shipments_predicted_delay_non_negative_check CHECK (predicted_delay_min IS NULL OR predicted_delay_min >= 0)');
  await knex.raw('ALTER TABLE shipments ADD CONSTRAINT shipments_planned_arrival_check CHECK (planned_arrival IS NULL OR planned_departure IS NULL OR planned_arrival >= planned_departure)');
  await knex.raw('ALTER TABLE shipments ADD CONSTRAINT shipments_actual_arrival_check CHECK (actual_arrival IS NULL OR actual_departure IS NULL OR actual_arrival >= actual_departure)');

  await knex.schema.createTable('shipment_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('shipment_id').notNullable().references('id').inTable('shipments').onDelete('CASCADE');
    table.enu('event_type', ['created', 'moved', 'delayed', 'rerouted', 'delivered'], {
      useNative: true,
      enumName: 'shipment_event_type'
    }).notNullable();
    table.uuid('node_id').references('id').inTable('network_nodes').onDelete('SET NULL');
    table.decimal('latitude', 10, 7);
    table.decimal('longitude', 10, 7);
    table.text('description');
    table.timestamp('event_time', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.enu('source', ['simulator', 'user', 'rule_engine', 'AI'], {
      useNative: true,
      enumName: 'shipment_event_source'
    }).notNullable().defaultTo('simulator');
    table.jsonb('metadata_json').notNullable().defaultTo(knex.raw("'{}'::jsonb"));

    table.index(['shipment_id', 'event_time']);
    table.index(['event_type']);
    table.index(['node_id']);
  });

  await knex.raw('ALTER TABLE shipment_events ADD CONSTRAINT shipment_events_latitude_check CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90))');
  await knex.raw('ALTER TABLE shipment_events ADD CONSTRAINT shipment_events_longitude_check CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))');
  await knex.raw("ALTER TABLE shipment_events ADD CONSTRAINT shipment_events_metadata_object_check CHECK (jsonb_typeof(metadata_json) = 'object')");

  await knex.schema.createTable('route_plans', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('shipment_id').notNullable().references('id').inTable('shipments').onDelete('CASCADE');
    table.integer('version_no').notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.enu('status', ['planned', 'active', 'replaced', 'completed'], {
      useNative: true,
      enumName: 'route_plan_status'
    }).notNullable().defaultTo('planned');
    table.enu('trigger_type', ['initial', 'disruption', 'manual', 'AI'], {
      useNative: true,
      enumName: 'route_trigger_type'
    }).notNullable().defaultTo('initial');
    table.decimal('total_distance_km', 10, 2);
    table.integer('total_duration_min');
    table.decimal('risk_score', 5, 2);
    table.jsonb('comparison_summary_json').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['shipment_id', 'version_no']);
    table.index(['shipment_id', 'version_no']);
    table.index(['shipment_id', 'is_active']);
  });

  await knex.raw('ALTER TABLE route_plans ADD CONSTRAINT route_plans_total_distance_check CHECK (total_distance_km IS NULL OR total_distance_km >= 0)');
  await knex.raw('ALTER TABLE route_plans ADD CONSTRAINT route_plans_total_duration_check CHECK (total_duration_min IS NULL OR total_duration_min >= 0)');
  await knex.raw('ALTER TABLE route_plans ADD CONSTRAINT route_plans_risk_score_check CHECK (risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 1))');
  await knex.raw("ALTER TABLE route_plans ADD CONSTRAINT route_plans_comparison_summary_object_check CHECK (jsonb_typeof(comparison_summary_json) = 'object')");

  await knex.schema.createTable('route_segments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('route_plan_id').notNullable().references('id').inTable('route_plans').onDelete('CASCADE');
    table.integer('sequence_no').notNullable();
    table.uuid('edge_id').references('id').inTable('network_edges').onDelete('SET NULL');
    table.uuid('from_node_id').references('id').inTable('network_nodes').onDelete('SET NULL');
    table.uuid('to_node_id').references('id').inTable('network_nodes').onDelete('SET NULL');
    table.decimal('planned_distance_km', 10, 2);
    table.integer('planned_duration_min');
    table.decimal('weather_risk', 5, 2);
    table.decimal('congestion_risk', 5, 2);
    table.decimal('disruption_risk', 5, 2);
    table.decimal('final_score', 5, 2);
    table.jsonb('geometry_json').defaultTo(knex.raw("'[]'::jsonb"));

    table.unique(['route_plan_id', 'sequence_no']);
    table.index(['route_plan_id', 'sequence_no']);
    table.index(['edge_id']);
  });

  await knex.raw('ALTER TABLE route_segments ADD CONSTRAINT route_segments_distance_check CHECK (planned_distance_km IS NULL OR planned_distance_km >= 0)');
  await knex.raw('ALTER TABLE route_segments ADD CONSTRAINT route_segments_duration_check CHECK (planned_duration_min IS NULL OR planned_duration_min >= 0)');
  await knex.raw('ALTER TABLE route_segments ADD CONSTRAINT route_segments_weather_risk_check CHECK (weather_risk IS NULL OR (weather_risk >= 0 AND weather_risk <= 1))');
  await knex.raw('ALTER TABLE route_segments ADD CONSTRAINT route_segments_congestion_risk_check CHECK (congestion_risk IS NULL OR (congestion_risk >= 0 AND congestion_risk <= 1))');
  await knex.raw('ALTER TABLE route_segments ADD CONSTRAINT route_segments_disruption_risk_check CHECK (disruption_risk IS NULL OR (disruption_risk >= 0 AND disruption_risk <= 1))');
  await knex.raw('ALTER TABLE route_segments ADD CONSTRAINT route_segments_final_score_check CHECK (final_score IS NULL OR (final_score >= 0 AND final_score <= 1))');

  await knex.schema.alterTable('shipments', (table) => {
    table.foreign('active_route_plan_id').references('id').inTable('route_plans').onDelete('SET NULL');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('shipments', (table) => {
    table.dropForeign(['active_route_plan_id']);
  });

  await knex.schema.dropTableIfExists('route_segments');
  await knex.schema.dropTableIfExists('route_plans');
  await knex.schema.dropTableIfExists('shipment_events');

  await knex.raw('ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_carrier_id_fkey');
  await knex.raw('ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_weight_non_negative_check');
  await knex.raw('ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_current_latitude_check');
  await knex.raw('ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_current_longitude_check');
  await knex.raw('ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_progress_percentage_check');
  await knex.raw('ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_delay_probability_check');
  await knex.raw('ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_predicted_delay_non_negative_check');
  await knex.raw('ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_planned_arrival_check');
  await knex.raw('ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_actual_arrival_check');

  await knex.raw('ALTER TABLE shipments ALTER COLUMN carrier_id TYPE varchar USING carrier_id::text');
  await knex.raw("UPDATE shipments SET carrier_id = 'legacy-carrier' WHERE carrier_id IS NULL");
  await knex.raw('ALTER TABLE shipments ALTER COLUMN carrier_id SET NOT NULL');

  await knex.schema.alterTable('shipments', (table) => {
    table.dropColumn('tracking_number');
    table.dropColumn('origin_node_id');
    table.dropColumn('destination_node_id');
    table.dropColumn('current_node_id');
    table.dropColumn('cargo_type');
    table.dropColumn('weight_kg');
    table.dropColumn('planned_departure');
    table.dropColumn('planned_arrival');
    table.dropColumn('actual_departure');
    table.dropColumn('actual_arrival');
    table.dropColumn('current_latitude');
    table.dropColumn('current_longitude');
    table.dropColumn('progress_percentage');
    table.dropColumn('current_eta');
    table.dropColumn('delay_probability');
    table.dropColumn('predicted_delay_min');
    table.dropColumn('risk_level');
    table.dropColumn('active_route_plan_id');
    table.dropColumn('updated_at');
  });

  await knex.raw('DROP TYPE IF EXISTS route_trigger_type');
  await knex.raw('DROP TYPE IF EXISTS route_plan_status');
  await knex.raw('DROP TYPE IF EXISTS shipment_event_source');
  await knex.raw('DROP TYPE IF EXISTS shipment_event_type');
  await knex.raw('DROP TYPE IF EXISTS shipment_risk_level');
}
