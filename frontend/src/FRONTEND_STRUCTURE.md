# Frontend Structure

## Pages

- pages/dashboard/DashboardPage.tsx: Main control-tower dashboard.
- pages/shipments/ShipmentDetailPage.tsx: Shipment detail view with timeline and reroute.

## Components

- components/dashboard: KPI row, map panel, side panel, chart section, AI panel, God Mode controls.
- components/shipment: Shipment overview, AI reasons, route comparison, alerts, timeline, reroute card.
- components/map: Map container, layer toggles, shipment popup.
- components/realtime: Realtime badge, toast stack, last-updated timestamp.
- components/layout: App shell and page header.
- components/common: Reusable card, status badge, empty state, loading block.

## Services

- services/api: HTTP client + dashboard/shipments/routes/disruptions/alerts API wrappers.
- services/demo: Demo APIs for seed/god-mode/reset.
- services/realtime: Realtime client stub.
- services/mappers: Raw API response mappers.

## Hooks

- hooks/useDashboardData.ts
- hooks/useShipmentDetail.ts
- hooks/useRealtime.ts
- hooks/useMapLayers.ts
- hooks/useDemoControls.ts

## Types

- types/dashboard.ts
- types/shipment.ts
- types/route.ts
- types/disruption.ts
- types/alert.ts
- types/ai.ts
- types/map.ts
- types/realtime.ts
- types/api.ts

## Utilities

- utils/constants.ts
- utils/formatters.ts
- utils/statusColors.ts
- utils/riskUtils.ts
- utils/mapLegend.ts
