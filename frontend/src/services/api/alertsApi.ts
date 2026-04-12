import { apiRequest } from './httpClient.ts';

export const alertsApi = {
  list: () => apiRequest('/api/alerts'),
  markRead: (alertId: string) =>
    apiRequest(`/api/alerts/${alertId}/read`, {
      method: 'PATCH'
    })
};
