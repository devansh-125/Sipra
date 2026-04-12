export type ShipmentStatus = 'pending' | 'in_transit' | 'delayed' | 'delivered' | 'cancelled';

export type Shipment = {
  id: string;
  tracking_number: string;
  status: ShipmentStatus;
  origin: string;
  destination: string;
  current_eta?: string | null;
  delay_probability?: number | null;
  predicted_delay_min?: number | null;
  risk_level?: string | null;
};
