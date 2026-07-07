import { useEffect, useReducer, useRef } from 'react';
import { NetworkManager, type DisconnectedDetail } from '../net/NetworkManager.js';
import type { SyncPayload, KickedPayload, CombatStatus, CombatUpdatePayload } from '../../server/game-gateway/types.js';
import type { PlayerSnapshot, MinimapCell, RoomInfo } from '../../shared/types.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

type Screen = 'auth' | 'game';

interface GameState {
  screen: Screen;
  authError: string;
  player: PlayerSnapshot | null;
  minimap: MinimapCell[];
  room: RoomInfo | null;
  monsterMessage: string | null;
  combat: CombatStatus | null;
  actionMessage: string;
}

const initialState: GameState = {
  screen: 'auth',
  authError: '',
  player: null,
  minimap: [],
  room: null,
  monsterMessage: null,
  combat: null,
  actionMessage: '',
};

type Action =
  | { type: 'authError'; message: string }
  | {
      type: 'sync';
      player: PlayerSnapshot;
      minimap: MinimapCell[];
      room: RoomInfo;
      monsterMessage?: string;
      isReconnect: boolean;
    }
  | {
      type: 'commandResult';
      message: string;
      player?: PlayerSnapshot;
      minimap?: MinimapCell[];
      room?: RoomInfo;
      monsterMessage?: string;
      combat?: CombatStatus | null;
    }
  | {
      type: 'combatUpdate';
      message: string;
      player: PlayerSnapshot;
      monster?: CombatStatus;
      monsterMessage?: string;
    }
  | { type: 'connectionMessage'; message: string }
  | { type: 'loggedOut'; message?: string };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'authError':
      return { ...state, authError: action.message };
    case 'sync':
      return {
        screen: 'game',
        authError: '',
        player: action.player,
        minimap: action.minimap,
        room: action.room,
        monsterMessage: action.monsterMessage ?? null,
        // A fresh connection never has a fight already running (the server
        // clears any auto-attack loop on disconnect), so this always resets.
        combat: null,
        actionMessage: action.isReconnect
          ? 'Reconnected — position resynced with the server.'
          : `${action.player.username} entered ${action.player.map}.`,
      };
    case 'commandResult':
      return {
        ...state,
        player: action.player ?? state.player,
        minimap: action.minimap ?? state.minimap,
        room: action.room ?? state.room,
        // The server only ever sends monsterMessage alongside room, and
        // always sends a definitive answer (string or omitted-meaning-none)
        // whenever it sends room — so "room present" is what distinguishes
        // "no monster here" from "this ack didn't recompute location info
        // at all" (e.g. rate-limited/invalid-command acks), which must
        // leave the last-known monster state alone instead of clearing it.
        monsterMessage: action.room ? (action.monsterMessage ?? null) : state.monsterMessage,
        // combat is tri-state: undefined means this ack doesn't pertain to
        // combat at all (movement, unknown command) so any in-progress
        // auto-attack loop's status is left alone — it keeps running
        // server-side and is only ever cleared via a 'combatUpdate' push
        // or an explicit null here (a killing first hit).
        combat: action.combat === undefined ? state.combat : action.combat,
        actionMessage: action.message,
      };
    case 'combatUpdate':
      return {
        ...state,
        player: action.player,
        monsterMessage: action.monsterMessage ?? null,
        combat: action.monster ?? null,
        actionMessage: action.message,
      };
    case 'connectionMessage':
      return { ...state, actionMessage: action.message };
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
      const { player, minimap, room, monsterMessage } = (e as CustomEvent<SyncPayload>).detail;
      const isReconnect = hasSyncedOnceRef.current;
      hasSyncedOnceRef.current = true;
      dispatch({ type: 'sync', player, minimap, room, monsterMessage, isReconnect });
    }

    function onCombatUpdate(e: Event): void {
      const { message, player, monster, monsterMessage } = (e as CustomEvent<CombatUpdatePayload>).detail;
      dispatch({ type: 'combatUpdate', message, player, monster, monsterMessage });
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
    try {
      const res = await network.sendCommand(text);
      if (res.loggedOut) {
        explicitLogoutRef.current = true;
        network.disconnectAndReset();
        hasSyncedOnceRef.current = false;
        dispatch({ type: 'loggedOut', message: res.message });
        return;
      }
      dispatch({
        type: 'commandResult',
        message: res.message,
        player: res.player,
        minimap: res.minimap ?? undefined,
        room: res.room,
        monsterMessage: res.monsterMessage,
        combat: res.combat,
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
