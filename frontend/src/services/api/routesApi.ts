import { apiRequest } from './httpClient.ts';

export const routesApi = {
  getActiveRoute: (shipmentId: string) => apiRequest(`/api/routes/${shipmentId}`),
  getAlternatives: (shipmentId: string) => apiRequest(`/api/routes/${shipmentId}/alternatives`),
  rerouteShipment: (shipmentId: string, reason?: string) =>
    apiRequest(`/api/routes/${shipmentId}/reroute`, {
      method: 'POST',
      body: JSON.stringify({ trigger_type: 'manual', reason })
    })
};
