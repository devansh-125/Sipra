import { apiRequest } from './httpClient.ts';

export const dashboardApi = {
  getSummary: () => apiRequest('/api/dashboard/summary'),
  getDelayTrends: (days = 14) => apiRequest('/api/dashboard/delay-trends', { query: { days } }),
  getBottlenecks: (limit = 10) => apiRequest('/api/dashboard/bottlenecks', { query: { limit } }),
  getMapData: (limit = 300) => apiRequest('/api/dashboard/map-data', { query: { limit } }),
  getRiskDistribution: () => apiRequest('/api/dashboard/risk-distribution')
};
