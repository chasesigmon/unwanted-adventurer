import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { PlayerSnapshot, MinimapCell, RoomInfo } from '../../shared/types.js';
import { Minimap } from './Minimap.js';

export interface GameScreenProps {
  player: PlayerSnapshot | null;
  minimap: MinimapCell[];
  room: RoomInfo | null;
  monsterMessage: string | null;
  actionMessage: string;
  onCommand: (text: string) => void;
}

// Arrow keys map to the same tokens the server already understands
// (there's no separate "left"/"right" direction — west/east cover both).
const MOVE_KEYS: Record<string, string> = {
  w: 'w',
  W: 'w',
  a: 'a',
  A: 'a',
  s: 's',
  S: 's',
  d: 'd',
  D: 'd',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'a',
  ArrowRight: 'd',
};

export function GameScreen({ player, minimap, room, monsterMessage, actionMessage, onCommand }: GameScreenProps): JSX.Element {
  const [command, setCommand] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div id="hud">
      <div id="top-bar">
        <div id="top-left-stack">
          <div className="side-box" id="score-box">
            <div className="side-box-label">Score</div>
            <div className="side-box-content">{player?.username}</div>
            {player && (
              <div id="player-stats">
                <span>
                  <span className="stat-label">HP</span> {player.hp}
                </span>
                <span>
                  <span className="stat-label">MP</span> {player.mana}
                </span>
                <span>
                  <span className="stat-label">MV</span> {player.movement}
                </span>
              </div>
            )}
          </div>
        </div>
        <div id="top-right-stack">
          <div id="position-readout">
            {player ? `${player.map}: (${player.row}, ${player.col})` : 'Position: (0, 0)'}
          </div>
        </div>
      </div>

      <div id="bottom-bar">
        <div id="status-row">
          <div id="action-log">
            <div id="action-message">{actionMessage}</div>
            {monsterMessage && <div id="monster-message">{monsterMessage}</div>}
            {room && (
              <>
                <div id="room-name">{room.name}</div>
                <div id="room-description">{room.description}</div>
              </>
            )}
          </div>
          <div className="side-box" id="minimap-box">
            <div className="side-box-label">Minimap</div>
            <Minimap cells={minimap} />
          </div>
        </div>
        <input
          ref={inputRef}
          id="command-input"
          type="text"
          maxLength={32}
          autoComplete="off"
          placeholder="Type a command (w, a, s, d, up, down) and press Enter..."
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      </div>
    </div>
  );
}
