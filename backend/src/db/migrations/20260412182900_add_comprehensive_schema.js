/**
 * Migration: Comprehensive Smart Supply Chain Schema
 *
 * This migration adds all required tables for the supply chain digital twin:
 * - warehouses: Hub locations with capacity tracking
 * - routes: Shipment routes with waypoints and risk scores
 * - predictions: AI-generated delay predictions
 * - alternate_routes: Alternative route recommendations
 * - shipment_history: Audit trail for shipment changes
 * - disruption_areas: Geographic areas affected by disruptions
 *
 * Also updates existing shipments table with additional fields
 */

export const up = async function(knex) {
  // Enable PostGIS extension for geographic queries (if using PostgreSQL)
  await knex.raw('CREATE EXTENSION IF NOT EXISTS postgis');

  // Update shipments table with additional fields
  await knex.schema.alterTable('shipments', function(table) {
    table.string('priority').defaultTo('MEDIUM'); // LOW, MEDIUM, HIGH, URGENT
    table.integer('carrier_id').unsigned();
    table.jsonb('current_location'); // {lat, lng, timestamp}
    table.integer('origin_warehouse_id').unsigned();
    table.integer('destination_warehouse_id').unsigned();
    table.float('distance_km');
    table.float('estimated_time_hours');
    table.float('current_speed_kmh');
    table.string('shipment_type').defaultTo('STANDARD'); // STANDARD, EXPRESS, FRAGILE, HAZMAT
    table.float('weight_kg');
    table.jsonb('cargo_details'); // {items: [], value: 0, temperature_control: false}
  });

  // Create warehouses/hubs table
  await knex.schema.createTable('warehouses', function(table) {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.string('code').unique().notNullable(); // e.g., "WH-NYC-01"
    table.float('latitude').notNullable();
    table.float('longitude').notNullable();
    table.specificType('location', 'geography(POINT, 4326)'); // PostGIS geography type
    table.string('address').notNullable();
    table.string('city').notNullable();
    table.string('state');
    table.string('country').notNullable();
    table.string('postal_code');
    table.integer('capacity').notNullable(); // Max number of shipments
    table.integer('current_load').defaultTo(0); // Current number of shipments
    table.string('operational_status').defaultTo('ACTIVE'); // ACTIVE, MAINTENANCE, CLOSED
    table.jsonb('operating_hours'); // {open: "08:00", close: "18:00", timezone: "EST"}
    table.jsonb('capabilities'); // {cold_storage: true, hazmat: false, loading_docks: 5}
    table.timestamps(true, true);
  });

  // Create routes table
  await knex.schema.createTable('routes', function(table) {
    table.increments('id').primary();
    table.integer('shipment_id').unsigned().references('id').inTable('shipments').onDelete('CASCADE');
    table.jsonb('waypoints').notNullable(); // [{lat, lng, name, sequence}]
    table.float('distance_km').notNullable();
    table.float('estimated_time_hours').notNullable();
    table.float('weather_risk_score').defaultTo(0); // 0-100 scale
    table.float('traffic_risk_score').defaultTo(0); // 0-100 scale
    table.float('operational_risk_score').defaultTo(0); // 0-100 scale
    table.float('overall_risk_score').defaultTo(0); // Combined risk score
    table.boolean('is_active').defaultTo(true);
    table.string('route_type').defaultTo('PRIMARY'); // PRIMARY, ALTERNATIVE, EMERGENCY
    table.jsonb('route_metadata'); // {highway_percentage: 80, urban_percentage: 20}
    table.timestamps(true, true);
  });

  // Create predictions table
  await knex.schema.createTable('predictions', function(table) {
    table.increments('id').primary();
    table.integer('shipment_id').unsigned().references('id').inTable('shipments').onDelete('CASCADE');
    table.float('predicted_delay_hours').notNullable();
    table.float('confidence_score').notNullable(); // 0-100
    table.jsonb('contributing_factors'); // [{factor: "weather", impact: 0.4}, ...]
    table.string('prediction_model').defaultTo('v1'); // Model version used
    table.timestamp('prediction_time').defaultTo(knex.fn.now());
    table.boolean('is_latest').defaultTo(true);
    table.jsonb('features_used'); // Stores input features for debugging
    table.timestamps(true, true);
  });

  // Create alternate_routes table
  await knex.schema.createTable('alternate_routes', function(table) {
    table.increments('id').primary();
    table.integer('shipment_id').unsigned().references('id').inTable('shipments').onDelete('CASCADE');
    table.integer('original_route_id').unsigned().references('id').inTable('routes').onDelete('SET NULL');
    table.jsonb('alternative_waypoints').notNullable();
    table.float('distance_km').notNullable();
    table.float('estimated_time_hours').notNullable();
    table.float('time_difference_hours'); // Compared to original route
    table.float('distance_difference_km');
    table.float('cost_difference'); // Estimated additional cost
    table.float('recommendation_score').notNullable(); // 0-100, higher is better
    table.string('reason').notNullable(); // Why this route is recommended
    table.string('status').defaultTo('PENDING'); // PENDING, ACCEPTED, REJECTED
    table.timestamp('recommended_at').defaultTo(knex.fn.now());
    table.timestamp('decision_at');
    table.string('decision_by'); // User ID or "SYSTEM"
    table.text('rejection_reason');
    table.timestamps(true, true);
  });

  // Create shipment_history table for audit trail
  await knex.schema.createTable('shipment_history', function(table) {
    table.increments('id').primary();
    table.integer('shipment_id').unsigned().references('id').inTable('shipments').onDelete('CASCADE');
    table.string('event_type').notNullable(); // STATUS_CHANGE, LOCATION_UPDATE, ROUTE_CHANGE, etc.
    table.string('old_value');
    table.string('new_value');
    table.jsonb('event_data'); // Additional context
    table.timestamp('event_timestamp').defaultTo(knex.fn.now());
    table.string('triggered_by').defaultTo('SYSTEM'); // SYSTEM, USER, SIMULATION
    table.text('notes');
  });

  // Create disruption_areas table for geographic disruption tracking
  await knex.schema.createTable('disruption_areas', function(table) {
    table.increments('id').primary();
    table.integer('disruption_id').unsigned().references('id').inTable('disruptions').onDelete('CASCADE');
    table.float('center_latitude').notNullable();
    table.float('center_longitude').notNullable();
    table.specificType('center_location', 'geography(POINT, 4326)');
    table.float('affected_radius_km').notNullable();
    table.specificType('affected_area', 'geography(POLYGON, 4326)'); // Circle or polygon
    table.jsonb('area_metadata'); // {cities: [], highways: []}
  });

  // Add indexes for performance
  await knex.schema.alterTable('shipments', function(table) {
    table.index('status');
    table.index('created_at');
    table.index('carrier_id');
    table.index('origin_warehouse_id');
    table.index('destination_warehouse_id');
    table.index(['status', 'priority']);
  });

  await knex.schema.alterTable('warehouses', function(table) {
    table.index('operational_status');
    table.index('city');
    table.index('country');
  });

  await knex.schema.alterTable('routes', function(table) {
    table.index('shipment_id');
    table.index('is_active');
    table.index(['shipment_id', 'is_active']);
  });

  await knex.schema.alterTable('predictions', function(table) {
    table.index('shipment_id');
    table.index('is_latest');
    table.index('prediction_time');
    table.index(['shipment_id', 'is_latest']);
  });

  await knex.schema.alterTable('alternate_routes', function(table) {
    table.index('shipment_id');
    table.index('status');
    table.index(['shipment_id', 'status']);
  });

  await knex.schema.alterTable('shipment_history', function(table) {
    table.index('shipment_id');
    table.index('event_type');
    table.index('event_timestamp');
  });

  await knex.schema.alterTable('disruptions', function(table) {
    table.index('type');
    table.index('severity');
    table.index('start_time');
    table.index(['type', 'severity']);
  });

  await knex.schema.alterTable('disruption_areas', function(table) {
    table.index('disruption_id');
  });

  // Add foreign key constraints for warehouses
  await knex.schema.alterTable('shipments', function(table) {
    table.foreign('origin_warehouse_id').references('id').inTable('warehouses').onDelete('SET NULL');
    table.foreign('destination_warehouse_id').references('id').inTable('warehouses').onDelete('SET NULL');
  });
};

export const down = async function(knex) {
  // Drop foreign key constraints first
  await knex.schema.alterTable('shipments', function(table) {
    table.dropForeign('origin_warehouse_id');
    table.dropForeign('destination_warehouse_id');
  });

  // Drop new tables
  await knex.schema.dropTableIfExists('disruption_areas');
  await knex.schema.dropTableIfExists('shipment_history');
  await knex.schema.dropTableIfExists('alternate_routes');
  await knex.schema.dropTableIfExists('predictions');
  await knex.schema.dropTableIfExists('routes');
  await knex.schema.dropTableIfExists('warehouses');

  // Revert shipments table changes
  await knex.schema.alterTable('shipments', function(table) {
    table.dropColumn('priority');
    table.dropColumn('carrier_id');
    table.dropColumn('current_location');
    table.dropColumn('origin_warehouse_id');
    table.dropColumn('destination_warehouse_id');
    table.dropColumn('distance_km');
    table.dropColumn('estimated_time_hours');
    table.dropColumn('current_speed_kmh');
    table.dropColumn('shipment_type');
    table.dropColumn('weight_kg');
    table.dropColumn('cargo_details');
  });
};
