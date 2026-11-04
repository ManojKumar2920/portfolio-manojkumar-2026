import * as THREE from 'three';

/**
 * Cherry blossom petals. They let go from the canopies, tumble and flutter down on the same wind that bends the
 * grass (direction + travelling gusts), settle on the turf (or float on the pond, drifting with the breeze), get
 * picked up again when a strong gust passes, and finally fade and regrow in a canopy. CPU-simulated, drawn as one InstancedMesh.
 */

export interface PetalTree {
  x: number;
  z: number;
  /** ground height at the trunk */
  y: number;
  /** tree height, world units */
  h: number;
}

const FALLING = 0, RESTING = 1, FADING = 2;
const TERMINAL = 0.15; // world units / s (tree ≈ 2 units tall)

function petalTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, s, s);
  // a rounded petal with the cherry's notch at the tip
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(s * 0.5, s * 0.96);
  g.bezierCurveTo(s * 0.04, s * 0.7, s * 0.06, s * 0.12, s * 0.38, s * 0.06);
  g.lineTo(s * 0.5, s * 0.17);
  g.lineTo(s * 0.62, s * 0.06);
  g.bezierCurveTo(s * 0.94, s * 0.12, s * 0.96, s * 0.7, s * 0.5, s * 0.96);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Wind shared with the grass shader (Ruin.ts uWind): a base breeze plus travelling gusts. */
export const WIND_DIR = new THREE.Vector2(0.86, 0.5).normalize();
export function gustAt(x: number, z: number, t: number) {
  const along = x * WIND_DIR.x + z * WIND_DIR.y;
  const across = -x * WIND_DIR.y + z * WIND_DIR.x;
  const n = 0.5 + 0.3 * Math.sin(along * 0.55 - t * 0.6) + 0.2 * Math.sin(across * 0.8 + t * 0.23 + Math.sin(t * 0.11) * 2);
  return THREE.MathUtils.smoothstep(n, 0.55, 0.9);
}

export class Petals {
  mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private total: number;
  private p: Float32Array; // position
  private v: Float32Array; // velocity
  private r: Float32Array; // euler rotation
  private w: Float32Array; // spin
  private size: Float32Array;
  private life: Float32Array;
  private phase: Float32Array;
  private mode: Uint8Array;
  private afloat: Uint8Array;
  private weights: number[];
  private dummy = new THREE.Object3D();
  private time = 0;

  constructor(
    private trees: PetalTree[],
    count: number,
    private ground: (x: number, z: number) => number,
    private water: (x: number, z: number) => boolean = () => false,
  ) {
    this.total = count;
    const geo = new THREE.PlaneGeometry(1, 1, 2, 2);
    // cup the petal a little
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getX(i) ** 2 * 0.35);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      alphaMap: petalTexture(),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.55,
      emissive: new THREE.Color('#ff9fb4'),
      emissiveIntensity: 0.12, // light through the petal
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, col.set('#ffd9e2').lerp(new THREE.Color('#f39ab4'), Math.random() * 0.8));

    this.p = new Float32Array(count * 3);
    this.v = new Float32Array(count * 3);
    this.r = new Float32Array(count * 3);
    this.w = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.life = new Float32Array(count);
    this.phase = new Float32Array(count);
    this.mode = new Uint8Array(count);
    this.afloat = new Uint8Array(count);
    this.weights = trees.map((t) => t.h * t.h);

    // pre-warm: some in the air, most already scattered on the ground under the trees
    for (let i = 0; i < count; i++) {
      this.spawn(i);
      if (Math.random() < 0.55) {
        const t = this.trees[this.pickTree()];
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * t.h * 0.9;
        this.p[i * 3] = t.x + Math.cos(a) * d + WIND_DIR.x * Math.random() * 1.2;
        this.p[i * 3 + 2] = t.z + Math.sin(a) * d + WIND_DIR.y * Math.random() * 1.2;
        this.land(i, Math.random() * 10);
      } else {
        this.p[i * 3 + 1] -= Math.random() * 1.2;
      }
    }
  }

  setQuality(frac: number) {
    this.mesh.count = Math.max(1, Math.floor(this.total * Math.max(0.35, frac)));
  }

  private pickTree() {
    let k = Math.random() * this.weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < this.weights.length; i++) if ((k -= this.weights[i]) <= 0) return i;
    return 0;
  }

  /** A fresh petal somewhere inside a canopy. */
  private spawn(i: number) {
    const t = this.trees[this.pickTree()];
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * t.h * 0.36;
    const j = i * 3;
    this.p[j] = t.x + Math.cos(a) * d;
    this.p[j + 1] = t.y + t.h * (0.5 + Math.random() * 0.4);
    this.p[j + 2] = t.z + Math.sin(a) * d;
    this.v.fill(0, j, j + 3);
    for (let k = 0; k < 3; k++) {
      this.r[j + k] = Math.random() * Math.PI * 2;
      this.w[j + k] = (Math.random() - 0.5) * 7;
    }
    this.size[i] = 0.03 + Math.random() * 0.02;
    this.phase[i] = Math.random() * 100;
    this.mode[i] = FALLING;
    this.life[i] = 0;
  }

  /** Lie (nearly) flat on the grass tops for a while. */
  private land(i: number, rest: number) {
    const j = i * 3;
    const wet = this.water(this.p[j], this.p[j + 2]);
    this.afloat[i] = wet ? 1 : 0;
    // on the grass tops, or flat on the water
    this.p[j + 1] = this.ground(this.p[j], this.p[j + 2]) + (wet ? 0.003 : 0.015 + Math.random() * 0.05);
    if (wet) rest *= 2.5; // petals linger on still water
    this.v.fill(0, j, j + 3);
    this.r[j] = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    this.r[j + 2] = (Math.random() - 0.5) * 0.6;
    this.mode[i] = RESTING;
    this.life[i] = rest;
  }

  update(dt: number) {
    this.time += dt;
    const t = this.time;
    const { p, v, r, w } = this;
    const k = Math.min(1, dt * 2.2);
    const n = this.mesh.count;
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      const x = p[j], z = p[j + 2];
      const gust = gustAt(x, z, t);
      let scale = this.size[i];

      if (this.mode[i] === FALLING) {
        // drift toward the wind, flutter across it, sink at a terminal speed that wobbles with the tumble
        const ph = this.phase[i];
        const speed = 0.08 + 0.55 * gust;
        const flutter = Math.sin(t * 2.7 + ph) * 0.12;
        const tx = WIND_DIR.x * speed - WIND_DIR.y * flutter;
        const tz = WIND_DIR.y * speed + WIND_DIR.x * flutter;
        const ty = -TERMINAL * (0.7 + 0.5 * Math.abs(Math.sin(r[j]))) + gust * 0.1 + Math.sin(t * 1.9 + ph * 1.3) * 0.05;
        v[j] += (tx - v[j]) * k;
        v[j + 1] += (ty - v[j + 1]) * k;
        v[j + 2] += (tz - v[j + 2]) * k;
        p[j] += v[j] * dt;
        p[j + 1] += v[j + 1] * dt;
        p[j + 2] += v[j + 2] * dt;
        const spin = 0.4 + gust;
        r[j] += w[j] * dt * spin;
        r[j + 1] += w[j + 1] * dt * spin;
        r[j + 2] += w[j + 2] * dt * spin;
        if (p[j + 1] <= this.ground(p[j], p[j + 2]) + 0.02) this.land(i, 6 + Math.random() * 14);
        if (Math.hypot(p[j], p[j + 2]) > 14) this.spawn(i); // blown off the hill
      } else if (this.mode[i] === RESTING) {
        this.life[i] -= dt;
        if (this.afloat[i]) {
          // drift on the surface, turning slowly; stop where it washes up
          const nx = p[j] + WIND_DIR.x * (0.012 + gust * 0.03) * dt, nz = p[j + 2] + WIND_DIR.y * (0.012 + gust * 0.03) * dt;
          if (this.water(nx, nz)) (p[j] = nx), (p[j + 2] = nz);
          r[j + 1] += dt * 0.15 * Math.sin(this.phase[i]);
          if (this.life[i] <= 0) (this.mode[i] = FADING), (this.life[i] = 1.5);
        } else if (gust > 0.75 && Math.random() < dt * 0.8) {
          // a strong gust picks it back up
          this.mode[i] = FALLING;
          v[j] = WIND_DIR.x * 0.5;
          v[j + 1] = 0.25 + Math.random() * 0.35;
          v[j + 2] = WIND_DIR.y * 0.5;
        } else if (this.life[i] <= 0) {
          this.mode[i] = FADING;
          this.life[i] = 1.5;
        }
      } else {
        this.life[i] -= dt;
        scale *= Math.max(0, this.life[i] / 1.5);
        if (this.life[i] <= 0) this.spawn(i);
      }

      const d = this.dummy;
      d.position.set(p[j], p[j + 1], p[j + 2]);
      d.rotation.set(r[j], r[j + 1], r[j + 2]);
      d.scale.set(scale, scale * 1.2, scale);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
