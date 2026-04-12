import { apiRequest } from '../api/httpClient.ts';

export const demoApi = {
  seed: (shipmentCount = 4) =>
    apiRequest('/api/demo/seed', {
      method: 'POST',
      body: JSON.stringify({ shipment_count: shipmentCount })
    }),
  godMode: (severity = 10) =>
    apiRequest('/api/demo/god-mode', {
      method: 'POST',
      body: JSON.stringify({ severity })
    }),
  reset: () =>
    apiRequest('/api/demo/reset', {
      method: 'POST'
    })
};
