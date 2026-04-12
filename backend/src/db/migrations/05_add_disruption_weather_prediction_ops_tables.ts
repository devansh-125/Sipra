export async function up(knex) {
  await knex.raw('ALTER TABLE disruptions DROP CONSTRAINT IF EXISTS disruptions_end_after_start_check');

  await knex.raw('ALTER TABLE disruptions ALTER COLUMN type TYPE text USING type::text');
  await knex.raw('DROP TYPE IF EXISTS disruption_type');
  await knex.raw("CREATE TYPE disruption_type AS ENUM ('weather', 'congestion', 'blockage', 'vehicle_issue')");
  await knex.raw(
    "ALTER TABLE disruptions ALTER COLUMN type TYPE disruption_type USING (CASE type WHEN 'weather' THEN 'weather' WHEN 'traffic' THEN 'congestion' WHEN 'operational' THEN 'blockage' ELSE 'weather' END)::disruption_type"
  );

  await knex.schema.alterTable('disruptions', (table) => {
    table.renameColumn('start_time', 'starts_at');
    table.renameColumn('end_time', 'ends_at');
    table.enu('status', ['active', 'resolved'], {
      useNative: true,
      enumName: 'disruption_status'
    }).notNullable().defaultTo('active');
    table.uuid('node_id').references('id').inTable('network_nodes').onDelete('SET NULL');
    table.uuid('edge_id').references('id').inTable('network_edges').onDelete('SET NULL');
    table.string('title');
    table.enu('source', ['rule_engine', 'AI', 'simulator', 'manual'], {
      useNative: true,
      enumName: 'disruption_source'
    }).notNullable().defaultTo('simulator');
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['status']);
    table.index(['node_id']);
    table.index(['edge_id']);
  });

  await knex.raw('ALTER TABLE disruptions ADD CONSTRAINT disruptions_ends_after_starts_check CHECK (ends_at IS NULL OR ends_at >= starts_at)');

  await knex.schema.createTable('weather_snapshots', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('node_id').references('id').inTable('network_nodes').onDelete('SET NULL');
    table.decimal('latitude', 10, 7).notNullable();
    table.decimal('longitude', 10, 7).notNullable();
    table.string('weather_code').notNullable();
    table.decimal('temperature', 6, 2);
    table.decimal('rain_mm', 8, 2);
    table.decimal('wind_speed', 8, 2);
    table.decimal('visibility_km', 8, 2);
    table.decimal('severity_score', 5, 2).notNullable().defaultTo(0);
    table.timestamp('observed_at', { useTz: true }).notNullable();
    table.string('source').notNullable().defaultTo('open-meteo');

    table.index(['node_id', 'observed_at']);
  });

  await knex.raw('ALTER TABLE weather_snapshots ADD CONSTRAINT weather_snapshots_latitude_check CHECK (latitude >= -90 AND latitude <= 90)');
  await knex.raw('ALTER TABLE weather_snapshots ADD CONSTRAINT weather_snapshots_longitude_check CHECK (longitude >= -180 AND longitude <= 180)');
  await knex.raw('ALTER TABLE weather_snapshots ADD CONSTRAINT weather_snapshots_severity_check CHECK (severity_score >= 0 AND severity_score <= 1)');

  await knex.schema.createTable('delay_predictions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('shipment_id').notNullable().references('id').inTable('shipments').onDelete('CASCADE');
    table.string('model_name').notNullable();
    table.string('model_version').notNullable();
    table.jsonb('input_features_json').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    table.decimal('delay_probability', 5, 2).notNullable();
    table.integer('predicted_delay_min').notNullable();
    table.enu('risk_level', ['low', 'medium', 'high', 'critical'], {
      useNative: true,
      enumName: 'prediction_risk_level'
    }).notNullable().defaultTo('low');
    table.jsonb('top_factors_json').notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    table.integer('actual_delay_min');
    table.boolean('is_correct');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['shipment_id']);
    table.index(['created_at']);
  });

  await knex.raw('ALTER TABLE delay_predictions ADD CONSTRAINT delay_predictions_probability_check CHECK (delay_probability >= 0 AND delay_probability <= 1)');
  await knex.raw('ALTER TABLE delay_predictions ADD CONSTRAINT delay_predictions_predicted_non_negative_check CHECK (predicted_delay_min >= 0)');
  await knex.raw('ALTER TABLE delay_predictions ADD CONSTRAINT delay_predictions_actual_non_negative_check CHECK (actual_delay_min IS NULL OR actual_delay_min >= 0)');
  await knex.raw("ALTER TABLE delay_predictions ADD CONSTRAINT delay_predictions_input_features_object_check CHECK (jsonb_typeof(input_features_json) = 'object')");
  await knex.raw("ALTER TABLE delay_predictions ADD CONSTRAINT delay_predictions_top_factors_array_check CHECK (jsonb_typeof(top_factors_json) = 'array')");

  await knex.schema.createTable('alerts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('shipment_id').references('id').inTable('shipments').onDelete('CASCADE');
    table.uuid('disruption_id').references('id').inTable('disruptions').onDelete('SET NULL');
    table.string('alert_type').notNullable();
    table.integer('severity').notNullable();
    table.string('title').notNullable();
    table.text('message').notNullable();
    table.boolean('is_read').notNullable().defaultTo(false);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('resolved_at', { useTz: true });

    table.index(['shipment_id']);
    table.index(['disruption_id']);
    table.index(['severity']);
    table.index(['is_read']);
  });

  await knex.raw('ALTER TABLE alerts ADD CONSTRAINT alerts_severity_check CHECK (severity >= 1 AND severity <= 10)');
  await knex.raw('ALTER TABLE alerts ADD CONSTRAINT alerts_resolved_at_check CHECK (resolved_at IS NULL OR resolved_at >= created_at)');

  await knex.schema.createTable('api_cache', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.enu('provider', ['open-meteo', 'nominatim', 'ors'], {
      useNative: true,
      enumName: 'api_provider'
    }).notNullable();
    table.string('cache_key').notNullable();
    table.jsonb('response_json').notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['provider', 'cache_key']);
    table.unique(['provider', 'cache_key']);
  });

  await knex.schema.createTable('job_runs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('job_name').notNullable();
    table.enu('status', ['success', 'failed', 'running'], {
      useNative: true,
      enumName: 'job_run_status'
    }).notNullable();
    table.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('finished_at', { useTz: true });
    table.text('error_message');
    table.jsonb('metadata_json').notNullable().defaultTo(knex.raw("'{}'::jsonb"));

    table.index(['job_name']);
    table.index(['status']);
    table.index(['started_at']);
  });

  await knex.raw('ALTER TABLE job_runs ADD CONSTRAINT job_runs_finished_after_started_check CHECK (finished_at IS NULL OR finished_at >= started_at)');
  await knex.raw("ALTER TABLE job_runs ADD CONSTRAINT job_runs_metadata_object_check CHECK (jsonb_typeof(metadata_json) = 'object')");
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('job_runs');
  await knex.schema.dropTableIfExists('api_cache');
  await knex.schema.dropTableIfExists('alerts');
  await knex.schema.dropTableIfExists('delay_predictions');
  await knex.schema.dropTableIfExists('weather_snapshots');

  await knex.raw('ALTER TABLE disruptions DROP CONSTRAINT IF EXISTS disruptions_ends_after_starts_check');

  await knex.schema.alterTable('disruptions', (table) => {
    table.dropColumn('status');
    table.dropColumn('node_id');
    table.dropColumn('edge_id');
    table.dropColumn('title');
    table.dropColumn('source');
    table.dropColumn('updated_at');
    table.renameColumn('starts_at', 'start_time');
    table.renameColumn('ends_at', 'end_time');
  });

  await knex.raw('ALTER TABLE disruptions ALTER COLUMN type TYPE text USING type::text');
  await knex.raw('DROP TYPE IF EXISTS disruption_type');
  await knex.raw("CREATE TYPE disruption_type AS ENUM ('weather', 'operational', 'traffic')");
  await knex.raw(
    "ALTER TABLE disruptions ALTER COLUMN type TYPE disruption_type USING (CASE type WHEN 'weather' THEN 'weather' WHEN 'congestion' THEN 'traffic' WHEN 'blockage' THEN 'operational' WHEN 'vehicle_issue' THEN 'operational' ELSE 'weather' END)::disruption_type"
  );

  await knex.raw('ALTER TABLE disruptions ADD CONSTRAINT disruptions_end_after_start_check CHECK (end_time IS NULL OR end_time >= start_time)');

  await knex.raw('DROP TYPE IF EXISTS job_run_status');
  await knex.raw('DROP TYPE IF EXISTS api_provider');
  await knex.raw('DROP TYPE IF EXISTS prediction_risk_level');
  await knex.raw('DROP TYPE IF EXISTS disruption_source');
  await knex.raw('DROP TYPE IF EXISTS disruption_status');
}
