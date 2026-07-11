// The Map modal: Here / World Map / Who / Where tabs.
import { activeScene, network } from '../state.js';
import { MAPS } from '../../shared/maps.js';
import { MAP_NAMES, townGroupFor, whereLabelFor } from '../../shared/constants.js';
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

function renderMapTab(): void {
  mapBody.innerHTML = '';
  if (activeMapTab === 'current') {
    const mapName = activeScene?.getCurrentMap() ?? 'Great Plains';
    mapBody.appendChild(renderConnectionsList(mapName));
  } else if (activeMapTab === 'world') {
    for (const name of MAP_NAMES) {
      const heading = document.createElement('div');
      heading.className = 'stat-label';
      heading.textContent = name;
      mapBody.appendChild(heading);
      mapBody.appendChild(renderConnectionsList(name));
    }
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
