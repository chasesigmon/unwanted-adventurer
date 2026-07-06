import type { MinimapCell } from '../../shared/types.js';

export interface MinimapProps {
  cells: MinimapCell[];
}

export function Minimap({ cells }: MinimapProps): JSX.Element {
  return (
    <div id="minimap">
      {cells.map((cell, i) => (
        <span
          key={i}
          className={`minimap-cell${cell.self ? ' is-self' : cell.exit ? ' is-exit' : ''}`}
        >
          {cell.self ? '@' : cell.exit ? '*' : cell.inBounds ? '.' : '#'}
        </span>
      ))}
    </div>
  );
}
