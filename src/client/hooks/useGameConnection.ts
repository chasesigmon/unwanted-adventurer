import { useEffect, useReducer, useRef } from 'react';
import { NetworkManager, type DisconnectedDetail } from '../net/NetworkManager.js';
import type { SyncPayload, KickedPayload, CombatUpdatePayload, NoticePayload } from '../../server/game-gateway/types.js';
import type { PlayerSnapshot, MinimapCell, RoomInfo, WorldMapArea } from '../../shared/types.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

// Caps the persistent log so a very long session doesn't grow the array
// (and the DOM list rendered from it) without bound.
const MAX_MESSAGES = 200;

type Screen = 'auth' | 'game';

// A line in the persistent message log, tagged with an optional visual
// treatment: 'sighting' (a monster/item just noticed — red, extra space
// above and below) or 'milestone' (a kill or level-up — extra space
// below, to set it apart from the ordinary flow). `leadsAction` is
// independent of `variant` (a separate small margin-top, rendered
// alongside whatever variant class also applies) — set on the first line
// of a command's own result, so each action's output gets a little
// breathing room from whatever came before it in the log.
export interface LogEntry {
  text: string;
  variant?: 'sighting' | 'milestone';
  leadsAction?: boolean;
}

interface GameState {
  screen: Screen;
  authError: string;
  player: PlayerSnapshot | null;
  minimap: MinimapCell[];
  room: RoomInfo | null;
  // Last-known monster/item indicator for the current room — not rendered
  // directly (see withSightings): kept only so the reducer can tell a
  // genuinely new sighting from the same one recomputed again.
  monsterMessage: string | null;
  itemMessage: string | null;
  messages: LogEntry[];
  // Set only by the "worldmap" command's ack; cleared by the modal's own
  // close action. Nothing else in GameState reacts to it.
  worldMapAreas: WorldMapArea[] | null;
}

const initialState: GameState = {
  screen: 'auth',
  authError: '',
  player: null,
  minimap: [],
  room: null,
  monsterMessage: null,
  itemMessage: null,
  messages: [],
  worldMapAreas: null,
};

function appendEntries(existing: LogEntry[], incoming: LogEntry[]): LogEntry[] {
  if (incoming.length === 0) return existing;
  const combined = [...existing, ...incoming];
  return combined.length > MAX_MESSAGES ? combined.slice(combined.length - MAX_MESSAGES) : combined;
}

// The server sends plain strings; a couple of exact, server-owned phrasings
// get tagged for the "milestone" spacing the moment they arrive, so
// GameScreen never has to guess from the raw text at render time.
function classifyServerLine(text: string): LogEntry['variant'] {
  if (text.startsWith('You killed ') || text.startsWith('You leveled up!') || text.includes('hits you for')) {
    return 'milestone';
  }
  if (text.includes('wanders into the room')) {
    return 'sighting';
  }
  return undefined;
}

// `leadsAction` only ever applies to the very first line of a batch (the
// start of this action's output) — never to every line, so a multi-line
// combat exchange still reads as one tight block with just a small gap
// above the whole thing, not gaps between its own lines.
function toEntries(lines: string[], leadsAction = false): LogEntry[] {
  return lines.map((text, i) => ({
    text,
    variant: classifyServerLine(text),
    leadsAction: i === 0 && leadsAction,
  }));
}

// Folds "a skeleton is here"/"a leg lies here" into the same natural,
// one-at-a-time message log as everything else, instead of a separate
// fixed banner — but only when the value is genuinely new (different from
// what was last seen), so standing in the same room across several
// actions doesn't reprint the same sighting on every single one. The
// monster sighting gets the 'sighting' variant (red, extra space both
// sides); the item sighting gets 'milestone' (just extra space below) —
// enough breathing room to set it apart without the same alarm color.
function withSightings(
  state: GameState,
  newMonsterMessage: string | null,
  newItemMessage: string | null,
  ownMessages: string[],
  leadsAction = false
): Pick<GameState, 'messages' | 'monsterMessage' | 'itemMessage'> {
  const sightings: LogEntry[] = [];
  if (newMonsterMessage && newMonsterMessage !== state.monsterMessage) {
    sightings.push({ text: newMonsterMessage, variant: 'sighting' });
  }
  if (newItemMessage && newItemMessage !== state.itemMessage) {
    sightings.push({ text: newItemMessage, variant: 'milestone' });
  }
  return {
    messages: appendEntries(state.messages, [...toEntries(ownMessages, leadsAction), ...sightings]),
    monsterMessage: newMonsterMessage,
    itemMessage: newItemMessage,
  };
}

type Action =
  | { type: 'authError'; message: string }
  | {
      type: 'sync';
      player: PlayerSnapshot;
      minimap: MinimapCell[];
      room: RoomInfo;
      monsterMessage?: string;
      itemMessage?: string;
    }
  | {
      type: 'commandResult';
      messages: string[];
      player?: PlayerSnapshot;
      minimap?: MinimapCell[];
      room?: RoomInfo;
      monsterMessage?: string;
      itemMessage?: string;
      worldMap?: WorldMapArea[];
    }
  | {
      type: 'combatUpdate';
      messages: string[];
      player: PlayerSnapshot;
      monsterMessage?: string;
      itemMessage?: string;
    }
  | {
      // Pushed on the server's own timers, never in response to a command
      // — a monster wandering into/out of the player's room, or a
      // sleep-tick heal. `monsterMessage` uses `null` (not just omitted)
      // to mean "authoritatively nothing here now" — see the reducer case,
      // which needs to tell that apart from "this notice doesn't carry
      // room info at all" (a heal tick).
      type: 'notice';
      messages: string[];
      player?: PlayerSnapshot;
      monsterMessage?: string | null;
    }
  | { type: 'connectionMessage'; message: string }
  | { type: 'clearMessages' }
  | { type: 'closeWorldMap' }
  | { type: 'loggedOut'; message?: string };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'authError':
      return { ...state, authError: action.message };
    case 'sync': {
      // Same greeting whether this is a fresh login or a reconnect after a
      // dropped connection — both are "the player showing up," as far as
      // the message log is concerned.
      const line = `Welcome back, ${action.player.username}!`;
      const sighted = withSightings(state, action.monsterMessage ?? null, action.itemMessage ?? null, [line]);
      return {
        screen: 'game',
        authError: '',
        player: action.player,
        minimap: action.minimap,
        room: action.room,
        worldMapAreas: null,
        ...sighted,
      };
    }
    case 'commandResult': {
      // The server only ever sends monsterMessage/itemMessage alongside
      // room, and always sends a definitive answer (string or
      // omitted-meaning-none) whenever it sends room — so "room present"
      // is what distinguishes "no monster/item here" from "this ack
      // didn't recompute location info at all" (e.g. rate-limited/
      // invalid-command acks), which must leave the last-known sighting
      // state alone rather than clearing (or re-triggering) it.
      const newMonsterMessage = action.room ? (action.monsterMessage ?? null) : state.monsterMessage;
      const newItemMessage = action.room ? (action.itemMessage ?? null) : state.itemMessage;
      // Every command result is "the player performing an action" — a
      // small gap above its first line sets it apart from whatever was
      // already in the log.
      const sighted = withSightings(state, newMonsterMessage, newItemMessage, action.messages, true);
      return {
        ...state,
        player: action.player ?? state.player,
        minimap: action.minimap ?? state.minimap,
        room: action.room ?? state.room,
        // Only the "worldmap" ack ever sets this; every other command
        // leaves whatever's already there (open or closed) alone.
        worldMapAreas: action.worldMap ?? state.worldMapAreas,
        ...sighted,
      };
    }
    case 'combatUpdate': {
      const sighted = withSightings(state, action.monsterMessage ?? null, action.itemMessage ?? null, action.messages);
      return {
        ...state,
        player: action.player,
        ...sighted,
      };
    }
    case 'notice': {
      return {
        ...state,
        player: action.player ?? state.player,
        monsterMessage: action.monsterMessage !== undefined ? action.monsterMessage : state.monsterMessage,
        messages: appendEntries(state.messages, toEntries(action.messages)),
      };
    }
    case 'connectionMessage':
      return { ...state, messages: appendEntries(state.messages, [{ text: action.message }]) };
    case 'clearMessages':
      // Deliberately only touches messages — room and everything else in
      // GameState are untouched by "clear".
      return { ...state, messages: [] };
    case 'closeWorldMap':
      return { ...state, worldMapAreas: null };
    case 'loggedOut':
      return { ...initialState, authError: action.message ?? '' };
    default:
      return state;
  }
}

export interface UseGameConnection {
  state: GameState;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, race: string) => Promise<void>;
  sendCommand: (text: string) => Promise<void>;
  closeWorldMap: () => void;
}

export function useGameConnection(): UseGameConnection {
  const networkRef = useRef<NetworkManager | null>(null);
  if (!networkRef.current) {
    networkRef.current = new NetworkManager(SERVER_URL);
  }
  const network = networkRef.current;

  const [state, dispatch] = useReducer(reducer, initialState);
  // Suppresses the 'disconnected' handler's generic loggedOut dispatch when
  // we've already shown a more specific message (kicked, or an explicit
  // "logout" command) — both are immediately followed by the socket's own
  // 'disconnect' event, which would otherwise clobber that message.
  const explicitLogoutRef = useRef(false);

  useEffect(() => {
    function onSync(e: Event): void {
      const { player, minimap, room, monsterMessage, itemMessage } = (e as CustomEvent<SyncPayload>).detail;
      dispatch({ type: 'sync', player, minimap, room, monsterMessage, itemMessage });
    }

    function onCombatUpdate(e: Event): void {
      const { messages, player, monsterMessage, itemMessage } = (e as CustomEvent<CombatUpdatePayload>).detail;
      dispatch({ type: 'combatUpdate', messages, player, monsterMessage, itemMessage });
    }

    function onNotice(e: Event): void {
      const { messages, player, monsterMessage } = (e as CustomEvent<NoticePayload>).detail;
      dispatch({ type: 'notice', messages, player, monsterMessage });
    }

    function onKicked(e: Event): void {
      const { message } = (e as CustomEvent<KickedPayload>).detail;
      network.disconnectAndReset();
      explicitLogoutRef.current = true;
      dispatch({ type: 'loggedOut', message });
    }

    function onDisconnected(e: Event): void {
      const { reason } = (e as CustomEvent<DisconnectedDetail>).detail;
      // A server- or client-initiated disconnect (logout, or kicked by a
      // newer login) won't auto-reconnect and the token is no longer good —
      // go back to login. Anything else is a transient network drop that
      // Socket.io will retry on its own.
      if (reason === 'io server disconnect' || reason === 'io client disconnect') {
        network.disconnectAndReset();
        if (!explicitLogoutRef.current) {
          dispatch({ type: 'loggedOut' });
        }
        explicitLogoutRef.current = false;
      } else {
        dispatch({ type: 'connectionMessage', message: 'Connection lost. Reconnecting…' });
      }
    }

    function onReconnectFailed(): void {
      network.disconnectAndReset();
      dispatch({ type: 'loggedOut', message: 'Could not reconnect. Please log in again.' });
    }

    network.addEventListener('sync', onSync);
    network.addEventListener('combatUpdate', onCombatUpdate);
    network.addEventListener('notice', onNotice);
    network.addEventListener('kicked', onKicked);
    network.addEventListener('disconnected', onDisconnected);
    network.addEventListener('reconnect_failed', onReconnectFailed);

    return () => {
      network.removeEventListener('sync', onSync);
      network.removeEventListener('combatUpdate', onCombatUpdate);
      network.removeEventListener('notice', onNotice);
      network.removeEventListener('kicked', onKicked);
      network.removeEventListener('disconnected', onDisconnected);
      network.removeEventListener('reconnect_failed', onReconnectFailed);
    };
  }, [network]);

  async function login(username: string, password: string): Promise<void> {
    try {
      await network.login(username, password);
      network.connectSocket();
    } catch (err) {
      dispatch({ type: 'authError', message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function register(username: string, password: string, race: string): Promise<void> {
    try {
      await network.register(username, password, race);
      network.connectSocket();
    } catch (err) {
      dispatch({ type: 'authError', message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function sendCommand(text: string): Promise<void> {
    // "clear" is a pure display action — it never touches the server (no
    // game state to change, no reason to spend a rate-limit token).
    if (text.trim().toLowerCase() === 'clear') {
      dispatch({ type: 'clearMessages' });
      return;
    }

    try {
      const res = await network.sendCommand(text);
      if (res.loggedOut) {
        explicitLogoutRef.current = true;
        network.disconnectAndReset();
        dispatch({ type: 'loggedOut', message: res.messages[0] });
        return;
      }
      dispatch({
        type: 'commandResult',
        messages: res.messages,
        player: res.player,
        minimap: res.minimap ?? undefined,
        room: res.room,
        monsterMessage: res.monsterMessage,
        itemMessage: res.itemMessage,
        worldMap: res.worldMap,
      });
    } catch (err) {
      dispatch({
        type: 'connectionMessage',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function closeWorldMap(): void {
    dispatch({ type: 'closeWorldMap' });
  }

  return { state, login, register, sendCommand, closeWorldMap };
}
