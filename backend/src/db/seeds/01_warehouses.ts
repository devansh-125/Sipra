export async function seed(knex) {
  await knex('warehouses').del();

  const warehouses = [
    {
      name: 'New York Distribution Hub',
      lat: 40.7128,
      lng: -74.0060,
      capacity: 1200,
      current_load: 740,
      operational_status: 'operational'
    },
    {
      name: 'Chicago Central Hub',
      lat: 41.8781,
      lng: -87.6298,
      capacity: 1000,
      current_load: 620,
      operational_status: 'operational'
    },
    {
      name: 'Los Angeles Gateway Hub',
      lat: 34.0522,
      lng: -118.2437,
      capacity: 1400,
      current_load: 1010,
      operational_status: 'limited'
    },
    {
      name: 'Houston South Logistics Hub',
      lat: 29.7604,
      lng: -95.3698,
      capacity: 950,
      current_load: 530,
      operational_status: 'operational'
    },
    {
      name: 'Seattle Northwest Hub',
      lat: 47.6062,
      lng: -122.3321,
      capacity: 800,
      current_load: 390,
      operational_status: 'operational'
    },
    {
      name: 'Miami Atlantic Hub',
      lat: 25.7617,
      lng: -80.1918,
      capacity: 900,
      current_load: 660,
      operational_status: 'limited'
    },
    {
      name: 'Denver Mountain Hub',
      lat: 39.7392,
      lng: -104.9903,
      capacity: 700,
      current_load: 280,
      operational_status: 'operational'
    },
    {
      name: 'Atlanta Southeast Hub',
      lat: 33.7490,
      lng: -84.3880,
      capacity: 1100,
      current_load: 770,
      operational_status: 'operational'
    }
  ];

  const payload = warehouses.map((warehouse) => ({
    name: warehouse.name,
    location: knex.raw('ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography', [warehouse.lng, warehouse.lat]),
    capacity: warehouse.capacity,
    current_load: warehouse.current_load,
    operational_status: warehouse.operational_status
  }));

  await knex('warehouses').insert(payload);
}
