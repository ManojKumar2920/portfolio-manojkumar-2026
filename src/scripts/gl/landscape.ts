import * as THREE from 'three';

/**
 * The exterior set's terrain, shared by everything planted on it (ground mesh, grass, trees, props, petals, birds):
 * the hill, a pond terraced into the front-left slope and a worn footpath climbing from the hero camera to the
 * tower arch. World units: ruin ≈ 3.1 wide, centred on the origin, floor at y = 0.
 */

/* ---------- footpath ---------- */

/** Centre line (x, z), from the tower arch down the front slope past the hero camera. */
const PATH_POINTS: [number, number][] = [
  [1.0, 1.0], [0.92, 1.6], [0.55, 2.4], [0.08, 3.2], [0.0, 4.0], [0.32, 4.8], [0.72, 5.6], [0.6, 6.5], [0.2, 7.6], [-0.35, 8.9],
];
export const PATH = new THREE.CatmullRomCurve3(PATH_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
const PATH_SAMPLES = PATH.getSpacedPoints(240).map((p) => [p.x, p.z] as [number, number]);
const PATH_BOX = PATH_SAMPLES.reduce((b, [x, z]) => [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)], [Infinity, -Infinity, Infinity, -Infinity]);

/** Half-width of the worn strip at path parameter t (0 at the arch): narrower near the ruin. */
export const pathHalfWidth = (t: number) => 0.13 + 0.06 * t;

/** Distance from (x, z) to the path centre line, and the path parameter there. Cheap early-out far from it. */
export function pathNearest(x: number, z: number): { d: number; t: number } {
  if (x < PATH_BOX[0] - 1 || x > PATH_BOX[1] + 1 || z < PATH_BOX[2] - 1 || z > PATH_BOX[3] + 1) return { d: 9, t: 0 };
  let best = Infinity, bt = 0;
  for (let i = 0; i < PATH_SAMPLES.length - 1; i++) {
    const [ax, az] = PATH_SAMPLES[i], [bx, bz] = PATH_SAMPLES[i + 1];
    const dx = bx - ax, dz = bz - az;
    const k = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const d = Math.hypot(x - ax - dx * k, z - az - dz * k);
    if (d < best) (best = d), (bt = (i + k) / (PATH_SAMPLES.length - 1));
  }
  return { d: best, t: bt };
}

/** 1 on the worn centre of the path, fading out over its ragged edge. */
export function pathMask(x: number, z: number) {
  const { d, t } = pathNearest(x, z);
  const w = pathHalfWidth(t) * (1 + 0.25 * Math.sin(t * 61) * Math.sin(t * 23 + 1));
  return 1 - THREE.MathUtils.smoothstep(d, w * 0.7, w * 1.25);
}

/* ---------- pond ---------- */

/** A small pond terraced into the front-left slope below the big cherry, its long axis following the contour. */
export const POND = (() => {
  const x = -1.05, z = 3.1;
  const radial = new THREE.Vector2(x, z).normalize();
  return {
    x, z,
    /** unit vectors of the pond frame: u along the contour (long axis), v down the slope */
    u: new THREE.Vector2(radial.y, -radial.x),
    v: radial,
    rx: 0.82,
    rz: 0.52,
    level: hill(x, z) - 0.035,
    depth: 0.14,
  };
})();

/** Lobed shoreline: radius multiplier at angle a. */
const shore = (a: number) => 1 + 0.12 * Math.sin(3 * a + 0.7) + 0.06 * Math.sin(5 * a + 2.1) + 0.03 * Math.sin(9 * a + 0.4);

/** Pond-frame local coordinates of a world point. */
export function pondLocal(x: number, z: number) {
  const dx = x - POND.x, dz = z - POND.z;
  return { a: dx * POND.u.x + dz * POND.u.y, b: dx * POND.v.x + dz * POND.v.y };
}

/** Normalised distance from the pond centre: < 1 is water, 1 is the shoreline. */
export function pondD(x: number, z: number) {
  const { a, b } = pondLocal(x, z);
  const ea = a / POND.rx, eb = b / POND.rz;
  return Math.hypot(ea, eb) / shore(Math.atan2(eb, ea));
}

/** World (x, z) of a point at normalised distance d and angle ang (pond frame) — for planting round the shore. */
export function pondPoint(d: number, ang: number): [number, number] {
  const r = d * shore(ang);
  const a = Math.cos(ang) * r * POND.rx, b = Math.sin(ang) * r * POND.rz;
  return [POND.x + POND.u.x * a + POND.v.x * b, POND.z + POND.u.y * a + POND.v.y * b];
}

/* ---------- heights ---------- */

/** The bare hill: a soft crown under the ruin, falling away on every side. */
function hill(x: number, z: number) {
  const r = Math.hypot(x, z * 1.15);
  const s = Math.max(r - 2.0, 0);
  const fall = (0.07 * s * s) / (1 + 0.1 * s);
  const bumps = Math.sin(x * 1.7 + z * 0.6) * 0.035 + Math.sin(x * 0.45 - z * 1.3) * 0.06 + Math.sin(x * 3.1 + z * 2.3) * 0.012;
  // level crown under the ruin (|bumps| ramps in only past its footprint)
  const t = Math.min(1, Math.max(0, (r - 2.0) / 1.4));
  return -0.04 - fall + bumps * t * t * (3 - 2 * t);
}

/** Ground height under (x, z): the hill, with the pond basin cut in and the path trodden flat and a little sunken. */
export function groundAt(x: number, z: number) {
  let g = hill(x, z);

  const d = pondD(x, z);
  if (d < 2.4) {
    const L = POND.level;
    let p: number;
    if (d < 1) p = L - POND.depth * (1 - d * d); // bowl
    else {
      const cut = Math.min(g, L + 0.32 * (d - 1)); // bank cut into the uphill side
      const berm = L + 0.03 * (1 - THREE.MathUtils.smoothstep(d, 1.0, 1.9)); // lip holding the water on the downhill side
      p = Math.max(cut, berm);
    }
    g = THREE.MathUtils.lerp(p, g, THREE.MathUtils.smoothstep(d, 1.7, 2.4));
  }

  const m = pathMask(x, z);
  if (m > 0) g -= 0.012 * m; // trodden in

  return g;
}

/** Height a falling thing comes to rest on: the water surface over the pond, else the ground. */
export function surfaceAt(x: number, z: number) {
  return pondD(x, z) < 1 ? Math.max(groundAt(x, z), POND.level) : groundAt(x, z);
}
export const isWater = (x: number, z: number) => pondD(x, z) < 0.97;

/* ---------- the note ---------- */

/** The old paper lying on the path, where the camera stops on the first scroll (see Note.ts, timeline.ts). */
export const NOTE = (() => {
  const p = PATH.getPointAt(0.45);
  return { x: p.x, z: p.z, y: groundAt(p.x, p.z) };
})();
