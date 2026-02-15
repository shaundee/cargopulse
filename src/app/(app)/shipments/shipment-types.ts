import type { MantineColor } from '@mantine/core';

export type ShipmentStatus =
  | 'received'
  | 'collected'
  | 'loaded'
  | 'departed_uk'
  | 'arrived_jamaica'
  | 'out_for_delivery'
  | 'delivered';

export type ShipmentRow = {
  id: string;
  tracking_code: string;
  destination: string;
  current_status: ShipmentStatus;
  last_event_at: string;
  customers: { name: string; phone: string } | null;

  // rollups (from supabase/migrations/20260207124716_shipments_financial_rollups.sql)
  balance_pence?: number | null;
  total_charged_pence?: number | null;
  total_paid_pence?: number | null;
};

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
};

export function statusLabel(s: ShipmentStatus) {
  switch (s) {
    case 'received':
      return 'Received';
    case 'collected':
      return 'Collected';
    case 'loaded':
      return 'Loaded';
    case 'departed_uk':
      return 'Departed UK';
    case 'arrived_jamaica':
      return 'Arrived at destination';
    case 'out_for_delivery':
      return 'Out for delivery';
    case 'delivered':
      return 'Delivered';
  }
}

export function statusBadgeColor(status: ShipmentStatus): MantineColor {
  switch (status) {
    case 'delivered':
      return 'green';
    case 'out_for_delivery':
      return 'teal';
    case 'arrived_jamaica':
      return 'cyan';
    case 'departed_uk':
      return 'blue';
    case 'loaded':
      return 'indigo';
    case 'collected':
      return 'grape';
    default:
      return 'gray';
  }
}

export function formatWhen(v: unknown) {
  const d = v ? new Date(String(v)) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : '-';
}

export function getExistingPod(detailShipment: ShipmentDetail | null): PodRow | null {
  if (!detailShipment) return null;
  const podAny = (detailShipment as any).pod;
  if (Array.isArray(podAny)) return podAny[0] ?? null;
  return podAny ?? null;
}
