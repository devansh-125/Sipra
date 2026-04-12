/**
 * Seed: Warehouse Locations
 *
 * Populates the warehouses table with realistic hub locations across the US
 * Includes major logistics hubs in key cities with varying capacities
 */

export const seed = async function(knex) {
  // Delete existing entries
  await knex('warehouses').del();

  // Insert warehouse seed data
  await knex('warehouses').insert([
    {
      id: 1,
      name: 'New York Metro Hub',
      code: 'WH-NYC-01',
      latitude: 40.7128,
      longitude: -74.0060,
      location: knex.raw(`ST_SetSRID(ST_MakePoint(-74.0060, 40.7128), 4326)`),
      address: '450 West 33rd Street',
      city: 'New York',
      state: 'NY',
      country: 'USA',
      postal_code: '10001',
      capacity: 200,
      current_load: 0,
      operational_status: 'ACTIVE',
      operating_hours: JSON.stringify({
        open: '06:00',
        close: '22:00',
        timezone: 'America/New_York'
      }),
      capabilities: JSON.stringify({
        cold_storage: true,
        hazmat: true,
        loading_docks: 12,
        cross_docking: true
      })
    },
    {
      id: 2,
      name: 'Los Angeles Distribution Center',
      code: 'WH-LAX-01',
      latitude: 34.0522,
      longitude: -118.2437,
      location: knex.raw(`ST_SetSRID(ST_MakePoint(-118.2437, 34.0522), 4326)`),
      address: '1800 E Olympic Blvd',
      city: 'Los Angeles',
      state: 'CA',
      country: 'USA',
      postal_code: '90021',
      capacity: 250,
      current_load: 0,
      operational_status: 'ACTIVE',
      operating_hours: JSON.stringify({
        open: '05:00',
        close: '23:00',
        timezone: 'America/Los_Angeles'
      }),
      capabilities: JSON.stringify({
        cold_storage: true,
        hazmat: true,
        loading_docks: 15,
        cross_docking: true
      })
    },
    {
      id: 3,
      name: 'Chicago Central Warehouse',
      code: 'WH-CHI-01',
      latitude: 41.8781,
      longitude: -87.6298,
      location: knex.raw(`ST_SetSRID(ST_MakePoint(-87.6298, 41.8781), 4326)`),
      address: '2000 S Western Ave',
      city: 'Chicago',
      state: 'IL',
      country: 'USA',
      postal_code: '60608',
      capacity: 180,
      current_load: 0,
      operational_status: 'ACTIVE',
      operating_hours: JSON.stringify({
        open: '06:00',
        close: '20:00',
        timezone: 'America/Chicago'
      }),
      capabilities: JSON.stringify({
        cold_storage: true,
        hazmat: false,
        loading_docks: 10,
        cross_docking: true
      })
    },
    {
      id: 4,
      name: 'Dallas-Fort Worth Hub',
      code: 'WH-DFW-01',
      latitude: 32.7767,
      longitude: -96.7970,
      location: knex.raw(`ST_SetSRID(ST_MakePoint(-96.7970, 32.7767), 4326)`),
      address: '3500 Inwood Rd',
      city: 'Dallas',
      state: 'TX',
      country: 'USA',
      postal_code: '75247',
      capacity: 220,
      current_load: 0,
      operational_status: 'ACTIVE',
      operating_hours: JSON.stringify({
        open: '06:00',
        close: '22:00',
        timezone: 'America/Chicago'
      }),
      capabilities: JSON.stringify({
        cold_storage: false,
        hazmat: true,
        loading_docks: 14,
        cross_docking: true
      })
    },
    {
      id: 5,
      name: 'Atlanta Regional Center',
      code: 'WH-ATL-01',
      latitude: 33.7490,
      longitude: -84.3880,
      location: knex.raw(`ST_SetSRID(ST_MakePoint(-84.3880, 33.7490), 4326)`),
      address: '1800 Westgate Dr',
      city: 'Atlanta',
      state: 'GA',
      country: 'USA',
      postal_code: '30336',
      capacity: 190,
      current_load: 0,
      operational_status: 'ACTIVE',
      operating_hours: JSON.stringify({
        open: '06:00',
        close: '21:00',
        timezone: 'America/New_York'
      }),
      capabilities: JSON.stringify({
        cold_storage: true,
        hazmat: true,
        loading_docks: 11,
        cross_docking: true
      })
    },
    {
      id: 6,
      name: 'Seattle Northwest Hub',
      code: 'WH-SEA-01',
      latitude: 47.6062,
      longitude: -122.3321,
      location: knex.raw(`ST_SetSRID(ST_MakePoint(-122.3321, 47.6062), 4326)`),
      address: '4500 1st Ave S',
      city: 'Seattle',
      state: 'WA',
      country: 'USA',
      postal_code: '98134',
      capacity: 160,
      current_load: 0,
      operational_status: 'ACTIVE',
      operating_hours: JSON.stringify({
        open: '06:00',
        close: '20:00',
        timezone: 'America/Los_Angeles'
      }),
      capabilities: JSON.stringify({
        cold_storage: true,
        hazmat: false,
        loading_docks: 9,
        cross_docking: false
      })
    },
    {
      id: 7,
      name: 'Denver Mountain Hub',
      code: 'WH-DEN-01',
      latitude: 39.7392,
      longitude: -104.9903,
      location: knex.raw(`ST_SetSRID(ST_MakePoint(-104.9903, 39.7392), 4326)`),
      address: '6000 Smith Rd',
      city: 'Denver',
      state: 'CO',
      country: 'USA',
      postal_code: '80207',
      capacity: 140,
      current_load: 0,
      operational_status: 'ACTIVE',
      operating_hours: JSON.stringify({
        open: '07:00',
        close: '19:00',
        timezone: 'America/Denver'
      }),
      capabilities: JSON.stringify({
        cold_storage: false,
        hazmat: true,
        loading_docks: 8,
        cross_docking: true
      })
    },
    {
      id: 8,
      name: 'Miami Southeast Hub',
      code: 'WH-MIA-01',
      latitude: 25.7617,
      longitude: -80.1918,
      location: knex.raw(`ST_SetSRID(ST_MakePoint(-80.1918, 25.7617), 4326)`),
      address: '3500 NW 79th Ave',
      city: 'Miami',
      state: 'FL',
      country: 'USA',
      postal_code: '33166',
      capacity: 170,
      current_load: 0,
      operational_status: 'ACTIVE',
      operating_hours: JSON.stringify({
        open: '06:00',
        close: '21:00',
        timezone: 'America/New_York'
      }),
      capabilities: JSON.stringify({
        cold_storage: true,
        hazmat: true,
        loading_docks: 10,
        cross_docking: true
      })
    },
    {
      id: 9,
      name: 'Phoenix Southwest Center',
      code: 'WH-PHX-01',
      latitude: 33.4484,
      longitude: -112.0740,
      location: knex.raw(`ST_SetSRID(ST_MakePoint(-112.0740, 33.4484), 4326)`),
      address: '2400 S 24th St',
      city: 'Phoenix',
      state: 'AZ',
      country: 'USA',
      postal_code: '85034',
      capacity: 150,
      current_load: 0,
      operational_status: 'ACTIVE',
      operating_hours: JSON.stringify({
        open: '06:00',
        close: '20:00',
        timezone: 'America/Phoenix'
      }),
      capabilities: JSON.stringify({
        cold_storage: false,
        hazmat: true,
        loading_docks: 9,
        cross_docking: true
      })
    },
    {
      id: 10,
      name: 'Boston Northeast Hub',
      code: 'WH-BOS-01',
      latitude: 42.3601,
      longitude: -71.0589,
      location: knex.raw(`ST_SetSRID(ST_MakePoint(-71.0589, 42.3601), 4326)`),
      address: '100 Widett Cir',
      city: 'Boston',
      state: 'MA',
      country: 'USA',
      postal_code: '02118',
      capacity: 130,
      current_load: 0,
      operational_status: 'ACTIVE',
      operating_hours: JSON.stringify({
        open: '06:00',
        close: '20:00',
        timezone: 'America/New_York'
      }),
      capabilities: JSON.stringify({
        cold_storage: true,
        hazmat: false,
        loading_docks: 8,
        cross_docking: false
      })
    }
  ]);

  // Reset the sequence for the id column
  await knex.raw(`SELECT setval('warehouses_id_seq', (SELECT MAX(id) FROM warehouses))`);
};
