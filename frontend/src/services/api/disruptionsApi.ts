import { apiRequest } from './httpClient.ts';

export const disruptionsApi = {
  list: () => apiRequest('/api/disruptions'),
  simulate: (payload: Record<string, unknown>) =>
    apiRequest('/api/disruptions/simulate', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
};
