/**
 * Canonical destination list for CargoPulse.
 * Names are stored in org_destinations.name exactly as they appear here.
 * All UI selects, flags, and seed data derive from this single source.
 */

export interface DestinationDef {
  /** Stored value in org_destinations.name and shipments.destination */
  name: string;
  flag: string;
  /** Insertion order when seeding a new org */
  sortOrder: number;
}

export const DESTINATIONS: DestinationDef[] = [
  { name: 'Jamaica',          flag: '🇯🇲', sortOrder: 0 },
  { name: 'Trinidad & Tobago',flag: '🇹🇹', sortOrder: 1 },
  { name: 'Barbados',         flag: '🇧🇧', sortOrder: 2 },
  { name: 'Guyana',           flag: '🇬🇾', sortOrder: 3 },
];

/**
 * Lowercased lookup map covering stored names, common variants, and
 * other corridors that may appear in historical data.
 */
const FLAG_MAP: Record<string, string> = {
  // Primary destinations
  'jamaica':              '🇯🇲',
  'trinidad & tobago':    '🇹🇹',
  'trinidad and tobago':  '🇹🇹',
  'trinidad':             '🇹🇹',
  'barbados':             '🇧🇧',
  'guyana':               '🇬🇾',
  // Other corridors that may exist in historical shipment data
  'uk':                   '🇬🇧',
  'united kingdom':       '🇬🇧',
  'ghana':                '🇬🇭',
  'nigeria':              '🇳🇬',
  'usa':                  '🇺🇸',
  'united states':        '🇺🇸',
  'canada':               '🇨🇦',
  'sierra leone':         '🇸🇱',
  'cameroon':             '🇨🇲',
  'kenya':                '🇰🇪',
  'antigua':              '🇦🇬',
  'antigua and barbuda':  '🇦🇬',
  'st lucia':             '🇱🇨',
  'saint lucia':          '🇱🇨',
  'dominica':             '🇩🇲',
  'grenada':              '🇬🇩',
  'st vincent':           '🇻🇨',
  'saint vincent':        '🇻🇨',
  'belize':               '🇧🇿',
};

/** Returns the flag emoji for a destination name, or '' if unknown. */
export function destFlag(name: string | null | undefined): string {
  if (!name) return '';
  return FLAG_MAP[name.trim().toLowerCase()] ?? '';
}
