import * as THREE from 'three';

/**
 * The work, hung on the hall walls as a gallery: each project is an exhibit, a framed screen showing the work itself
 * (its reel, a still, or its mark) and a printed placard beside it (below it on phones) with what it is and what I
 * did. Exhibits face each other across the nave, two to a bay. Candles light them; the camera stops square on to
 * each (timeline.ts) and clicking one opens its case study (World.click). Only the exhibit in view plays its reel.
 */

export interface WorkMedia {
  type: 'video' | 'image' | 'logo';
  src: string;
  poster?: string;
  bg?: string;
  caption?: string;
}

export interface WorkItem {
  href: string;
  no: string;
  kind: 'fullstack' | '3d';
  client: string;
  title: string;
  category: string;
  year?: number;
  role?: string;
  note?: string;
  summary: string;
  stack: readonly string[];
  metrics: readonly { value: string; label: string }[];
  color: string;
  media?: WorkMedia;
}

export interface WorkSpot {
  /** wall side: −1 left (x < 0), +1 right */
  side: number;
  z: number;
  /** which bay of the nave it hangs in */
  bay: number;
  /** centre of the exhibit, hall-local */
  center: THREE.Vector3;
}

/** Screen (media) size, frame border, placard size and gap; the placard sits right of the frame, or below when stacked. */
const MW = 3.0, MH = 1.6, F = 0.14;
const FW = MW + F * 2, FH = MH + F * 2;
const PW_SIDE = 1.22, GAP_SIDE = 0.2;
const PH_STACK = 1.3, GAP_STACK = 0.12;

/** Overall size of one exhibit on the wall (m). */
export function exhibitSize(stacked: boolean) {
  return stacked ? { w: FW, h: FH + GAP_STACK + PH_STACK } : { w: FW + GAP_SIDE + PW_SIDE, h: FH };
}

function rand(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/* ---------------- type ---------------- */

const INK = '#211b14', MUTE = '#5b5142', ACCENT = '#93391b';
const F_ = {
  // small text on the placards: the text face in sentence case (no tracked monospace capitals anywhere on the site)
  mono: (px: number) => `400 ${Math.round(px * 1.18)}px "Season Sans", "Helvetica Neue", Arial, sans-serif`,
  light: (px: number) => `300 ${px}px "Season Sans", "Helvetica Neue", Arial, sans-serif`,
  body: (px: number) => `400 ${px}px "Season Sans", "Helvetica Neue", Arial, sans-serif`,
  serif: (px: number) => `italic 400 ${px}px "Season Mix", Georgia, serif`,
};
type Ctx = CanvasRenderingContext2D & { letterSpacing?: string };

function spacing(g: Ctx, px: number) {
  if ('letterSpacing' in g) g.letterSpacing = `${px}px`;
}

function wrap(g: Ctx, text: string, maxW: number, maxLines: number, ls = 0) {
  spacing(g, ls);
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  let i = 0;
  for (; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i];
    if (g.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = words[i];
      if (lines.length === maxLines) break;
    } else cur = next;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  else if (i < words.length) {
    // ran out of lines: ellipsis on the last one
    let last = lines[maxLines - 1];
    while (g.measureText(`${last}…`).width > maxW && last.includes(' ')) last = last.slice(0, last.lastIndexOf(' '));
    lines[maxLines - 1] = `${last}…`;
  }
  spacing(g, 0);
  return lines;
}

/** Small text line (formerly spaced capitals): drawn as written, in sentence case, untracked. */
function caps(g: Ctx, text: string, x: number, y: number, _ls = 0) {
  g.fillText(text, x, y);
}

/** Aged paper: warm stock, fibres, foxing, darker toward the edges. */
function paper(g: CanvasRenderingContext2D, W: number, H: number, seed: number) {
  const r = rand(seed);
  g.fillStyle = '#ebe1c8';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    const x = r() * W, y = r() * H, rad = 40 + r() * 200;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, r() < 0.5 ? 'rgba(170,140,90,0.07)' : 'rgba(255,250,235,0.1)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(${120 + r() * 40},${80 + r() * 30},40,${0.05 + r() * 0.14})`;
    g.beginPath();
    g.arc(r() * W, r() * H, 0.8 + r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 900; i++) {
    g.strokeStyle = `rgba(${r() < 0.5 ? '255,255,250' : '90,70,40'},${r() * 0.07})`;
    g.lineWidth = 0.6;
    const x = r() * W, y = r() * H, a = r() * Math.PI;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * (4 + r() * 10), y + Math.sin(a) * (4 + r() * 10));
    g.stroke();
  }
  const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(110,72,30,0.3)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
}

/* ---------------- the placard ---------------- */

const KIND = { fullstack: 'Full-stack', '3d': '3D web' } as const;

function tag(g: Ctx, text: string, x: number, y: number, size: number, color: string) {
  g.font = F_.mono(size);
  const w = g.measureText(text).width;
  const ph = size * 0.55, pv = size * 0.42;
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(x, y - size - pv + 4, w + ph * 2, size + pv * 2, 999);
  g.stroke();
  g.fillStyle = color;
  caps(g, text, x + ph, y + 2, size * 0.12);
  return w + ph * 2;
}

function rule(g: CanvasRenderingContext2D, x: number, y: number, w: number, a = 0.5, h = 2) {
  g.globalAlpha = a;
  g.fillStyle = INK;
  g.fillRect(x, y, w, h);
  g.globalAlpha = 1;
}

/** Portrait placard, hung beside the frame. */
function placardSide(g: Ctx, W: number, H: number, it: WorkItem) {
  const M = 58, CW = W - M * 2;
  let y = 96;
  tag(g, KIND[it.kind], M, y, 22, ACCENT);
  g.fillStyle = MUTE;
  g.font = F_.mono(22);
  g.textAlign = 'right';
  caps(g, `No. ${it.no}`, W - M, y, 3);
  g.textAlign = 'left';

  y += 96;
  g.fillStyle = ACCENT;
  g.font = F_.serif(56);
  wrap(g, it.client, CW, 2).forEach((l) => (g.fillText(l, M - 2, y), (y += 60)));
  y += 4;
  g.fillStyle = INK;
  g.font = F_.light(52);
  wrap(g, it.title, CW, 3).forEach((l) => (g.fillText(l, M - 2, y), (y += 58)));
  g.fillStyle = MUTE;
  g.font = F_.mono(19);
  caps(g, [it.category, it.year].filter(Boolean).join(' · '), M, y + 4, 1.5);
  y += 40;
  rule(g, M, y, CW);
  y += 62;

  // footer from the bottom: call to action, small print, stack
  rule(g, M, H - 112, CW);
  g.fillStyle = ACCENT;
  g.font = F_.mono(23);
  caps(g, 'Open the case study  →', M, H - 62, 2.5);
  let fy = H - 144;
  if (it.note) {
    g.fillStyle = MUTE;
    g.font = F_.mono(17);
    caps(g, it.note, M, fy, 1.5);
    fy -= 34;
  }
  g.fillStyle = INK;
  g.font = F_.mono(18);
  const st = wrap(g, it.stack.slice(0, 6).join(' · '), CW, 2);
  st.reverse().forEach((l) => (caps(g, l, M, fy, 1.5), (fy -= 28)));
  if (it.role) {
    g.fillStyle = MUTE;
    g.font = F_.mono(18);
    caps(g, it.role, M, fy - 8, 1.5);
    fy -= 36;
  }
  const bottom = fy - 24;

  // metrics, then the summary in whatever room is left
  for (const m of it.metrics.slice(0, 3)) {
    if (y + 70 > bottom - 80) break;
    g.fillStyle = m === it.metrics[0] ? ACCENT : INK;
    let size = 50;
    g.font = F_.light(size);
    while (g.measureText(m.value).width > CW * 0.42 && size > 30) g.font = F_.light((size -= 2));
    g.fillText(m.value, M - 2, y);
    g.fillStyle = MUTE;
    g.font = F_.mono(19);
    wrap(g, m.label, CW * 0.54, 2).forEach((l, j) => caps(g, l, M + CW * 0.44, y - 24 + j * 26, 1.2));
    y += 74;
  }
  if (it.metrics.length) y += 12;
  g.fillStyle = '#3a3227';
  g.font = F_.body(33);
  const lines = Math.max(0, Math.floor((bottom - y + 10) / 44));
  if (lines) wrap(g, it.summary, CW, Math.min(lines, 8)).forEach((l) => (g.fillText(l, M, y), (y += 44)));
}

/** Landscape placard, hung below the frame on phones: two columns. */
function placardStacked(g: Ctx, W: number, H: number, it: WorkItem) {
  const M = 52, colA = W * 0.5 - M;
  const xB = W * 0.54, colB = W - xB - M;
  let y = 84;
  tag(g, KIND[it.kind], M, y, 22, ACCENT);
  g.fillStyle = MUTE;
  g.font = F_.mono(20);
  caps(g, [it.category, it.year].filter(Boolean).join(' · '), xB, y, 1.5);
  y += 82;
  g.fillStyle = ACCENT;
  g.font = F_.serif(58);
  g.fillText(wrap(g, it.client, colA, 1)[0] ?? '', M - 2, y);
  y += 64;
  g.fillStyle = INK;
  g.font = F_.light(48);
  wrap(g, it.title, colA, 3).forEach((l) => (g.fillText(l, M - 2, y), (y += 54)));

  let yb = 152;
  g.fillStyle = '#3a3227';
  g.font = F_.body(30);
  wrap(g, it.summary, colB, it.metrics.length ? 4 : 6).forEach((l) => (g.fillText(l, xB, yb), (yb += 40)));
  const ms = it.metrics.slice(0, 3);
  if (ms.length) {
    yb += 34;
    const cw = colB / ms.length;
    ms.forEach((m, k) => {
      g.fillStyle = k === 0 ? ACCENT : INK;
      let size = 40;
      g.font = F_.light(size);
      while (g.measureText(m.value).width > cw - 16 && size > 24) g.font = F_.light((size -= 2));
      g.fillText(m.value, xB + k * cw, yb);
    });
  }
  rule(g, M, H - 92, W - M * 2);
  g.fillStyle = INK;
  g.font = F_.mono(18);
  caps(g, wrap(g, it.stack.slice(0, 5).join(' · '), colA, 1)[0] ?? '', M, H - 46, 1.5);
  g.fillStyle = ACCENT;
  g.font = F_.mono(22);
  g.textAlign = 'right';
  caps(g, 'Open the case study  →', W - M, H - 46, 2.5);
  g.textAlign = 'left';
}

/* ---------------- media ---------------- */

/** Crop a texture to cover the screen's aspect. */
function cover(t: THREE.Texture, w: number, h: number) {
  const a = w / h, s = MW / MH;
  t.repeat.set(1, 1);
  t.offset.set(0, 0);
  if (a > s) (t.repeat.x = s / a), (t.offset.x = (1 - t.repeat.x) / 2);
  else (t.repeat.y = a / s), (t.offset.y = (1 - t.repeat.y) / 2);
}

/** A mark on a coloured ground, with a caption, for work that has no reel yet. */
async function logoCanvas(media: WorkMedia, color: string) {
  const W = 1280, H = Math.round((W * MH) / MW);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')! as Ctx;
  const bg = new THREE.Color(media.bg ?? '#141210');
  const grd = g.createRadialGradient(W * 0.5, H * 0.45, 40, W * 0.5, H * 0.5, W * 0.7);
  grd.addColorStop(0, bg.clone().lerp(new THREE.Color(color), 0.22).getStyle());
  grd.addColorStop(1, bg.getStyle());
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // faint route lines in the accent colour
  const r = rand(5);
  g.strokeStyle = color;
  for (let i = 0; i < 26; i++) {
    g.globalAlpha = 0.05 + r() * 0.12;
    g.lineWidth = 1 + r() * 2;
    const y = r() * H, len = 120 + r() * 520, x = r() * W;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + len, y);
    g.stroke();
  }
  g.globalAlpha = 1;
  const img = new Image();
  img.src = media.src;
  await img.decode().catch(() => undefined);
  if (img.naturalWidth) {
    // logos are usually padded squares: trim to the ink by drawing the middle band large
    const s = Math.min((W * 0.62) / img.naturalWidth, (H * 0.9) / img.naturalHeight) * 1.0;
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    g.globalCompositeOperation = 'lighten'; // marks on a black square: let the ground show through
    g.drawImage(img, (W - w) / 2, (H - h) / 2 - H * 0.04, w, h);
    g.globalCompositeOperation = 'source-over';
  }
  if (media.caption) {
    g.fillStyle = 'rgba(240,232,214,0.75)';
    g.font = F_.mono(26);
    g.textAlign = 'center';
    caps(g, media.caption, W / 2, H - 70, 4);
    g.textAlign = 'left';
  }
  return c;
}

/* ---------------- candles ---------------- */

function flameTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 92, 2, 32, 80, 52);
  grd.addColorStop(0, 'rgba(255,250,235,1)');
  grd.addColorStop(0.25, 'rgba(255,214,140,0.95)');
  grd.addColorStop(0.6, 'rgba(255,140,50,0.45)');
  grd.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(32, 4);
  g.bezierCurveTo(46, 50, 56, 78, 50, 100);
  g.bezierCurveTo(44, 122, 20, 122, 14, 100);
  g.bezierCurveTo(8, 78, 18, 50, 32, 4);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function haloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    grd.addColorStop(t, `rgba(255,${Math.round(190 - 60 * t)},${Math.round(120 - 70 * t)},${(0.42 * Math.exp(-t * 5.5) * (1 - t)).toFixed(4)})`);
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Frame moulding: an outer border with a bevel, as an extruded ring. */
function ring(iw: number, ih: number, border: number, depth: number, bevel: number) {
  const s = new THREE.Shape();
  const ow = iw / 2 + border, oh = ih / 2 + border;
  s.moveTo(-ow, -oh);
  s.lineTo(ow, -oh);
  s.lineTo(ow, oh);
  s.lineTo(-ow, oh);
  const h = new THREE.Path();
  h.moveTo(-iw / 2, -ih / 2);
  h.lineTo(-iw / 2, ih / 2);
  h.lineTo(iw / 2, ih / 2);
  h.lineTo(iw / 2, -ih / 2);
  s.holes.push(h);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 1 });
}

/* ---------------- the set ---------------- */

interface Exhibit {
  item: WorkItem;
  pick: THREE.Mesh;
  screen: THREE.MeshBasicMaterial;
  placard: THREE.MeshStandardMaterial;
  frameMat: THREE.MeshStandardMaterial;
  video?: HTMLVideoElement;
  videoTex?: THREE.VideoTexture;
  hover: number;
}

export class WorkPanels {
  group = new THREE.Group();
  private exhibits: Exhibit[] = [];
  private flames: { s: THREE.Sprite; base: THREE.Vector2; phase: number }[] = [];
  private halos: { s: THREE.Sprite; base: number; phase: number }[] = [];
  private lights: { light: THREE.PointLight; phase: number }[] = [];
  private active = -1;
  hovered = -1;

  constructor(items: WorkItem[], spots: WorkSpot[], wallX: number, private stacked: boolean, isMobile: boolean) {
    const r = rand(77);
    const flameMat = new THREE.SpriteMaterial({ map: flameTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    const haloMat = new THREE.SpriteMaterial({ map: haloTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    const iron = new THREE.MeshStandardMaterial({ color: '#221d18', roughness: 0.55, metalness: 0.6 });
    const wax = new THREE.MeshStandardMaterial({ color: '#e6d9bd', roughness: 0.55, emissive: new THREE.Color('#ff9a50'), emissiveIntensity: 0.12 });
    const gold = new THREE.MeshStandardMaterial({ color: '#c39a4a', roughness: 0.35, metalness: 0.5, emissive: new THREE.Color('#4a3010'), emissiveIntensity: 0.5 });
    const board = new THREE.MeshStandardMaterial({ color: '#2a1d14', roughness: 0.7 });

    const { w: EW } = exhibitSize(stacked);
    const frameX = stacked ? 0 : -EW / 2 + FW / 2;
    const frameY = stacked ? exhibitSize(true).h / 2 - FH / 2 : 0;
    const PW = stacked ? FW : PW_SIDE, PH = stacked ? PH_STACK : FH;
    const plX = stacked ? 0 : EW / 2 - PW / 2;
    const plY = stacked ? -exhibitSize(true).h / 2 + PH / 2 : 0;

    const frameGeo = ring(MW, MH, F, 0.06, 0.03);
    const lipGeo = ring(MW, MH, 0.035, 0.07, 0.008);
    const backGeo = new THREE.BoxGeometry(MW + 0.02, MH + 0.02, 0.04);
    const screenGeo = new THREE.PlaneGeometry(MW, MH);
    const placardGeo = new THREE.PlaneGeometry(PW - 0.06, PH - 0.06);
    const mountGeo = new THREE.BoxGeometry(PW, PH, 0.04);
    const candleGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
    candleGeo.translate(0, 0.5, 0);
    const candles: THREE.Matrix4[] = [];

    const addFlame = (p: THREE.Vector3, size: number) => {
      const s = new THREE.Sprite(flameMat);
      s.position.copy(p);
      const base = new THREE.Vector2(size * 0.45, size);
      s.scale.set(base.x, base.y, 1);
      s.center.set(0.5, 0.12);
      this.group.add(s);
      this.flames.push({ s, base, phase: r() * 10 });
    };
    const addHalo = (p: THREE.Vector3, size: number) => {
      const s = new THREE.Sprite(haloMat);
      s.position.copy(p);
      s.scale.setScalar(size);
      this.group.add(s);
      this.halos.push({ s, base: size, phase: r() * 10 });
    };
    const candle = (x: number, y: number, z: number, rad: number, h: number) => {
      candles.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(rad, h, rad)));
      addFlame(new THREE.Vector3(x, y + h + 0.005, z), 0.05 + rad * 0.6);
    };

    items.forEach((item, i) => {
      const spot = spots[i];
      if (!spot) return;
      const s = spot.side;
      const g = new THREE.Group();
      g.position.copy(spot.center);
      g.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2; // face into the nave; local +x is the viewer's right
      this.group.add(g);

      // the framed screen
      const frameMat = new THREE.MeshStandardMaterial({ color: '#4a3826', roughness: 0.42, metalness: 0.45, emissive: new THREE.Color('#1c1208'), emissiveIntensity: 0.4 });
      const frame = new THREE.Mesh(frameGeo, frameMat);
      const lip = new THREE.Mesh(lipGeo, gold);
      const back = new THREE.Mesh(backGeo, board);
      const screen = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.86, 0.84, 0.8), toneMapped: false, fog: false });
      const scr = new THREE.Mesh(screenGeo, screen);
      scr.position.z = 0.045;
      lip.position.z = 0.0;
      const fg = new THREE.Group();
      fg.position.set(frameX, frameY, 0);
      fg.add(frame, lip, back, scr);
      g.add(fg);

      // the placard, on a dark mount
      const pc = document.createElement('canvas');
      pc.width = stacked ? 1280 : 768;
      pc.height = Math.round((pc.width * (PH - 0.06)) / (PW - 0.06));
      paper(pc.getContext('2d')!, pc.width, pc.height, 31 + i * 7);
      const ptex = new THREE.CanvasTexture(pc);
      ptex.colorSpace = THREE.SRGBColorSpace;
      ptex.anisotropy = 8;
      const placard = new THREE.MeshStandardMaterial({ map: ptex, emissiveMap: ptex, emissive: new THREE.Color('#fff2dc'), emissiveIntensity: 0.3, roughness: 0.85 });
      const mount = new THREE.Mesh(mountGeo, board);
      mount.position.set(plX, plY, 0.02);
      const pl = new THREE.Mesh(placardGeo, placard);
      pl.position.set(plX, plY, 0.042);
      g.add(mount, pl);

      // hit area: the whole exhibit
      const { w, h } = exhibitSize(stacked);
      const pick = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.1, h + 0.1), new THREE.MeshBasicMaterial({ visible: false }));
      pick.position.z = 0.12;
      g.add(pick);

      // sconces either side of the exhibit
      const inX = (d: number) => s * (wallX - d);
      for (const dz of [-1, 1]) {
        const z = spot.z + dz * (w / 2 + 0.32);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.12), iron);
        plate.position.set(inX(0.015), spot.center.y + 0.05, z);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.025), iron);
        arm.position.set(inX(0.12), spot.center.y - 0.02, z);
        const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.03, 14), iron);
        pan.position.set(inX(0.22), spot.center.y, z);
        this.group.add(plate, arm, pan);
        const ch = 0.16 + r() * 0.1;
        candle(inX(0.22), spot.center.y + 0.015, z, 0.028, ch);
        addHalo(new THREE.Vector3(inX(0.22), spot.center.y + ch + 0.06, z), 1.1);
      }
      // a few candles on the floor below
      const n = isMobile ? 3 : 5;
      for (let k = 0; k < n; k++) {
        const rad = 0.03 + r() * 0.025;
        candle(inX(0.25 + r() * 0.45), 0, spot.z + (r() - 0.5) * w * 0.7, rad, 0.1 + r() * 0.34);
      }
      addHalo(new THREE.Vector3(inX(0.5), 0.4, spot.z), 1.6);

      const ex: Exhibit = { item, pick, screen, placard, frameMat, hover: 0 };
      this.exhibits.push(ex);
      this.loadMedia(ex);
    });

    // light: one warm light per bay, in the aisle, reaching both walls (fewer lights, cheaper shaders)
    const used = spots.slice(0, items.length);
    for (const b of new Set(used.map((p) => p.bay))) {
      const zs = used.filter((p) => p.bay === b).map((p) => p.z);
      const light = new THREE.PointLight('#ffb070', 7, 9, 1.1);
      light.position.set(0, 2.5, zs.reduce((a, c) => a + c, 0) / zs.length);
      this.group.add(light);
      this.lights.push({ light, phase: r() * 10 });
    }

    const wicks = new THREE.InstancedMesh(candleGeo, wax, candles.length);
    candles.forEach((mm, k) => wicks.setMatrixAt(k, mm));
    this.group.add(wicks);
  }

  /** Poster / still / mark into the screen; the reel itself streams in only when the exhibit is in view. */
  private loadMedia(ex: Exhibit) {
    const m = ex.item.media;
    if (!m) return;
    if (m.type === 'logo') return; // painted with the placards, once fonts are in
    const url = m.type === 'video' ? m.poster : m.src;
    if (url)
      new THREE.TextureLoader().load(url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        cover(t, (t.image as HTMLImageElement).width, (t.image as HTMLImageElement).height);
        if (!ex.videoTex || !ex.video || ex.video.paused) ex.screen.map = t;
        ex.screen.userData.poster = t;
        ex.screen.needsUpdate = true;
      });
    if (m.type === 'video') {
      const v = document.createElement('video');
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.preload = 'none';
      v.crossOrigin = 'anonymous';
      ex.video = v;
    }
  }

  /** Paint the placards (and any marks) once the web fonts are available. */
  async paint() {
    await Promise.all([
      document.fonts?.load(F_.light(52)),
      document.fonts?.load(F_.body(29)),
      document.fonts?.load(F_.serif(56)),
      document.fonts?.load(F_.mono(22)),
    ]).catch(() => undefined);
    await Promise.all(
      this.exhibits.map(async (ex) => {
        const tex = ex.placard.map as THREE.CanvasTexture;
        const c = tex.image as HTMLCanvasElement;
        const g = c.getContext('2d')! as Ctx;
        if (this.stacked) placardStacked(g, c.width, c.height, ex.item);
        else placardSide(g, c.width, c.height, ex.item);
        tex.needsUpdate = true;
        const m = ex.item.media;
        if (m?.type === 'logo') {
          const t = new THREE.CanvasTexture(await logoCanvas(m, ex.item.color));
          t.colorSpace = THREE.SRGBColorSpace;
          ex.screen.map = t;
          ex.screen.needsUpdate = true;
        }
      }),
    );
  }

  /** Play the reel of the exhibit in view (−1: none); every other reel pauses and shows its poster. */
  setActive(i: number) {
    if (i === this.active) return;
    this.active = i;
    this.exhibits.forEach((ex, k) => {
      const v = ex.video;
      if (!v) return;
      if (k === i) {
        if (!v.src) {
          v.src = ex.item.media!.src;
          v.preload = 'auto';
        }
        v.play()
          .then(() => {
            if (this.active !== k) return v.pause();
            if (!ex.videoTex) {
              ex.videoTex = new THREE.VideoTexture(v);
              ex.videoTex.colorSpace = THREE.SRGBColorSpace;
              cover(ex.videoTex, v.videoWidth || 1280, v.videoHeight || 656);
            }
            ex.screen.map = ex.videoTex;
            ex.screen.needsUpdate = true;
          })
          .catch(() => undefined);
      } else if (!v.paused) v.pause();
    });
  }

  /** Index of the exhibit under the ray, or −1. */
  pick(ray: THREE.Raycaster) {
    const hit = ray.intersectObjects(this.exhibits.map((p) => p.pick), false)[0];
    this.hovered = hit ? this.exhibits.findIndex((p) => p.pick === hit.object) : -1;
    return this.hovered;
  }

  href(i: number) {
    return this.exhibits[i]?.item.href ?? null;
  }

  get count() {
    return this.exhibits.length;
  }

  update(time: number, dt: number) {
    for (const f of this.flames) {
      const k = 1 + 0.12 * Math.sin(time * 13 + f.phase) + 0.07 * Math.sin(time * 29 + f.phase * 3);
      f.s.scale.set(f.base.x * (1.9 - 0.9 * k), f.base.y * k, 1);
    }
    for (const h of this.halos) h.s.scale.setScalar(h.base * (0.94 + 0.06 * Math.sin(time * 7 + h.phase)));
    for (const l of this.lights) l.light.intensity = 7 * (0.92 + 0.06 * Math.sin(time * 9 + l.phase) + 0.02 * Math.sin(time * 23 + l.phase));
    this.exhibits.forEach((ex, i) => {
      ex.hover = THREE.MathUtils.damp(ex.hover, this.hovered === i ? 1 : 0, 10, dt);
      const c = 0.86 + ex.hover * 0.14;
      ex.screen.color.setRGB(c, c * 0.98, c * 0.94);
      ex.placard.emissiveIntensity = 0.3 + ex.hover * 0.15;
      ex.frameMat.emissiveIntensity = 0.4 + ex.hover * 1.6;
    });
  }
}
