// Shared pixel-art post-processing utilities — item request: "add Canvas
// post-processing... for animation and sprite generation." Every
// gen-*.mjs script in this project builds sprites as a flat RGBA buffer
// via pngjs (a coarse "big pixel" grid rasterized by hand, not a real
// CanvasRenderingContext2D), so most of these operate directly on that
// same {width, height, data} shape rather than requiring a canvas at
// all — cheaper and just as correct for effects that are really just
// pixel-neighbor math (outline, glow, palette quantization, nearest-
// neighbor upscale). The one effect that genuinely needs a real Canvas
// context (a soft drop shadow, which only applies to drawImage/fill/
// stroke calls, never to raw pixel buffers) uses the `canvas` package —
// see addDropShadowCanvas below.
import { PNG } from 'pngjs';
import { createCanvas, Image } from 'canvas';
import { readFileSync, writeFileSync } from 'fs';

// ---------- I/O ----------

export function readPNG(path) {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: Buffer.from(png.data) };
}

export function writePNG(path, { width, height, data }) {
  const png = new PNG({ width, height });
  data.copy(png.data);
  writeFileSync(path, PNG.sync.write(png));
}

function alphaAt(data, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  return data[(width * y + x) * 4 + 3];
}

// ---------- Outline generation ----------
// Programmatically scans neighboring alpha pixels and paints a clean
// 1px (or thicker) high-contrast border around the sprite's own
// silhouette — every transparent pixel adjacent to an opaque one gets
// the outline color, without ever touching pixels that are already
// opaque (so it never eats into the sprite's own art).
export function addOutline({ width, height, data }, { color = [0, 0, 0, 255], thickness = 1, alphaThreshold = 32 } = {}) {
  const src = Buffer.from(data);
  const out = Buffer.from(data);
  const [r, g, b, a] = color;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) * 4;
      if (src[idx + 3] >= alphaThreshold) continue; // already opaque — leave the real art alone
      let touchesOpaque = false;
      for (let dy = -thickness; dy <= thickness && !touchesOpaque; dy++) {
        for (let dx = -thickness; dx <= thickness; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (alphaAt(src, width, height, x + dx, y + dy) >= alphaThreshold) {
            touchesOpaque = true;
            break;
          }
        }
      }
      if (touchesOpaque) {
        out[idx] = r;
        out[idx + 1] = g;
        out[idx + 2] = b;
        out[idx + 3] = a;
      }
    }
  }
  return { width, height, data: out };
}

// ---------- Glow ----------
// A soft radial falloff painted BEHIND the existing sprite content
// (never overwrites an already-opaque pixel) — "dynamic inner/outer
// glow" for a magical/highlighted look. distanceToOpaque is the cheap
// brute-force version (fine at sprite-sheet resolutions); falls off
// linearly from `intensity` at distance 0 to 0 at `radius`.
export function addGlow({ width, height, data }, { color = [255, 255, 255], radius = 4, intensity = 0.6 } = {}) {
  const src = Buffer.from(data);
  const out = Buffer.from(data);
  const [r, g, b] = color;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) * 4;
      if (src[idx + 3] >= 200) continue; // already solid — the glow sits behind it, not on top
      let minDist = Infinity;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > radius || dist >= minDist) continue;
          if (alphaAt(src, width, height, x + dx, y + dy) >= 200) minDist = dist;
        }
      }
      if (minDist === Infinity) continue;
      const glowAlpha = Math.round(255 * intensity * (1 - minDist / radius));
      // Blend with whatever's already there (usually fully transparent,
      // but respects a softer existing pixel if one's present).
      const existingAlpha = out[idx + 3];
      const blended = Math.max(existingAlpha, glowAlpha);
      if (blended > existingAlpha) {
        out[idx] = r;
        out[idx + 1] = g;
        out[idx + 2] = b;
        out[idx + 3] = blended;
      }
    }
  }
  return { width, height, data: out };
}

// ---------- Palette quantization ----------
// Snaps every opaque pixel's RGB to the nearest entry (squared Euclidean
// distance) in a fixed palette — unifies a sprite's own aesthetic onto a
// shared retro palette instead of whatever arbitrary colors the
// generator script happened to hand-pick.
export function quantizeToPalette({ width, height, data }, palette, { alphaThreshold = 32 } = {}) {
  const out = Buffer.from(data);
  const paletteRgb = palette.map((hex) => [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff]);

  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] < alphaThreshold) continue;
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    let best = paletteRgb[0];
    let bestDist = Infinity;
    for (const [pr, pg, pb] of paletteRgb) {
      const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = [pr, pg, pb];
      }
    }
    out[i] = best[0];
    out[i + 1] = best[1];
    out[i + 2] = best[2];
  }
  return { width, height, data: out };
}

// ---------- Crisp nearest-neighbor upscale ----------
// Every gen-*.mjs script already draws at its final pixel resolution
// (each "big pixel" cell is a solid block of CELL x CELL real pixels),
// so there's no runtime scaling blur to fix during generation itself —
// this is for the OTHER case: baking an existing sprite up to a higher
// base resolution (e.g. for item 10's zoom-in), where naive canvas
// scaling would blur pixel-art edges unless imageSmoothingEnabled is
// explicitly turned off. Implemented as a real canvas draw (not just a
// manual pixel repeat) so it exercises the actual "turn off anti-
// aliasing on the context" technique the ask specifically named.
export function upscaleNearestNeighbor({ width, height, data }, factor) {
  const src = createCanvas(width, height);
  const srcCtx = src.getContext('2d');
  const imageData = srcCtx.createImageData(width, height);
  data.copy(imageData.data);
  srcCtx.putImageData(imageData, 0, 0);

  const dst = createCanvas(width * factor, height * factor);
  const dstCtx = dst.getContext('2d');
  dstCtx.imageSmoothingEnabled = false;
  dstCtx.drawImage(src, 0, 0, width * factor, height * factor);

  const out = dstCtx.getImageData(0, 0, width * factor, height * factor);
  return { width: width * factor, height: height * factor, data: Buffer.from(out.data) };
}

// ---------- Drop shadow (the one effect that genuinely needs a real
// Canvas context — shadows only apply to drawImage/fill/stroke calls,
// never to a raw putImageData pixel buffer) ----------
export function addDropShadowCanvas({ width, height, data }, { color = 'rgba(0,0,0,0.55)', blur = 4, offsetX = 3, offsetY = 3, padding = 8 } = {}) {
  // The sprite itself lives on an offscreen canvas first (a plain,
  // shadowless draw target)...
  const spriteCanvas = createCanvas(width, height);
  const spriteCtx = spriteCanvas.getContext('2d');
  const imageData = spriteCtx.createImageData(width, height);
  data.copy(imageData.data);
  spriteCtx.putImageData(imageData, 0, 0);

  // ...then drawn ONTO the final, padded canvas via drawImage, which is
  // the one draw call node-canvas actually applies ctx.shadow* to.
  const outW = width + padding * 2;
  const outH = height + padding * 2;
  const out = createCanvas(outW, outH);
  const outCtx = out.getContext('2d');
  outCtx.imageSmoothingEnabled = false;
  outCtx.shadowColor = color;
  outCtx.shadowBlur = blur;
  outCtx.shadowOffsetX = offsetX;
  outCtx.shadowOffsetY = offsetY;
  outCtx.drawImage(spriteCanvas, padding, padding);
  // A second, shadow-less draw on top — otherwise the shadow's own blur
  // would visibly bleed through the sprite's own semi-transparent edge
  // pixels.
  outCtx.shadowColor = 'rgba(0,0,0,0)';
  outCtx.drawImage(spriteCanvas, padding, padding);

  const outData = outCtx.getImageData(0, 0, outW, outH);
  return { width: outW, height: outH, data: Buffer.from(outData.data) };
}
