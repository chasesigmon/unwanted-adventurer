import { useEffect, useReducer, useRef } from 'react';
import { NetworkManager, type DisconnectedDetail } from '../net/NetworkManager.js';
import type { SyncPayload, KickedPayload } from '../../server/game-gateway/types.js';
import type { PlayerSnapshot, MinimapCell } from '../../shared/types.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

type Screen = 'auth' | 'game';

interface GameState {
  screen: Screen;
  authError: string;
  player: PlayerSnapshot | null;
  minimap: MinimapCell[];
  actionMessage: string;
}

const initialState: GameState = {
  screen: 'auth',
  authError: '',
  player: null,
  minimap: [],
  actionMessage: '',
};

type Action =
  | { type: 'authError'; message: string }
  | { type: 'sync'; player: PlayerSnapshot; minimap: MinimapCell[]; isReconnect: boolean }
  | { type: 'commandResult'; message: string; player?: PlayerSnapshot; minimap?: MinimapCell[] }
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
        actionMessage: action.isReconnect
          ? 'Reconnected — position resynced with the server.'
          : `${action.player.username} entered ${action.player.map}.`,
      };
    case 'commandResult':
      return {
        ...state,
        player: action.player ?? state.player,
        minimap: action.minimap ?? state.minimap,
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
      const { player, minimap } = (e as CustomEvent<SyncPayload>).detail;
      const isReconnect = hasSyncedOnceRef.current;
      hasSyncedOnceRef.current = true;
      dispatch({ type: 'sync', player, minimap, isReconnect });
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
    network.addEventListener('kicked', onKicked);
    network.addEventListener('disconnected', onDisconnected);
    network.addEventListener('reconnect_failed', onReconnectFailed);

    return () => {
      network.removeEventListener('sync', onSync);
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
