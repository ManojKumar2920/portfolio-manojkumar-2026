import * as THREE from 'three';
import { NOTE } from './landscape';
import { LIGHTBOX, lightboxSize, posterZ, workSpots } from './Hall';
import { exhibitSize } from './WorkPanels';

/**
 * Scroll progress (0–1) is split into three sets, joined by short fades to black:
 *   exterior  · castle at dusk, then orbit to the darker back side
 *   interior  · the Great Hall (content lives here)
 *   sky       · chase camera behind the aeroplane, flying into the sunrise
 */

export type SceneName = 'exterior' | 'interior' | 'sky';

export const SCENES: { name: SceneName; from: number; to: number }[] = [
  { name: 'exterior', from: 0, to: 0.27 },
  { name: 'interior', from: 0.27, to: 0.71 },
  { name: 'sky', from: 0.71, to: 1 },
];

/** Half-width of the fade to black at each scene boundary (in progress units). */
export const CUT = 0.022;

export function sceneAt(p: number) {
  const s = SCENES.find((x) => p < x.to) ?? SCENES[SCENES.length - 1];
  const local = THREE.MathUtils.clamp((p - s.from) / (s.to - s.from), 0, 1);
  return { scene: s.name, local };
}

/** The hall → sky boundary is crossed in cloud, not in black: the camera rises out of the roof and through it. */
const SKY_FROM = SCENES[2].from;
/** the cloud starts only once the star hold is over (hall local 0.955 → 0.69 global) and clears soon after dawn */
const CLOUD_IN = 0.018, CLOUD_OUT = 0.026;

/** 0 = clear, 1 = black. Peaks exactly on each boundary (except into the sky, see cloudout). */
export function blackout(p: number) {
  let b = 0;
  for (const s of SCENES.slice(1, 2)) {
    const d = Math.abs(p - s.from);
    if (d < CUT) b = Math.max(b, 1 - d / CUT);
  }
  return b * b * (3 - 2 * b);
}

/** 0 = clear, 1 = all cloud, around the hall → sky boundary; and which side of it we are on (0 night, 1 dawn). */
export function cloudout(p: number) {
  const d = p - SKY_FROM;
  const c = d < 0 ? Math.max(0, 1 + d / CLOUD_IN) : Math.max(0, 1 - d / CLOUD_OUT);
  return { amount: c * c * (3 - 2 * c), dawn: p >= SKY_FROM ? 1 : 0 };
}

export interface CamKey {
  t: number;
  pos: [number, number, number];
  look: [number, number, number];
  /** the camera comes to rest here (zero tangent): no overshoot around holds */
  stop?: boolean;
  /** the camera passes through here without slowing (no per-segment ease at this end) */
  glide?: boolean;
}

/** Ruin: ~3.1 wide, tower ~2.1 tall, floor at y = 0, on a hilltop falling away on every side (see Ruin.groundAt). */
export const EXTERIOR: CamKey[] = [
  { t: 0.0, pos: [0.45, -0.05, 6.9], look: [0.25, 0.25, 0] }, // hero: low on the slope, the ruin on the crest, half the frame sky
  // down the path to the old note lying on it (Note.ts), then a slow push in while it is read
  { t: 0.13, pos: [NOTE.x + 0.04, NOTE.y + 0.92, NOTE.z + 0.58], look: [NOTE.x, NOTE.y, NOTE.z - 0.02], stop: true },
  { t: 0.31, pos: [NOTE.x + 0.03, NOTE.y + 0.8, NOTE.z + 0.48], look: [NOTE.x, NOTE.y, NOTE.z - 0.02], stop: true },
  // the gust takes it: the camera rises and tilts up after it, toward the ruin
  { t: 0.46, pos: [-0.4, 0.05, 5.0], look: [0.3, 0.6, 0] },
  { t: 0.66, pos: [-4.4, 0.45, 1.4], look: [0, 0.7, 0] }, // round the dome end
  { t: 0.85, pos: [-2.2, 0.65, -4.0], look: [0, 0.75, 0] }, // the dark far side
  { t: 1.0, pos: [-0.8, 0.3, -2.2], look: [0, 0.6, 0] }, // push in toward the walls
];

/**
 * Hall (local coords): floor y = 0, nave x ±4.5, z from +14 (entrance) to −22 (fireplace).
 * Down the nave the camera stops square on to each framed print (WORK_SPOTS), alternating walls, holding while it
 * is read; then on to the hearth and up through the open roof.
 */
const hall = { count: 8, stacked: false };
// the last hold ends well before the scene does, leaving a real walk down the nave and the look up through the roof
/** The arrival: through the door, then a held wide view of the nave while the welcome line is read (HomeUI). */
export const ARRIVAL = { in: 0.04, out: 0.1 };
const WORK_T0 = 0.14, WORK_END = 0.52;
/** each exhibit's hold: longer when there are fewer of them, so every one gets a comfortable read */
const holdT = () => THREE.MathUtils.clamp(0.24 / hall.count, 0.035, 0.07);

const workT = (i: number) => WORK_T0 + i * ((WORK_END - WORK_T0) / Math.max(1, hall.count - 1));
/** After the work: the poster lightboxes (a stop of their own), then the sky of favourites, held to the end. */
function endTimes() {
  const tEnd = workT(workSpots(hall.count, hall.stacked).length - 1) + holdT();
  const pz = posterZ(hall.count);
  const pAt = tEnd + 0.105, pEnd = pAt + 0.06;
  const skyAt = pz === null ? tEnd + 0.17 : pEnd + 0.08;
  return { tEnd, pz, pAt, pEnd, skyAt };
}
const MOON: [number, number, number] = [-1.5, 16, -17.5]; // over the open roof (Hall's sky and moon model)

function interiorKeys(aspect: number): CamKey[] {
  const spots = workSpots(hall.count, hall.stacked);
  // back off far enough that the whole exhibit fits, with room for the nav above and the counter below
  const tanV = Math.tan(THREE.MathUtils.degToRad((aspect < 1 ? 52 : 38) / 2));
  const { w, h } = exhibitSize(hall.stacked);
  const d = THREE.MathUtils.clamp(Math.max(h / (0.66 * 2 * tanV), w / (0.9 * 2 * tanV * aspect)), 3.5, 8.2);
  // aim along a direction rather than at a far point: look points sit a fixed distance ahead, so the view turns
  // at an even rate instead of whipping across the nave when the target jumps from one wall to the other
  const aim = (pos: [number, number, number], at: [number, number, number]): [number, number, number] => {
    const dir = new THREE.Vector3(at[0] - pos[0], at[1] - pos[1], at[2] - pos[2]).normalize().multiplyScalar(4);
    return [pos[0] + dir.x, pos[1] + dir.y, pos[2] + dir.z];
  };
  const key = (t: number, pos: [number, number, number], at: [number, number, number], flags: Partial<CamKey> = {}): CamKey => ({ t, pos, look: aim(pos, at), ...flags });

  const keys: CamKey[] = [
    key(0.0, [0, 1.75, 15.6], [0, 1.85, 0]), // on the threshold, the doorway still round the view
    key(ARRIVAL.in, [0, 1.8, 12.4], [0, 2.6, -8], { stop: true }), // in: the whole nave, candles down both walls, moonlight
    key(ARRIVAL.out, [0, 1.85, 11.6], [0, 2.75, -8], { stop: true }), // held, drifting in while the welcome is read
  ];
  spots.forEach((sp, i) => {
    const t = workT(i);
    const c = sp.center;
    const at: [number, number, number] = [c.x, c.y - 0.05, c.z];
    if (i > 0 && spots[i - 1].side !== sp.side) {
      // across the nave: step back into the aisle and walk on, looking down the nave, turning toward the next one
      const prev = spots[i - 1];
      const zm = (prev.z + sp.z) / 2;
      const tm = (workT(i - 1) + holdT() + t) / 2;
      keys.push(key(tm, [-sp.side * 0.15, 1.85, zm], [sp.side * 1.6, 1.95, zm - 6], { glide: true }));
    }
    // along the same wall there is no mid key: the camera trucks sideways from one piece to the next, still facing the wall
    keys.push(key(t, [c.x - sp.side * d, c.y - 0.4, c.z], at, { stop: true }));
    keys.push(key(t + holdT(), [c.x - sp.side * (d - 0.2), c.y - 0.38, c.z], at, { stop: true })); // slow push in
  });
  const last = spots[spots.length - 1];
  const { tEnd, pz, pAt, pEnd, skyAt } = endTimes();
  if (pz !== null) {
    // across the nave to the lightboxes on the left wall: a stop square on to the row, a slow push in
    const lb = lightboxSize(hall.stacked);
    const dp = THREE.MathUtils.clamp(Math.max(lb.h / (0.8 * 2 * tanV), lb.w / (0.86 * 2 * tanV * aspect)), 3, 8.4);
    const at: [number, number, number] = [-LIGHTBOX.wallX, LIGHTBOX.y + 0.05, pz];
    const zm = (last.z + pz) / 2;
    keys.push(
      key((tEnd + pAt) / 2, [last.side > 0 ? 0.2 : -0.2, 1.9, zm], [-1.6, 2.1, zm - 6], { glide: true }),
      key(pAt, [-LIGHTBOX.wallX + dp, 2.4, pz], at, { stop: true }),
      key(pEnd, [-LIGHTBOX.wallX + dp - 0.2, 2.42, pz], at, { stop: true }),
      // then the head lifts, up through the open roof to the moon and the sky of visitors' favourites
      key(skyAt, [-0.3, 2.0, pz], MOON, { stop: true }),
    );
  } else {
    const z2 = Math.min(-13, last.z - 2.5);
    keys.push(
      key((tEnd + skyAt) / 2, [0.05, 1.85, (last.z + z2) / 2], [0.3, 6.8, -21.5], { glide: true }),
      key(skyAt, [-0.3, 2.0, z2], MOON, { stop: true }),
    );
  }
  const hold = keys[keys.length - 1];
  // then up: out through the open roof toward the moon, into the cloud the flight rises out of (cloudout, Post)
  keys.push(key(0.955, [hold.pos[0], hold.pos[1], hold.pos[2] - 0.1], [MOON[0], MOON[1] + 0.5, MOON[2]], { stop: true })); // held under the stars
  keys.push(key(1.0, [hold.pos[0] - 0.5, 11.5, hold.pos[2] - 1.2], [MOON[0], MOON[1] + 3, MOON[2] - 0.5]));
  return keys;
}

/** Interior-local span where the camera looks up at the sky of favourites (the last stop of the hall). */
export function skyHold() {
  const { pEnd, skyAt, pz, tEnd } = endTimes();
  const from = pz === null ? tEnd : pEnd;
  return { from: from + (skyAt - from) * 0.75, to: 0.955, at: skyAt };
}

/** Global scroll progress at the middle of each exhibit's hold (the HUD counter follows these). */
export function workStops() {
  return Array.from({ length: workSpots(hall.count, hall.stacked).length }, (_, i) => 0.27 + 0.44 * (workT(i) + holdT() / 2));
}

/** Sky: camera rises out of the cloud deck behind the plane. */
const SKY: CamKey[] = [
  { t: 0.0, pos: [0, 6.2, 0], look: [0, 7.0, -12] }, // rising out of the cloud sea
  { t: 0.3, pos: [0, 8.4, 0], look: [0, 7.9, -12] },
  { t: 1.0, pos: [0, 9.6, 0], look: [0, 8.7, -12] },
];

export const KEYS: Record<SceneName, CamKey[]> = { exterior: EXTERIOR, interior: interiorKeys(16 / 9), sky: SKY };

let lastAspect = 16 / 9;
/** Refit the hall's stops to the viewport (narrow phones stand further back from the exhibits). */
export function fitInterior(aspect: number) {
  lastAspect = aspect;
  KEYS.interior = interiorKeys(aspect);
  cache.delete('interior');
}
/** How many exhibits hang in the hall, and whether their placards sit below the frame (phones). */
export function setHall(count: number, stacked: boolean) {
  hall.count = Math.max(1, count);
  hall.stacked = stacked;
  fitInterior(lastAspect);
}

const m1 = new THREE.Vector3(), m2 = new THREE.Vector3();
/** Catmull–Rom (Hermite form) between pts[i] and pts[i + 1]; keys flagged stop get a zero tangent. */
/** monotone: a component that changes direction at a key gets a flat tangent there, so it never overshoots */
const limit = (m: number, d0: number, d1: number) => (d0 * d1 <= 0 ? 0 : Math.sign(m) * Math.min(Math.abs(m), 3 * Math.min(Math.abs(d0), Math.abs(d1))));
const flatten = (m: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
  m.set(limit(m.x, b.x - a.x, c.x - b.x), limit(m.y, b.y - a.y, c.y - b.y), limit(m.z, b.z - a.z, c.z - b.z));
};
function catmull(pts: THREE.Vector3[], keys: CamKey[], i: number, t: number, out: THREE.Vector3, monotone = false) {
  const n = pts.length;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[Math.min(n - 1, i + 1)], p3 = pts[Math.min(n - 1, i + 2)];
  m1.subVectors(p2, p0).multiplyScalar(keys[i].stop ? 0 : 0.5);
  m2.subVectors(p3, p1).multiplyScalar(keys[Math.min(n - 1, i + 1)].stop ? 0 : 0.5);
  if (monotone) {
    flatten(m1, p0, p1, p2);
    flatten(m2, p1, p2, p3);
  }
  const t2 = t * t, t3 = t2 * t;
  return out
    .set(0, 0, 0)
    .addScaledVector(p1, 2 * t3 - 3 * t2 + 1)
    .addScaledVector(m1, t3 - 2 * t2 + t)
    .addScaledVector(p2, -2 * t3 + 3 * t2)
    .addScaledVector(m2, t3 - t2);
}

/** Each key's view direction as (yaw, pitch), yaw unwrapped so consecutive keys never turn the long way round. */
function headings(k: CamKey[]) {
  let prev = 0;
  return k.map((x, i) => {
    const d = new THREE.Vector3(x.look[0] - x.pos[0], x.look[1] - x.pos[1], x.look[2] - x.pos[2]).normalize();
    let yaw = Math.atan2(d.x, -d.z);
    if (i > 0) while (yaw - prev > Math.PI) yaw -= Math.PI * 2;
    if (i > 0) while (yaw - prev < -Math.PI) yaw += Math.PI * 2;
    prev = yaw;
    return new THREE.Vector3(yaw, Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)), 0);
  });
}

const ang = new THREE.Vector3();
const cache = new Map<SceneName, { pos: THREE.Vector3[]; look: THREE.Vector3[]; head: THREE.Vector3[] }>();
export function sampleCamera(scene: SceneName, t: number, pos: THREE.Vector3, look: THREE.Vector3) {
  const k = KEYS[scene];
  if (!cache.has(scene)) cache.set(scene, { pos: k.map((x) => new THREE.Vector3(...x.pos)), look: k.map((x) => new THREE.Vector3(...x.look)), head: headings(k) });
  const c = cache.get(scene)!;
  let i = 0;
  while (i < k.length - 2 && t > k[i + 1].t) i++;
  const u = THREE.MathUtils.clamp((t - k[i].t) / Math.max(1e-5, k[i + 1].t - k[i].t), 0, 1);
  // ease in and out of each key, except where the camera glides straight through one
  const g0 = !!k[i].glide, g1 = !!k[i + 1].glide;
  const e = g0 && g1 ? u : g0 ? u * 0.4 + (1 - (1 - u) * (1 - u)) * 0.6 : g1 ? u * 0.4 + u * u * 0.6 : u * u * (3 - 2 * u) * 0.6 + u * 0.4;
  catmull(c.pos, k, i, e, pos);
  if (scene === 'interior') {
    // indoors the view turns by angle, not by sliding a look point: an even, head-like turn between the walls
    catmull(c.head, k, i, e, ang, true);
    const cp = Math.cos(ang.y);
    look.set(pos.x + Math.sin(ang.x) * cp * 4, pos.y + Math.sin(ang.y) * 4, pos.z - Math.cos(ang.x) * cp * 4);
  } else catmull(c.look, k, i, e, look);
}

/* ---------------- lighting ---------------- */

export interface LightState {
  t: number;
  skyTop: THREE.Color;
  skyBottom: THREE.Color;
  sun: THREE.Color;
  sunStrength: number;
  sunDir: THREE.Vector3;
  fog: THREE.Color;
  fogDensity: number;
  castle: THREE.Color;
  windows: number;
  stars: number;
  cloud: THREE.Color;
  cloudLight: THREE.Color;
}

const c = (hex: string) => new THREE.Color(hex);
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();

const golden = {
  skyTop: c('#9fb2bf'), skyBottom: c('#efdfc2'), sun: c('#fff0d2'), sunStrength: 0.9, sunDir: v(-0.5, 0.3, -0.8),
  fog: c('#e2d5b9'), fogDensity: 0.04, castle: c('#ffffff'), windows: 0, stars: 0,
  cloud: c('#cbc2b4'), cloudLight: c('#fff8ec'),
};
const dusk = {
  skyTop: c('#161d2b'), skyBottom: c('#c27648'), sun: c('#ffb27c'), sunStrength: 1.0, sunDir: v(-0.55, 0.06, -0.83),
  fog: c('#6a4836'), fogDensity: 0.022, castle: c('#ffffff'), windows: 0.3, stars: 0.1,
  cloud: c('#5e463f'), cloudLight: c('#e8a073'),
};
const northSide = {
  skyTop: c('#070a11'), skyBottom: c('#1d2533'), sun: c('#7f95b8'), sunStrength: 0.35, sunDir: v(0.4, 0.4, 0.8),
  fog: c('#0b1017'), fogDensity: 0.05, castle: c('#46526a'), windows: 1.0, stars: 0.8,
  cloud: c('#161d28'), cloudLight: c('#33415a'),
};
const cloudLayer = {
  skyTop: c('#2a3a5c'), skyBottom: c('#b78b83'), sun: c('#ffc79a'), sunStrength: 0.7, sunDir: v(0.5, 0.06, -1),
  fog: c('#8e7f88'), fogDensity: 0.035, castle: c('#ffffff'), windows: 0, stars: 0.1,
  cloud: c('#8d7f8c'), cloudLight: c('#f3d2c0'),
};
const sunrise = {
  skyTop: c('#203458'), skyBottom: c('#f09a62'), sun: c('#ffd2a0'), sunStrength: 1.4, sunDir: v(0.5, 0.05, -1),
  fog: c('#c99079'), fogDensity: 0.006, castle: c('#ffffff'), windows: 0, stars: 0,
  cloud: c('#866574'), cloudLight: c('#ffeadb'),
};

const LIGHT: Record<'exterior' | 'sky', (LightState & { t: number })[]> = {
  exterior: [
    { t: 0, ...golden },
    { t: 0.3, ...golden },
    { t: 0.6, ...dusk },
    { t: 0.85, ...northSide },
    { t: 1, ...northSide },
  ],
  sky: [
    { t: 0, ...cloudLayer },
    { t: 0.45, ...sunrise },
    { t: 1, ...sunrise },
  ],
};

/** Parked state for DOM pages: night, slow orbit. */

export function makeLightState(): LightState {
  return {
    t: 0, skyTop: new THREE.Color(), skyBottom: new THREE.Color(), sun: new THREE.Color(), sunStrength: 1,
    sunDir: new THREE.Vector3(0, 0, -1), fog: new THREE.Color(), fogDensity: 0.05, castle: new THREE.Color(),
    windows: 0, stars: 0, cloud: new THREE.Color(), cloudLight: new THREE.Color(),
  };
}

export function lerpLight(a: LightState, b: LightState, t: number, out: LightState) {
  out.skyTop.copy(a.skyTop).lerp(b.skyTop, t);
  out.skyBottom.copy(a.skyBottom).lerp(b.skyBottom, t);
  out.sun.copy(a.sun).lerp(b.sun, t);
  out.sunStrength = a.sunStrength + (b.sunStrength - a.sunStrength) * t;
  out.sunDir.copy(a.sunDir).lerp(b.sunDir, t).normalize();
  out.fog.copy(a.fog).lerp(b.fog, t);
  out.fogDensity = a.fogDensity + (b.fogDensity - a.fogDensity) * t;
  out.castle.copy(a.castle).lerp(b.castle, t);
  out.windows = a.windows + (b.windows - a.windows) * t;
  out.stars = a.stars + (b.stars - a.stars) * t;
  out.cloud.copy(a.cloud).lerp(b.cloud, t);
  out.cloudLight.copy(a.cloudLight).lerp(b.cloudLight, t);
}

export function sampleLight(scene: 'exterior' | 'sky', t: number, out: LightState) {
  const s = LIGHT[scene];
  let i = 0;
  while (i < s.length - 2 && t > s[i + 1].t) i++;
  const u = THREE.MathUtils.clamp((t - s[i].t) / Math.max(1e-5, s[i + 1].t - s[i].t), 0, 1);
  lerpLight(s[i], s[i + 1], u * u * (3 - 2 * u), out);
}
