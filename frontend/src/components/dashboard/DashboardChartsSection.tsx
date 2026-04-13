import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import SectionCard from '../common/SectionCard.tsx';
import EmptyState from '../common/EmptyState.tsx';
import LoadingBlock from '../common/LoadingBlock.tsx';
import { dashboardApi } from '../../services/api/dashboardApi.ts';
import { shipmentsApi } from '../../services/api/shipmentsApi.ts';
import type { ApiResponse } from '../../types/api.ts';

type DelayTrendRow = {
  day: string;
  delayed_count: number;
  delivered_count: number;
  avg_predicted_delay_min: number;
};

type RiskDistributionResponse = {
  shipments: Array<{ risk_level: string; count: number }>;
  disruptions: Array<{ severity_bucket: string; count: number }>;
  routes: Array<{ risk_bucket: string; count: number }>;
};

type BottlenecksResponse = {
  nodes: Array<Record<string, unknown>>;
  edges: Array<{
    transport_mode?: string;
    current_risk_score?: number | string;
    is_blocked?: boolean;
  }>;
};

type MapDataResponse = {
  shipments: Array<Record<string, unknown>>;
  disruptions: Array<{
    type?: string;
    status?: string;
  }>;
  nodes: Array<Record<string, unknown>>;
};

type ShipmentListItem = {
  carrier_id?: string | null;
  status?: string;
};

type DelayChartPoint = {
  day: string;
  delayed: number;
  delivered: number;
  avgDelayMin: number;
};

type RoutePerformancePoint = {
  mode: string;
  avgRiskPct: number;
  blocked: number;
};

type RiskDistributionPoint = {
  name: string;
  value: number;
};

type DisruptionFrequencyPoint = {
  type: string;
  count: number;
  active: number;
};

type CarrierPerformancePoint = {
  carrier: string;
  onTimePct: number;
  delayedPct: number;
  total: number;
};

const PIE_COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#0ea5e9', '#94a3b8'];

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toLabelCase(value: string): string {
  if (!value) {
    return 'Unknown';
  }

  return value
    .replaceAll('_', ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toDayLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function DashboardChartsSection() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [delayData, setDelayData] = useState<DelayChartPoint[]>([]);
  const [routeData, setRouteData] = useState<RoutePerformancePoint[]>([]);
  const [riskData, setRiskData] = useState<RiskDistributionPoint[]>([]);
  const [disruptionData, setDisruptionData] = useState<DisruptionFrequencyPoint[]>([]);
  const [carrierData, setCarrierData] = useState<CarrierPerformancePoint[]>([]);

  const loadCharts = useCallback(async () => {
    setError(null);

    try {
      const [delayTrendsRes, riskRes, bottlenecksRes, mapRes, shipmentsRes] = await Promise.all([
        dashboardApi.getDelayTrends(14) as Promise<ApiResponse<DelayTrendRow[]>>,
        dashboardApi.getRiskDistribution() as Promise<ApiResponse<RiskDistributionResponse>>,
        dashboardApi.getBottlenecks(30) as Promise<ApiResponse<BottlenecksResponse>>,
        dashboardApi.getMapData(300) as Promise<ApiResponse<MapDataResponse>>,
        shipmentsApi.list() as Promise<ApiResponse<ShipmentListItem[]>>
      ]);

      const nextDelayData = (delayTrendsRes.data || []).map((row) => ({
        day: toDayLabel(row.day),
        delayed: toNumber(row.delayed_count),
        delivered: toNumber(row.delivered_count),
        avgDelayMin: toNumber(row.avg_predicted_delay_min)
      }));

      const edges = bottlenecksRes.data?.edges || [];
      const routeByMode: Record<string, { totalRisk: number; count: number; blocked: number }> = {};
      for (const edge of edges) {
        const mode = String(edge.transport_mode || 'unknown').toUpperCase();
        routeByMode[mode] = routeByMode[mode] || { totalRisk: 0, count: 0, blocked: 0 };
        routeByMode[mode].totalRisk += toNumber(edge.current_risk_score, 0);
        routeByMode[mode].count += 1;
        if (edge.is_blocked) {
          routeByMode[mode].blocked += 1;
        }
      }

      const nextRouteData = Object.entries(routeByMode)
        .map(([mode, aggregate]) => ({
          mode,
          avgRiskPct: Number(((aggregate.totalRisk / Math.max(1, aggregate.count)) * 100).toFixed(1)),
          blocked: aggregate.blocked
        }))
        .sort((a, b) => b.avgRiskPct - a.avgRiskPct)
        .slice(0, 6);

      const nextRiskData = (riskRes.data?.shipments || [])
        .map((row) => ({ name: toLabelCase(row.risk_level), value: toNumber(row.count) }))
        .filter((row) => row.value > 0);

      const disruptions = mapRes.data?.disruptions || [];
      const disruptionBuckets: Record<string, { count: number; active: number }> = {};
      for (const disruption of disruptions) {
        const type = toLabelCase(String(disruption.type || 'unknown'));
        disruptionBuckets[type] = disruptionBuckets[type] || { count: 0, active: 0 };
        disruptionBuckets[type].count += 1;
        if (String(disruption.status || '').toLowerCase() === 'active') {
          disruptionBuckets[type].active += 1;
        }
      }

      const nextDisruptionData = Object.entries(disruptionBuckets)
        .map(([type, aggregate]) => ({
          type,
          count: aggregate.count,
          active: aggregate.active
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      const carrierBuckets: Record<string, { total: number; onTime: number; delayed: number }> = {};
      for (const shipment of shipmentsRes.data || []) {
        const carrierId = shipment.carrier_id || 'unassigned';
        carrierBuckets[carrierId] = carrierBuckets[carrierId] || { total: 0, onTime: 0, delayed: 0 };
        carrierBuckets[carrierId].total += 1;

        const status = String(shipment.status || '').toLowerCase();
        if (status === 'delayed') {
          carrierBuckets[carrierId].delayed += 1;
        }
        if (status === 'delivered' || status === 'in_transit') {
          carrierBuckets[carrierId].onTime += 1;
        }
      }

      const nextCarrierData = Object.entries(carrierBuckets)
        .map(([carrier, aggregate]) => ({
          carrier: carrier === 'unassigned' ? 'Unassigned' : carrier.slice(0, 8),
          onTimePct: Number(((aggregate.onTime / Math.max(1, aggregate.total)) * 100).toFixed(1)),
          delayedPct: Number(((aggregate.delayed / Math.max(1, aggregate.total)) * 100).toFixed(1)),
          total: aggregate.total
        }))
        .sort((a, b) => b.onTimePct - a.onTimePct)
        .slice(0, 6);

      setDelayData(nextDelayData);
      setRouteData(nextRouteData);
      setRiskData(nextRiskData);
      setDisruptionData(nextDisruptionData);
      setCarrierData(nextCarrierData);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load dashboard charts';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCharts();

    const refreshTimer = window.setInterval(() => {
      void loadCharts();
    }, 45000);

    return () => window.clearInterval(refreshTimer);
  }, [loadCharts]);

  const showError = useMemo(() => Boolean(error), [error]);

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      <SectionCard title="Delay Trends" subtitle="Daily delayed vs delivered volume and predicted delay">
        {isLoading ? (
          <LoadingBlock />
        ) : showError ? (
          <EmptyState label={error || 'Unable to load delay trends'} />
        ) : delayData.length === 0 ? (
          <EmptyState label="No delay trend data found" />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={delayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="day" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="delayed" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="delivered" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Route Performance" subtitle="Average route risk and blocked links by transport mode">
        {isLoading ? (
          <LoadingBlock />
        ) : showError ? (
          <EmptyState label={error || 'Unable to load route performance'} />
        ) : routeData.length === 0 ? (
          <EmptyState label="No route performance data found" />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={routeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="mode" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Bar dataKey="avgRiskPct" name="Avg Risk %" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="blocked" name="Blocked" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Risk Distribution" subtitle="Current shipment risk-level spread">
        {isLoading ? (
          <LoadingBlock />
        ) : showError ? (
          <EmptyState label={error || 'Unable to load risk distribution'} />
        ) : riskData.length === 0 ? (
          <EmptyState label="No risk distribution data found" />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={riskData} dataKey="value" nameKey="name" outerRadius={90} label>
                  {riskData.map((entry, index) => (
                    <Cell key={`risk-${entry.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Disruption Frequency" subtitle="Disruption count by type with active incidents">
        {isLoading ? (
          <LoadingBlock />
        ) : showError ? (
          <EmptyState label={error || 'Unable to load disruption frequency'} />
        ) : disruptionData.length === 0 ? (
          <EmptyState label="No disruption data found" />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={disruptionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="type" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" name="Total" fill="#a855f7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="active" name="Active" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Carrier Performance" subtitle="On-time vs delayed ratio by carrier">
        {isLoading ? (
          <LoadingBlock />
        ) : showError ? (
          <EmptyState label={error || 'Unable to load carrier performance'} />
        ) : carrierData.length === 0 ? (
          <EmptyState label="No carrier data found" />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={carrierData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="carrier" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" domain={[0, 100]} />
                <Tooltip formatter={(value: unknown) => `${toNumber(value).toFixed(1)}%`} />
                <Legend />
                <Bar dataKey="onTimePct" name="On-Time %" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="delayedPct" name="Delayed %" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>
    </section>
  );
}
