export type RouteMetrics = {
  eta_text: string;
  distance_km: number;
  risk_label: string;
  weather_exposure: string;
  stops: number;
};

export type RouteComparison = {
  current: RouteMetrics;
  suggested: RouteMetrics;
  recommendation: string;
};
