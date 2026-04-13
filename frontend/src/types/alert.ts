export type AlertItem = {
  id: string;
  shipment_id?: string | null;
  disruption_id?: string | null;
  alert_type?: string;
  title: string;
  message?: string;
  severity: number;
  is_read: boolean;
  created_at: string;
  resolved_at?: string | null;
};
