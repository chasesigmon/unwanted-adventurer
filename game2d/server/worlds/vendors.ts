import type { MapName } from '../../shared/constants.js';
import type { VendorSnapshot } from '../../shared/types.js';

// Static (never-moving, never-attackable) shop NPCs — a completely
// separate list from NPCS (worlds/npcs.ts), since those are combat
// targets (the training dummy) and vendors deliberately aren't.
export const VENDORS: VendorSnapshot[] = [
  {
    id: 'labyrinth-shopkeeper',
    name: 'Shopkeeper',
    map: 'Labyrinth',
    row: 5,
    col: 6,
    items: [{ label: 'torch', price: 3 }],
  },
];

export function vendorsForMap(mapName: MapName): VendorSnapshot[] {
  return VENDORS.filter((v) => v.map === mapName);
}

export function findVendor(vendorId: string): VendorSnapshot | undefined {
  return VENDORS.find((v) => v.id === vendorId);
}
