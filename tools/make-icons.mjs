// Genera los iconos PWA de Picas y Fijas (marca "El Toro") sin dependencias.
// Rasterizador propio: aplana curvas Bezier, rellena por scanline (nonzero)
// y traza con capsulas, todo supermuestreado y volcado a PNG con zlib.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SS = 3; // supermuestreo por eje

/* ---------- parser de paths SVG (M/m C/c S/s L/l Z) ---------- */
function parsePath(d) {
  const toks = d.match(/[MmCcSsLlZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  const subs = [];
  let pts = null, i = 0, cx = 0, cy = 0, sx = 0, sy = 0, px = 0, py = 0, cmd = '';
  const num = () => parseFloat(toks[i++]);
  const bez = (x1, y1, x2, y2, x, y) => {
    const N = 28;
    for (let k = 1; k <= N; k++) {
      const t = k / N, u = 1 - t;
      pts.push([
        u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
        u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
      ]);
    }
    px = x2; py = y2; cx = x; cy = y;
  };
  while (i < toks.length) {
    if (/[MmCcSsLlZz]/.test(toks[i])) cmd = toks[i++];
    if (cmd === 'M' || cmd === 'm') {
      const rel = cmd === 'm';
      cx = (rel ? cx : 0) + num(); cy = (rel ? cy : 0) + num();
      sx = cx; sy = cy; px = cx; py = cy;
      pts = [[cx, cy]]; subs.push(pts);
      cmd = rel ? 'l' : 'L';
    } else if (cmd === 'L' || cmd === 'l') {
      const rel = cmd === 'l';
      cx = (rel ? cx : 0) + num(); cy = (rel ? cy : 0) + num();
      px = cx; py = cy; pts.push([cx, cy]);
    } else if (cmd === 'C' || cmd === 'c') {
      const rel = cmd === 'c', ox = rel ? cx : 0, oy = rel ? cy : 0;
      bez(ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num());
    } else if (cmd === 'S' || cmd === 's') {
      const rel = cmd === 's', ox = rel ? cx : 0, oy = rel ? cy : 0;
      bez(2 * cx - px, 2 * cy - py, ox + num(), oy + num(), ox + num(), oy + num());
    } else if (cmd === 'Z' || cmd === 'z') {
      pts.push([sx, sy]); cx = sx; cy = sy; px = cx; py = cy;
    } else i++;
  }
  return subs.filter((s) => s.length > 1);
}

/* ---------- lienzo ---------- */
class Canvas {
  constructor(size) {
    this.size = size;
    this.W = size * SS;
    this.buf = new Float64Array(this.W * this.W * 3);
  }
  clear([r, g, b]) {
    for (let i = 0; i < this.W * this.W; i++) {
      this.buf[i * 3] = r; this.buf[i * 3 + 1] = g; this.buf[i * 3 + 2] = b;
    }
  }
  px(x, y, [r, g, b]) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.W) return;
    const i = (y * this.W + x) * 3;
    this.buf[i] = r; this.buf[i + 1] = g; this.buf[i + 2] = b;
  }
  fill(subs, color) {
    const edges = [];
    let minY = Infinity, maxY = -Infinity;
    for (const s of subs) {
      for (let k = 0; k < s.length - 1; k++) {
        const [x0, y0] = s[k], [x1, y1] = s[k + 1];
        if (y0 === y1) continue;
        edges.push([x0, y0, x1, y1]);
        minY = Math.min(minY, y0, y1); maxY = Math.max(maxY, y0, y1);
      }
      const [ax, ay] = s[s.length - 1], [bx, by] = s[0];
      if (ay !== by) { edges.push([ax, ay, bx, by]); minY = Math.min(minY, ay, by); maxY = Math.max(maxY, ay, by); }
    }
    const y0i = Math.max(0, Math.floor(minY)), y1i = Math.min(this.W - 1, Math.ceil(maxY));
    for (let y = y0i; y <= y1i; y++) {
      const yc = y + 0.5, xs = [];
      for (const [ax, ay, bx, by] of edges) {
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) {
          xs.push([ax + ((yc - ay) / (by - ay)) * (bx - ax), by > ay ? 1 : -1]);
        }
      }
      if (!xs.length) continue;
      xs.sort((a, b) => a[0] - b[0]);
      let w = 0;
      for (let k = 0; k < xs.length - 1; k++) {
        w += xs[k][1];
        if (w === 0) continue;
        const a = Math.max(0, Math.ceil(xs[k][0] - 0.5)), b = Math.min(this.W - 1, Math.floor(xs[k + 1][0] - 0.5));
        for (let x = a; x <= b; x++) this.px(x, y, color);
      }
    }
  }
  stroke(subs, width, color) {
    const r = width / 2, r2 = r * r;
    for (const s of subs) {
      for (let k = 0; k < s.length - 1; k++) {
        const [ax, ay] = s[k], [bx, by] = s[k + 1];
        const lo = [Math.floor(Math.min(ax, bx) - r), Math.floor(Math.min(ay, by) - r)];
        const hi = [Math.ceil(Math.max(ax, bx) + r), Math.ceil(Math.max(ay, by) + r)];
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
        for (let y = Math.max(0, lo[1]); y <= Math.min(this.W - 1, hi[1]); y++) {
          for (let x = Math.max(0, lo[0]); x <= Math.min(this.W - 1, hi[0]); x++) {
            const qx = x + 0.5 - ax, qy = y + 0.5 - ay;
            let t = len2 ? (qx * dx + qy * dy) / len2 : 0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const ex = qx - t * dx, ey = qy - t * dy;
            if (ex * ex + ey * ey <= r2) this.px(x, y, color);
          }
        }
      }
    }
  }
  circle(cx, cy, r, color) {
    const r2 = r * r;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(this.W - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(this.W - 1, Math.ceil(cx + r)); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) this.px(x, y, color);
      }
    }
  }
  toPNG() {
    const n = this.size, raw = Buffer.alloc(n * (n * 3 + 1));
    for (let y = 0; y < n; y++) {
      raw[y * (n * 3 + 1)] = 0;
      for (let x = 0; x < n; x++) {
        let r = 0, g = 0, b = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const i = ((y * SS + sy) * this.W + (x * SS + sx)) * 3;
            r += this.buf[i]; g += this.buf[i + 1]; b += this.buf[i + 2];
          }
        }
        const m = SS * SS, o = y * (n * 3 + 1) + 1 + x * 3;
        raw[o] = Math.round(r / m); raw[o + 1] = Math.round(g / m); raw[o + 2] = Math.round(b / m);
      }
    }
    const chunk = (type, data) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
      const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
      return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4);
    ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

let TBL = null;
function crc32(buf) {
  if (!TBL) {
    TBL = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TBL[i] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TBL[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

/* ---------- la marca ---------- */
const BOARD = [0x12, 0x10, 0x0c];
const CREAM = [0xf5, 0xef, 0xe3];

const HL = 'M19 21C12.5 16.5 4.5 11 -2 5c0 9.5 4.5 18.5 12.5 25C13 27.5 16 24 19 21Z';
const HR = 'M69 21C75.5 16.5 83.5 11 90 5c0 9.5-4.5 18.5-12.5 25C75 27.5 72 24 69 21Z';
const HEAD = 'M15 32c0-11.6 13-20.6 29-20.6s29 9 29 20.6c0 7-1.6 12.8-4.8 17.6C64.6 57 55.4 61.6 44 61.6S23.4 57 19.8 49.6C16.6 44.8 15 39 15 32Z';
const TUFT = 'M37.6 12.4c1.4-4 3.5-6 6.4-6s5 2 6.4 6';
const MUZ = 'M32.5 54c0-3.4 5.2-5.6 11.5-5.6s11.5 2.2 11.5 5.6-5.2 5.6-11.5 5.6-11.5-2.2-11.5-5.6Z';

function draw(size, frac) {
  const c = new Canvas(size);
  c.clear(BOARD);
  const s = (size * frac / 92) * SS;
  const tx = (size * SS) / 2 - 44 * s, ty = (size * SS) / 2 - 33.5 * s;
  const T = (subs) => subs.map((p) => p.map(([x, y]) => [x * s + tx, y * s + ty]));
  for (const d of [HL, HR, HEAD]) {
    const p = T(parsePath(d));
    c.fill(p, CREAM);
    c.stroke(p, 2.6 * s, BOARD);
  }
  c.stroke(T(parsePath(TUFT)), 2.4 * s, BOARD);
  c.stroke(T(parsePath(MUZ)), 2.4 * s, BOARD);
  for (const [ex, ey, er] of [[32, 34, 3.4], [56, 34, 3.4], [40, 53.6, 1.8], [48, 53.6, 1.8]]) {
    c.circle(ex * s + tx, ey * s + ty, er * s, BOARD);
  }
  return c.toPNG();
}

const out = process.argv[2] || 'public';
for (const [name, size, frac] of [
  ['icon-192.png', 192, 0.78],
  ['icon-512.png', 512, 0.78],
  ['icon-maskable-512.png', 512, 0.58],
  ['apple-touch-icon.png', 180, 0.78],
]) {
  const png = draw(size, frac);
  writeFileSync(`${out}/${name}`, png);
  console.log(name, png.length, 'bytes');
}
