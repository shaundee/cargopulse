import type { MantineColor } from '@mantine/core';

export type ShipmentStatus =
  | 'received'
  | 'collected'
  | 'loaded'
  | 'departed_uk'
  | 'arrived_destination'
  | 'customs_processing'
  | 'customs_cleared'
  | 'awaiting_collection'
  | 'collected_by_customer'
  | 'out_for_delivery'
  | 'delivered';

export const OPTIONAL_STATUSES: ShipmentStatus[] = [
  'customs_processing',
  'customs_cleared',
  'awaiting_collection',
];

// Stable ordering for UI sorting (optional)
export const statusOrder: ShipmentStatus[] = [
  'received',
  'collected',
  'loaded',
  'departed_uk',
  'arrived_destination',
  'customs_processing',
  'customs_cleared',
  'awaiting_collection',
  'collected_by_customer',
  'out_for_delivery',
  'delivered',
];

export function statusRank(s: ShipmentStatus) {
  const idx = statusOrder.indexOf(s);
  return idx === -1 ? 999 : idx;
}

export type ShipmentRow = {
  id: string;
  tracking_code: string;
  destination: string;
  current_status: ShipmentStatus;
  last_event_at: string;
  customers: { name: string; phone: string; phone_e164?: string | null } | null;
  service_type?: 'depot' | 'door_to_door' | string | null;
  created_at?: string | null;
  public_tracking_token?: string | null;
  last_outbound_message_at?: string | null;
  last_outbound_message_status?: string | null;
  last_outbound_send_status?: string | null;
  last_outbound_preview?: string | null;
  has_pod?: boolean;
  has_pickup_assets?: boolean;
  internal_notes?: string | null;
  reference_no?: string | null;
}

export type NewShipmentForm = {
  customerName: string;
  phone: string;
  destination: string;
  serviceType: 'depot' | 'door_to_door';
};

export type TemplateRow = {
  id: string;
  status: ShipmentStatus;
  name?: string; // not always returned; safe
  body: string;
  enabled: boolean;
};

export type MessageLogRow = {
  id: string;
  shipment_id: string;
  template_id?: string | null;

  direction?: 'outbound' | 'inbound' | string | null;
  from_phone?: string | null;
  to_phone?: string | null;

  provider?: string | null;
  provider_message_id?: string | null;
  send_status?: string | null;

  body?: string | null;
  status?: ShipmentStatus | null;
  error?: string | null;

  media?: any | null;
  created_at?: string | null;
};

export type ShipmentEventRow = {
  id: string;
  status: ShipmentStatus;
  note?: string | null;
  occurred_at?: string | null;
  actor_label?: string | null; // resolved server-side: "Admin", "Staff", agent name, etc.
};

export type PodRow = {
  receiver_name?: string | null;
  delivered_at?: string | null;
  photo_url?: string | null;
  photo_path?: string | null;
};

export type ShipmentDetail = {
  id: string;
  tracking_code: string;
  destination: string;
  current_status: ShipmentStatus;
  service_type?: string | null;
  serviceType?: string | null; // defensive
  customers?: { name: string; phone: string } | null;
  pod?: PodRow | PodRow[] | null;
  public_tracking_token?: string | null;
  

  // Cargo
  cargo_type?: string | null;
  cargo_meta?: any | null;
};

export function statusLabel(status: ShipmentStatus, destination?: string | null) {
  switch (status) {
    case 'received':
      return 'Received';
    case 'collected':
      return 'Collected';
    case 'loaded':
      return 'Loaded';
    case 'departed_uk':
      return 'Departed UK';
    case 'arrived_destination':
      return destination ? `Arrived (${destination})` : 'Arrived (destination)';
    case 'customs_processing':
      return 'Customs processing';
    case 'customs_cleared':
      return 'Customs cleared';
    case 'awaiting_collection':
      return 'Awaiting collection';
    case 'collected_by_customer':
      return 'Collected by customer';
    case 'out_for_delivery':
      return 'Out for delivery';
    case 'delivered':
      return 'Delivered';
  }
}

export function statusBadgeColor(status: ShipmentStatus): MantineColor {
  switch (status) {
    case 'delivered':             return 'green';
    case 'collected_by_customer': return 'green';
    case 'out_for_delivery':      return 'orange';
    case 'arrived_destination':   return 'teal';
    case 'customs_processing':    return 'yellow';
    case 'customs_cleared':       return 'lime';
    case 'awaiting_collection':   return 'cyan';
    case 'departed_uk':           return 'violet';
    case 'loaded':                return 'blue';
    case 'collected':             return 'gray';
    default:                      return 'gray'; // received
  }
}

export function formatWhen(v: unknown) {
  const d = v ? new Date(String(v)) : null;
  if (!d || Number.isNaN(d.getTime())) return '-';

  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr  = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1)  return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr  < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7)  return `${diffDay} days ago`;

  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function getExistingPod(detailShipment: ShipmentDetail | null): PodRow | null {
  if (!detailShipment) return null;
  const podAny = (detailShipment as any).pod;
  if (Array.isArray(podAny)) return podAny[0] ?? null;
  return podAny ?? null;
}