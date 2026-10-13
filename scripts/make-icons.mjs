// Generates the PWA icons (PNG) without any image libraries: a green rounded square with a wave.
import fs from 'node:fs';
import zlib from 'node:zlib';

const BG = [47, 107, 85];
const FG = [245, 243, 238];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// "∿": one full sine wave across the middle, in a 32-unit design space
const pts = [];
for (let i = 0; i <= 400; i++) {
  const t = i / 400;
  pts.push([8 + 16 * t, 16 - 6 * Math.sin(2 * Math.PI * t)]);
}

function distToPolyline(px, py) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
    const dx = x2 - x1, dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)));
  }
  return best;
}

function icon(size, { maskable = false, rounded = true } = {}) {
  const s = 32 / size;
  const scale = maskable ? 0.78 : 1; // keep the mark inside the maskable safe zone
  return png(size, (x, y) => {
    const u = x * s, v = y * s;
    const r = rounded && !maskable ? 7 : 0;
    const inside = (() => {
      const cx = Math.max(r, Math.min(32 - r, u)), cy = Math.max(r, Math.min(32 - r, v));
      return Math.hypot(u - cx, v - cy) <= r || r === 0;
    })();
    if (!inside) return [0, 0, 0, 0];
    const wu = 16 + (u - 16) / scale, wv = 16 + (v - 16) / scale;
    const d = distToPolyline(wu, wv);
    const w = 1.45; // half stroke width
    const k = Math.max(0, Math.min(1, (w - d) / (s * 1.2) + 0.5));
    const mix = (a, b) => Math.round(a + (b - a) * k);
    return [mix(BG[0], FG[0]), mix(BG[1], FG[1]), mix(BG[2], FG[2]), 255];
  });
}

fs.writeFileSync('public/icon-192.png', icon(192));
fs.writeFileSync('public/icon-512.png', icon(512));
fs.writeFileSync('public/icon-maskable-512.png', icon(512, { maskable: true }));
fs.writeFileSync('public/apple-touch-icon.png', icon(180, { rounded: false }));
console.log('icons written');
