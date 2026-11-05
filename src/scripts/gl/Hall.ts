import * as THREE from 'three';
import { FavSky } from './Favourites';
import { pewGeometry, woodTexture } from './furniture';
import { WorkPanels, exhibitSize, type WorkItem, type WorkSpot } from './WorkPanels';

/**
 * Inside the ruin: the chapel nave where the home page content lives. Night, the roof long gone.
 * Nave runs along −Z: entrance at z = +14, hearth at z = −22. Floor at y = 0, walls up to ~7.5 (broken).
 * Lit by moonlight through the open roof, wall torches and the old hearth; old paintings hang along the walls.
 */

export const HALL_ORIGIN = new THREE.Vector3(200, 0, 0);
export const HALL_FOG = new THREE.Color('#0b1018');
export const HALL_FOG_DENSITY = 0.04;

const W = 9, H = 7.5, Z0 = 14, Z1 = -22, L = Z0 - Z1;
const COL_X = 3.3;
const COL_Z = [10, 4.4, -1.2, -6.8, -12.4, -18];
const BAY_Z = [7.2, 1.6, -4, -9.6, -15.2];
const BROKEN_COLS = new Set([3, 8]); // indices into the column list that have fallen

/**
 * Where the work hangs (see WorkPanels, timeline), from the entrance toward the hearth. Up to one exhibit per bay,
 * in runs of two on the same wall (left, left, right, right…): the camera trucks along a wall from one to the next
 * and turns across the nave only once per run, while walking. More than five pieces fall back to two per bay,
 * facing each other across the nave.
 */
export const HALL_WALL_X = W / 2;
export function workSpots(count: number, stacked: boolean): WorkSpot[] {
  const cy = stacked ? 2.65 : 2.55;
  const spread = count <= BAY_Z.length;
  return Array.from({ length: Math.min(count, BAY_Z.length * 2) }, (_, i) => {
    if (spread) {
      const side = Math.floor(i / 2) % 2 ? 1 : -1;
      return { side, z: BAY_Z[i], bay: i, center: new THREE.Vector3(side * (W / 2 - 0.05), cy, BAY_Z[i]) };
    }
    const bay = Math.floor(i / 2), side = i % 2 ? 1 : -1;
    const z = BAY_Z[bay] + (i % 2 ? -0.4 : 0.4);
    return { side, z, bay, center: new THREE.Vector3(side * (W / 2 - 0.05), cy, z) };
  });
}
/** Hall-local z of the bay that holds the poster lightboxes (left wall), the first bay without work; null if none. */
export function posterZ(count: number): number | null {
  const used = count <= BAY_Z.length ? count : Math.ceil(Math.min(count, BAY_Z.length * 2) / 2);
  return used < BAY_Z.length ? BAY_Z[used] : null;
}
/** The lightbox row: its size and the poster set (see the lightboxes in Hall). */
export const LIGHTBOX = { y: 2.78, h: 1.42, w: 5.05, wallX: W / 2 - 0.04 };
/** On phones (stacked) the four lightboxes hang as a 2 × 2 grid: a row of four is too wide for a portrait screen. */
export const LIGHTBOX_GRID = { h: 1.2, rowStep: 1.95 };
/** The whole lightbox group, plates and headline included, for the camera to frame (timeline). */
export const lightboxSize = (stacked: boolean) => (stacked ? { w: 2.25, h: 4.2 } : { w: LIGHTBOX.w, h: 2.5 });

let SPOTS: WorkSpot[] = [];
let SPOT_HALF = 2.4; // half the exhibit's length along the wall
const nearWork = (x: number, z: number, reach = 0) => SPOTS.some((w) => Math.sign(x) === w.side && Math.abs(z - w.z) < SPOT_HALF + reach);

function rand(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement, color = true) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Weathered lime plaster: stains, run-off streaks, patches of exposed brick, moss rising from the floor. */
function plasterTexture(seed: number, brokenTop: boolean) {
  const S = 1024;
  const [c, g] = canvas(S);
  const r = rand(seed);
  g.fillStyle = '#9a947f';
  g.fillRect(0, 0, S, S);
  // broad tonal blotches
  for (let i = 0; i < 90; i++) {
    const x = r() * S, y = r() * S, rad = 40 + r() * 220;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() < 0.55;
    grd.addColorStop(0, dark ? 'rgba(70,66,52,0.22)' : 'rgba(196,188,164,0.22)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // exposed brick where the plaster has fallen
  for (let p = 0; p < 7; p++) {
    const px = r() * S, py = S * (0.2 + r() * 0.55), pw = 90 + r() * 170, ph = 60 + r() * 120;
    g.save();
    g.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.35) {
      const k = 0.65 + r() * 0.45;
      g.lineTo(px + Math.cos(a) * pw * 0.5 * k, py + Math.sin(a) * ph * 0.5 * k);
    }
    g.closePath();
    g.clip();
    g.fillStyle = '#3e3229';
    g.fillRect(px - pw, py - ph, pw * 2, ph * 2);
    for (let y = py - ph, row = 0; y < py + ph; y += 18, row++)
      for (let x = px - pw - (row % 2) * 20; x < px + pw; x += 40) {
        g.fillStyle = `hsl(${14 + r() * 12}, ${22 + r() * 14}%, ${26 + r() * 12}%)`;
        g.fillRect(x + 1.5, y + 1.5, 37, 15);
      }
    g.restore();
    g.strokeStyle = 'rgba(40,36,28,0.5)';
    g.lineWidth = 3;
    g.stroke();
  }
  // run-off streaks from the top
  for (let i = 0; i < 140; i++) {
    const x = r() * S, len = 80 + r() * 420, w = 2 + r() * 10;
    const grd = g.createLinearGradient(0, 0, 0, len);
    grd.addColorStop(0, `rgba(48,46,36,${0.08 + r() * 0.14})`);
    grd.addColorStop(1, 'rgba(48,46,36,0)');
    g.fillStyle = grd;
    g.fillRect(x, brokenTop ? S * 0.1 : 0, w, len);
  }
  // cracks
  g.strokeStyle = 'rgba(30,28,22,0.55)';
  for (let i = 0; i < 26; i++) {
    let x = r() * S, y = r() * S;
    g.lineWidth = 0.8 + r() * 1.6;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 10; k++) {
      x += (r() - 0.5) * 50;
      y += r() * 40;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // moss rising from the base, and in the upper ledges
  for (let i = 0; i < 9000; i++) {
    const y = S - Math.pow(r(), 2.2) * S * 0.38;
    const x = r() * S;
    g.fillStyle = `hsla(${68 + r() * 22}, ${24 + r() * 20}%, ${16 + r() * 14}%, ${0.1 + r() * 0.22})`;
    g.beginPath();
    g.ellipse(x, y, 1 + r() * 3.5, 0.8 + r() * 2.5, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 500; i++) {
    const y = S * (0.1 + Math.pow(r(), 3) * 0.2);
    g.fillStyle = `hsla(${70 + r() * 20}, 30%, ${18 + r() * 12}%, ${0.15 + r() * 0.3})`;
    g.beginPath();
    g.arc(r() * S, y, 2 + r() * 7, 0, Math.PI * 2);
    g.fill();
  }
  // fine grain
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 18;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // broken, jagged top edge (alpha)
  if (brokenTop) {
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.moveTo(0, 0);
    let x = 0;
    while (x <= S) {
      const dip = r() < 0.12 ? 0.08 + r() * 0.12 : r() * 0.05;
      g.lineTo(x, S * dip);
      x += 14 + r() * 40;
    }
    g.lineTo(S, 0);
    g.closePath();
    g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  return tex(c);
}

/** Fine pitted grain, tiled small as a bump map so close-up stone and plaster keep crisp detail. */
function grainTexture(seed: number) {
  const S = 512;
  const [c, g] = canvas(S);
  const r = rand(seed);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const v = Math.round(60 + r() * 140);
    g.fillStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.5})`;
    g.beginPath();
    g.arc(r() * S, r() * S, 0.6 + Math.pow(r(), 3) * 5, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(30,30,30,${0.3 + r() * 0.4})`;
    g.lineWidth = 0.6 + r();
    let x = r() * S, y = r() * S;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) g.lineTo((x += (r() - 0.5) * 30), (y += (r() - 0.5) * 30));
    g.stroke();
  }
  const t = tex(c, false);
  return t;
}

/** Uneven flagstones, grass and moss in the joints. */
function floorTexture() {
  const S = 1024;
  const [c, g] = canvas(S);
  const r = rand(5);
  g.fillStyle = '#23261a';
  g.fillRect(0, 0, S, S);
  const n = 6, s = S / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x0 = i * s + 4 + r() * 6, y0 = j * s + 4 + r() * 6;
      const x1 = (i + 1) * s - 4 - r() * 6, y1 = (j + 1) * s - 4 - r() * 6;
      const l = 30 + r() * 16;
      g.fillStyle = `hsl(${36 + r() * 10}, ${6 + r() * 6}%, ${l}%)`;
      g.beginPath();
      g.moveTo(x0 + r() * 8, y0);
      g.lineTo(x1, y0 + r() * 8);
      g.lineTo(x1 - r() * 8, y1);
      g.lineTo(x0, y1 - r() * 8);
      g.closePath();
      g.fill();
      for (let k = 0; k < 50; k++) {
        g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.06})`;
        g.fillRect(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 2 + r() * 26, 1 + r() * 3);
      }
      if (r() < 0.25) {
        // a cracked slab
        g.strokeStyle = 'rgba(25,26,18,0.8)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x0 + r() * (x1 - x0), y0);
        g.lineTo(x0 + r() * (x1 - x0), y0 + (y1 - y0) * 0.5);
        g.lineTo(x0 + r() * (x1 - x0), y1);
        g.stroke();
      }
    }
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = `hsla(${70 + r() * 25}, ${30 + r() * 30}%, ${14 + r() * 16}%, ${0.25 + r() * 0.4})`;
    const along = r() < 0.5;
    const x = along ? Math.round(r() * n) * s + (r() - 0.5) * 18 : r() * S;
    const y = along ? r() * S : Math.round(r() * n) * s + (r() - 0.5) * 18;
    g.beginPath();
    g.arc(x, y, 2 + r() * 8, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}

/**
 * Old oil paintings, all on one atlas (4 × 3 cells): landscapes, a sea, a portrait, a still life, the ruin itself.
 * Brush texture, yellowed varnish, craquelure and a dark vignette make them read as old canvases in low light.
 */
const ATLAS_COLS = 4, ATLAS_ROWS = 3, CELL_W = 384, CELL_H = 480;
function paintingAtlas() {
  const c = document.createElement('canvas');
  c.width = CELL_W * ATLAS_COLS;
  c.height = CELL_H * ATLAS_ROWS;
  const ctx = c.getContext('2d')!;
  const kinds = ['landscape', 'portrait', 'sea', 'ruin', 'still', 'landscape', 'portrait', 'sea', 'still', 'ruin', 'landscape', 'portrait'];
  kinds.forEach((kind, i) => {
    const r = rand(101 + i * 17);
    const ox = (i % ATLAS_COLS) * CELL_W, oy = Math.floor(i / ATLAS_COLS) * CELL_H;
    const w = CELL_W, h = CELL_H;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    const grad = (y0: number, y1: number, stops: string[]) => {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      stops.forEach((col, k) => g.addColorStop(k / (stops.length - 1), col));
      return g;
    };
    const ridge = (base: number, amp: number, col: string, freq: number) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, h);
      const p1 = r() * 6, p2 = r() * 6;
      for (let x = 0; x <= w; x += 6) ctx.lineTo(x, base - amp * (0.5 + 0.35 * Math.sin(x * freq + p1) + 0.15 * Math.sin(x * freq * 3.1 + p2)));
      ctx.lineTo(w, h);
      ctx.fill();
    };
    if (kind === 'landscape') {
      const warm = r() > 0.5;
      ctx.fillStyle = grad(0, h * 0.62, warm ? ['#5b6e86', '#c7a36e', '#e8c58a'] : ['#33475e', '#7d8fa0', '#c9c3a6']);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = warm ? 'rgba(255,226,160,0.85)' : 'rgba(240,236,214,0.7)';
      ctx.beginPath();
      ctx.arc(w * (0.25 + r() * 0.5), h * 0.42, 18 + r() * 10, 0, Math.PI * 2);
      ctx.fill();
      ridge(h * 0.58, 90, warm ? '#7c7a86' : '#56616e', 0.012);
      ridge(h * 0.66, 60, warm ? '#4e5a48' : '#3c4a40', 0.02);
      ridge(h * 0.78, 40, warm ? '#3a4128' : '#2a3424', 0.03);
      ctx.fillStyle = grad(h * 0.78, h, ['#4c4a26', '#2a2814']);
      ctx.fillRect(0, h * 0.8, w, h * 0.2);
      // a lone tree
      const tx = w * (0.15 + r() * 0.7);
      ctx.fillStyle = '#1e2214';
      ctx.fillRect(tx - 3, h * 0.66, 6, h * 0.16);
      ctx.beginPath();
      ctx.ellipse(tx, h * 0.62, 30, 38, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'sea') {
      ctx.fillStyle = grad(0, h * 0.55, ['#1f2a3c', '#5d6a7a', '#b7ab8e']);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = grad(h * 0.55, h, ['#3e5562', '#1b2a33', '#0e161c']);
      ctx.fillRect(0, h * 0.55, w, h * 0.45);
      for (let k = 0; k < 160; k++) {
        const y = h * 0.56 + Math.pow(r(), 1.6) * h * 0.44;
        ctx.strokeStyle = `rgba(${200 + r() * 40},${200 + r() * 30},${180},${0.08 + r() * 0.2})`;
        ctx.lineWidth = 1 + (y / h) * 3;
        ctx.beginPath();
        const x = r() * w;
        ctx.moveTo(x, y);
        ctx.lineTo(x + 10 + r() * 40, y + (r() - 0.5) * 2);
        ctx.stroke();
      }
      // a sail on the horizon
      ctx.fillStyle = '#d8cdb0';
      const sx = w * (0.3 + r() * 0.4);
      ctx.beginPath();
      ctx.moveTo(sx, h * 0.47);
      ctx.lineTo(sx + 14, h * 0.545);
      ctx.lineTo(sx - 8, h * 0.545);
      ctx.fill();
    } else if (kind === 'portrait') {
      const bg = ['#2a2418', '#1c2224', '#30201a'][Math.floor(r() * 3)];
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      const lg = ctx.createRadialGradient(w * 0.4, h * 0.3, 10, w * 0.5, h * 0.4, w * 0.8);
      lg.addColorStop(0, 'rgba(120,96,60,0.55)');
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, w, h);
      // shoulders and dark coat
      ctx.fillStyle = ['#15130f', '#2a1a14', '#1a2026'][Math.floor(r() * 3)];
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.98, w * 0.42, h * 0.3, 0, Math.PI, 0);
      ctx.fill();
      // collar
      ctx.fillStyle = '#d9cdb0';
      ctx.beginPath();
      ctx.moveTo(w * 0.42, h * 0.66);
      ctx.lineTo(w * 0.5, h * 0.76);
      ctx.lineTo(w * 0.58, h * 0.66);
      ctx.fill();
      // head, lit from the left
      const fg = ctx.createRadialGradient(w * 0.45, h * 0.4, 6, w * 0.5, h * 0.44, 80);
      fg.addColorStop(0, '#e2b98e');
      fg.addColorStop(0.6, '#a87650');
      fg.addColorStop(1, '#4a2e1c');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.45, 52, 68, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(w * 0.5 - 22, h * 0.52, 44, h * 0.12);
      // hair
      ctx.fillStyle = ['#1a120c', '#3a2a1a', '#5a4630'][Math.floor(r() * 3)];
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.38, 58, 46, 0, Math.PI, 0);
      ctx.fill();
    } else if (kind === 'still') {
      ctx.fillStyle = grad(0, h, ['#20180f', '#2c2216']);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#4a3420';
      ctx.fillRect(0, h * 0.68, w, h * 0.32);
      ctx.fillStyle = '#5e4428';
      ctx.fillRect(0, h * 0.68, w, 6);
      // jug
      const jg = ctx.createLinearGradient(w * 0.3, 0, w * 0.6, 0);
      jg.addColorStop(0, '#c8b48a');
      jg.addColorStop(1, '#4e4230');
      ctx.fillStyle = jg;
      ctx.beginPath();
      ctx.ellipse(w * 0.42, h * 0.56, 52, 66, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(w * 0.42 - 20, h * 0.36, 40, 50);
      // fruit
      for (let k = 0; k < 4; k++) {
        const fx = w * (0.58 + k * 0.08), fy = h * 0.66 - (k % 2) * 10;
        const g = ctx.createRadialGradient(fx - 6, fy - 6, 2, fx, fy, 22);
        g.addColorStop(0, k % 2 ? '#e0a040' : '#c84a28');
        g.addColorStop(1, '#3a1a0c');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(fx, fy, 20, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // the ruin on its hill at dusk
      ctx.fillStyle = grad(0, h * 0.7, ['#283850', '#8a6a5a', '#d8a070']);
      ctx.fillRect(0, 0, w, h);
      ridge(h * 0.62, 40, '#5a5060', 0.015);
      ctx.fillStyle = '#2c3020';
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.quadraticCurveTo(w * 0.5, h * 0.48, w, h);
      ctx.fill();
      ctx.fillStyle = '#2a241e';
      ctx.fillRect(w * 0.3, h * 0.52, w * 0.36, h * 0.12); // nave
      ctx.fillRect(w * 0.6, h * 0.4, w * 0.08, h * 0.24); // tower
      ctx.beginPath();
      ctx.moveTo(w * 0.6, h * 0.4);
      ctx.lineTo(w * 0.64, h * 0.34);
      ctx.lineTo(w * 0.68, h * 0.4);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(w * 0.38, h * 0.52, 18, Math.PI, 0); // dome
      ctx.fill();
      ctx.fillStyle = 'rgba(255,180,90,0.9)';
      ctx.fillRect(w * 0.63, h * 0.45, 5, 8); // lantern in the tower
    }
    // brushwork: short directional strokes of light and dark
    for (let k = 0; k < 900; k++) {
      ctx.strokeStyle = r() > 0.5 ? `rgba(255,240,210,${r() * 0.05})` : `rgba(0,0,0,${r() * 0.07})`;
      ctx.lineWidth = 1 + r() * 3;
      const x = r() * w, y = r() * h, a = (r() - 0.5) * 0.8 + (k % 2 ? 0 : Math.PI / 2) * 0.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * (6 + r() * 14), y + Math.sin(a) * (6 + r() * 14));
      ctx.stroke();
    }
    // yellowed varnish + dark edges
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#d9b77a';
    ctx.fillRect(0, 0, w, h);
    const vg = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.85);
    vg.addColorStop(0, '#ffffff');
    vg.addColorStop(1, '#3a3026');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    // craquelure
    ctx.strokeStyle = 'rgba(20,14,8,0.22)';
    ctx.lineWidth = 0.7;
    for (let k = 0; k < 70; k++) {
      let x = r() * w, y = r() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += (r() - 0.5) * 30;
        y += (r() - 0.5) * 30;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function leafTexture() {
  const S = 64;
  const [c, g] = canvas(S);
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(S / 2, 2);
  g.bezierCurveTo(S - 4, S * 0.25, S - 6, S * 0.7, S / 2, S - 2);
  g.bezierCurveTo(6, S * 0.7, 4, S * 0.25, S / 2, 2);
  g.fill();
  return new THREE.CanvasTexture(c);
}

/** Banner cloth alpha: frayed hem and moth holes. */
function tatterTexture(seed: number) {
  const S = 128;
  const [c, g] = canvas(S);
  const r = rand(seed);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#000';
  g.beginPath();
  g.moveTo(0, S);
  for (let x = 0; x <= S; x += 6) g.lineTo(x, S - 6 - r() * 30 - (Math.abs(x - S / 2) < 20 ? 18 : 0));
  g.lineTo(S, S);
  g.fill();
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.arc(r() * S, S * (0.2 + r() * 0.6), 2 + r() * 6, 0, Math.PI * 2);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}

export class Hall {
  group = new THREE.Group();
  private flicker: { light: THREE.PointLight; base: number; phase: number }[] = [];
  private banners: THREE.Mesh[] = [];
  works: WorkPanels;
  private fireMat: THREE.ShaderMaterial;
  private shaftMat: THREE.ShaderMaterial;
  private skyMat: THREE.ShaderMaterial;
  readonly favs = new FavSky();
  private grassMat: THREE.ShaderMaterial;
  private dust: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private embers: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private flies: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor(items: WorkItem[], isMobile: boolean, stacked: boolean) {
    const bannerColors = items.map((w) => w.color);
    SPOTS = workSpots(items.length, stacked);
    SPOT_HALF = exhibitSize(stacked).w / 2;
    this.group.position.copy(HALL_ORIGIN);
    const zMid = (Z0 + Z1) / 2;
    const r = rand(3);

    /* ---------- night sky over the open roof ---------- */
    this.skyMat = new THREE.ShaderMaterial({
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), u.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), u.x), u.y); }
        float stars(vec2 p, float cell, float th){
          vec2 q = p / cell; vec2 id = floor(q), f = fract(q) - 0.5;
          float s = h(id);
          vec2 o = vec2(h(id + 3.1), h(id + 7.7)) - 0.5;
          return step(th, s) * smoothstep(0.16, 0.0, length(f - o * 0.6)) * (0.65 + 0.35 * sin(uTime * 1.7 + s * 90.0));
        }
        void main(){
          // moon sits straight above the end of the nave, where the camera looks up
          vec2 m = vec2(-1.5, -7.5);
          float d = length(vP - m);
          vec3 col = mix(vec3(0.07, 0.1, 0.19), vec3(0.015, 0.02, 0.045), smoothstep(0.0, 40.0, d));
          // the painted stars stay few, faint and cold: the bright, warm ones are the visitors' (Favourites.ts)
          col += (stars(vP, 0.55, 0.965) * 0.42 + stars(vP + 17.0, 0.25, 0.95) * 0.16) * vec3(0.72, 0.8, 1.0);
          // thin moonlit cloud
          float c = n(vP * 0.12 + vec2(uTime * 0.01, 0.0)) * n(vP * 0.31 - vec2(0.0, uTime * 0.008));
          col = mix(col, vec3(0.32, 0.36, 0.48), smoothstep(0.25, 0.6, c) * 0.35 * exp(-d * 0.06));
          // the moon itself is a model (setMoon); the sky keeps its glow
          col += vec3(0.4, 0.5, 0.75) * exp(-d * 0.45) * 0.55; // halo
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), this.skyMat);
    sky.rotation.x = Math.PI / 2;
    sky.position.set(0, 16, zMid - 6);
    sky.renderOrder = -5;
    this.group.add(sky);
    // visitors' favourite films and series, as stars round the moon (Favourites.ts)
    this.group.add(this.favs.points);

    /* ---------- floor ---------- */
    const floorTex = floorTexture();
    floorTex.repeat.set(W / 4.5, L / 4.5);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.4, L + 2), new THREE.MeshStandardMaterial({ map: floorTex, bumpMap: floorTex, bumpScale: 3, color: '#b4ac9c', roughness: 0.82 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = zMid;
    this.group.add(floor);

    /* ---------- walls: broken-topped plaster ---------- */
    const wallMat = (seed: number, rx: number) => {
      const t = plasterTexture(seed, true);
      t.repeat.set(rx, 1);
      const m = new THREE.MeshStandardMaterial({ map: t, color: '#c4bba8', roughness: 0.92, alphaTest: 0.5, side: THREE.DoubleSide });
      m.bumpScale = 3;
      return m;
    };
    const grain = grainTexture(71);
    grain.repeat.set(L / 1.6, H / 1.6);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(L, H), wallMat(11, L / H));
    left.rotation.y = Math.PI / 2;
    left.position.set(-W / 2, H / 2, zMid);
    const right = new THREE.Mesh(new THREE.PlaneGeometry(L, H), wallMat(17, L / H));
    right.rotation.y = -Math.PI / 2;
    right.position.set(W / 2, H / 2, zMid);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H + 1.5), wallMat(23, W / H));
    back.position.set(0, (H + 1.5) / 2, Z1);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat(29, W / H));
    front.rotation.y = Math.PI;
    front.position.set(0, H / 2, Z0 + 1);
    for (const w of [left, right, back, front]) {
      const m = w.material as THREE.MeshStandardMaterial;
      m.bumpMap = grain.clone();
      m.bumpMap.repeat.set(w === left || w === right ? L / 1.6 : W / 1.6, H / 1.6);
    }
    this.group.add(left, right, back, front);

    // what is left of the roof: a few rafters (some fallen) and a stub of boarding at each end
    const timber = new THREE.MeshStandardMaterial({ color: '#3b2a1e', roughness: 1 });
    const rafter = new THREE.BoxGeometry(W + 0.6, 0.28, 0.32);
    [11.5, 8, 3, -2.5, -8.5, -14, -19.5].forEach((z, i) => {
      if (i === 3 || i === 5) return; // gone (the open stretch the camera looks up through at the end)
      const b = new THREE.Mesh(rafter, timber);
      b.position.set(0, H - 0.3, z);
      if (i === 4) {
        // snapped, leaning against the left wall with its foot among the pews (clear of the camera's walk)
        b.scale.x = 0.62;
        b.position.set(-3.05, 2.6, z);
        b.rotation.z = -1.1;
      }
      if (i === 2) b.rotation.z = 0.04;
      this.group.add(b);
    });
    for (const [z, len] of [[Z0 - 1.2, 3.4], [Z1 + 1.6, 3.6]] as const) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.12, len), timber);
      roof.position.set(0, H + 0.05, z);
      this.group.add(roof);
    }

    /* ---------- columns (two fallen) + arches ---------- */
    const colTex = plasterTexture(41, false);
    colTex.repeat.set(1, 1);
    const colMat = new THREE.MeshStandardMaterial({ map: colTex, bumpMap: colTex, bumpScale: 1.6, color: '#bdb5a2', roughness: 0.92 });
    const trimMat = new THREE.MeshStandardMaterial({ map: colTex, bumpMap: colTex, bumpScale: 1.6, color: '#9a927f', roughness: 0.92 });
    const colGeo = new THREE.CylinderGeometry(0.3, 0.34, 1, 18);
    colGeo.translate(0, 0.5, 0);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const cols = new THREE.InstancedMesh(colGeo, colMat, COL_Z.length * 2);
    const bases = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.45, 0.9), trimMat, COL_Z.length * 2);
    const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.85, 0.3, 0.85), trimMat, COL_Z.length * 2);
    const rubbleSpots: [number, number, number][] = [];
    let k = 0;
    for (const z of COL_Z)
      for (const x of [-COL_X, COL_X]) {
        const broken = BROKEN_COLS.has(k);
        const h = broken ? 1.6 + r() * 1.2 : H;
        cols.setMatrixAt(k, m.compose(pos.set(x, 0, z), q.identity(), sc.set(1, h, 1)));
        bases.setMatrixAt(k, m.makeTranslation(x, 0.22, z));
        caps.setMatrixAt(k, broken ? m.makeScale(0, 0, 0) : m.makeTranslation(x, 4.25, z));
        if (broken) for (let i = 0; i < 5; i++) rubbleSpots.push([x + (r() - 0.5) * 2.2, z + (r() - 0.5) * 2.6, 0.18 + r() * 0.3]);
        k++;
      }
    this.group.add(cols, bases, caps);
    // fallen drum segments
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.6, 18), colMat);
    drum.rotation.set(0, 0.5, Math.PI / 2);
    drum.position.set(COL_X - 1.2, 0.3, COL_Z[1] - 1.4);
    const drum2 = drum.clone();
    drum2.position.set(-COL_X + 1.0, 0.3, COL_Z[4] + 1.6);
    drum2.rotation.y = -0.9;
    this.group.add(drum, drum2);

    // transverse arches survive in places; arcades along both sides
    const ribs = new THREE.InstancedMesh(new THREE.TorusGeometry(COL_X, 0.16, 8, 40, Math.PI), trimMat, 4);
    [COL_Z[0], COL_Z[2], COL_Z[3], COL_Z[5]].forEach((z, i) => ribs.setMatrixAt(i, m.makeTranslation(0, 4.4, z)));
    const span = (COL_Z[0] - COL_Z[1]) / 2;
    const arcade = new THREE.InstancedMesh(new THREE.TorusGeometry(span, 0.13, 8, 32, Math.PI), trimMat, BAY_Z.length * 2);
    const rot = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    k = 0;
    for (const z of BAY_Z)
      for (const x of [-COL_X, COL_X]) arcade.setMatrixAt(k++, new THREE.Matrix4().makeTranslation(x, 4.4, z).multiply(rot));
    this.group.add(ribs, arcade);

    /* ---------- rows of old oak pews facing the hearth, a few toppled or missing ---------- */
    {
      const PL = 2.0;
      const geo = pewGeometry(PL);
      const wood = new THREE.MeshStandardMaterial({ map: woodTexture(9, '#5b3f29'), color: '#c2ab92', roughness: 0.62 });
      wood.bumpMap = wood.map;
      wood.bumpScale = 0.8;
      const rows: number[] = [];
      for (let z = 6.4; z > -12; z -= 1.45) rows.push(z);
      const mats: THREE.Matrix4[] = [];
      const tints: THREE.Color[] = [];
      const q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
      rows.forEach((z, i) => {
        for (const side of [-1, 1]) {
          const roll = r();
          if (roll < 0.14) continue; // long gone
          const x = side * (0.85 + PL / 2) + (r() - 0.5) * 0.12;
          if (roll < 0.24 && i > 1) {
            // toppled onto its back
            pos.set(x, 0.4, z + 0.1);
            e.set(Math.PI / 2 - 0.09, (r() - 0.5) * 0.4, (r() - 0.5) * 0.1);
          } else {
            pos.set(x, 0, z);
            e.set(0, (r() - 0.5) * 0.1, 0);
          }
          mats.push(new THREE.Matrix4().compose(pos, q.setFromEuler(e), one));
          tints.push(new THREE.Color().setHSL(0.07 + r() * 0.03, 0.25 + r() * 0.2, 0.62 + r() * 0.25));
        }
      });
      const pewsMesh = new THREE.InstancedMesh(geo, wood, mats.length);
      mats.forEach((mm, i) => {
        pewsMesh.setMatrixAt(i, mm);
        pewsMesh.setColorAt(i, tints[i]);
      });
      this.group.add(pewsMesh);
    }

    /* ---------- a worn runner down the aisle ---------- */
    {
      const [c, g] = canvas(512);
      const rr = rand(61);
      g.fillStyle = '#5c1f19';
      g.fillRect(0, 0, 512, 512);
      // woven border and a repeating lozenge field
      g.fillStyle = '#8a6a3a';
      g.fillRect(18, 0, 14, 512);
      g.fillRect(480, 0, 14, 512);
      g.fillStyle = '#2c1210';
      g.fillRect(36, 0, 6, 512);
      g.fillRect(470, 0, 6, 512);
      g.strokeStyle = 'rgba(176,132,70,0.55)';
      g.lineWidth = 5;
      for (let y = -64; y < 576; y += 128) {
        g.beginPath();
        g.moveTo(256, y);
        g.lineTo(380, y + 64);
        g.lineTo(256, y + 128);
        g.lineTo(132, y + 64);
        g.closePath();
        g.stroke();
      }
      // worn and dusty down the middle, frayed and holed
      for (let i = 0; i < 4000; i++) {
        g.fillStyle = `rgba(${rr() < 0.5 ? '190,160,130' : '20,10,8'},${rr() * 0.12})`;
        const x = 256 + (rr() - 0.5) * 380 * rr();
        g.fillRect(x, rr() * 512, 2 + rr() * 6, 1 + rr() * 3);
      }
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        g.ellipse(rr() * 512, rr() * 512, 6 + rr() * 26, 4 + rr() * 14, rr() * 3, 0, Math.PI * 2);
        g.fill();
      }
      for (let y = 0; y < 512; y += 3) {
        g.fillRect(0, y, 4 + rr() * 12, 2);
        g.fillRect(512 - 4 - rr() * 12, y, 16, 2);
      }
      g.globalCompositeOperation = 'source-over';
      const t = tex(c);
      t.repeat.set(1, 18);
      const runner = new THREE.Mesh(
        new THREE.PlaneGeometry(1.35, 28),
        new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 1.5, color: '#b59a8c', roughness: 1, alphaTest: 0.5 }),
      );
      runner.rotation.x = -Math.PI / 2;
      runner.position.set(0, 0.006, -2.5);
      this.group.add(runner);
    }

    let posterBay: number | null = null;
    /* ---------- old paintings in gilt frames along both walls ---------- */
    {
      const atlas = paintingAtlas();
      const canvasMat = new THREE.MeshStandardMaterial({
        map: atlas,
        emissiveMap: atlas,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 0.16, // picture-lit: they stay readable in the moonlight
        roughness: 0.55,
      });
      const gilt = new THREE.MeshStandardMaterial({ color: '#8a6a34', roughness: 0.42, metalness: 0.45, emissive: new THREE.Color('#2a1c08'), emissiveIntensity: 0.4 });
      const liner = new THREE.MeshStandardMaterial({ color: '#2a2218', roughness: 0.9 });
      const PW = 1.25, PH = 1.56, FW = 0.15;
      // frame: a bevelled moulding round the canvas, plus a dark inner liner
      const outer = new THREE.Shape();
      outer.moveTo(-PW / 2 - FW, -PH / 2 - FW);
      outer.lineTo(PW / 2 + FW, -PH / 2 - FW);
      outer.lineTo(PW / 2 + FW, PH / 2 + FW);
      outer.lineTo(-PW / 2 - FW, PH / 2 + FW);
      const hole = new THREE.Path();
      hole.moveTo(-PW / 2, -PH / 2);
      hole.lineTo(-PW / 2, PH / 2);
      hole.lineTo(PW / 2, PH / 2);
      hole.lineTo(PW / 2, -PH / 2);
      outer.holes.push(hole);
      const frameGeo = new THREE.ExtrudeGeometry(outer, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 1 });
      const linerGeo = new THREE.BoxGeometry(PW + 0.02, PH + 0.02, 0.03);
      linerGeo.translate(0, 0, 0.015);
      const placements: { x: number; y: number; z: number; ry: number; rx: number; rz: number }[] = [];
      // the first bay with no work gets the poster lightboxes on its left wall (below)
      posterBay = posterZ(SPOTS.length);
      for (const z of BAY_Z) {
        for (const side of [-1, 1]) {
          if (nearWork(side, z, -SPOT_HALF + 1.0)) continue; // the work hangs here
          if (z === posterBay && side < 0) continue; // the poster lightboxes hang here
          placements.push({ x: side * (W / 2 - 0.035), y: 3.05, z: z - (side > 0 ? 0.35 : 0), ry: side * -Math.PI / 2, rx: 0, rz: (r() - 0.5) * 0.05 });
        }
      }
      // one has come down and leans against the wall
      const fallen = placements[Math.min(2, placements.length - 1)];
      if (fallen) {
        fallen.y = PH / 2 + FW - 0.02;
        fallen.rx = -0.16;
        fallen.x += fallen.x > 0 ? -0.12 : 0.12;
      }
      placements.forEach((pl, i) => {
        const g = new THREE.Group();
        g.position.set(pl.x, pl.y, pl.z);
        g.rotation.set(0, pl.ry, 0);
        const inner = new THREE.Group();
        inner.rotation.set(pl.rx, 0, pl.rz);
        g.add(inner);
        const frame = new THREE.Mesh(frameGeo, gilt);
        const lin = new THREE.Mesh(linerGeo, liner);
        // canvas: map this plane onto its atlas cell
        const pg = new THREE.PlaneGeometry(PW, PH);
        const cell = i % (ATLAS_COLS * ATLAS_ROWS);
        const cu = (cell % ATLAS_COLS) / ATLAS_COLS, cv = 1 - (Math.floor(cell / ATLAS_COLS) + 1) / ATLAS_ROWS;
        const uv = pg.getAttribute('uv');
        for (let k = 0; k < uv.count; k++) uv.setXY(k, cu + uv.getX(k) / ATLAS_COLS, cv + uv.getY(k) / ATLAS_ROWS);
        const pic = new THREE.Mesh(pg, canvasMat);
        pic.position.z = 0.035;
        inner.add(frame, lin, pic);
        this.group.add(g);
      });
    }

    /* ---------- my favourites: four backlit cinema lightboxes in a row on the left wall, brass plates below ---------- */
    if (posterBay !== null) {
      const loader = new THREE.TextureLoader();
      const caseMat = new THREE.MeshStandardMaterial({ color: '#1b1c1e', roughness: 0.3, metalness: 0.8 });
      const brass = new THREE.MeshStandardMaterial({ color: '#b08a45', roughness: 0.32, metalness: 0.75, emissive: new THREE.Color('#3a2608'), emissiveIntensity: 0.5 });
      const films = [
        { src: '/media/posters/friends.jpg', aspect: 734 / 1100, title: 'Friends', year: '1994' },
        { src: '/media/posters/breaking-bad.jpg', aspect: 734 / 1100, title: 'Breaking Bad', year: '2008' },
        { src: '/media/posters/better-call-saul.jpg', aspect: 776 / 1100, title: 'Better Call Saul', year: '2015' },
        { src: '/media/posters/avengers.jpg', aspect: 734 / 1100, title: 'The Avengers', year: '2012' },
      ];
      const grid = stacked; // phones: 2 × 2
      const cols = grid ? 2 : films.length;
      const H = grid ? LIGHTBOX_GRID.h : LIGHTBOX.h, B = 0.06, D = 0.09, GAP = grid ? 0.22 : 0.24;
      const widths = films.map((f) => H * f.aspect);
      // each row is centred on its own; in the grid the two rows sit half a step above and below the row's centre
      const rowWidth = (r: number) => {
        const ws = widths.slice(r * cols, r * cols + cols);
        return ws.reduce((a, b) => a + b, 0) + ws.length * B * 2 + GAP * (ws.length - 1);
      };
      const rowY = (r: number) => (grid ? (r === 0 ? 1 : -1) * LIGHTBOX_GRID.rowStep / 2 : 0);
      const row = new THREE.Group();
      row.position.set(-LIGHTBOX.wallX, LIGHTBOX.y, posterBay);
      row.rotation.y = Math.PI / 2; // face into the nave from the left wall; local +x runs toward −z
      this.group.add(row);
      // soft spill of the light boxes on the wall round them
      const spill = document.createElement('canvas');
      spill.width = spill.height = 128;
      const sg = spill.getContext('2d')!;
      const grd = sg.createRadialGradient(64, 64, 8, 64, 64, 64);
      grd.addColorStop(0, 'rgba(255,236,210,0.55)');
      grd.addColorStop(1, 'rgba(255,236,210,0)');
      sg.fillStyle = grd;
      sg.fillRect(0, 0, 128, 128);
      const spillMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(spill), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.38 });
      // a sheen across the glass
      const sheen = document.createElement('canvas');
      sheen.width = 64;
      sheen.height = 256;
      const hg = sheen.getContext('2d')!;
      const lin = hg.createLinearGradient(0, 0, 64, 256);
      lin.addColorStop(0, 'rgba(255,255,255,0)');
      lin.addColorStop(0.42, 'rgba(255,255,255,0)');
      lin.addColorStop(0.5, 'rgba(255,255,255,0.16)');
      lin.addColorStop(0.58, 'rgba(255,255,255,0)');
      lin.addColorStop(1, 'rgba(255,255,255,0)');
      hg.fillStyle = lin;
      hg.fillRect(0, 0, 64, 256);
      const glassMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sheen), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      this.plates = [];
      let x = 0;
      films.forEach((f, k) => {
        const r = Math.floor(k / cols);
        if (k % cols === 0) x = -rowWidth(r) / 2;
        const w = widths[k];
        const cx = x + B + w / 2, cy = rowY(r);
        // the case: a slim metal box, its face a frame round the lit poster
        const shell = new THREE.Shape();
        shell.moveTo(-w / 2 - B, -H / 2 - B);
        shell.lineTo(w / 2 + B, -H / 2 - B);
        shell.lineTo(w / 2 + B, H / 2 + B);
        shell.lineTo(-w / 2 - B, H / 2 + B);
        const hole = new THREE.Path();
        hole.moveTo(-w / 2, -H / 2);
        hole.lineTo(-w / 2, H / 2);
        hole.lineTo(w / 2, H / 2);
        hole.lineTo(w / 2, -H / 2);
        shell.holes.push(hole);
        const face = new THREE.Mesh(new THREE.ExtrudeGeometry(shell, { depth: D, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 1 }), caseMat);
        face.position.set(cx, cy, 0);
        const box = new THREE.Mesh(new THREE.BoxGeometry(w + B * 2, H + B * 2, 0.02), caseMat);
        box.position.set(cx, cy, 0.01);
        // the poster, lit from behind: unlit, a touch over white so it glows in the dark nave
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.12, 1.1, 1.06), toneMapped: false });
        loader.load(f.src, (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 8;
          mat.map = t;
          mat.needsUpdate = true;
        });
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, H), mat);
        pic.position.set(cx, cy, D - 0.02);
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, H), glassMat);
        glass.position.set(cx, cy, D + 0.005);
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 2.1, H * 1.7), spillMat);
        glow.position.set(cx, cy, 0.004);
        row.add(glow, box, face, pic, glass);
        // a brass plate under each: the title and the year
        const plateW = Math.min(w, 0.86), plateH = 0.19;
        const pc = document.createElement('canvas');
        pc.width = 512;
        pc.height = Math.round((512 * plateH) / plateW);
        const ptex = new THREE.CanvasTexture(pc);
        ptex.colorSpace = THREE.SRGBColorSpace;
        ptex.anisotropy = 8;
        const plate = new THREE.Mesh(new THREE.BoxGeometry(plateW, plateH, 0.012), [brass, brass, brass, brass, new THREE.MeshBasicMaterial({ map: ptex }), brass]); // enamel face, unlit so it reads in the dark
        plate.position.set(cx, cy - H / 2 - B - 0.2, 0.014);
        row.add(plate);
        this.plates.push({ canvas: pc, tex: ptex, title: f.title, year: f.year });
        x += w + B * 2 + GAP;
      });
      // a headline plate above the row
      const head = document.createElement('canvas');
      head.width = 1024;
      head.height = 96;
      const htex = new THREE.CanvasTexture(head);
      htex.colorSpace = THREE.SRGBColorSpace;
      const headPlate = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.225), new THREE.MeshBasicMaterial({ map: htex, transparent: true, depthWrite: false }));
      headPlate.position.set(0, rowY(0) + H / 2 + B + 0.24, 0.02);
      row.add(headPlate);
      this.plates.push({ canvas: head, tex: htex, title: 'My favourites', year: '', heading: true });
      // the light the boxes throw into the nave
      const spillLight = new THREE.PointLight('#ffe6cc', 4, 6, 1.4);
      spillLight.position.set(-LIGHTBOX.wallX + 0.9, LIGHTBOX.y - 0.2, posterBay);
      this.group.add(spillLight);
      this.paintPlates();
    }

    this.shaftMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#8ea6d8') } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
        void main(){
          float across = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
          float along = smoothstep(1.0, 0.75, vUv.y) * smoothstep(0.0, 0.5, vUv.y);
          float streak = 0.7 + 0.3 * sin(vUv.x * 30.0 + uTime * 0.3) * sin(vUv.x * 11.0 - uTime * 0.17);
          float a = across * along * streak * 0.15;
          gl_FragColor = vec4(uColor * a, a);
        }`,
    });
    const shaft = (start: THREE.Vector3, dir: THREE.Vector3, len: number, width: number) => {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(width, len), this.shaftMat);
      s.position.copy(start).addScaledVector(dir, len / 2);
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
      this.group.add(s);
      const s2 = s.clone();
      s2.rotateY(Math.PI / 2);
      this.group.add(s2);
      const t = start.y / -dir.y;
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.5, width), this.shaftMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(start.x + dir.x * t, 0.012, start.z + dir.z * t);
      this.group.add(pool);
    };
    // moonlight pouring through the open roof
    const roofDir = new THREE.Vector3(0.28, -1, -0.12).normalize();
    for (const [x, z, w] of [[-1.2, 5.5, 2.4], [0.6, -4.5, 3.0], [-0.4, -11, 2.2]] as const) shaft(new THREE.Vector3(x, H + 0.5, z), roofDir, 9.5, w);

    /* ---------- ivy hanging from the broken wall tops, arches and columns ---------- */
    {
      const n = isMobile ? 2400 : 6000;
      const ivy = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshStandardMaterial({ color: '#ffffff', alphaMap: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }),
        n,
      );
      const dummy = new THREE.Object3D();
      const col = new THREE.Color();
      let i = 0;
      const strand = (x: number, y: number, z: number, nx: number, len: number) => {
        let px = x, py = y, pz = z;
        while (len > 0 && i < n) {
          for (let l = 0; l < 3 && i < n; l++) {
            dummy.position.set(px + nx * (0.03 + r() * 0.05) + (r() - 0.5) * 0.12 * (nx === 0 ? 1 : 0), py + (r() - 0.5) * 0.08, pz + (r() - 0.5) * 0.14);
            dummy.rotation.set((r() - 0.5) * 1.2, nx !== 0 ? Math.PI / 2 + (r() - 0.5) * 0.8 : (r() - 0.5) * 0.8, r() * Math.PI * 2);
            dummy.scale.setScalar(0.07 + r() * 0.08);
            dummy.updateMatrix();
            ivy.setMatrixAt(i, dummy.matrix);
            ivy.setColorAt(i, col.setHSL(0.24 + r() * 0.07, 0.35 + r() * 0.2, 0.14 + r() * 0.12));
            i++;
          }
          py -= 0.07;
          pz += (r() - 0.5) * 0.05;
          len -= 0.07;
        }
      };
      // curtains on both side walls, clustered
      for (let c = 0; c < (isMobile ? 26 : 50); c++) {
        const side = r() < 0.5 ? -1 : 1;
        const z = Z1 + 1 + r() * (L - 2);
        if (nearWork(side, z, 0.5)) continue; // keep the exhibits clear
        if (posterBay !== null && Math.abs(z - posterBay) < 2.2) continue; // and the posters
        const top = H * (0.82 + r() * 0.1);
        for (let s = 0; s < 4; s++) strand(side * (W / 2 - 0.01), top - r() * 0.3, z + (r() - 0.5) * 0.9, -side, 1 + r() * (r() < 0.3 ? 5.5 : 2.6));
      }
      // draped over arches and up the columns
      for (const z of COL_Z) {
        for (const x of [-COL_X, COL_X]) if (r() < 0.6) strand(x + (r() - 0.5) * 0.3, 4.3, z + 0.32, 0, 0.6 + r() * 2);
      }
      ivy.count = i;
      ivy.instanceMatrix.needsUpdate = true;
      if (ivy.instanceColor) ivy.instanceColor.needsUpdate = true;
      this.group.add(ivy);
    }

    /* ---------- grass in the floor joints, thickest along the walls ---------- */
    {
      const n = isMobile ? 5000 : 14000;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.25, 0.5, 0, 0.25, 0.5, 0, 0, 1, 0], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 0.5, 1, 0.5, 0.5, 1], 2));
      g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
      this.grassMat = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uFire: { value: new THREE.Vector3(0, 1, Z1 + 1) },
          uFogColor: { value: HALL_FOG.clone() },
          uFogDensity: { value: HALL_FOG_DENSITY },
        },
        vertexShader: /* glsl */ `
          uniform float uTime; varying vec2 vUv; varying vec3 vW; varying float vDepth;
          void main(){
            vUv = uv;
            vec4 w = instanceMatrix * vec4(position, 1.0);
            w.x += sin(uTime * 1.1 + w.z * 1.3) * uv.y * uv.y * 0.04;
            vW = w.xyz;
            vec4 mv = modelViewMatrix * w;
            vDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uFire, uFogColor; uniform float uFogDensity;
          varying vec2 vUv; varying vec3 vW; varying float vDepth;
          void main(){
            vec3 base = mix(vec3(0.025, 0.03, 0.018), vec3(0.15, 0.19, 0.1), vUv.y);
            vec3 moon = vec3(0.35, 0.42, 0.6) * (0.35 + 0.65 * vUv.y);
            float fd = distance(vW, uFire);
            vec3 fire = vec3(1.4, 0.6, 0.2) * exp(-fd * 0.35) * 1.4;
            vec3 col = base * (moon + fire);
            float f = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
            gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
            #include <colorspace_fragment>
          }`,
      });
      const grass = new THREE.InstancedMesh(g, this.grassMat, n);
      const dummy = new THREE.Object3D();
      // tufts of fine blades in the joints, thickest along the walls; the aisle runner and the prints stay clear
      let cx = 0, cz = 0, wall = false;
      for (let i = 0; i < n; i++) {
        if (i % 7 === 0) {
          wall = r() < 0.6;
          cx = wall ? (r() < 0.5 ? -1 : 1) * (W / 2 - Math.pow(r(), 2) * 1.4) : (r() - 0.5) * W * 0.92;
          cz = Z1 + 0.5 + r() * (L - 0.5);
          if (Math.abs(cx) < 0.78 && cz < 11.5 && cz > -16.5) cx = Math.sign(cx || 1) * (0.72 + r() * 0.1); // runner's edge
          if (nearWork(cx, cz, 0) && Math.abs(cx) > W / 2 - 1) cx *= 0.75;
        }
        const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * 0.07;
        dummy.position.set(cx + Math.cos(a) * d, 0, cz + Math.sin(a) * d);
        dummy.rotation.set((r() - 0.5) * 0.7, r() * Math.PI, (r() - 0.5) * 0.7);
        const h = (wall ? 0.14 : 0.06) + r() * (wall ? 0.3 : 0.12);
        dummy.scale.set(0.01 + r() * 0.012, h, 1);
        dummy.updateMatrix();
        grass.setMatrixAt(i, dummy.matrix);
      }
      grass.frustumCulled = false;
      this.group.add(grass);
    }

    /* ---------- rubble ---------- */
    {
      const rock = new THREE.MeshStandardMaterial({ map: colTex, color: '#8f897a', roughness: 1 });
      const spots = [...rubbleSpots];
      for (let i = 0; i < 26; i++) {
        const x = (r() < 0.5 ? -1 : 1) * (W / 2 - 0.3 - r() * 0.8), z = Z1 + 1 + r() * (L - 2), s = 0.12 + r() * 0.3;
        if (!nearWork(x, z, 0.2)) spots.push([x, z, s]);
      }
      const geo = new THREE.DodecahedronGeometry(1, 1);
      const rubble = new THREE.InstancedMesh(geo, rock, spots.length);
      spots.forEach(([x, z, s], i) => {
        rubble.setMatrixAt(i, m.compose(pos.set(x, s * 0.3, z), q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3)), sc.set(s * (0.8 + r() * 0.6), s * 0.6, s)));
      });
      this.group.add(rubble);
    }

    /* ---------- light ---------- */
    this.group.add(new THREE.HemisphereLight('#53658f', '#2a2318', 1.9));
    const moon = new THREE.DirectionalLight('#b4c6ec', 3.0);
    moon.position.set(-3, 12, 4);
    moon.target.position.set(1, 0, -4);
    this.group.add(moon, moon.target);

    const iron = new THREE.MeshStandardMaterial({ color: '#1d1b19', roughness: 0.6, metalness: 0.5 });

    /* ---------- the work, framed on the walls, candle-lit ---------- */
    this.works = new WorkPanels(items.slice(0, SPOTS.length), SPOTS, W / 2, stacked, isMobile);
    this.group.add(this.works.group);

    /* ---------- the old hearth ---------- */
    const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.6, 0.9), trimMat);
    pillarL.position.set(-1.55, 1.3, Z1 + 0.45);
    const pillarR = pillarL.clone();
    pillarR.position.x = 1.55;
    pillarR.scale.y = 0.82; // chipped
    pillarR.position.y = 1.3 * 0.82;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.55, 1.0), trimMat);
    lintel.position.set(0, 2.85, Z1 + 0.5);
    lintel.rotation.z = -0.025;
    const hood = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 0.7), colMat);
    hood.position.set(0, 4.4, Z1 + 0.35);
    this.fireMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), u.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), u.x), u.y); }
        void main(){
          vec2 p = vUv * vec2(4.0, 3.0);
          float f = n(p + vec2(0.0, -uTime * 1.6)) * 0.6 + n(p * 2.1 + vec2(0.0, -uTime * 2.4)) * 0.4;
          float shape = (1.0 - vUv.y) * 1.25 - abs(vUv.x - 0.5) * 0.9;
          float fire = smoothstep(0.25, 0.75, f * shape);
          vec3 col = mix(vec3(0.05, 0.015, 0.0), vec3(1.6, 0.55, 0.12), fire) + vec3(2.4, 1.3, 0.5) * smoothstep(0.75, 1.0, f * shape);
          col += vec3(0.25, 0.06, 0.01) * smoothstep(0.35, 0.0, vUv.y);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const fire = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.3), this.fireMat);
    fire.position.set(0, 1.15, Z1 + 0.05);
    const fireLight = new THREE.PointLight('#ff7a32', 20, 16, 1.5);
    fireLight.position.set(0, 1.2, Z1 + 1.4);
    this.flicker.push({ light: fireLight, base: 20, phase: 1.3 });
    this.group.add(pillarL, pillarR, lintel, hood, fire, fireLight);

    /* ---------- banners (one per project), faded and frayed ---------- */
    bannerColors.slice(0, 8).forEach((color, i) => {
      const side = i % 2 ? 1 : -1;
      const z = COL_Z[Math.floor(i / 2) + 1] ?? COL_Z[COL_Z.length - 1];
      const geo = new THREE.PlaneGeometry(1.0, 2.6, 1, 8);
      geo.translate(0, -1.3, 0);
      const faded = new THREE.Color(color).lerp(new THREE.Color('#6e6458'), 0.25);
      const banner = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: faded, roughness: 0.95, side: THREE.DoubleSide, emissive: faded, emissiveIntensity: 0.05, alphaMap: tatterTexture(i + 7), alphaTest: 0.5 }),
      );
      banner.position.set(side * (COL_X - 0.36), 5.8, z);
      banner.rotation.y = side * -Math.PI / 2;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), iron);
      rod.rotation.z = Math.PI / 2;
      banner.add(rod);
      this.group.add(banner);
      this.banners.push(banner);
    });

    /* ---------- motes in the moonlight, embers, fireflies ---------- */
    const nd = isMobile ? 260 : 700;
    const dp = new Float32Array(nd * 3);
    for (let i = 0; i < nd; i++) dp.set([-4 + r() * 8, r() * 7, Z1 + 2 + r() * (L - 4)], i * 3);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.dust = new THREE.Points(
      dg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
        vertexShader: /* glsl */ `
          uniform float uTime, uScale; varying float vA;
          void main(){
            vec3 p = position;
            p.y = mod(p.y + uTime * 0.05, 7.0);
            p.x += sin(uTime * 0.2 + position.z) * 0.2;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vA = 0.5 + 0.5 * sin(uTime + position.x * 10.0);
            gl_PointSize = 2.2 * uScale / max(-mv.z, 0.5) * 3.0;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA * 0.5; gl_FragColor = vec4(vec3(0.75, 0.82, 1.0) * a, a); }`,
      }),
    );
    this.group.add(this.dust);

    const ne = isMobile ? 60 : 140;
    const ep = new Float32Array(ne * 3);
    for (let i = 0; i < ne; i++) ep.set([(r() - 0.5) * 2.2, r() * 5, Z1 + 0.6 + r() * 1.2], i * 3);
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
    this.embers = new THREE.Points(
      eg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
        vertexShader: /* glsl */ `
          uniform float uTime, uScale; varying float vA;
          void main(){
            vec3 p = position;
            float t = mod(p.y + uTime * (0.4 + fract(position.x * 7.0) * 0.5), 5.0);
            p.y = t + 0.4;
            p.x += sin(uTime * 1.5 + position.z * 9.0) * 0.25 * t * 0.3;
            p.z += t * 0.35;
            vA = smoothstep(5.0, 1.0, t);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = 3.0 * uScale / max(-mv.z, 0.5) * 3.0;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(2.0, 0.8, 0.25) * a, a); }`,
      }),
    );
    this.group.add(this.embers);

    const nf = isMobile ? 40 : 90;
    const fp = new Float32Array(nf * 3);
    const fr = new Float32Array(nf);
    for (let i = 0; i < nf; i++) {
      fp.set([(r() - 0.5) * (W - 1), 0.2 + r() * 2.2, Z1 + 2 + r() * (L - 3)], i * 3);
      fr[i] = r();
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    fg.setAttribute('aRand', new THREE.BufferAttribute(fr, 1));
    this.flies = new THREE.Points(
      fg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
        vertexShader: /* glsl */ `
          attribute float aRand; uniform float uTime, uScale; varying float vA;
          void main(){
            vec3 p = position;
            p.x += sin(uTime * 0.4 + aRand * 20.0) * 0.4;
            p.y += sin(uTime * 0.6 + aRand * 13.0) * 0.2;
            p.z += cos(uTime * 0.35 + aRand * 17.0) * 0.4;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vA = pow(0.5 + 0.5 * sin(uTime * (1.2 + aRand * 1.5) + aRand * 40.0), 3.0);
            gl_PointSize = (5.0 + aRand * 4.0) * uScale / max(-mv.z, 0.5) * 3.0;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main(){ float d = length(gl_PointCoord - 0.5); float a = (smoothstep(0.5, 0.0, d) * 0.5 + smoothstep(0.12, 0.0, d)) * vA; gl_FragColor = vec4(vec3(1.0, 0.8, 0.42) * a * 1.6, a); }`,
      }),
    );
    this.group.add(this.flies);
    this.group.visible = false;
  }

  private plates: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; title: string; year: string; heading?: boolean }[] = [];
  /** Engrave the lightbox plates once the web fonts are in. */
  private async paintPlates() {
    try {
      await Promise.all([document.fonts.load("400 40px 'Season Sans'"), document.fonts.load("300 40px 'Season Mix'")]);
    } catch {}
    for (const p of this.plates) {
      const g = p.canvas.getContext('2d')!;
      const { width: w, height: h } = p.canvas;
      g.clearRect(0, 0, w, h);
      if (p.heading) {
        g.fillStyle = 'rgba(231, 227, 220, 0.82)';
        g.font = "300 64px 'Season Mix', Georgia, serif";
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(p.title, w / 2, h / 2 + 4);
      } else {
        // black enamel inside a thin brass edge: title, and the year under it
        g.fillStyle = '#b08a45';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#16130f';
        g.fillRect(6, 6, w - 12, h - 12);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        let size = 44;
        g.font = `400 ${size}px 'Season Sans', Arial, sans-serif`;
        while (g.measureText(p.title).width > w - 60 && size > 24) g.font = `400 ${--size}px 'Season Sans', Arial, sans-serif`;
        g.fillStyle = 'rgba(240, 232, 218, 0.94)';
        g.fillText(p.title, w / 2, h * 0.4);
        g.font = "300 30px 'Season Sans', Arial, sans-serif";
        g.fillStyle = 'rgba(214, 178, 110, 0.95)';
        g.fillText(p.year, w / 2, h * 0.74);
      }
      p.tex.needsUpdate = true;
    }
  }

  private moon?: THREE.Object3D;
  /** The moon over the open roof (public/moon.glb), where the sky shader's glow is centred and the walk ends looking up. */
  setMoon(gltf: { scene: THREE.Object3D }) {
    const src = gltf.scene.getObjectByProperty('type', 'Mesh') as THREE.Mesh | undefined;
    if (!src) return;
    const geo = src.geometry.clone();
    geo.center();
    geo.computeBoundingSphere();
    const map = (src.material as THREE.MeshStandardMaterial).map;
    // unlit and out of the fog: it is the light source of this set, not something the set lights
    const mat = new THREE.MeshBasicMaterial({ map, color: new THREE.Color(1.45, 1.47, 1.55), fog: false });
    const moon = new THREE.Mesh(geo, mat);
    moon.scale.setScalar(1.0 / (geo.boundingSphere?.radius || 1));
    moon.position.set(-1.5, 15.2, -17.5);
    moon.rotation.set(0.4, 2.2, 0.15);
    moon.renderOrder = -4;
    this.group.add(moon);
    this.moon = moon;
  }

  update(time: number, dt: number, viewportH: number) {
    if (!this.group.visible) return;
    if (this.moon) this.moon.rotation.y = 2.2 + time * 0.01;
    this.works.update(time, dt);
    for (const f of this.flicker) {
      f.light.intensity = f.base * (0.85 + 0.1 * Math.sin(time * 9 + f.phase) + 0.05 * Math.sin(time * 23 + f.phase * 2));
    }
    this.banners.forEach((b, i) => (b.rotation.z = Math.sin(time * 0.6 + i) * 0.03));
    this.fireMat.uniforms.uTime.value = time;
    this.shaftMat.uniforms.uTime.value = time;
    this.skyMat.uniforms.uTime.value = time;
    this.favs.update(time, viewportH);
    this.grassMat.uniforms.uTime.value = time;
    const s = viewportH / 900;
    for (const p of [this.dust, this.embers, this.flies]) {
      p.material.uniforms.uTime.value = time;
      p.material.uniforms.uScale.value = s;
    }
  }
}
