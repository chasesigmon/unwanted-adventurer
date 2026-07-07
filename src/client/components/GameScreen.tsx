import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { PlayerSnapshot, MinimapCell, RoomInfo, WorldMapArea } from '../../shared/types.js';
import type { LogEntry } from '../hooks/useGameConnection.js';
import { Minimap } from './Minimap.js';
import { WorldMapModal } from './WorldMapModal.js';

export interface GameScreenProps {
  player: PlayerSnapshot | null;
  minimap: MinimapCell[];
  room: RoomInfo | null;
  messages: LogEntry[];
  worldMapAreas: WorldMapArea[] | null;
  onCommand: (text: string) => void;
  onCloseWorldMap: () => void;
}

// Physical WASD/arrow keys keep their usual screen-relative meaning (W/up
// = away from the bottom of the screen, etc.) but now send the compass
// letters the server understands (n/s/e/w) instead of the keys' own
// letters — e.g. physical "D"/ArrowRight both send 'e' (east), not 'd'.
const MOVE_KEYS: Record<string, string> = {
  w: 'n',
  W: 'n',
  a: 'w',
  A: 'w',
  s: 's',
  S: 's',
  d: 'e',
  D: 'e',
  ArrowUp: 'n',
  ArrowDown: 's',
  ArrowLeft: 'w',
  ArrowRight: 'e',
};

export function GameScreen({
  player,
  minimap,
  room,
  messages,
  worldMapAreas,
  onCommand,
  onCloseWorldMap,
}: GameScreenProps): JSX.Element {
  const [command, setCommand] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key !== 'Enter') return;
    const text = command.trim();
    if (!text) return;
    setCommand(text);
    onCommand(text);
    // Re-select once the input re-renders with the trimmed value, so the
    // whole command is highlighted and typing immediately replaces it.
    setTimeout(() => inputRef.current?.select(), 0);
  }

  // WASD / arrow keys move the player directly whenever the command box
  // isn't focused — typing in the box is left completely alone.
  useEffect(() => {
    function handleGlobalKeyDown(e: globalThis.KeyboardEvent): void {
      if (document.activeElement === inputRef.current) return;

      const move = MOVE_KEYS[e.key];
      if (!move) return;

      e.preventDefault();
      onCommand(move);
    }

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [onCommand]);

  // Keep the log pinned to the newest line as messages accumulate.
  useEffect(() => {
    const el = messageListRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const xpPercent = player ? Math.min(100, Math.max(0, Math.round((player.exp / player.maxTnl) * 100))) : 0;

  return (
    <div id="hud">
      <div id="game-columns">
        <div id="left-column">
          <div className="side-box" id="score-box">
            <div className="side-box-label">Score</div>
            <div className="side-box-content">{player?.username}</div>
            {player && (
              <div id="player-stats">
                <span>
                  <span className="stat-label">RACE</span> {player.race}
                </span>
                <span>
                  <span className="stat-label">LVL</span> {player.level}
                </span>
                <span>
                  <span className="stat-label">HP</span> {player.hp}
                </span>
                <span>
                  <span className="stat-label">MP</span> {player.mana}
                </span>
                <span>
                  <span className="stat-label">MV</span> {player.movement}
                </span>
                <span>
                  <span className="stat-label">XP</span> {player.exp}
                </span>
                <span>
                  <span className="stat-label">CXP</span> {player.consumeExp}
                </span>
              </div>
            )}
          </div>
        </div>

        <div id="center-column">
          <div id="message-box">
            {room && (
              <div id="room-info">
                <div id="room-name">{room.name}</div>
                <div id="room-description">{room.description}</div>
              </div>
            )}
            <div id="message-list" ref={messageListRef}>
              {messages.map((entry, i) => (
                <div
                  className={`message-line${entry.variant ? ` message-line--${entry.variant}` : ''}${entry.leadsAction ? ' message-line--leads-action' : ''}`}
                  key={i}
                >
                  {entry.text}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div id="right-column">
          <div id="position-readout">
            {player ? `${player.map}: (${player.row}, ${player.col})` : 'Position: (0, 0)'}
          </div>
          <div className="side-box" id="minimap-box">
            <div className="side-box-label">Minimap</div>
            <Minimap cells={minimap} />
          </div>
          <div className="side-box" id="inventory-box">
            <div className="side-box-label">Inventory</div>
            <div className="side-box-content">
              {player && player.inventory.length > 0 ? player.inventory.join(', ') : '(empty)'}
            </div>
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        id="command-input"
        type="text"
        maxLength={32}
        autoComplete="off"
        placeholder="Type a command (n/s/e/w, attack/kill <mob>, flee, consume/grab/get <item>, commands) and press Enter..."
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
      />
      <div id="xp-bar-track">
        <div id="xp-bar-fill" style={{ width: `${xpPercent}%` }} />
      </div>

      {worldMapAreas && <WorldMapModal areas={worldMapAreas} onClose={onCloseWorldMap} />}
    </div>
  );
}
