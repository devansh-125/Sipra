export function mapShipmentDetail(raw: any) {
  return {
    shipment: raw?.shipment || null,
    route: raw?.route || null,
    alerts: raw?.alerts || []
  };
}
