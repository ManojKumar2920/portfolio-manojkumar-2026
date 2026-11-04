import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import type { LightState } from './timeline';
import { NOTE, PATH, POND, groundAt, pathHalfWidth, pondD, pondPoint } from './landscape';
import { Birds, type Blossom } from './Birds';
import { gustAt } from './Petals';
import { Note } from './Note';

/**
 * Everything along the footpath and round the pond: stone lanterns that light up at dusk, stepping stones in the
 * worn path, the old note on the path, the pond's water and its planted shore, and the hummingbirds.
 */

export interface GardenAssets {
  lanterns: GLTF;
  pond: GLTF;
  bird: GLTF;
}

interface Options {
  isMobile: boolean;
  env: THREE.Texture | null;
  stoneMap: THREE.Texture | null;
  blossoms: Blossom[];
  /** existing perches (fence-post tops); lantern tops are added here */
  perches: THREE.Vector3[];
  /** camera key positions (x, z): nothing tall is planted right in front of the lens */
  cameraKeys: [number, number][];
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Lantern height in world units per source unit (source lanterns are 1.4–2.1 tall -> 0.3–0.45). */
const LANTERN_SCALE = 0.215;
/** Pond diorama -> world (its water was ~5.6 wide; ours ~2.1). */
const POND_SCALE = 0.36;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  // roughly exponential falloff: no visible rim
  grad.addColorStop(0, 'rgba(255,214,160,1)');
  grad.addColorStop(0.12, 'rgba(255,180,110,0.55)');
  grad.addColorStop(0.35, 'rgba(255,150,80,0.16)');
  grad.addColorStop(0.65, 'rgba(255,140,60,0.04)');
  grad.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Tileable ripple normal map: a sum of wrapped sines and soft blobs, differentiated. */
function rippleNormals(size = 256) {
  const h = new Float32Array(size * size);
  const waves = Array.from({ length: 7 }, () => [Math.floor(rand(1, 6)), Math.floor(rand(-5, 6)), rand(0, 6.28), rand(0.4, 1)]);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const [kx, ky, ph, a] of waves) v += a * Math.sin(((kx * x + ky * y) / size) * Math.PI * 2 + ph);
      h[y * size + x] = v;
    }
  const img = new ImageData(size, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5, dy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
      const n = new THREE.Vector3(-dx * 2.5, -dy * 2.5, 1).normalize();
      const i = (y * size + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255;
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d')!.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Float copy of a (possibly quantized) geometry's position/normal/uv, transformed — ready to merge. */
function bake(geo: THREE.BufferGeometry, m: THREE.Matrix4) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv'] as const) {
    const src = geo.getAttribute(name);
    if (!src) continue;
    const n = src.itemSize;
    const arr = new Float32Array(src.count * n);
    for (let i = 0; i < src.count; i++) {
      arr[i * n] = src.getX(i);
      arr[i * n + 1] = src.getY(i);
      if (n > 2) arr[i * n + 2] = src.getZ(i);
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, n));
  }
  if (geo.index) out.setIndex(Array.from(geo.index.array as ArrayLike<number>));
  out.applyMatrix4(m);
  return out;
}

export class Garden {
  group = new THREE.Group();
  /** materials whose env intensity follows the light (Ruin.lit) */
  materials: THREE.MeshStandardMaterial[] = [];
  private lanternMats: THREE.MeshStandardMaterial[] = [];
  private pools: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private halos: THREE.Sprite[] = [];
  private water!: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private birds: Birds | null = null;
  note: Note;
  private time = 0;

  constructor(assets: GardenAssets, private o: Options) {
    const tops = this.buildLanterns(assets.lanterns);
    this.note = new Note(o.isMobile, o.env);
    this.materials.push(this.note.material);
    this.group.add(this.note.group);
    this.buildStones();
    this.buildPond(assets.pond);
    // the hummingbird model's beak points 135° off +Z
    this.birds = new Birds(assets.bird, o.isMobile ? 2 : 3, o.blossoms, [...o.perches, ...tops], (-3 * Math.PI) / 4);
    this.group.add(this.birds.group);
  }

  /**
   * The hero camera sits low on the slope, so anything lantern-height between it and the ruin rises over the
   * horizon and covers the walls: keep a narrow cone from the opening shots toward the ruin clear.
   */
  private blocksHero(x: number, z: number) {
    return this.o.cameraKeys.slice(0, 2).some(([kx, kz]) => {
      const dx = x - kx, dz = z - kz, lx = -kx, lz = -kz;
      const cos = (dx * lx + dz * lz) / (Math.hypot(dx, dz) * Math.hypot(lx, lz));
      return cos > Math.cos(THREE.MathUtils.degToRad(13)) && Math.hypot(dx, dz) < Math.hypot(lx, lz);
    });
  }

  private nearCamera(x: number, z: number, r: number) {
    return this.o.cameraKeys.some(([kx, kz]) => Math.hypot(x - kx, z - kz) < r);
  }

  /* ---------- lanterns ---------- */
  private buildLanterns(gltf: GLTF): THREE.Vector3[] {
    const kinds = [1, 2, 3, 4, 5].map((i) => gltf.scene.getObjectByName(`lantern_${i}`)).filter(Boolean) as THREE.Object3D[];
    if (!kinds.length) return [];
    for (const k of kinds) {
      k.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(k);
      k.position.sub(new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2));
      k.userData.height = box.max.y - box.min.y;
    }
    gltf.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!m || this.lanternMats.includes(m)) return;
      m.envMap = this.o.env;
      m.emissive.set('#ffb469');
      m.emissiveIntensity = 0;
      this.lanternMats.push(m);
      this.materials.push(m);
    });

    // [path parameter, side]: alternating down the path, then two on the pond bank
    const spots: { x: number; z: number; yaw: number; kind: number }[] = [];
    const along = [0.05, 0.16, 0.28, 0.4, 0.52, 0.64, 0.78];
    along.forEach((t, i) => {
      const p = PATH.getPointAt(t), tan = PATH.getTangentAt(t);
      const side = i % 2 ? 1 : -1;
      const off = pathHalfWidth(t) + 0.2;
      const x = p.x + -tan.z * side * off, z = p.z + tan.x * side * off;
      if (this.nearCamera(x, z, 1.3) || this.blocksHero(x, z) || Math.hypot(x - NOTE.x, z - NOTE.z) < 0.6) return;
      spots.push({ x, z, yaw: Math.atan2(p.x - x, p.z - z), kind: i % kinds.length }); // face the path
    });
    // two on the pond's far bank (away from the path), facing the water
    for (const [ang, kind] of [[2.4, 3], [3.7, 4]] as [number, number][]) {
      const [x, z] = pondPoint(1.45, ang);
      if (this.blocksHero(x, z)) continue;
      spots.push({ x, z, yaw: Math.atan2(POND.x - x, POND.z - z), kind });
    }

    const tops: THREE.Vector3[] = [];
    const glow = glowTexture();
    spots.forEach(({ x, z, yaw, kind }, i) => {
      const src = kinds[kind % kinds.length];
      const l = src.clone();
      const pivot = new THREE.Group();
      pivot.add(l);
      const y = groundAt(x, z) - 0.02;
      pivot.position.set(x, y, z);
      pivot.rotation.set(rand(-0.03, 0.03), yaw + rand(-0.15, 0.15), rand(-0.03, 0.03)); // set by hand, not by a level
      pivot.scale.setScalar(LANTERN_SCALE);
      l.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.castShadow = m.receiveShadow = !this.o.isMobile;
      });
      this.group.add(pivot);
      const h = src.userData.height * LANTERN_SCALE;
      tops.push(new THREE.Vector3(x, y + h, z));

      // the fire box sits a little above half height
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      halo.position.set(x, y + h * 0.6, z);
      halo.scale.setScalar(h * 0.75);
      this.halos.push(halo);
      this.group.add(halo);

      // the warm pool it throws on the ground: an additive decal tilted to the slope (no real light: a point
      // light would cost a pass over every tree and petal fragment)
      const pool = new THREE.Mesh(
        new THREE.CircleGeometry(h * 1.15, 24).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: glow, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2 }),
      );
      const e = 0.05, gx = groundAt(x + e, z) - groundAt(x - e, z), gz = groundAt(x, z + e) - groundAt(x, z - e);
      pool.lookAt(new THREE.Vector3(-gx, 2 * e, -gz)); // align +z to the ground normal...
      pool.rotateX(Math.PI / 2); // ...and the disc (in xz) with it
      pool.position.set(x, groundAt(x, z) + 0.01, z);
      pool.renderOrder = 2;
      this.pools.push(pool);
      this.group.add(pool);
    });
    return tops;
  }

  /* ---------- stepping stones in the worn path ---------- */
  private buildStones() {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.18 * Math.sin(x * 3.1 + z * 1.7) * Math.cos(z * 2.3 - x);
      p.setXYZ(i, x * n, Math.max(y, -0.2) * (y > 0 ? 0.35 : 0.6), z * n);
    }
    g.computeVertexNormals();
    const map = this.o.stoneMap?.clone() ?? null;
    if (map) {
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(0.3, 0.3);
      map.needsUpdate = true;
    }
    const mat = new THREE.MeshStandardMaterial({ map, color: '#8d8a7a', roughness: 0.95, envMap: this.o.env });
    this.materials.push(mat);

    const len = PATH.getLength();
    const place: THREE.Matrix4[] = [];
    const d = new THREE.Object3D();
    for (let s = 0.08; s < len; s += 0.13) {
      const t = s / len;
      if (Math.random() < 0.4) continue; // worn gaps
      const pt = PATH.getPointAt(t), tan = PATH.getTangentAt(t);
      const w = pathHalfWidth(t);
      const lat = rand(-0.7, 0.7) * w;
      const x = pt.x - tan.z * lat, z = pt.z + tan.x * lat;
      if (Math.hypot(x - NOTE.x, z - NOTE.z) < 0.4) continue; // the note lies here
      const r = rand(0.045, 0.085) * (1 - Math.abs(lat / w) * 0.4);
      d.position.set(x, groundAt(x, z) - 0.006, z);
      d.rotation.set(rand(-0.05, 0.05), rand(0, Math.PI), rand(-0.05, 0.05));
      d.scale.set(r * rand(0.9, 1.4), r * 0.5, r);
      d.updateMatrix();
      place.push(d.matrix.clone());
    }
    const mesh = new THREE.InstancedMesh(g, mat, place.length);
    place.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.receiveShadow = !this.o.isMobile;
    this.group.add(mesh);
  }

  /* ---------- pond ---------- */
  /**
   * Still water: a real planar reflection of the set (Reflector), bent by two drifting ripple normal layers and
   * weighted by Schlick fresnel over a dark silt bed, plus a sun glint and the scene fog. Where the mirror sees
   * nothing it falls back to the live sky gradient.
   */
  private waterMaterial() {
    const normals = rippleNormals();
    return new THREE.ShaderMaterial({
      transparent: true,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uNormals: { value: normals },
          uOffA: { value: new THREE.Vector2() },
          uOffB: { value: new THREE.Vector2() },
          uRough: { value: 0.15 },
          uSkyTop: { value: new THREE.Color('#6d86a3') },
          uSkyBottom: { value: new THREE.Color('#e9c9a0') },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uSunCol: { value: new THREE.Color('#ffd2a0') },
          uDeep: { value: new THREE.Color('#1f2d24') },
          uBank: { value: new THREE.Color('#1f2a17') },
        },
      ]),
      vertexShader: /* glsl */ `
        attribute float aShore;
        uniform mat4 textureMatrix;
        varying vec3 vW;
        varying float vShore;
        varying vec4 vMirror;
        #include <fog_pars_vertex>
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vMirror = textureMatrix * vec4(position, 1.0);
          vShore = aShore;
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uNormals, tDiffuse;
        uniform vec2 uOffA, uOffB;
        uniform float uRough;
        uniform vec3 uSkyTop, uSkyBottom, uSunDir, uSunCol, uDeep, uBank;
        varying vec3 vW;
        varying float vShore;
        varying vec4 vMirror;
        #include <fog_pars_fragment>
        void main() {
          vec2 uv = vW.xz * 4.0;
          vec3 a = texture2D(uNormals, uv + uOffA).xyz * 2.0 - 1.0;
          vec3 b = texture2D(uNormals, uv * 1.7 + uOffB).xyz * 2.0 - 1.0;
          vec2 slope = (a.xy + b.xy) * uRough;
          vec3 N = normalize(vec3(slope.x, 1.0, slope.y));
          vec3 V = normalize(cameraPosition - vW);
          vec3 R = reflect(-V, N);
          float cosV = max(dot(N, V), 0.0);
          float fres = 0.04 + 0.96 * pow(1.0 - cosV, 5.0);
          // mirror image, bent by the ripples
          vec4 m = vMirror;
          m.xy += slope * 0.35 * m.w;
          vec3 mirror = texture2DProj(tDiffuse, m).rgb;
          // where the mirror caught nothing (cleared black), fall back to the sky gradient
          vec3 sky = mix(uSkyBottom, uSkyTop, smoothstep(0.0, 0.6, R.y));
          // water absorbs a little: reflections sit a touch darker and greener than what they show
          vec3 refl = mix(sky, mirror, step(0.0005, dot(mirror, vec3(1.0)))) * vec3(0.78, 0.84, 0.82);
          // still water over a dark bed reads as a mirror; the bed only shows looking straight down and in the shallows
          float shallow = smoothstep(0.7, 1.0, vShore);
          float k = clamp(fres * 1.2 + 0.16, 0.0, 0.9) * (1.0 - shallow * 0.35);
          vec3 bed = mix(uDeep, uBank, shallow * 0.6);
          float glint = pow(max(dot(R, normalize(uSunDir)), 0.0), 1400.0) * 2.0;
          vec3 col = mix(bed, refl, k) + uSunCol * glint;
          float alpha = mix(0.88, 1.0, k) * (1.0 - smoothstep(0.97, 1.04, vShore)); // feather into the bank
          gl_FragColor = vec4(col, alpha);
          #include <fog_fragment>
        }`,
    });
  }

  private buildPond(gltf: GLTF) {
    // water: a disc bent to the lobed shoreline, a hair past it so the bank swallows the edge. Built in the
    // Reflector's local XY plane (its mirror normal is local +Z), then laid flat at the water level.
    const geo = new THREE.CircleGeometry(1, 96);
    const pos = geo.getAttribute('position');
    const shoreD = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const cx = pos.getX(i), cy = pos.getY(i);
      const r = Math.hypot(cx, cy);
      const [x, z] = pondPoint(r * 1.04, Math.atan2(cy, cx));
      pos.setXYZ(i, x, -z, 0); // rotation.x = -PI/2 maps local (x, y, 0) to world (x, 0, -y)
      shoreD[i] = r;
    }
    geo.setAttribute('aShore', new THREE.BufferAttribute(shoreD, 1));
    geo.computeVertexNormals();
    if (geo.getAttribute('normal').getZ(0) < 0) geo.index!.array.reverse(); // pond frame may be left-handed: keep faces up
    geo.computeBoundingSphere();

    // planar mirror: the scene re-drawn reflected about the water plane into a small texture (grass is on
    // layer 1, which the mirror camera does not see, so the pass stays cheap)
    const res = this.o.isMobile ? 0.25 : 0.4;
    const mirror = new Reflector(geo, {
      textureWidth: Math.round(innerWidth * Math.min(devicePixelRatio, 1.5) * res),
      textureHeight: Math.round(innerHeight * Math.min(devicePixelRatio, 1.5) * res),
      clipBias: 0.003,
      multisample: 0,
    });
    const reflected = (mirror.material as THREE.ShaderMaterial).uniforms;
    const mat = this.waterMaterial();
    mat.uniforms.tDiffuse = { value: reflected.tDiffuse.value };
    mat.uniforms.textureMatrix = { value: reflected.textureMatrix.value };
    (mirror.material as THREE.Material).dispose();
    mirror.material = mat;
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.y = POND.level;
    mirror.renderOrder = 1;
    this.water = mirror as unknown as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    this.group.add(this.water);

    // shore: the diorama's rocks, bushes, plants and grass tufts, replanted round our shoreline and merged
    const lib: Record<'rock' | 'bush' | 'plant' | 'tuft', THREE.Mesh[]> = { rock: [], bush: [], plant: [], tuft: [] };
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const name = (m.name + ' ' + (m.parent?.name ?? '')).toLowerCase();
      const kind = /rock/.test(name) ? 'rock' : /bush/.test(name) ? 'bush' : /grass/.test(name) ? 'tuft' : /lactuca|dandelion|plantain/.test(name) ? 'plant' : null;
      if (kind) lib[kind].push(m);
    });
    const plan: { kind: keyof typeof lib; n: number; d: [number, number]; sink: number; scale: [number, number]; uphill?: boolean }[] = [
      { kind: 'rock', n: this.o.isMobile ? 14 : 24, d: [0.95, 1.1], sink: 0.45, scale: [0.25, 0.55] },
      { kind: 'bush', n: this.o.isMobile ? 3 : 5, d: [1.35, 1.9], sink: 0.08, scale: [0.45, 0.7], uphill: true },
      { kind: 'tuft', n: this.o.isMobile ? 24 : 44, d: [0.97, 1.35], sink: 0.02, scale: [0.35, 0.6] },
      { kind: 'plant', n: this.o.isMobile ? 26 : 54, d: [1.05, 1.7], sink: 0.02, scale: [0.4, 0.65] },
    ];
    const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; shadow: boolean }>();
    const q = new THREE.Quaternion(), sc = new THREE.Vector3(), tmpPos = new THREE.Vector3();
    const m4 = new THREE.Matrix4();
    for (const { kind, n, d, sink, scale, uphill } of plan) {
      const src = lib[kind];
      if (!src.length) continue;
      for (let i = 0; i < n; i++) {
        // bushes keep to the far end of the pond, away from the path and out of the hero's view of the ruin
        const ang = uphill ? rand(Math.PI * 0.75, Math.PI * 1.25) : (i / n) * Math.PI * 2 + rand(-0.25, 0.25);
        const [x, z] = pondPoint(rand(d[0], d[1]), ang);
        if (kind === 'bush' && (this.nearCamera(x, z, 1.6) || this.blocksHero(x, z))) continue;
        if (kind !== 'rock' && kind !== 'plant' && this.blocksHero(x, z) && Math.random() < 0.6) continue;
        const mesh = src[Math.floor(Math.random() * src.length)];
        mesh.matrixWorld.decompose(tmpPos, q, sc);
        const g = mesh.geometry;
        g.computeBoundingBox();
        const s = POND_SCALE * rand(scale[0], scale[1]);
        const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, Math.PI * 2));
        // local bbox -> base offset (after the source rotation/scale)
        const box = g.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(), q, sc));
        const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, h = box.max.y - box.min.y;
        const base = new THREE.Matrix4().makeTranslation(-cx, -box.min.y - h * sink, -cz);
        m4.compose(new THREE.Vector3(x, groundAt(x, z), z), yaw, new THREE.Vector3(s, s, s))
          .multiply(base)
          .multiply(new THREE.Matrix4().compose(new THREE.Vector3(), q, sc));
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const mat = mats[0];
        const e = byMat.get(mat) ?? { geos: [], shadow: kind === 'rock' || kind === 'bush' };
        e.geos.push(bake(g, m4));
        byMat.set(mat, e);
      }
    }
    for (const [mat, { geos, shadow }] of byMat) {
      const merged = mergeGeometries(geos);
      if (!merged) continue;
      const sm = mat as THREE.MeshStandardMaterial;
      sm.envMap = this.o.env;
      // into the dusk grade: the diorama's greens muted, its pale rocks weathered and mossy
      sm.color.multiply(new THREE.Color(/rock/i.test(sm.name) ? '#7d7766' : '#9c9a7c'));
      if (sm.alphaTest > 0 || sm.transparent) {
        sm.transparent = false;
        sm.alphaTest = 0.5;
        sm.side = THREE.DoubleSide;
      }
      this.materials.push(sm);
      const mesh = new THREE.Mesh(merged, sm);
      mesh.castShadow = shadow && !this.o.isMobile;
      mesh.receiveShadow = !this.o.isMobile;
      this.group.add(mesh);
    }
  }

  update(dt: number, s: LightState) {
    this.time += dt;
    const t = this.time;
    const night = THREE.MathUtils.smoothstep(s.windows, 0.25, 0.85);

    // lanterns: emissive + halo + a few real lights, with a slow candle flicker
    const flick = 0.88 + 0.12 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1.3);
    for (const m of this.lanternMats) m.emissiveIntensity = night * 2.4 * flick;
    this.halos.forEach((h, i) => ((h.material as THREE.SpriteMaterial).opacity = night * 0.4 * (0.9 + 0.1 * Math.sin(t * 5 + i))));
    this.pools.forEach((p, i) => (p.material.opacity = night * 0.2 * (0.9 + 0.1 * Math.sin(t * 6.1 + i * 2))));

    // water: ripples drift with the wind and roughen in gusts; sky and sun follow the time of day
    const gust = gustAt(POND.x, POND.z, t);
    const u = this.water.material.uniforms;
    u.uOffA.value.x += dt * (0.01 + gust * 0.03);
    u.uOffA.value.y += dt * 0.006;
    u.uOffB.value.x -= dt * 0.004;
    u.uOffB.value.y += dt * (0.008 + gust * 0.02);
    u.uRough.value = 0.02 + gust * 0.07;
    u.uSkyTop.value.copy(s.skyTop);
    u.uSkyBottom.value.copy(s.skyBottom);
    u.uSunDir.value.copy(s.sunDir);
    u.uSunCol.value.copy(s.sun).multiplyScalar(s.sunStrength);
    u.uDeep.value.set('#1f2d24').multiplyScalar(0.35 + 0.65 * Math.min(1, s.sunStrength));
    u.uBank.value.copy(s.skyBottom).multiplyScalar(0.18).lerp(new THREE.Color('#1c2614'), 0.6);

    this.note.update(dt, gustAt(NOTE.x, NOTE.z, t));

    this.birds?.update(dt, night > 0.6);
  }
}

/** Is (x, z) part of the garden's water or near shore (keep grass, trees and posts off it)? */
export const inPond = (x: number, z: number, margin = 0) => pondD(x, z) < 1 + margin;
