import type { MapName } from '../../shared/constants.js';
import type { VendorSnapshot } from '../../shared/types.js';

// Static (never-moving, never-attackable) shop NPCs — a completely
// separate list from NPCS (worlds/npcs.ts), since those are combat
// targets (the training dummy) and vendors deliberately aren't.
// Directly in front of (same column as) the Labyrinth's own entrance —
// the door back to the Great Plains is at (LABYRINTH_SIZE-1,
// LABYRINTH_MID_COL) = (59, 30) (see shared/maps.ts) — set back from it
// by roughly the "100 feet" asked for, using this project's own
// established ~2.5ft/tile scale (see shared/lighting.ts's original "10
// foot diameter" == 4-tile-diameter light radius), i.e. 40 tiles north
// of the door. The client renders a non-interactive shopfront sprite
// directly in front of (one row south of) every vendor — see main.ts's
// applyMapState. Both the shopkeeper's own tile and that shopfront tile
// block movement (see WorldManagerService.isOccupied/
// MonsterManagerService.isFree).
export const VENDORS: VendorSnapshot[] = [
  {
    id: 'labyrinth-shopkeeper',
    name: 'Shopkeeper',
    map: 'Labyrinth',
    row: 19,
    col: 30,
    items: [{ label: 'torch', price: 3 }],
  },
];

export function vendorsForMap(mapName: MapName): VendorSnapshot[] {
  return VENDORS.filter((v) => v.map === mapName);
}

export function findVendor(vendorId: string): VendorSnapshot | undefined {
  return VENDORS.find((v) => v.id === vendorId);
}
