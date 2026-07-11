// The Map modal: Here / World Map / Who / Where tabs.
import { activeScene, network } from '../state.js';
import { MAPS } from '../../shared/maps.js';
import { FLORO_SHOP_MAPS, GRIMOAK_CASTLE_MAPS, townGroupFor, whereLabelFor } from '../../shared/constants.js';
import type { MapName } from '../../shared/constants.js';
import type { WhoEntry } from '../../shared/types.js';
import { mapBody, mapModal, mapTabCurrentBtn, mapTabWhereBtn, mapTabWhoBtn, mapTabWorldBtn, registerModalOpenHandler } from './modalCore.js';

type MapTab = 'current' | 'world' | 'who' | 'where';
let activeMapTab: MapTab = 'current';

function updateMapTabButtons(): void {
  mapTabCurrentBtn.classList.toggle('active', activeMapTab === 'current');
  mapTabWorldBtn.classList.toggle('active', activeMapTab === 'world');
  mapTabWhoBtn.classList.toggle('active', activeMapTab === 'who');
  mapTabWhereBtn.classList.toggle('active', activeMapTab === 'where');
  // "the starting tab should be the name of the World they are in" — the
  // first tab's label is the player's current map, not a fixed word.
  mapTabCurrentBtn.textContent = activeScene?.getCurrentMap() ?? 'Here';
}

function switchMapTab(tab: MapTab): void {
  activeMapTab = tab;
  updateMapTabButtons();
  renderMapTab();
}
mapTabCurrentBtn.addEventListener('click', () => switchMapTab('current'));
mapTabWorldBtn.addEventListener('click', () => switchMapTab('world'));
mapTabWhoBtn.addEventListener('click', () => switchMapTab('who'));
mapTabWhereBtn.addEventListener('click', () => switchMapTab('where'));

// Opening the modal always resets back to the "current world" tab.
export function openMapModal(): void {
  activeMapTab = 'current';
  updateMapTabButtons();
  renderMapTab();
}

// Called by WorldScene whenever a map transition actually completes
// (item 4) — the "Here" tab (not World Map, which is a deliberate,
// manually-picked view) should reflect wherever the player just walked
// to, live, while the modal stays open.
export function notifyMapChanged(): void {
  if (mapModal.hidden || activeMapTab !== 'current') return;
  updateMapTabButtons();
  renderMapTab();
}

function renderConnectionsList(mapName: MapName): HTMLUListElement {
  const list = document.createElement('ul');
  list.className = 'map-connections';
  const def = MAPS[mapName];
  if (def.exits.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No connections.';
    list.appendChild(li);
  }
  for (const exit of def.exits) {
    const li = document.createElement('li');
    li.textContent = `${exit.direction} → ${exit.toMap}`;
    list.appendChild(li);
  }
  return list;
}

// ---------- World Map tab (item 1) — a dropdown grouping every map into
// one of two "worlds" (everything inside Grimoak Castle vs. everything
// else), each rendered as a simple text/line tree diagram built from the
// same exits data every map transition already uses — no separate layout
// data to maintain, and no graphics library needed for what's explicitly
// a placeholder view "for now." ----------

interface WorldMapGroup {
  label: string;
  root: MapName;
  maps: readonly MapName[];
}

const GRIMOAK_GROUP_MAPS: readonly MapName[] = ['Grimoak Grounds', ...GRIMOAK_CASTLE_MAPS];
const OVERWORLD_GROUP_MAPS: readonly MapName[] = ['Great Plains', 'Labyrinth', 'Floro', 'Kortho', ...FLORO_SHOP_MAPS];

const WORLD_MAP_GROUPS: WorldMapGroup[] = [
  { label: 'Grimoak Academy', root: 'Grimoak Grounds', maps: GRIMOAK_GROUP_MAPS },
  { label: 'The Overworld', root: 'Great Plains', maps: OVERWORLD_GROUP_MAPS },
];

function groupFor(mapName: MapName): WorldMapGroup {
  return WORLD_MAP_GROUPS.find((g) => g.maps.includes(mapName)) ?? WORLD_MAP_GROUPS[0]!;
}

interface MapTreeNode {
  name: MapName;
  children: MapTreeNode[];
}

// A plain tree walk over the exits graph — skips any exit leading outside
// this group (so Floro's own link back to the Great Plains doesn't pull
// the whole Overworld group into one giant cross-linked mess) and any
// map already placed in the tree (a reciprocal exit would otherwise walk
// straight back to the parent forever).
function buildMapTree(root: MapName, groupMaps: readonly MapName[]): MapTreeNode {
  const visited = new Set<MapName>([root]);
  const build = (name: MapName): MapTreeNode => {
    const def = MAPS[name];
    const children: MapTreeNode[] = [];
    for (const exit of def.exits) {
      if (!groupMaps.includes(exit.toMap) || visited.has(exit.toMap)) continue;
      visited.add(exit.toMap);
      children.push(build(exit.toMap));
    }
    return { name, children };
  };
  return build(root);
}

// Renders one tree as a flat list of already-prefixed text lines — box-
// drawing characters standing in for real graphics "for now" (see item
// 1's own note that this may become a real visual map later).
function treeLines(node: MapTreeNode, prefix: string, isLast: boolean, isRoot: boolean): string[] {
  const lines = [isRoot ? node.name : `${prefix}${isLast ? '└─ ' : '├─ '}${node.name}`];
  const childPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '│   ');
  node.children.forEach((child, i) => {
    lines.push(...treeLines(child, childPrefix, i === node.children.length - 1, false));
  });
  return lines;
}

let selectedWorldMapGroup: WorldMapGroup = WORLD_MAP_GROUPS[0]!;

function renderWorldMapTab(): void {
  mapBody.innerHTML = '';

  const select = document.createElement('select');
  select.className = 'world-map-select';
  for (const group of WORLD_MAP_GROUPS) {
    const option = document.createElement('option');
    option.value = group.label;
    option.textContent = group.label;
    option.selected = group === selectedWorldMapGroup;
    select.appendChild(option);
  }
  select.addEventListener('change', () => {
    selectedWorldMapGroup = WORLD_MAP_GROUPS.find((g) => g.label === select.value) ?? WORLD_MAP_GROUPS[0]!;
    renderWorldMapTab();
  });
  mapBody.appendChild(select);

  const tree = buildMapTree(selectedWorldMapGroup.root, selectedWorldMapGroup.maps);
  const pre = document.createElement('pre');
  pre.className = 'world-map-tree';
  pre.textContent = treeLines(tree, '', true, true).join('\n');
  mapBody.appendChild(pre);
}

function renderMapTab(): void {
  mapBody.innerHTML = '';
  if (activeMapTab === 'current') {
    const mapName = activeScene?.getCurrentMap() ?? 'Grimoak Grounds';
    mapBody.appendChild(renderConnectionsList(mapName));
  } else if (activeMapTab === 'world') {
    // Default the dropdown to whichever group the player is actually
    // standing in the first time this tab is opened after a map change,
    // rather than always resetting to the first group regardless of
    // where they are.
    selectedWorldMapGroup = groupFor(activeScene?.getCurrentMap() ?? 'Grimoak Grounds');
    renderWorldMapTab();
  } else {
    renderPlayerListTab(activeMapTab);
  }
}

function renderPlayerListTab(tab: 'who' | 'where'): void {
  const loading = document.createElement('div');
  loading.textContent = 'Loading...';
  mapBody.appendChild(loading);

  network
    .who()
    .then((res) => {
      if (activeMapTab !== tab) return; // the tab changed while this was in flight
      const currentMap = activeScene?.getCurrentMap();
      // "Where" means "in my town" — Floro's street and all 7 of its
      // shop interiors group together, so someone browsing the
      // Blacksmith still shows up for a player standing out on the
      // street, not just an exact same-map match.
      const players: WhoEntry[] =
        tab === 'where' && currentMap ? res.players.filter((p) => townGroupFor(p.map) === townGroupFor(currentMap)) : res.players;
      mapBody.innerHTML = '';
      const list = document.createElement('ul');
      list.className = 'map-connections';
      if (players.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Nobody here.';
        list.appendChild(li);
      }
      for (const p of players) {
        const li = document.createElement('li');
        if (tab === 'who') {
          li.textContent = `${p.username} (Lv ${p.level}) — ${p.map}`;
        } else {
          const buildingLabel = whereLabelFor(p.map);
          li.textContent = buildingLabel ? `${p.username} (Lv ${p.level}) - ${buildingLabel}` : `${p.username} (Lv ${p.level})`;
        }
        list.appendChild(li);
      }
      mapBody.appendChild(list);
    })
    .catch(() => {
      loading.textContent = 'Could not load.';
    });
}

registerModalOpenHandler(mapModal, openMapModal);
