import { useEffect, useReducer, useRef } from 'react';
import { NetworkManager, type DisconnectedDetail } from '../net/NetworkManager.js';
import type { SyncPayload, KickedPayload, CombatUpdatePayload } from '../../server/game-gateway/types.js';
import type { PlayerSnapshot, MinimapCell, RoomInfo } from '../../shared/types.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

// Caps the persistent log so a very long session doesn't grow the array
// (and the DOM list rendered from it) without bound.
const MAX_MESSAGES = 200;

type Screen = 'auth' | 'game';

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
  messages: string[];
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
};

function appendMessages(existing: string[], incoming: string[]): string[] {
  if (incoming.length === 0) return existing;
  const combined = [...existing, ...incoming];
  return combined.length > MAX_MESSAGES ? combined.slice(combined.length - MAX_MESSAGES) : combined;
}

// Folds "a skeleton is here"/"a leg lies here" into the same natural,
// one-at-a-time message log as everything else, instead of a separate
// fixed banner — but only when the value is genuinely new (different from
// what was last seen), so standing in the same room across several
// actions doesn't reprint the same sighting on every single one.
function withSightings(
  state: GameState,
  newMonsterMessage: string | null,
  newItemMessage: string | null,
  ownMessages: string[]
): Pick<GameState, 'messages' | 'monsterMessage' | 'itemMessage'> {
  const sightings: string[] = [];
  if (newMonsterMessage && newMonsterMessage !== state.monsterMessage) {
    sightings.push(newMonsterMessage);
  }
  if (newItemMessage && newItemMessage !== state.itemMessage) {
    sightings.push(newItemMessage);
  }
  return {
    messages: appendMessages(state.messages, [...ownMessages, ...sightings]),
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
      isReconnect: boolean;
    }
  | {
      type: 'commandResult';
      messages: string[];
      player?: PlayerSnapshot;
      minimap?: MinimapCell[];
      room?: RoomInfo;
      monsterMessage?: string;
      itemMessage?: string;
    }
  | {
      type: 'combatUpdate';
      messages: string[];
      player: PlayerSnapshot;
      monsterMessage?: string;
      itemMessage?: string;
    }
  | { type: 'connectionMessage'; message: string }
  | { type: 'clearMessages' }
  | { type: 'loggedOut'; message?: string };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'authError':
      return { ...state, authError: action.message };
    case 'sync': {
      const line = action.isReconnect
        ? 'Reconnected — position resynced with the server.'
        : `${action.player.username} entered ${action.player.map}.`;
      const sighted = withSightings(state, action.monsterMessage ?? null, action.itemMessage ?? null, [line]);
      return {
        screen: 'game',
        authError: '',
        player: action.player,
        minimap: action.minimap,
        room: action.room,
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
      const sighted = withSightings(state, newMonsterMessage, newItemMessage, action.messages);
      return {
        ...state,
        player: action.player ?? state.player,
        minimap: action.minimap ?? state.minimap,
        room: action.room ?? state.room,
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
    case 'connectionMessage':
      return { ...state, messages: appendMessages(state.messages, [action.message]) };
    case 'clearMessages':
      // Deliberately only touches messages — room and everything else in
      // GameState are untouched by "clear".
      return { ...state, messages: [] };
    case 'loggedOut':
      return { ...initialState, authError: action.message ?? '' };
    default:
      return state;
  }
}

export interface UseGameConnection {
  state: GameState;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  sendCommand: (text: string) => Promise<void>;
}

export function useGameConnection(): UseGameConnection {
  const networkRef = useRef<NetworkManager | null>(null);
  if (!networkRef.current) {
    networkRef.current = new NetworkManager(SERVER_URL);
  }
  const network = networkRef.current;

  const [state, dispatch] = useReducer(reducer, initialState);
  const hasSyncedOnceRef = useRef(false);
  // Suppresses the 'disconnected' handler's generic loggedOut dispatch when
  // we've already shown a more specific message (kicked, or an explicit
  // "logout" command) — both are immediately followed by the socket's own
  // 'disconnect' event, which would otherwise clobber that message.
  const explicitLogoutRef = useRef(false);

  useEffect(() => {
    function onSync(e: Event): void {
      const { player, minimap, room, monsterMessage, itemMessage } = (e as CustomEvent<SyncPayload>).detail;
      const isReconnect = hasSyncedOnceRef.current;
      hasSyncedOnceRef.current = true;
      dispatch({ type: 'sync', player, minimap, room, monsterMessage, itemMessage, isReconnect });
    }

    function onCombatUpdate(e: Event): void {
      const { messages, player, monsterMessage, itemMessage } = (e as CustomEvent<CombatUpdatePayload>).detail;
      dispatch({ type: 'combatUpdate', messages, player, monsterMessage, itemMessage });
    }

    function onKicked(e: Event): void {
      const { message } = (e as CustomEvent<KickedPayload>).detail;
      network.disconnectAndReset();
      hasSyncedOnceRef.current = false;
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
        hasSyncedOnceRef.current = false;
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
      hasSyncedOnceRef.current = false;
      dispatch({ type: 'loggedOut', message: 'Could not reconnect. Please log in again.' });
    }

    network.addEventListener('sync', onSync);
    network.addEventListener('combatUpdate', onCombatUpdate);
    network.addEventListener('kicked', onKicked);
    network.addEventListener('disconnected', onDisconnected);
    network.addEventListener('reconnect_failed', onReconnectFailed);

    return () => {
      network.removeEventListener('sync', onSync);
      network.removeEventListener('combatUpdate', onCombatUpdate);
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

  async function register(username: string, password: string): Promise<void> {
    try {
      await network.register(username, password);
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
        hasSyncedOnceRef.current = false;
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
      });
    } catch (err) {
      dispatch({
        type: 'connectionMessage',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { state, login, register, sendCommand };
}
