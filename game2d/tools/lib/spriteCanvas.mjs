// Shared sprite-generation helpers (a later follow-up ask: "for every
// sprite created from now on use Canvas processing and Sharp to enhance
// everything") — replaces the project's older PIL/python3-inline-script
// convention (see CLAUDE.md's own Assets section) for any NEW sprite
// generator from this point forward. Every existing gen-*.mjs script
// (moose, dire wolf, orc, ...) used a hand-rolled "grid of colored cells,
// rasterize by writing raw PNG bytes via pngjs" approach — this keeps
// that exact same grid abstraction (so the drawing code for a new
// creature can still be written the same "fillRect a leg here, a snout
// there" way), just swaps the RASTERIZER: node-canvas's own 2D context
// draws each cell as a real filled rect, and the finished frame is piped
// through sharp for a real enhancement pass (a mild sharpen + a small
// saturation/contrast bump) before being written to disk, rather than
// writing raw pixels by hand.
import { createCanvas } from 'canvas';
import sharp from 'sharp';

export function hex(n) {
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

// Same "grid of nullable color cells" shape every existing gen-*.mjs
// script's own createGrid() already uses — a new creature's drawing code
// ported from one of those old scripts needs no changes beyond the import.
export function createGrid(cols, rows) {
  const cells = Array.from({ length: rows }, () => new Array(cols).fill(null));
  return {
    cells,
    fillRect(x, y, w, h, color) {
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (yy >= 0 && yy < rows && xx >= 0 && xx < cols) cells[yy][xx] = color;
        }
      }
    },
    set(x, y, color) {
      if (y >= 0 && y < rows && x >= 0 && x < cols) cells[y][x] = color;
    },
  };
}

// Draws a single facing's own row of animation frames (e.g. 8 walk/attack
// poses) onto the shared canvas context, one CELL-sized square per grid
// cell — plain rectangle fills, no anti-aliasing, so the pixel-art look is
// preserved exactly the same as the old raw-PNG-byte approach.
function drawFrameGrid(ctx, grid, cell, cols, rows, offsetX, offsetY) {
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const color = grid.cells[cy][cx];
      if (!color) continue;
      const { r, g, b } = hex(color);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(offsetX + cx * cell, offsetY + cy * cell, cell, cell);
    }
  }
}

// Same 4-facing-rows x N-frame-columns character-sheet layout every
// existing creature spritesheet in this project already uses (see e.g.
// gen-moose-sprites.mjs) — `frameGrids` is `{ down: Grid[], up: Grid[],
// left: Grid[], right: Grid[] }`, each array the same length (framesPerRow).
export async function rasterizeCharacterSheet(frameGrids, cell, cols, rows, framesPerRow, outPath) {
  const frameWidth = cols * cell;
  const frameHeight = rows * cell;
  const canvas = createCanvas(frameWidth * framesPerRow, frameHeight * 4);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const ROW_ORDER = ['down', 'up', 'left', 'right'];
  ROW_ORDER.forEach((facing, rowIdx) => {
    const frames = frameGrids[facing];
    for (let col = 0; col < frames.length; col++) {
      drawFrameGrid(ctx, frames[col], cell, cols, rows, col * frameWidth, rowIdx * frameHeight);
    }
  });

  const rawPng = canvas.toBuffer('image/png');
  // The "enhance" pass — a mild sharpen (crisper pixel edges after any
  // future resampling) and a small saturation/contrast lift so flat
  // fillRect colors don't read as quite as dull as a raw, unprocessed
  // rasterization would.
  await sharp(rawPng).sharpen({ sigma: 0.5 }).modulate({ saturation: 1.08, brightness: 1.02 }).toFile(outPath);
  console.log(`Wrote ${outPath} (${frameWidth * framesPerRow}x${frameHeight * 4})`);
}

// For a single-image (non-spritesheet) asset — a plain building/prop/
// tile, same enhancement pass as above.
export async function rasterizeSingleImage(grid, cell, cols, rows, outPath) {
  const canvas = createCanvas(cols * cell, rows * cell);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawFrameGrid(ctx, grid, cell, cols, rows, 0, 0);
  const rawPng = canvas.toBuffer('image/png');
  await sharp(rawPng).sharpen({ sigma: 0.5 }).modulate({ saturation: 1.08, brightness: 1.02 }).toFile(outPath);
  console.log(`Wrote ${outPath} (${cols * cell}x${rows * cell})`);
}
