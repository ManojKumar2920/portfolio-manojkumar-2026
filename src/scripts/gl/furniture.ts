import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Seating, modelled rather than stacked from boxes: shaped end panels, rounded boards, slatted backs.
 * Units are metres; callers scale. UVs are box-projected in world units so wood grain keeps its scale on every
 * board and runs along the length of each one (see woodTexture: grain runs along U).
 */

function rand(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Box-project UVs from each vertex's normal; `scale` is texture repeats per metre. Grain (U) follows the board. */
function boxUV(g: THREE.BufferGeometry, scale: number) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let u: number, v: number;
    if (ay >= ax && ay >= az) (u = x), (v = z); // tops: grain along the length
    else if (az >= ax) (u = x), (v = y); // faces: along the length
    else (u = y), (v = z); // end panels: grain runs up the panel
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Normalise geometries so they merge: non-indexed, position + normal only. */
function prep(g: THREE.BufferGeometry) {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k);
  return out;
}

function roundedRect(w: number, h: number, r: number, x = 0, y = 0) {
  const s = new THREE.Shape();
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x - w / 2 + r, y - h / 2);
  s.lineTo(x + w / 2 - r, y - h / 2);
  s.quadraticCurveTo(x + w / 2, y - h / 2, x + w / 2, y - h / 2 + r);
  s.lineTo(x + w / 2, y + h / 2 - r);
  s.quadraticCurveTo(x + w / 2, y + h / 2, x + w / 2 - r, y + h / 2);
  s.lineTo(x - w / 2 + r, y + h / 2);
  s.quadraticCurveTo(x - w / 2, y + h / 2, x - w / 2, y + h / 2 - r);
  s.lineTo(x - w / 2, y - h / 2 + r);
  s.quadraticCurveTo(x - w / 2, y - h / 2, x - w / 2 + r, y - h / 2);
  return s;
}

/**
 * A profile drawn in the side view (shape x = world z, shape y = world y), extruded across world x
 * from x0 to x0 + len, with a small bevel so edges catch the light.
 */
function sideExtrude(shape: THREE.Shape, x0: number, len: number, bevel = 0.006, curve = 6) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, len - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: curve,
  });
  // extrusion runs along +z over [−bevel, len − bevel]; turn it so shape x → world z and it spans x0 … x0 + len
  g.rotateY(-Math.PI / 2); // (x, y, z) → (−z, y, x)
  g.translate(x0 + len - bevel, 0, 0);
  return g;
}

/** A board of rectangular section (w × h in the side view, rounded edges) centred at (z, y), tilted by `tilt`. */
function board(len: number, z: number, y: number, w: number, h: number, r: number, tilt = 0) {
  const g = sideExtrude(roundedRect(w, h, r), -len / 2, len, 0.004, 3);
  if (tilt) g.rotateX(tilt);
  g.translate(0, y, z);
  return g;
}

/**
 * Church pew, `len` long, facing −z (backs toward +z). Shaped end panels with a scrolled arm, a seat board with a
 * rounded nose, an apron, a slatted back with a capping rail, and a book ledge + kneeler on the back for the row
 * behind. Floor at y = 0.
 */
export function pewGeometry(len = 2.0) {
  const parts: THREE.BufferGeometry[] = [];
  const T = 0.055; // end panel thickness

  // end panel profile (z forward = −, y up)
  const end = new THREE.Shape();
  end.moveTo(-0.33, 0);
  end.lineTo(-0.33, 0.05);
  end.quadraticCurveTo(-0.25, 0.06, -0.25, 0.16); // foot
  end.lineTo(-0.25, 0.5);
  end.bezierCurveTo(-0.25, 0.6, -0.31, 0.66, -0.24, 0.71); // scrolled arm nose
  end.bezierCurveTo(-0.17, 0.75, -0.1, 0.68, -0.02, 0.66);
  end.lineTo(0.13, 0.66);
  end.lineTo(0.21, 0.98); // up the raked back
  end.bezierCurveTo(0.22, 1.06, 0.31, 1.08, 0.33, 1.0); // rounded cap
  end.lineTo(0.3, 0.16);
  end.quadraticCurveTo(0.3, 0.06, 0.38, 0.05);
  end.lineTo(0.38, 0);
  end.lineTo(0.14, 0);
  end.quadraticCurveTo(0.04, 0.12, -0.06, 0); // arched cut-out between the feet
  end.closePath();
  for (const x0 of [-len / 2, len / 2 - T]) parts.push(sideExtrude(end, x0, T, 0.008, 10));

  const inner = len - T * 2 + 0.02;
  // seat: thick board, rounded nose, slight dish toward the back
  parts.push(board(inner, -0.03, 0.45, 0.44, 0.045, 0.02, -0.035));
  // apron under the seat front
  parts.push(board(inner, -0.22, 0.37, 0.025, 0.1, 0.008));
  // back: three raked slats and a rounded capping rail
  const rake = -0.24;
  const back = (y: number) => 0.13 + (y - 0.5) * Math.tan(-rake) + 0.02;
  for (const y of [0.58, 0.73, 0.88]) parts.push(board(inner, back(y), y, 0.025, 0.12, 0.008, rake));
  parts.push(board(inner, back(1.0) + 0.01, 1.0, 0.07, 0.05, 0.022, rake));
  // book ledge and kneeler, on the back for the row behind
  parts.push(board(inner, 0.3, 0.74, 0.11, 0.022, 0.008));
  parts.push(board(inner, 0.42, 0.13, 0.16, 0.06, 0.02));
  // stretcher low between the end panels
  parts.push(board(inner, 0.02, 0.1, 0.05, 0.06, 0.01));

  const g = mergeGeometries(parts.map(prep));
  return boxUV(g, 1.4);
}

/**
 * Park bench, 1.5 long: wooden slats on a pair of cast-iron sides. Returns the two parts separately so they can
 * take their own materials. Faces −z, seat at 0.45, floor at y = 0.
 */
export function gardenBenchGeometry(len = 1.5) {
  const wood: THREE.BufferGeometry[] = [];
  const iron: THREE.BufferGeometry[] = [];

  // cast-iron side: front leg, rear leg sweeping up into the back support, arm rest, seat bearer
  const side = new THREE.Shape();
  side.moveTo(-0.3, 0);
  side.lineTo(-0.24, 0);
  side.quadraticCurveTo(-0.26, 0.2, -0.22, 0.4); // front leg, slight flare
  side.lineTo(0.18, 0.41); // seat bearer underside
  side.quadraticCurveTo(0.22, 0.2, 0.3, 0); // rear leg
  side.lineTo(0.36, 0);
  side.quadraticCurveTo(0.28, 0.22, 0.25, 0.44);
  side.quadraticCurveTo(0.26, 0.7, 0.34, 0.86); // back support, raked
  side.lineTo(0.3, 0.88);
  side.quadraticCurveTo(0.2, 0.7, 0.18, 0.47);
  side.lineTo(-0.2, 0.46);
  side.quadraticCurveTo(-0.22, 0.56, -0.18, 0.64); // arm post
  side.quadraticCurveTo(-0.04, 0.66, 0.2, 0.62); // arm rest
  side.lineTo(0.2, 0.66);
  side.quadraticCurveTo(-0.06, 0.71, -0.26, 0.66);
  side.quadraticCurveTo(-0.3, 0.6, -0.27, 0.44);
  side.quadraticCurveTo(-0.32, 0.2, -0.3, 0);
  side.closePath();
  const T = 0.04;
  for (const x0 of [-len / 2 + 0.08, len / 2 - 0.08 - T]) iron.push(sideExtrude(side, x0, T, 0.006, 8));

  // slats: five on the seat, three up the back
  for (let i = 0; i < 5; i++) wood.push(board(len, -0.2 + i * 0.09, 0.47, 0.07, 0.03, 0.012));
  for (let i = 0; i < 3; i++) {
    const t = i / 2;
    wood.push(board(len, 0.24 + t * 0.07, 0.56 + t * 0.24, 0.025, 0.08, 0.01, -0.3));
  }
  return { wood: boxUV(mergeGeometries(wood.map(prep)), 1.6), iron: boxUV(mergeGeometries(iron.map(prep)), 2) };
}

/**
 * Old oak: long grain lines with figure, a few knots, worn lighter where hands and bodies rubbed it,
 * darker in the pores. Grain runs along U.
 */
export function woodTexture(seed = 7, base = '#5a3f2a', size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const r = rand(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  // planks: slightly different tone per board strip
  const strips = 4;
  for (let i = 0; i < strips; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '255,230,200' : '0,0,0'},${0.03 + r() * 0.06})`;
    g.fillRect(0, (i * size) / strips, size, size / strips);
  }
  // grain: wavy lines along x
  for (let i = 0; i < 340; i++) {
    const y = r() * size;
    const dark = r() < 0.6;
    g.strokeStyle = dark ? `rgba(24,14,6,${0.08 + r() * 0.22})` : `rgba(190,150,105,${0.05 + r() * 0.12})`;
    g.lineWidth = 0.4 + r() * 1.8;
    g.beginPath();
    const amp = 1 + r() * 5, f = 0.004 + r() * 0.01, ph = r() * 6;
    for (let x = -4; x <= size + 4; x += 8) g.lineTo(x, y + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.7) * amp * 0.3);
    g.stroke();
  }
  // knots with grain flowing round them
  for (let k = 0; k < 3; k++) {
    const x = r() * size, y = r() * size, rx = 6 + r() * 10;
    for (let j = 6; j > 0; j--) {
      g.strokeStyle = `rgba(30,16,6,${0.12 + j * 0.03})`;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(x, y, rx * (j / 3), rx * (j / 7), 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = 'rgba(25,12,4,0.6)';
    g.beginPath();
    g.ellipse(x, y, rx * 0.5, rx * 0.25, 0, 0, Math.PI * 2);
    g.fill();
  }
  // pores
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = `rgba(10,5,0,${r() * 0.18})`;
    g.fillRect(r() * size, r() * size, 1 + r() * 4, 1);
  }
  // seams between boards
  for (let i = 1; i < strips; i++) {
    g.fillStyle = 'rgba(12,6,2,0.55)';
    g.fillRect(0, (i * size) / strips - 1, size, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
