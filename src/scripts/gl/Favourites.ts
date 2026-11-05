import * as THREE from 'three';

/**
 * Visitors' favourite films and series, as stars in the night sky over the hall's open roof. The walk through the
 * hall ends looking straight up at the moon (timeline.ts): the stars sit round it, in that view. One star per title,
 * at a fixed place (hashed from the title's id, so it never moves between visits), bigger the more people picked it.
 * The server sends at most ~400 (the most picked and the newest), so 10k picks cost the same as 400.
 */

export interface FavStar {
  ref: string; // 'movie:157336' | 'tv:1396'
  title: string;
  year: string | null;
  poster: string | null;
  /** how many visitors picked it */
  count: number;
  /** the latest of them */
  firstName: string | null;
  country: string;
}

const MAX = 400;
/** where the camera stands at the end of the walk, and the moon it looks at (hall-local; see timeline, Hall sky) */
const EYE = new THREE.Vector3(-0.3, 2.0, -15.2);
const MOON = new THREE.Vector3(-1.5, 16, -17.5);
/** the hold looks from the moon to just over it (timeline: MOON → MOON + 0.5 up); stars are laid out from midway */
const LOOK = MOON.clone().add(new THREE.Vector3(0, 0.25, 0));
const Y = new THREE.Vector3(0, 1, 0);
const m4 = new THREE.Matrix4();

function hash(n: number) {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function strHash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h | 0;
}

export class FavSky {
  readonly points: THREE.Points;
  picks: FavStar[] = [];
  /** titles this visitor added (kept in localStorage by social.ts): drawn warmer, always */
  mine = new Set<string>();
  private mineA = new Float32Array(MAX);
  hovered = -1;
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(MAX * 3);
  private size = new Float32Array(MAX);
  private seed = new Float32Array(MAX);
  private born = new Float32Array(MAX).fill(-100);
  private hot = new Float32Array(MAX);
  private mat: THREE.ShaderMaterial;
  private time = 0;
  private world = new THREE.Vector3();
  private v = new THREE.Vector3();

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    this.geo.setAttribute('aBorn', new THREE.BufferAttribute(this.born, 1));
    this.geo.setAttribute('aHot', new THREE.BufferAttribute(this.hot, 1));
    this.geo.setAttribute('aMine', new THREE.BufferAttribute(this.mineA, 1));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aSeed; attribute float aBorn; attribute float aHot; attribute float aMine;
        uniform float uTime; uniform float uScale;
        varying float vTw; varying float vHot; varying float vFlare;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float age = uTime - aBorn;
          vFlare = age < 6.0 ? exp(-age * 0.7) : 0.0; // a new star flares, then settles
          vTw = 0.75 + 0.25 * sin(uTime * (1.3 + aSeed * 2.2) + aSeed * 40.0);
          vHot = max(aHot, aMine * 0.6);
          float px = aSize * (1.0 + aHot * 1.4 + vFlare * 3.0) * uScale;
          gl_PointSize = px * (230.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vTw; varying float vHot; varying float vFlare;
        void main(){
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p);
          float core = smoothstep(0.09, 0.0, d);
          float halo = exp(-d * 11.0) * 0.5;
          // four-point glint, so a star reads as a star and not a dot
          float glint = (exp(-abs(p.x) * 40.0) * exp(-abs(p.y) * 5.0) + exp(-abs(p.y) * 40.0) * exp(-abs(p.x) * 5.0)) * 0.6;
          // warm gold, unlike the cold background stars painted on the sky: these are people's. The white-hot core
          // stays small; the gold lives in the halo and the glint, so the colour survives additive blending
          float glow = (halo + glint * (0.7 + vHot + vFlare)) * vTw;
          vec3 gold = mix(vec3(1.0, 0.68, 0.3), vec3(1.0, 0.5, 0.22), clamp(vHot + vFlare, 0.0, 1.0));
          vec3 col = gold * glow * 1.8 + vec3(1.0, 0.86, 0.6) * core * vTw;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = -4; // over the night sky plane, under everything else
  }

  /** Replace the sky with these stars (one per title). */
  set(stars: FavStar[]) {
    this.picks = stars.slice(0, MAX);
    this.picks.forEach((p, i) => this.place(i, p, -100));
    this.flush();
  }

  /**
   * A title just added (by this visitor, or by someone else while this one watches): a new star flares in, or the
   * existing one grows and flares. Returns its index.
   */
  add(star: FavStar, mine = true) {
    if (mine) this.mine.add(star.ref);
    const at = this.picks.findIndex((p) => p.ref === star.ref);
    if (at >= 0) {
      this.picks[at] = star;
      this.place(at, star, this.time);
      this.flush();
      return at;
    }
    if (this.picks.length >= MAX) this.picks.pop();
    this.picks.unshift(star);
    // shift the attribute arrays one place along, the new star at 0
    for (const [arr, k] of [[this.pos, 3], [this.size, 1], [this.seed, 1], [this.born, 1], [this.hot, 1], [this.mineA, 1]] as const) arr.copyWithin(k, 0, (MAX - 1) * k);
    this.place(0, star, this.time);
    this.hot[0] = 0;
    this.hovered = -1;
    this.flush();
    return 0;
  }

  /** Index of a title in the sky, or −1. */
  indexOf(ref: string) {
    return this.picks.findIndex((p) => p.ref === ref);
  }

  /** The lens the sky is seen through at the hold: stars are laid out to fill that view, so a new lens re-lays them. */
  private lens = { tanV: Math.tan(THREE.MathUtils.degToRad(19)), aspect: 1.6 };
  frame(fovDeg: number, aspect: number) {
    const tanV = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
    if (Math.abs(tanV - this.lens.tanV) < 1e-4 && Math.abs(aspect - this.lens.aspect) < 1e-3) return;
    this.lens = { tanV, aspect };
    this.picks.forEach((p, i) => {
      const born = this.born[i];
      this.place(i, p, born);
    });
    this.flush();
  }

  private place(i: number, p: FavStar, born: number) {
    // A spot on the screen of the hold view (the camera at EYE looking up at the moon), in that camera's own axes:
    // looking straight up the camera is rolled, so world left/right would land the stars on a diagonal. u, v are
    // fractions of the half-width and half-height: across the whole width, from the nav down to just above the
    // invitation at the foot, never on the moon. Hashed from the title, so a star keeps its place between visits.
    const id = strHash(p.ref);
    const { tanV, aspect } = this.lens;
    let u = 0, v = 0;
    for (let k = 0; k < 12; k++) {
      u = (hash(id * 7 + 1 + k * 101) * 2 - 1) * 0.9;
      v = -0.3 + hash(id * 13 + 5 + k * 103) * 1.12; // −0.3 … 0.82
      const dx = u * aspect, moon = Math.hypot(dx, v + 0.05);
      if (moon > 0.34) break;
    }
    const c = hash(id * 31 + 9);
    m4.lookAt(EYE, LOOK, Y);
    const right = this.v.setFromMatrixColumn(m4, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(m4, 1);
    const fwd = new THREE.Vector3().setFromMatrixColumn(m4, 2).negate();
    const dir = fwd.addScaledVector(right, u * tanV * aspect).addScaledVector(up, v * tanV).normalize();
    const dist = 11 + c * 3;
    this.pos.set([EYE.x + dir.x * dist, EYE.y + dir.y * dist, EYE.z + dir.z * dist], i * 3);
    this.size[i] = 1.7 + Math.min(2.2, Math.log2(p.count) * 0.45) + c * 0.3;
    this.seed[i] = hash(id * 3 + 2);
    this.mineA[i] = this.mine.has(p.ref) ? 1 : 0;
    this.born[i] = born;
  }

  private flush() {
    for (const k of ['position', 'aSize', 'aSeed', 'aBorn', 'aHot', 'aMine']) (this.geo.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, this.picks.length);
  }

  /** how near (CSS px) the pointer must come to a star: wider for a fingertip */
  reach = 22;

  /** The star nearest the pointer (within reach), or −1. */
  hit(clientX: number, clientY: number, camera: THREE.Camera) {
    if (!this.points.visible || !this.picks.length) return -1;
    let best = -1, bd = this.reach * this.reach;
    for (let i = 0; i < this.picks.length; i++) {
      const s = this.screen(i, camera);
      if (!s) continue;
      const d = (s.x - clientX) ** 2 + (s.y - clientY) ** 2;
      if (d < bd) (bd = d), (best = i);
    }
    return best;
  }

  /** Where star i is on screen (CSS px), or null when behind the camera. */
  screen(i: number, camera: THREE.Camera) {
    this.world.fromArray(this.pos, i * 3).applyMatrix4(this.points.matrixWorld).project(camera);
    if (this.world.z > 1 || Math.abs(this.world.x) > 1.1 || Math.abs(this.world.y) > 1.1) return null;
    return { x: (this.world.x * 0.5 + 0.5) * innerWidth, y: (-this.world.y * 0.5 + 0.5) * innerHeight };
  }

  update(time: number, viewportH: number) {
    this.time = time;
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uScale.value = viewportH / 900;
    const attr = this.geo.getAttribute('aHot') as THREE.BufferAttribute;
    let dirty = false;
    for (let i = 0; i < this.picks.length; i++) {
      const target = i === this.hovered ? 1 : 0;
      if (Math.abs(this.hot[i] - target) > 0.01) {
        this.hot[i] += (target - this.hot[i]) * 0.2;
        dirty = true;
      }
    }
    if (dirty) attr.needsUpdate = true;
  }
}
