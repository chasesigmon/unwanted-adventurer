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

// Opening the modal always resets back to the "current world" tab (and,
// if the World Map tab gets picked again later, its own area dropdown
// back to the ground floor — a deliberate, manually-picked view each
// time, same reasoning as the tab reset itself).
export function openMapModal(): void {
  activeMapTab = 'current';
  selectedWorldArea = 'Grimoak Castle';
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
                         /   SPECIAL-     DEFENSE    SUMMONING    UTILITY    OFFENSE  \\
                        /    IZATION     CLASSROOM   CLASSROOM   CLASSROOM  CLASSROOM  \\
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
                                                          ^
                                               stairs up to 2nd Floor
                                              (Specialization Chambers)
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

// The castle's 3 upper floors, the Grounds, and Bramwick (a later
// follow-up ask: "create a dropdown... that shows when the respective
// dropdown option is chosen") — same hand-drawn ASCII sketch treatment
// as the ground floor above, one sketch per area, picked via the new
// <select> renderWorldMapTab now renders above the sketch itself.
const FLOOR2_ASCII_MAP = `
                    ___________________________________________________________
                   /  NECROMANCER   ENHANCER   ELEMENTALIST   SUMMONER ILLUSIONIST\\
                  /    CHAMBER      CHAMBER      CHAMBER      CHAMBER    CHAMBER   \\
                  |       ^             ^            ^            ^         ^     |
                  |_______|_____________|____________|____________|_________|_____|
                  |                                                               |
                  |                    (2 fireplaces, center)                     |
                  |                                                               |
                  |_______________________________________________________________|
                          v                                               v
                  stairs down to                                 stairs up to
                  Entrance Hall (1st Floor)                       3rd Floor
`.trim();

const FLOOR3_ASCII_MAP = `
                    ___________________________________________________________
                   /   BATTLEMAGE     CLERIC       DRUID      DIABOLIST HEMOMANCER\\
                  /     CHAMBER      CHAMBER      CHAMBER      CHAMBER   CHAMBER   \\
                  |       ^             ^            ^            ^         ^     |
                  |_______|_____________|____________|____________|_________|_____|
                  |                                                               |
                  |                    (2 fireplaces, center)                     |
                  |                                                               |
                  |_______________________________________________________________|
                          v                                               v
                  stairs down to                                 stairs up to
                  2nd Floor                                       4th Floor
`.trim();

const FLOOR4_ASCII_MAP = `
                                     ^  NORTH PORTAL
                                        (swirling, decorative)
                    ___________________________________________________________
                   /                                                            \\
                  |                                                              |
      < WEST      |                 (2 fireplaces, center)                      |   EAST >
      PORTAL      |                                                              |   PORTAL
    (swirling)    |                                                              | (swirling)
                  |______________________________________________________________|
                          v
                  stairs down to
                  3rd Floor
                                     v  SOUTH PORTAL
                                        (swirling, decorative)
`.trim();

const GRIMOAK_GROUNDS_ASCII_MAP = `
                                          ^  dirt road to Bramwick
                                          |
                                   [ NORTH BRIDGE + GATE ]
                                          ^
                    _____________________________________________________
                   /   ~~~~~~~~~~~~~~~~~~~ MOAT ~~~~~~~~~~~~~~~~~~~~~~~  \\
                  /    ~~                                            ~~  \\
                 |     ~~                                            ~~   |
                 |     ~~          G R I M O A K   C A S T L E        ~~   |
                 |     ~~         (imps patrol around the moat)       ~~   |
                 |     ~~                                            ~~   |
                  \\    ~~                                            ~~  /
                   \\   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ /
                    \\_________________________|_______________________/
                                          v
                                   [ SOUTH BRIDGE + GATE ]
                                          |
                                          v
                                    (spawn point)
`.trim();

const BRAMWICK_ASCII_MAP = `
                _________________________________________________
               /                                                  \\
              |     [GENERAL SHOP]              [WANDS]            |
              |           ^                         ^               |
              |                                                     |
              |     *          *          *          *         *    |
              |         (9 standing torches — unlit by day,          |
              |          lit with their own glow at night)          |
              |     *          *          *          *         *    |
              |                                                     |
              |     [ARMOR]                     [POTIONS]           |
              |           ^                         ^               |
              |                                                     |
              |                sign: "Grimoak Grounds"              |
               \\___________________________|_____________________ /
                                            v
                                   dirt road south
                                (a different, cooler shade
                                 than Bramwick's own streets)
                                            |
                                            v
                                    Grimoak Grounds
`.trim();

type WorldMapArea = 'Grimoak Castle' | 'Grimoak Castle 2nd Floor' | 'Grimoak Castle 3rd Floor' | 'Grimoak Castle 4th Floor' | 'Grimoak Grounds' | 'Bramwick';

const WORLD_MAP_ASCII: Record<WorldMapArea, string> = {
  'Grimoak Castle': GRIMOAK_ASCII_MAP,
  'Grimoak Castle 2nd Floor': FLOOR2_ASCII_MAP,
  'Grimoak Castle 3rd Floor': FLOOR3_ASCII_MAP,
  'Grimoak Castle 4th Floor': FLOOR4_ASCII_MAP,
  'Grimoak Grounds': GRIMOAK_GROUNDS_ASCII_MAP,
  Bramwick: BRAMWICK_ASCII_MAP,
};

const WORLD_MAP_AREAS = Object.keys(WORLD_MAP_ASCII) as WorldMapArea[];

// Resets to the ground floor every time the modal is freshly opened (see
// openMapModal below) — a deliberate, manually-picked view, same as the
// tab itself.
let selectedWorldArea: WorldMapArea = 'Grimoak Castle';

function renderWorldMapTab(): void {
  mapBody.innerHTML = '';

  const select = document.createElement('select');
  select.className = 'world-map-area-select';
  for (const area of WORLD_MAP_AREAS) {
    const option = document.createElement('option');
    option.value = area;
    option.textContent = area;
    option.selected = area === selectedWorldArea;
    select.appendChild(option);
  }
  select.addEventListener('change', () => {
    selectedWorldArea = select.value as WorldMapArea;
    pre.textContent = WORLD_MAP_ASCII[selectedWorldArea];
  });
  mapBody.appendChild(select);

  const pre = document.createElement('pre');
  pre.className = 'world-map-tree';
  pre.textContent = WORLD_MAP_ASCII[selectedWorldArea];
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
          // A follow-up ask: "should not show where the player is, only
          // their name and level" — unlike "Where" (deliberately about
          // location within your own town), "Who" is just a roster.
          li.textContent = `${p.username} (Lv ${p.level})`;
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
