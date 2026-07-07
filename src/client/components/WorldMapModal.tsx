import type { WorldMapArea } from '../../shared/types.js';

export interface WorldMapModalProps {
  areas: WorldMapArea[];
  onClose: () => void;
}

// A coarse "map of maps" — every area and what it connects to, no
// per-room detail (that's what the "map" command is for). Closing via
// backdrop click is stopped from bubbling by the inner div so clicking
// inside the modal itself doesn't also close it.
export function WorldMapModal({ areas, onClose }: WorldMapModalProps): JSX.Element {
  return (
    <div id="worldmap-overlay" onClick={onClose}>
      <div id="worldmap-modal" onClick={(e) => e.stopPropagation()}>
        <div id="worldmap-title">World Map</div>
        <div id="worldmap-areas">
          {areas.map((area) => (
            <div className="worldmap-area" key={area.name}>
              <span className="worldmap-area-name">{area.name}</span>
              <span className="worldmap-area-size">
                ({area.rows}x{area.cols})
              </span>
              {area.connectsTo.length > 0 && (
                <span className="worldmap-area-connects"> → {area.connectsTo.join(', ')}</span>
              )}
            </div>
          ))}
        </div>
        <button id="worldmap-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
