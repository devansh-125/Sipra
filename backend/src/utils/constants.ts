export const SHIPMENT_STATUSES = ['pending', 'in_transit', 'delayed', 'delivered', 'cancelled'];

export const SHIPMENT_PRIORITIES = ['low', 'medium', 'high', 'critical'];

export const SHIPMENT_EVENT_TYPES = ['created', 'moved', 'delayed', 'rerouted', 'delivered'];

export const SHIPMENT_EVENT_SOURCES = ['simulator', 'user', 'rule_engine', 'AI'];

export const ROUTE_PLAN_TRIGGERS = ['initial', 'disruption', 'manual', 'AI'];

export const NETWORK_TRANSPORT_MODES = ['road', 'rail', 'sea', 'air'];

export const DISRUPTION_TYPES = ['weather', 'congestion', 'blockage', 'vehicle_issue'];

export const DISRUPTION_STATUSES = ['active', 'resolved'];

export const DISRUPTION_SOURCES = ['rule_engine', 'AI', 'simulator', 'manual'];
