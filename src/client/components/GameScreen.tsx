import { useState, type KeyboardEvent } from 'react';
import type { PlayerSnapshot, MinimapCell } from '../../shared/types.js';
import { Minimap } from './Minimap.js';

export interface GameScreenProps {
  player: PlayerSnapshot | null;
  minimap: MinimapCell[];
  actionMessage: string;
  onCommand: (text: string) => void;
}

export function GameScreen({ player, minimap, actionMessage, onCommand }: GameScreenProps): JSX.Element {
  const [command, setCommand] = useState('');

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key !== 'Enter') return;
    const text = command.trim();
    if (!text) return;
    setCommand('');
    onCommand(text);
  }

  return (
    <div id="hud">
      <div id="position-readout">
        {player ? `${player.map}: (${player.row}, ${player.col})` : 'Position: (0, 0)'}
      </div>

      <div id="bottom-bar">
        <div id="status-row">
          <div id="action-log">{actionMessage}</div>
          <Minimap cells={minimap} />
        </div>
        <input
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
