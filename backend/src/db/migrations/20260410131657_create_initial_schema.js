export const up = function(knex) {
  return knex.schema
    .createTable('shipments', function(table) {
      table.increments('id').primary();
      table.string('tracking_number').unique().notNullable();
      table.string('origin').notNullable();
      table.string('destination').notNullable();
      table.string('status').notNullable(); // PENDING, IN_TRANSIT, DELIVERED, DELAYED
      table.float('latitude');
      table.float('longitude');
      table.string('carrier');
      table.timestamp('estimated_delivery');
      table.timestamp('actual_delivery');
      table.timestamps(true, true);
    })
    .createTable('disruptions', function(table) {
      table.increments('id').primary();
      table.string('type').notNullable(); // WEATHER, TRAFFIC, STRIKE, MECHANICAL
      table.string('severity').notNullable(); // LOW, MEDIUM, HIGH
      table.string('location').notNullable();
      table.text('description');
      table.timestamp('start_time').defaultTo(knex.fn.now());
      table.timestamp('end_time');
      table.timestamps(true, true);
    })
    .createTable('shipment_disruptions', function(table) {
      table.integer('shipment_id').unsigned().references('id').inTable('shipments').onDelete('CASCADE');
      table.integer('disruption_id').unsigned().references('id').inTable('disruptions').onDelete('CASCADE');
      table.primary(['shipment_id', 'disruption_id']);
    })
    .createTable('analytics', function(table) {
      table.increments('id').primary();
      table.string('metric_name').notNullable();
      table.float('metric_value').notNullable();
      table.timestamp('timestamp').defaultTo(knex.fn.now());
    });
};

export const down = function(knex) {
  return knex.schema
    .dropTableIfExists('analytics')
    .dropTableIfExists('shipment_disruptions')
    .dropTableIfExists('disruptions')
    .dropTableIfExists('shipments');
};
