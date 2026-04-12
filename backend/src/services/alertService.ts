import db from '../db/connection.js';

type AlertFilters = {
  is_read?: boolean | null;
  alert_type?: string;
  severity_gte?: number;
  severity_lte?: number;
  shipment_id?: string;
  limit: number;
  offset: number;
};

export async function listAlerts(filters: AlertFilters) {
  const query = db('alerts').select('*').orderBy('created_at', 'desc').limit(filters.limit).offset(filters.offset);

  if (filters.is_read != null) {
    query.where('is_read', filters.is_read);
  }

  if (filters.alert_type) {
    query.where('alert_type', filters.alert_type);
  }

  if (filters.shipment_id) {
    query.where('shipment_id', filters.shipment_id);
  }

  if (typeof filters.severity_gte === 'number') {
    query.where('severity', '>=', filters.severity_gte);
  }

  if (typeof filters.severity_lte === 'number') {
    query.where('severity', '<=', filters.severity_lte);
  }

  return query;
}

export async function markAlertRead(alertId: string) {
  const [alert] = await db('alerts')
    .where({ id: alertId })
    .update(
      {
        is_read: true
      },
      ['*']
    );

  return alert || null;
}

export async function listAlertsByShipment(shipmentId: string, limit: number, offset: number) {
  return db('alerts')
    .select('*')
    .where({ shipment_id: shipmentId })
    .orderBy('created_at', 'desc')
    .limit(limit)
    .offset(offset);
}
