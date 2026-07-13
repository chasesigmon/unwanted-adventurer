// The Map modal: Here / World Map / Who / Where tabs.
import { activeScene, network } from '../state.js';
import { MAPS } from '../../shared/maps.js';
import { townGroupFor, whereLabelFor } from '../../shared/constants.js';
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

// ---------- World Map tab — a hand-drawn ASCII sketch of Grimoak Academy
// itself (a later follow-up ask: "delete the idea of 'overworld' from the
// map modal... update the World Map for grimoak to use the ASCII
// representation"). The old dropdown-grouped tree view covered both
// Grimoak Castle AND the separate pre-wizarding-world town/dungeon maps
// (Great Plains, Labyrinth, Floro, Kortho, its shops) — those map
// DEFINITIONS are deliberately left untouched in shared/maps.ts (likely
// to be connected back in later), just no longer surfaced by this
// dropdown; this tab is Grimoak-only now, so there's nothing left to pick
// between. ----------
const GRIMOAK_ASCII_MAP = `
                          ___________________________________________________________
                         /   ELEMENTAL    DEFENSE    SUMMONING    UTILITY    OFFENSE  \\
                        /    CASTING     CLASSROOM   CLASSROOM   CLASSROOM  CLASSROOM  \\
                        |       ^            ^            ^          ^          ^      |
                        |_______|____________|____________|__________|__________|______|
                                                           |
                                                 (secret room <-- hidden behind
                                                  Utility's own locked door)
                                                           |
  THISTLEDOWN                                              |                            GREAT HALL
    DORMS                                                  |                          (long table +
      ^                                                    |                          faculty stage)
      |                                                    |                                ^
  THISTLEDOWN ------------------------------.              |              .----------------- |
  COMMON ROOM                                \\             |             /
                                              |             |            |
  EMBERCLAW                                   \\            |           /                 DUSKWING
    DORMS                                      |            |          |                   DORMS
      ^                                        |            |          |                     ^
      |                                        |            |          |                     |
  EMBERCLAW ---------------------------------- +--- ENTRANCE HALL ---- + ---------------- DUSKWING
  COMMON ROOM                                  |            |          |                COMMON ROOM
                                               |            |          |
  STARFALL                                     /            |           \\
    DORMS                                     |             |            |
      ^                                       |             |            |
      |                                       /              |            \\
  STARFALL -----------------------------------               |             ------------------'
  COMMON ROOM                                                |
                                                              v  south exit, over the bridge
                          ___________________________________________________________
                         /   ~~~~~~~~~~~~~~~~~~~~~~~~ MOAT ~~~~~~~~~~~~~~~~~~~~~~~~~ \\
                        /    ~~                                                  ~~   \\
                       |     ~~            G R I M O A K   G R O U N D S         ~~    |
                       |     ~~      (imps patrol; bridge crosses the moat here) ~~    |
                        \\    ~~                       ^                          ~~   /
                         \\   ~~~~~~~~~~~~~~~~~~~~~~ bridge ~~~~~~~~~~~~~~~~~~~~~~~~~ /
                          \\_______________________________|_________________________/
                                                           v
                                                   >==[ GATE ]==<
                                          (Opens magically for players
                                               -- not for monsters)
`.trim();

function renderWorldMapTab(): void {
  mapBody.innerHTML = '';
  const pre = document.createElement('pre');
  pre.className = 'world-map-tree';
  pre.textContent = GRIMOAK_ASCII_MAP;
  mapBody.appendChild(pre);
}

function renderMapTab(): void {
  mapBody.innerHTML = '';
  if (activeMapTab === 'current') {
    const mapName = activeScene?.getCurrentMap() ?? 'Grimoak Grounds';
    mapBody.appendChild(renderConnectionsList(mapName));
  } else if (activeMapTab === 'world') {
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
