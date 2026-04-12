export function mapDashboardSummary(raw: any) {
  return {
    kpis: raw?.kpis || []
  };
}
