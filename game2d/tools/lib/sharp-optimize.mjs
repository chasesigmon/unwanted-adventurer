// Sharp-based final compression pass — every gen-*.mjs script writes a
// PNG via pngjs with no compression tuning at all (PNG.sync.write's own
// default). Sharp re-encodes the SAME pixels through libvips with real
// palette-mode PNG optimization (a much smaller color table + max
// compression effort), shrinking file size with zero visual difference
// for these flat, low-color-count sprite sheets. Pure post-processing —
// never used for drawing, only for the final "write the smallest
// correct file" step.
import sharp from 'sharp';
import { statSync } from 'fs';

// `palette: true` lets libvips pick an optimal (<=256-color) palette
// automatically — ideal here since every sprite in this project is
// already a small, flat "big pixel" palette to begin with, so this is
// lossless in practice, not just "good enough."
export async function optimizePNG(path, { paletteColors = 256 } = {}) {
  const before = statSync(path).size;
  const buffer = await sharp(path)
    .png({ palette: true, colors: paletteColors, compressionLevel: 9, effort: 10 })
    .toBuffer();
  const { writeFileSync } = await import('fs');
  writeFileSync(path, buffer);
  const after = statSync(path).size;
  return { before, after, savedBytes: before - after, savedPercent: before > 0 ? Math.round(((before - after) / before) * 100) : 0 };
}
