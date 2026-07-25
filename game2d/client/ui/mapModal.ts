// The Map modal: Here / World Map / Who / Where tabs.
import { activeScene, myProfile, network } from '../state.js';
import { MAPS } from '../../shared/maps.js';
import { townGroupFor, whereLabelFor, isShopMap } from '../../shared/constants.js';
import type { MapName } from '../../shared/constants.js';
import type { WhoEntry } from '../../shared/types.js';
import { mapBody, mapModal, mapTabCurrentBtn, mapTabWhereBtn, mapTabWhoBtn, mapTabWorldBtn, registerModalOpenHandler, closeAllModals, updateInputCaptured } from './modalCore.js';

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

// A later follow-up ask: "add commands /who, /where, /map. The who
// command opens the map modal with the who tab focused, where command
// opens map modal with where tab focused, map command opens map modal
// with map tab focused" — same open-and-reset shape as openMapModal
// above (see toggleModal's own "close everything else, then show" flow
// in modalCore.ts), just landing on a caller-chosen tab instead of always
// resetting to 'current'. Purely client-side (see log.ts's own chat-input
// interception) — no server round trip needed, the modal's own tabs
// already fetch whatever data they need once rendered.
export function openMapModalToTab(tab: Exclude<MapTab, 'current'>): void {
  closeAllModals();
  activeMapTab = tab;
  if (tab === 'world') selectedWorldArea = 'Grimoak Castle';
  mapModal.hidden = false;
  updateInputCaptured();
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
  // A wide road (e.g. Grimoak Grounds <-> Bramwick/Kortho Road) is
  // really one exit per column across its own width under the hood, so
  // every step across it lands at the matching lateral position on the
  // other side (see bramwickGroundsEntranceExits's own doc comment) — a
  // follow-up bug fix: "for some reason there is 5 references to
  // Bramwick" reported this raw list surfacing all of them as separate
  // bullets instead of collapsing to the one connection a player actually
  // perceives.
  const seen = new Set<string>();
  const uniqueExits = def.exits.filter((exit) => {
    // A later follow-up ask: "in the towns on the map modal remove the
    // shops from showing as exits" — a shop door is a building entrance,
    // not a real place-to-place connection worth listing here.
    if (isShopMap(exit.toMap)) return false;
    const key = `${exit.direction} ${exit.toMap}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (uniqueExits.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No connections.';
    list.appendChild(li);
  }
  for (const exit of uniqueExits) {
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
                   /  NECROMANCER    SHAMAN    ELEMENTALIST   SUMMONER ILLUSIONIST\\
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
                    _____________________________________________________   sign: "Kortho Road"
                   /   ~~~~~~~~~~~~~~~~~~~ MOAT ~~~~~~~~~~~~~~~~~~~~~~~  \\  ------------------> east,
                  /    ~~                                            ~~  \\  dirt road (full width
                 |     ~~                                            ~~   |  walkable) to Road to
                 |     ~~          G R I M O A K   C A S T L E        ~~   |  Kortho -> Kortho
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

                    (new south strip, added by a later follow-up ask's
                     10% expansion)
                                          |
                                          v  south, dirt road (full width
                                             walkable) to Floro Road ->
                                             Floro
                                sign: "Floro Road"
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

// A later follow-up ask: "create ASCII maps to represent the new roads &
// towns that have been added" — Kortho Road/Kortho and Floro Road/
// Floro, same hand-drawn sketch treatment as every area above.
const ROAD_TO_KORTHO_ASCII_MAP = `
  < Grimoak Grounds                                                      Kortho >
  sign: "Grimoak Grounds"                                        sign: "Kortho"
   __________________________________________________________________________
  /   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~ dirt road ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ \\
 <===  walk in from either end, anywhere across its FULL WIDTH — no single  ===>
  \\    choke-point tile anymore (a later follow-up bug fix)                  /
   \\__________________________________________________________________________/
`.trim();

const KORTHO_ASCII_MAP = `
                     ______________________________________________________
                    /   [BLACKSMITH]  [GENERAL STORE]   [INN]     [BANK]    \\
                    |         ^               ^            ^         ^       |
                    |     (each shop building now has real collision —       |
< Kortho Road    |      walk in only through its own painted-on door)     |
sign: "Road to      |                                                       |
 Kortho"    <=======|           [ARMORER]    [PET SALESMAN]  [JOBS OFFICE]   |
                    |                ^              ^               ^       |
                    |                                                       |
                    |             sign: "Kortho Road"                    |
                     \\______________________________________________________/
`.trim();

const ROAD_TO_FLORO_ASCII_MAP = `
                                    ^  Grimoak Grounds
                          sign: "Grimoak Grounds"
                     ______________
                    /  ~~~~~~~~~~  \\
                    |  ~~ dirt  ~~  |
                    |  ~~ road  ~~  |  walk in from either end, anywhere
                    |  ~~~~~~~~~~   |  across its FULL WIDTH — no single
                    |  ~~~~~~~~~~   |  choke-point tile anymore
                     \\____________ /
                          sign: "Floro"
                                    v  Floro
`.trim();

const FLORO_ASCII_MAP = `
                                    ^  Floro Road
                          sign: "Floro Road"
                     ______________________________________________________
                    /   [BLACKSMITH]  [GENERAL STORE]   [INN]     [BANK]    \\
                    |         ^               ^            ^         ^       |
                    |     (each shop building now has real collision —       |
                    |      walk in only through its own painted-on door)     |
                    |                                                       |
                    |           [ARMORER]    [PET SALESMAN]  [JOBS OFFICE]   |
                    |                ^              ^               ^       |
                     \\______________________________________________________/
`.trim();

// A later follow-up ask: "create a new World/area called 'Mystical
// Timberland'... lots of trees spread out, even like the trees were a
// labyrinth" — connects directly off Grimoak Grounds' own west edge (no
// separate corridor map, same shape as Bramwick's own north connection).
const MYSTICAL_TIMBERLAND_ASCII_MAP = `
                                              Grimoak Grounds >
                                    sign: "Grimoak Grounds"
   ________________________________________________________
  /  .  |    . |  .    .|  . |.  |   .  | .   |. |  .   .  \\
 <==  . | . |.   .  |  . | .  ||.  .| .   | .  |.  | .  .  ===>
  |  . |.  | .   . |.  |.  | . |  .  ..  | .  |.  |  . |    |
  |   . | .  |  .  |  .  |.  |  .    . |.   |  . |.  |.  .  |
  \\   . |  .    | .  |  .  | .   |  .  | .  |.  | .   .   . /
   \\________________________________________________________/
     (each '.' is one of ~2,200 densely-scattered trees, all with
      real collision — pick your own way through, no fixed path)
`.trim();

type WorldMapArea =
  | 'World Map'
  | 'Grimoak Castle'
  | 'Grimoak Castle 2nd Floor'
  | 'Grimoak Castle 3rd Floor'
  | 'Grimoak Castle 4th Floor'
  | 'Grimoak Grounds'
  | 'Bramwick'
  | 'Kortho Road'
  | 'Kortho'
  | 'Floro Road'
  | 'Floro'
  | 'Mystical Timberland';

// A later follow-up ask: "would you be able to make a better 'World Map'
// representation with HTML than ASCII" — a real positioned/connected
// node graph (see buildWorldOverviewElement below) instead of a `<pre>`
// sketch, used only for this one dropdown entry; every other area below
// keeps its own hand-drawn ASCII sketch (unaffected by this ask).
const WORLD_MAP_ASCII: Partial<Record<WorldMapArea, string>> = {
  'Grimoak Castle': GRIMOAK_ASCII_MAP,
  'Grimoak Castle 2nd Floor': FLOOR2_ASCII_MAP,
  'Grimoak Castle 3rd Floor': FLOOR3_ASCII_MAP,
  'Grimoak Castle 4th Floor': FLOOR4_ASCII_MAP,
  'Grimoak Grounds': GRIMOAK_GROUNDS_ASCII_MAP,
  Bramwick: BRAMWICK_ASCII_MAP,
  'Kortho Road': ROAD_TO_KORTHO_ASCII_MAP,
  Kortho: KORTHO_ASCII_MAP,
  'Floro Road': ROAD_TO_FLORO_ASCII_MAP,
  Floro: FLORO_ASCII_MAP,
  'Mystical Timberland': MYSTICAL_TIMBERLAND_ASCII_MAP,
};

// Explicit order (not derived from WORLD_MAP_ASCII's own keys) so "World
// Map" — which has no ASCII entry at all, see buildWorldOverviewElement
// below — still appears, first, in the dropdown.
const WORLD_MAP_AREAS: WorldMapArea[] = [
  'World Map',
  'Grimoak Castle',
  'Grimoak Castle 2nd Floor',
  'Grimoak Castle 3rd Floor',
  'Grimoak Castle 4th Floor',
  'Grimoak Grounds',
  'Bramwick',
  'Kortho Road',
  'Kortho',
  'Floro Road',
  'Floro',
  'Mystical Timberland',
];

// Resets to the ground floor every time the modal is freshly opened (see
// openMapModal below) — a deliberate, manually-picked view, same as the
// tab itself.
let selectedWorldArea: WorldMapArea = 'Grimoak Castle';

// A later follow-up ask: "would you be able to make a better 'World Map'
// representation with HTML than ASCII" — a real positioned node graph
// (CSS grid + connector cells) reflecting this project's own actual area
// graph: Bramwick north, Kortho east, Floro south, Mystical Timberland
// west, all off Grimoak Grounds (which itself sits above Grimoak Castle).
function buildWorldOverviewElement(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'world-overview';

  const grid = document.createElement('div');
  grid.className = 'world-overview-grid';
  grid.style.gridTemplateAreas =
    '". . bram . ." ". . connN . ." "timb connW hub connE korth" ". . connS . ." ". . floro . ."';
  root.appendChild(grid);

  const addNode = (gridArea: string, label: string, sub: string): void => {
    const div = document.createElement('div');
    div.className = 'world-node';
    div.style.gridArea = gridArea;
    const name = document.createElement('div');
    name.className = 'world-node-name';
    name.textContent = label;
    div.appendChild(name);
    const small = document.createElement('div');
    small.className = 'world-node-sub';
    small.textContent = sub;
    div.appendChild(small);
    grid.appendChild(div);
  };
  const addConnector = (gridArea: string, orientation: 'v' | 'h', label: string): void => {
    const div = document.createElement('div');
    div.className = `world-connector world-connector-${orientation}`;
    div.style.gridArea = gridArea;
    div.textContent = label;
    grid.appendChild(div);
  };

  addNode('bram', 'Bramwick', '4 shops + a pet shop');
  addConnector('connN', 'v', '↕ dirt road');
  addNode('timb', 'Mystical Timberland', '~2,200 trees, maze-like');
  addConnector('connW', 'h', '↔ dirt road');
  addNode('hub', 'Grimoak Grounds', 'Grimoak Castle lies beneath, entered via the north door');
  addConnector('connE', 'h', '↔ Kortho Road');
  addNode('korth', 'Kortho', '7 shops, square grid');
  addConnector('connS', 'v', '↕ Floro Road');
  addNode('floro', 'Floro', '7 shops, square grid');

  const note = document.createElement('p');
  note.className = 'world-overview-note';
  note.textContent =
    'Grimoak Castle (2nd/3rd/4th Floor + the 4 portal dungeons) has its own separate sketches — pick "Grimoak Castle" from this dropdown for those.';
  root.appendChild(note);

  return root;
}

function renderWorldMapAreaContent(container: HTMLElement, area: WorldMapArea): void {
  container.innerHTML = '';
  if (area === 'World Map') {
    container.appendChild(buildWorldOverviewElement());
    return;
  }
  const pre = document.createElement('pre');
  pre.className = 'world-map-tree';
  pre.textContent = WORLD_MAP_ASCII[area] ?? '';
  container.appendChild(pre);
}

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
  mapBody.appendChild(select);

  const content = document.createElement('div');
  content.className = 'world-map-content';
  mapBody.appendChild(content);

  select.addEventListener('change', () => {
    selectedWorldArea = select.value as WorldMapArea;
    renderWorldMapAreaContent(content, selectedWorldArea);
  });
  renderWorldMapAreaContent(content, selectedWorldArea);
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
      // A later follow-up ask: "if the player has a corpse anywhere in
      // the game, that has not faded away due to time limit, tell them
      // where their corpse is" — surfaced here in "Where" specifically,
      // since that's the tab this ask named.
      if (tab === 'where' && myProfile?.corpseLocation) {
        const corpseNote = document.createElement('div');
        corpseNote.className = 'map-corpse-note';
        corpseNote.textContent = `Your corpse is in ${myProfile.corpseLocation}.`;
        mapBody.appendChild(corpseNote);
      }
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
