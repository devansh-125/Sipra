import { useCallback, useEffect, useMemo, useState } from 'react';
import SectionCard from '../common/SectionCard.tsx';
import EmptyState from '../common/EmptyState.tsx';
import LoadingBlock from '../common/LoadingBlock.tsx';
import StatusBadge from '../common/StatusBadge.tsx';
import { shipmentsApi } from '../../services/api/shipmentsApi.ts';
import type { ApiResponse } from '../../types/api.ts';
import type { Shipment } from '../../types/shipment.ts';
import { getStatusTone } from '../../utils/statusColors.ts';

type ShipmentTimelineProps = {
  shipmentId?: string;
};

type ShipmentRecord = Shipment & {
  updated_at?: string | null;
  delay_probability?: number | null;
  predicted_delay_min?: number | null;
  risk_level?: string | null;
};

type ShipmentEvent = {
  id: string;
  shipment_id: string;
  event_type: 'created' | 'moved' | 'delayed' | 'rerouted' | 'delivered' | string;
  node_id?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  description?: string | null;
  event_time: string;
  source?: 'simulator' | 'user' | 'rule_engine' | 'AI' | string;
  metadata_json?: Record<string, unknown> | null;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function rankShipment(shipment: ShipmentRecord): number {
  const probability = clamp(toNumber(shipment.delay_probability, 0));
  const delayWeight = Math.min(1, toNumber(shipment.predicted_delay_min, 0) / 240);
  const level = String(shipment.risk_level || '').toLowerCase();
  const levelWeight = level === 'critical' ? 1 : level === 'high' ? 0.8 : level === 'medium' ? 0.55 : 0.2;
  return Math.max(probability, levelWeight * 0.65 + delayWeight * 0.35);
}

function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Unable to load shipment timeline';
  }

  try {
    const parsed = JSON.parse(error.message) as { message?: string };
    return parsed.message || error.message;
  } catch {
    return error.message;
  }
}

function toRelativeTime(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return 'just now';
  }

  const seconds = Math.max(0, Math.round((Date.now() - parsed) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.floor(hours / 24)}d ago`;
}

function formatEventType(value: string): string {
  return value.replace(/_/g, ' ');
}

function getEventToneClass(eventType: string): string {
  if (eventType === 'delayed') {
    return 'bg-rose-400 border-rose-300';
  }

  if (eventType === 'rerouted') {
    return 'bg-amber-400 border-amber-300';
  }

  if (eventType === 'delivered') {
    return 'bg-emerald-400 border-emerald-300';
  }

  if (eventType === 'moved') {
    return 'bg-cyan-400 border-cyan-300';
  }

  return 'bg-slate-400 border-slate-300';
}

function formatEventDescription(event: ShipmentEvent): string {
  if (event.description) {
    return event.description;
  }

  if (event.event_type === 'created') {
    return 'Shipment initialized in the network.';
  }

  if (event.event_type === 'moved') {
    return 'Shipment position updated along the route.';
  }

  if (event.event_type === 'delayed') {
    return 'Delay signal recorded for this shipment.';
  }

  if (event.event_type === 'rerouted') {
    return 'Shipment route recalculated and updated.';
  }

  if (event.event_type === 'delivered') {
    return 'Shipment marked as delivered.';
  }

  return 'Shipment event recorded.';
}

function formatSource(source?: string): string {
  if (!source) {
    return 'unknown';
  }

  return source.toLowerCase() === 'ai' ? 'AI' : source.replace(/_/g, ' ');
}

export default function ShipmentTimeline({ shipmentId }: ShipmentTimelineProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetShipment, setTargetShipment] = useState<ShipmentRecord | null>(null);
  const [events, setEvents] = useState<ShipmentEvent[]>([]);
  const [selectedType, setSelectedType] = useState<string>('all');

  const loadTimeline = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      let target: ShipmentRecord | null = null;

      if (shipmentId) {
        const byId = (await shipmentsApi.getById(shipmentId)) as ApiResponse<ShipmentRecord>;
        target = byId.data || null;
      } else {
        const list = (await shipmentsApi.list()) as ApiResponse<ShipmentRecord[]>;
        const active = (list.data || []).filter(
          (item) => item.status !== 'delivered' && item.status !== 'cancelled'
        );
        target = active.sort((a, b) => rankShipment(b) - rankShipment(a))[0] || null;
      }

      setTargetShipment(target);

      if (!target) {
        setEvents([]);
        return;
      }

      const eventsRes = (await shipmentsApi.getEvents(target.id)) as ApiResponse<ShipmentEvent[]>;
      const sorted = (eventsRes.data || []).sort(
        (a, b) => Date.parse(b.event_time || '') - Date.parse(a.event_time || '')
      );

      setEvents(sorted);
    } catch (loadError) {
      setError(parseErrorMessage(loadError));
      setTargetShipment(null);
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    void loadTimeline();
  }, [loadTimeline]);

  const eventTypes = useMemo(() => {
    const values = Array.from(new Set(events.map((event) => event.event_type))).sort();
    return ['all', ...values];
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (selectedType === 'all') {
      return events;
    }

    return events.filter((event) => event.event_type === selectedType);
  }, [events, selectedType]);

  const delayedCount = useMemo(() => {
    return events.filter((event) => event.event_type === 'delayed').length;
  }, [events]);

  return (
    <SectionCard title="Event Timeline" subtitle="Movement events, delays, reroutes, and deliveries">
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <div className="space-y-3">
          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-200">{error}</p>
          <button
            type="button"
            onClick={() => void loadTimeline()}
            className="rounded-md bg-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-600"
          >
            Retry
          </button>
        </div>
      ) : !targetShipment ? (
        <EmptyState label="No active shipment available to build timeline." />
      ) : events.length === 0 ? (
        <EmptyState label={`No timeline events yet for ${targetShipment.tracking_number}.`} />
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-100">{targetShipment.tracking_number}</p>
              <StatusBadge text={targetShipment.status.replace(/_/g, ' ')} tone={getStatusTone(targetShipment.status)} />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {events.length} events tracked | {delayedCount} delay signal{delayedCount === 1 ? '' : 's'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {eventTypes.map((eventType) => (
              <button
                key={eventType}
                type="button"
                onClick={() => setSelectedType(eventType)}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
                  selectedType === eventType
                    ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-100'
                    : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
                }`}
              >
                {formatEventType(eventType)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void loadTimeline()}
              className="ml-auto rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:border-slate-500"
            >
              Refresh
            </button>
          </div>

          {filteredEvents.length === 0 ? (
            <EmptyState label="No events match the selected filter." />
          ) : (
            <ol className="space-y-2">
              {filteredEvents.map((event, index) => {
                const latitude = toNumber(event.latitude, Number.NaN);
                const longitude = toNumber(event.longitude, Number.NaN);
                const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude);
                const metadata = event.metadata_json && typeof event.metadata_json === 'object' ? event.metadata_json : null;
                const metadataEntries = metadata ? Object.entries(metadata).slice(0, 2) : [];

                return (
                  <li key={event.id} className="relative pl-6">
                    <span
                      className={`absolute left-0 top-2 h-2.5 w-2.5 rounded-full border ${getEventToneClass(event.event_type)}`}
                    />
                    {index !== filteredEvents.length - 1 ? (
                      <span className="absolute left-[4px] top-5 h-[calc(100%-0.5rem)] w-px bg-slate-700" />
                    ) : null}

                    <article className="rounded-lg border border-slate-700 bg-slate-950/55 p-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-slate-100">{formatEventType(event.event_type)}</p>
                          <p className="mt-1 text-[11px] text-slate-300">{formatEventDescription(event)}</p>
                        </div>
                        <div className="text-right text-[11px] text-slate-400">
                          <p>{toRelativeTime(event.event_time)}</p>
                          <p>{new Date(event.event_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <span className="rounded-full border border-slate-700 px-2 py-0.5">Source: {formatSource(event.source)}</span>
                        {hasLocation ? (
                          <span className="rounded-full border border-slate-700 px-2 py-0.5">
                            {latitude.toFixed(3)}, {longitude.toFixed(3)}
                          </span>
                        ) : null}
                        {event.node_id ? <span className="rounded-full border border-slate-700 px-2 py-0.5">Node linked</span> : null}
                      </div>

                      {metadataEntries.length > 0 ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                          {metadataEntries.map(([key, value]) => (
                            <span key={`${event.id}-${key}`} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5">
                              {key}: {String(value)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </SectionCard>
  );
}
