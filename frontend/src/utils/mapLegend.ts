import { MAP_COLORS } from './constants.ts';

export type MapLegendTone = 'healthy' | 'warning' | 'delayed' | 'rerouted' | 'replacedRoute';

export type MapLegendItem = {
  key: MapLegendTone;
  label: string;
  color: string;
  dotClass: string;
};

export const mapLegendItems: readonly MapLegendItem[] = [
  {
    key: 'healthy',
    label: 'Healthy / On-Time',
    color: MAP_COLORS.healthy,
    dotClass: 'bg-emerald-400'
  },
  {
    key: 'warning',
    label: 'Warning / At Risk',
    color: MAP_COLORS.warning,
    dotClass: 'bg-amber-400'
  },
  {
    key: 'delayed',
    label: 'Delayed / Disruption',
    color: MAP_COLORS.delayed,
    dotClass: 'bg-rose-400'
  },
  {
    key: 'rerouted',
    label: 'Rerouted Route',
    color: MAP_COLORS.rerouted,
    dotClass: 'bg-sky-400'
  },
  {
    key: 'replacedRoute',
    label: 'Original Replaced Route',
    color: MAP_COLORS.replacedRoute,
    dotClass: 'border border-slate-300 bg-slate-400'
  }
] as const;
