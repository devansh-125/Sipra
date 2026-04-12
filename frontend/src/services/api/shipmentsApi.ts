import { apiRequest } from './httpClient.ts';

export const shipmentsApi = {
  list: () => apiRequest('/api/shipments'),
  getById: (shipmentId: string) => apiRequest(`/api/shipments/${shipmentId}`),
  getEvents: (shipmentId: string) => apiRequest(`/api/shipments/${shipmentId}/events`),
  updateStatus: (shipmentId: string, status: string) =>
    apiRequest(`/api/shipments/${shipmentId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    })
};
