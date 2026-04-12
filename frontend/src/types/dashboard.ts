export type DashboardKpi = {
  label: string;
  value: number | string;
  trend?: 'up' | 'down' | 'flat';
};

export type DashboardSummary = {
  kpis: DashboardKpi[];
};
