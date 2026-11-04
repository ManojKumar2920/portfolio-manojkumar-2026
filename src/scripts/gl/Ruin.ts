import * as THREE from 'three';
import { gardenBenchGeometry, woodTexture } from './furniture';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EXTERIOR, type LightState } from './timeline';
import { Petals, type PetalTree } from './Petals';
import { NOTE, groundAt, isWater, pathMask, pathNearest, pondD, surfaceAt } from './landscape';
import { Garden, type GardenAssets } from './Garden';
import type { Blossom } from './Birds';

/**
 * The opening set: an overgrown chapel ruin on a grassy hilltop, framed by trees (after the reference render).
 * ruin.glb brings the ruin and ladders, trees.glb the trees; the hill, grass, flowers, fence posts, rocks and far ridges are built here.
 * The terrain (hill, pond basin, footpath) lives in landscape.ts; lanterns, path stones, pond and birds in Garden.ts.
 * World units: ruin ≈ 3.1 wide, tower ≈ 2.1 tall, ruin centred on the origin, its floor at y = 0.
 */

const RUIN_WIDTH = 3.1;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function noiseTexture(size: number, base: string, spots: [string, number][], count: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const [col, a] = spots[i % spots.length];
    ctx.globalAlpha = a * Math.random();
    ctx.fillStyle = col;
    const r = rand(1, size * 0.04);
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Box-projected UVs (dominant normal axis), tiled about every 1.5 model units. */
function boxUV(g: THREE.BufferGeometry) {
  if (g.userData.boxUV) return;
  g.userData.boxUV = true;
  const pos = g.attributes.position, nrm = g.attributes.normal;
  if (!nrm) g.computeVertexNormals();
  const n = g.attributes.normal;
  g.computeBoundingBox();
  const size = g.boundingBox!.getSize(new THREE.Vector3());
  const k = 1 / Math.max(1e-6, Math.max(size.x, size.y, size.z) / 2.5); // ~2.5 tiles across the largest side
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = pos.getX(i) * k, y = pos.getY(i) * k, z = pos.getZ(i) * k;
    if (ax >= ay && ax >= az) uv.set([z, y], i * 2);
    else if (ay >= az) uv.set([x, z], i * 2);
    else uv.set([x, y], i * 2);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export class Ruin {
  group = new THREE.Group();
  private footprint = { x0: -1.6, x1: 1.6, z0: -1, z1: 1 };
  private sun = new THREE.DirectionalLight('#ffd2a0', 3);
  private hemi = new THREE.HemisphereLight('#ffe2c4', '#2c3318', 1);
  private lantern = new THREE.PointLight('#ffad5c', 0, 3.2, 1.6);
  private grass: THREE.InstancedMesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private flies: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private sunDay = new THREE.Vector3(-5.5, 4.2, 3.6);
  private sunNight = new THREE.Vector3(4.5, 5, -4);
  private tmp = new THREE.Color();
  private lit: THREE.MeshStandardMaterial[] = [];
  private terrain!: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private stoneMap: THREE.Texture | null = null;
  private petals: Petals | null = null;
  private fillTrees: THREE.Object3D[] = [];
  private garden: Garden | null = null;
  /** blossom points on the front trees' outer canopy (birds feed here) */
  private blossoms: Blossom[] = [];
  /** fence-post tops (birds perch here) */
  private perches: THREE.Vector3[] = [];
  private lastTime = -1;

  constructor(gltf: GLTF, assets: GardenAssets & { trees: GLTF }, private isMobile: boolean, private env: THREE.Texture | null) {
    const root = gltf.scene;
    this.prepareModel(root);
    this.group.add(root);
    this.group.updateMatrixWorld(true);
    this.seatRuin(root);
    this.placeTrees(assets.trees.scene); // after seatRuin: needs the ruin footprint
    this.buildGround();
    this.grass = this.buildGrass();
    this.grass.layers.set(1); // the pond's mirror camera only sees layer 0: grass is too costly to draw twice
    this.buildProps();
    this.garden = new Garden(assets, {
      isMobile,
      env,
      stoneMap: this.stoneMap,
      blossoms: this.blossoms,
      perches: this.perches,
      cameraKeys: EXTERIOR.map((k) => [k.pos[0], k.pos[2]] as [number, number]),
    });
    this.lit.push(...this.garden.materials);
    this.group.add(this.garden.group);
    this.buildBenches();
    this.flies = this.buildFireflies();
    this.buildRidges();

    this.sun.position.copy(this.sunDay);
    this.sun.target.position.set(0, 0.6, 0);
    if (!isMobile) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const cam = this.sun.shadow.camera;
      cam.left = cam.bottom = -5.5;
      cam.right = cam.top = 5.5;
      cam.near = 0.5;
      cam.far = 22;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.02;
    }
    this.lantern.position.set(1.26, 1.37, -0.2);
    this.group.add(this.sun, this.sun.target, this.hemi, this.lantern);
  }

  /** Normalise the model and swap in materials that read well in our grade. */
  private prepareModel(root: THREE.Object3D) {
    // the plaster/stone texture, reused on the parts exported without one
    let stoneMap: THREE.Texture | null = null;
    root.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (mat?.name?.startsWith('basic_stone') && mat.map) stoneMap = mat.map;
    });
    this.stoneMap = stoneMap;
    root.traverse((o) => {
      if (o.name === 'Plane.005') o.visible = false; // stray reference card
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = !this.isMobile;
      mesh.receiveShadow = !this.isMobile;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = mats.map((m) => {
        const src = m as THREE.MeshStandardMaterial;
        const name = src.name ?? '';
        if (!src.map) {
          // walls exported without a texture (and without usable UVs): box-project the weathered plaster
          boxUV(mesh.geometry);
          return new THREE.MeshStandardMaterial({ map: stoneMap, color: '#8c8a78', roughness: 1 });
        }
        const stone = name.startsWith('basic_stone');
        const mat = new THREE.MeshStandardMaterial({
          map: src.map,
          normalMap: src.normalMap,
          normalScale: new THREE.Vector2(stone ? 0.25 : 0.6, stone ? 0.25 : 0.6),
          roughnessMap: src.roughnessMap,
          roughness: 1,
          metalness: 0,
          color: stone ? '#b9b7a0' : '#ffffff',
          side: src.side,
        });
        if (mat.map) mat.map.anisotropy = 8;
        return mat;
      });
      for (const m of next) {
        m.envMap = this.env;
        this.lit.push(m);
      }
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
    });

    // Frame the ruin: centre it, floor at y = 0, RUIN_WIDTH across.
    root.updateMatrixWorld(true);
    const ruin = new THREE.Box3();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.visible) ruin.expandByObject(mesh, true);
    });
    const size = ruin.getSize(new THREE.Vector3());
    const scale = RUIN_WIDTH / Math.max(size.x, size.z);
    const c = ruin.getCenter(new THREE.Vector3());
    root.scale.multiplyScalar(scale);
    root.position.multiplyScalar(scale).sub(new THREE.Vector3(c.x, 0, c.z).multiplyScalar(scale));
  }

  /**
   * trees.glb (scripts/optimize-trees.mjs) holds the cherry blossom twice: tree_cherry and a lighter tree_cherry_far.
   * Three hero trees frame the ruin like the reference; a seeded scatter fills the rest of the hill, kept off the
   * exterior camera path and its sightlines to the ruin. Clones share geometry and materials. Petals fall from all.
   */
  private placeTrees(root: THREE.Object3D) {
    const near = root.getObjectByName('tree_cherry');
    const far = root.getObjectByName('tree_cherry_far') ?? near;
    if (!near || !far) return;
    const tint = '#f2e6e0'; // a touch of warmth for the dusk grade
    const height = (t: THREE.Object3D) => {
      this.prepareTree(t, tint);
      t.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(t, true);
      t.position.sub(new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2));
      return Math.max(1e-6, box.max.y - box.min.y);
    };
    const hNear = height(near);
    const hFar = far === near ? hNear : height(far);

    const spots: { x: number; z: number; h: number; hero: boolean }[] = [
      { x: -1.9, z: 2.3, h: 2.5, hero: true }, // big, front left
      { x: 2.7, z: 1.7, h: 2.0, hero: true }, // front right
      { x: 2.9, z: -1.0, h: 1.8, hero: true }, // behind the tower
    ];

    // keep-out: the exterior camera path (sampled) and each key's sightline to the ruin
    const seg = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
      const dx = bx - ax, dz = bz - az;
      const t = THREE.MathUtils.clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
    };
    const keys = EXTERIOR.map((k) => k.pos);
    const blocked = (x: number, z: number) => {
      for (let i = 0; i < keys.length; i++) {
        const [ax, , az] = keys[i];
        if (seg(x, z, ax, az, 0, 0) < 1.0) return true; // sightline to the ruin
        if (i > 0 && seg(x, z, keys[i - 1][0], keys[i - 1][2], ax, az) < 1.4) return true; // the path itself
      }
      if (keys.some(([kx, , kz]) => Math.hypot(x - kx, z - kz) < 2.2)) return true; // nothing in the lens
      if (pondD(x, z) < 1.7 || pathNearest(x, z).d < 0.6) return true; // off the water and the path
      if (Math.hypot(x - NOTE.x, z - NOTE.z) < 1.0) return true; // keep the note's close-up clear
      const f = this.footprint;
      return x > f.x0 - 0.8 && x < f.x1 + 0.8 && z > f.z0 - 0.8 && z < f.z1 + 0.8;
    };

    // seeded scatter on the slopes
    let seed = 20261104;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const want = this.isMobile ? 12 : 26;
    for (let tries = 0; tries < 2000 && spots.length < want; tries++) {
      const a = rnd() * Math.PI * 2, d = 2.4 + Math.sqrt(rnd()) * 5.6;
      const x = Math.cos(a) * d, z = Math.sin(a) * d * 1.1;
      const h = 1.5 + rnd() * 0.9 + (d > 5 ? 0.3 : 0);
      if (blocked(x, z)) continue;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < (s.h + h) * 0.36)) continue;
      spots.push({ x, z, h, hero: false });
    }

    const petalTrees: PetalTree[] = [];
    const used = new Set<THREE.Object3D>();
    // full detail wherever the camera passes close; the far LOD elsewhere
    const close = (x: number, z: number) => keys.some(([kx, , kz]) => Math.hypot(x - kx, z - kz) < 3.2);
    spots.forEach(({ x, z, h, hero }, i) => {
      const detailed = hero || close(x, z);
      const src = detailed ? near : far;
      const tree = used.has(src) ? src.clone() : src; // first use takes the loaded node itself
      used.add(src);
      if (!hero) tree.traverse((o) => ((o as THREE.Mesh).castShadow = false)); // shadow pass: hero trees only
      const y = groundAt(x, z);
      const pivot = new THREE.Group();
      pivot.name = `tree_cherry_${i}`;
      pivot.add(tree);
      pivot.position.set(x, y - h * 0.03, z); // trunk base just under the turf
      pivot.scale.setScalar(h / (detailed ? hNear : hFar));
      pivot.rotation.y = rnd() * Math.PI * 2;
      this.group.add(pivot);
      if (!hero) this.fillTrees.push(pivot);
      petalTrees.push({ x, z, y, h });
    });

    this.blossoms = this.sampleBlossoms(this.group.children.filter((c) => c.name === 'tree_cherry_0' || c.name === 'tree_cherry_1'));

    this.petals = new Petals(petalTrees, this.isMobile ? 500 : 1400, surfaceAt, isWater);
    this.petals.mesh.material.envMap = this.env;
    this.lit.push(this.petals.mesh.material);
    this.group.add(this.petals.mesh);
  }

  /** Points on the outer shell of each canopy, low enough to be seen, with an outward direction. */
  private sampleBlossoms(trees: THREE.Object3D[], perTree = 24): Blossom[] {
    const out: Blossom[] = [];
    const v = new THREE.Vector3();
    for (const t of trees) {
      t.updateMatrixWorld(true);
      const pts: THREE.Vector3[] = [];
      t.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !/flower/i.test((m.material as THREE.Material).name)) return;
        const pos = m.geometry.getAttribute('position');
        for (let i = 0; i < 600; i++) pts.push(v.fromBufferAttribute(pos, Math.floor(Math.random() * pos.count)).applyMatrix4(m.matrixWorld).clone());
      });
      if (!pts.length) continue;
      const c = t.position;
      const box = new THREE.Box3().setFromPoints(pts);
      const shell = pts
        .filter((p) => p.y < box.min.y + (box.max.y - box.min.y) * 0.7) // the lower canopy, where the camera looks
        .sort((a, b) => Math.hypot(b.x - c.x, b.z - c.z) - Math.hypot(a.x - c.x, a.z - c.z))
        .slice(0, perTree * 3);
      for (let i = 0; i < perTree && shell.length; i++) {
        const p = shell.splice(Math.floor(Math.random() * shell.length), 1)[0];
        out.push({ pos: p, out: new THREE.Vector3(p.x - c.x, 0, p.z - c.z).normalize() });
      }
    }
    return out;
  }

  /** Keep the tree's own textures; petals go alpha-tested (no sorting artefacts, casts cut-out shadows). */
  private prepareTree(tree: THREE.Object3D, tint: string) {
    const color = new THREE.Color(tint);
    tree.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = !this.isMobile;
      mesh.receiveShadow = !this.isMobile;
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[];
      for (const m of mats) {
        const foliage = m.transparent || m.alphaTest > 0;
        if (foliage) {
          m.transparent = false;
          m.depthWrite = true;
          m.alphaTest = 0.5;
          m.side = THREE.DoubleSide;
          m.alphaToCoverage = !this.isMobile; // smooth cut-out edges under MSAA
        }
        m.color.multiply(color);
        m.metalness = 0;
        m.envMap = this.env;
        if (m.map) m.map.anisotropy = 4;
        m.needsUpdate = true;
        this.lit.push(m);
      }
    });
  }

  /**
   * Sit the ruin into the hill instead of on it: sink it a little, run a rough stone plinth under the walls
   * (so no edge ever floats where the ground dips) and scatter fallen stones along the base.
   */
  private seatRuin(root: THREE.Object3D) {
    root.position.y -= 0.07;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.visible) box.expandByObject(mesh, true);
    });
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    this.footprint = { x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z };

    const map = this.stoneMap?.clone() ?? null;
    if (map) {
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(4, 0.6);
      map.needsUpdate = true;
    }
    const stone = new THREE.MeshStandardMaterial({ map, color: '#7d7a66', roughness: 1, envMap: this.env });
    this.lit.push(stone);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(size.x + 0.08, 0.5, size.z + 0.08), stone);
    plinth.position.set(c.x, -0.27, c.z);
    plinth.receiveShadow = !this.isMobile;
    this.group.add(plinth);

    // fallen stones along the foot of the walls
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const n = this.isMobile ? 40 : 70;
    const rubble = new THREE.InstancedMesh(geo, stone, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      // a random point on the footprint's perimeter, pushed a touch outside it
      const side = Math.floor(Math.random() * 4), u = Math.random();
      const out = rand(0.02, 0.14);
      let x: number, z: number;
      if (side === 0) { x = box.min.x + u * size.x; z = box.max.z + out; }
      else if (side === 1) { x = box.min.x + u * size.x; z = box.min.z - out; }
      else if (side === 2) { x = box.max.x + out; z = box.min.z + u * size.z; }
      else { x = box.min.x - out; z = box.min.z + u * size.z; }
      const k = rand(0.018, 0.05);
      p.set(x, groundAt(x, z) + k * 0.15, z);
      q.setFromEuler(e.set(rand(0, 3), rand(0, 3), rand(0, 3)));
      sc.set(k * rand(1, 1.6), k * rand(0.5, 0.9), k);
      rubble.setMatrixAt(i, m.compose(p, q, sc));
    }
    rubble.castShadow = rubble.receiveShadow = !this.isMobile;
    this.group.add(rubble);
  }

  /** Park benches on the slope: weathered slats on cast-iron sides (furniture.ts), scaled to the set. */
  private buildBenches() {
    const { wood: woodGeo, iron: ironGeo } = gardenBenchGeometry(1.5);
    const S = 0.34 / 1.5;
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture(21, '#6a5440'), color: '#b9a690', roughness: 0.85, envMap: this.env });
    const iron = new THREE.MeshStandardMaterial({ color: '#2a2b28', roughness: 0.55, metalness: 0.6, envMap: this.env });
    this.lit.push(wood, iron);
    const spots: [number, number, number, number][] = [
      // x, z, facing (yaw), lean
      [-0.75, 2.15, 0.25, 0],
      [2.55, 0.95, 1.2, 0],
      [-2.55, -0.6, -1.6, 0.06],
    ];
    for (const [x, z, yaw, lean] of spots) {
      const b = new THREE.Group();
      for (const [g, m] of [[woodGeo, wood], [ironGeo, iron]] as const) {
        const mesh = new THREE.Mesh(g, m);
        mesh.castShadow = mesh.receiveShadow = !this.isMobile;
        b.add(mesh);
      }
      b.scale.setScalar(S);
      b.position.set(x, groundAt(x, z) - 0.005, z);
      b.rotation.set(0, yaw + Math.PI, lean); // modelled facing −z; these face +z
      this.group.add(b);
    }
  }

  private buildGround() {
    const g = new THREE.PlaneGeometry(90, 90, 240, 240);
    g.rotateX(-Math.PI / 2);
    const pos = g.getAttribute('position');
    // pull the grid in toward the set (≈0.08 apart near the ruin, ≈1 at the edge) so the pond bank and path read
    const warp = (u: number) => 45 * (0.22 * u + 0.78 * u * u * u);
    const col = new Float32Array(pos.count * 3);
    const a = new THREE.Color('#2e4420'), b = new THREE.Color('#4a6630'), d = new THREE.Color('#2a3016');
    const dirt = new THREE.Color('#6b5a43'), dirtDark = new THREE.Color('#4a3e2e'), mud = new THREE.Color('#2b2a1c'), bed = new THREE.Color('#1c2219');
    for (let i = 0; i < pos.count; i++) {
      const x = warp(pos.getX(i) / 45), z = warp(pos.getZ(i) / 45);
      pos.setXYZ(i, x, groundAt(x, z), z);
      const n = 0.5 + 0.5 * Math.sin(x * 2.3 + Math.sin(z * 1.7) * 2) * Math.cos(z * 1.9 - x * 0.7);
      this.tmp.copy(a).lerp(b, n * 0.8).lerp(d, Math.max(0, Math.sin(x * 0.9 + z * 1.3)) * 0.35);
      // the worn path: packed dirt, darker in the ruts
      const pm = pathMask(x, z);
      if (pm > 0) this.tmp.lerp(dirt, pm * 0.9).lerp(dirtDark, pm * Math.max(0, Math.sin(x * 31 + z * 17)) * 0.35);
      // pond: wet mud bank, dark silt bed under the water
      const pd = pondD(x, z);
      if (pd < 1.35) this.tmp.lerp(mud, 1 - THREE.MathUtils.smoothstep(pd, 1.0, 1.35)).lerp(bed, 1 - THREE.MathUtils.smoothstep(pd, 0.6, 1.0));
      col.set([this.tmp.r, this.tmp.g, this.tmp.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const map = noiseTexture(512, '#c4c6ae', [['#6a6e44', 0.22], ['#d6d2ae', 0.18], ['#4a4e2c', 0.2]], 5000);
    map.repeat.set(90, 90);
    const ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, map }));
    ground.receiveShadow = !this.isMobile;
    this.group.add(ground);
  }

  /**
   * Grass: WebGL port of the techniques in revo-realms' WebGPU grass
   * (github.com/alezen9/revo-realms, MIT © Aleksandar Gjoreski), rebuilt without compute shaders
   * so it runs on every device:
   *  - blade width profile (grown base, curved taper) and golden-angle clumps of 8 blades
   *  - blades turn to face the camera (never edge-on), widen and thin out stochastically with distance
   *  - length-preserving bend: tip drops as it bends; cubic-bezier wind response over blade height
   *  - gust field + eddy veer + two-sine ambient sway + flutter
   *  - rounded tuft normals, five-colour palette, grazing sheen and sun backlight
   *  - lighting evaluated per vertex (varyings), so the fragment shader stays tiny
   */
  private buildGrass() {
    const total = this.isMobile ? 64000 : 200000;
    const PER_CLUMP = 8;
    const CLUMP_R = 0.05;
    const H_MAX = 0.16;
    const SEG = 4;

    // revo blade profile: base grows over the first quarter, then a curved taper to the tip
    const halfW = (t: number) => 0.5 * Math.min(1, 0.28 + 0.72 * (t / 0.26)) * Math.pow(1 - t, 1.22);
    const P: number[] = [], U: number[] = [], idx: number[] = [];
    for (let r = 0; r < SEG; r++) {
      const v = r / SEG, w = halfW(v);
      P.push(-w, v, 0, w, v, 0);
      U.push(0, v, 1, v);
      if (r) {
        const l = r * 2, pl = l - 2;
        idx.push(pl, pl + 1, l + 1, pl, l + 1, l);
      }
    }
    P.push(0, 1, 0);
    U.push(0.5, 1);
    const last = (SEG - 1) * 2;
    idx.push(last, last + 1, SEG * 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(idx);

    const c = (hex: string) => new THREE.Color(hex);
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunCol: { value: new THREE.Color() },
        uSky: { value: new THREE.Color() },
        uGround: { value: new THREE.Color() },
        uFogColor: { value: new THREE.Color() },
        uFogDensity: { value: 0.02 },
        uWind: { value: new THREE.Vector2(0.86, 0.5).normalize() },
        uHMax: { value: H_MAX },
        // revo palette (sRGB → linear handled by THREE.Color)
        uDark: { value: c('#1f2712') },
        uBase: { value: c('#33612f') },
        uTip: { value: c('#757d5e') },
        uWarm: { value: c('#a88769') },
        uRust: { value: c('#61301c') },
        // density: full near the camera, thinning (and widening) further out
        uFull: { value: 4.0 },
        uFalloff: { value: 11.0 },
        uFarKeep: { value: 0.3 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aBlade; // x: seed, y: colour noise, zw: offset inside its clump (−1..1)
        uniform float uTime, uHMax, uFull, uFalloff, uFarKeep;
        uniform vec2 uWind;
        uniform vec3 uSunDir, uSunCol, uSky, uGround, uDark, uBase, uWarm, uRust;
        varying vec2 vUv; varying vec3 vColor; varying vec3 vLight; varying vec3 vExtra; varying float vDist;

        float h1(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
          return mix(mix(h2(i), h2(i+vec2(1,0)), u.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), u.x), u.y); }

        void main() {
          vUv = uv;
          float seed = aBlade.x;
          vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float hgt = length((modelMatrix * instanceMatrix)[1].xyz);
          float wid = length((modelMatrix * instanceMatrix)[0].xyz);

          // stochastic density falloff with distance (blades past the cut collapse to nothing)
          vec2 toCam = cameraPosition.xz - root.xz;
          float dist = length(toCam);
          float far = smoothstep(uFull, uFalloff, dist);
          float keep = mix(1.0, uFarKeep, far);
          if (h1(seed * 91.7 + 3.1) > keep) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          wid *= mix(1.0, 2.4, far); // fewer, wider blades far away read as the same density

          // face the camera, with a little random twist
          vec2 vxz = toCam / max(dist, 1e-4);
          float tw = (h1(seed * 31.7) * 2.0 - 1.0) * 0.45;
          vec3 side = vec3(vxz.y, 0.0, -vxz.x);
          side = normalize(side * cos(tw) + vec3(vxz.x, 0.0, vxz.y) * sin(tw));

          // wind: travelling gust field, eddy veer, ambient two-sine sway, flutter
          vec2 perp = vec2(-uWind.y, uWind.x);
          vec2 nuv = root.xz * 0.55 + (perp * 0.3717 - uWind) * uTime * 0.35;
          float gustField = vn(nuv);
          float gust = smoothstep(0.4, 0.65, gustField);
          float veer = (vn(nuv * 1.7 + 11.0) - 0.5) * 2.0 * 0.9;
          vec2 windXZ = normalize(uWind + perp * veer) * 0.32 * mix(0.09, 1.0, gust);
          float t = clamp(hgt / uHMax, 0.0, 1.0); // cubic bezier response (P1 .003, P2 .85)
          float resp = t * (0.009 + t * (2.532 + t * (-1.541)));
          float phase = seed * 6.283 - 3.1415;
          float rate = mix(0.7, 1.45, fract(seed * 31.7));
          float act = max(clamp(dot(windXZ, windXZ) * 3.5, 0.0, 1.0), smoothstep(0.2, 1.0, gust) * 0.45);
          float env = mix(0.75, 1.35, act);
          float sway = (sin(uTime * rate * 1.35 + phase + env * 0.55) + 0.45 * sin(uTime * rate * 2.15 + root.x * 0.17 + root.z * 0.11 + phase * 1.7)) * 0.055 * env;
          float aAng = fract(seed * 53.3) * 6.283;
          vec2 ambient = vec2(cos(aAng), sin(aAng)) * sway;
          float flutter = sin(uTime * 0.3 + fract(seed * 97.13) * 8.2 + root.x * 0.13) * 0.025 * act;
          // a static lean per blade, plus wind
          vec2 lean = vec2(cos(aAng * 1.7), sin(aAng * 1.7)) * (h1(seed * 7.3) - 0.5) * 0.5;
          vec2 bend = (windXZ * 2.5 + lean) * resp + ambient * resp + perp * flutter * 2.5 * resp;
          bend *= 0.55; // in blade lengths

          // length-preserving bend: quadratic + control-point arc, tip drops as it bends
          float y = position.y;
          float shape = y * (1.0 - y) * 0.8 + y * y;
          float drop = dot(bend, bend) * 1.3;
          vec3 off = vec3(bend.x, -drop, bend.y) * shape * hgt;
          vec3 w = root + side * position.x * wid + vec3(0.0, y * hgt, 0.0) + off;

          // rounded tuft normal + width roundness toward the view side
          vec3 tuft = normalize(vec3(aBlade.z * 0.6, y + 0.5, aBlade.w * 0.6));
          vec3 N = normalize(tuft + side * (uv.x * 2.0 - 1.0) * 0.8);

          // colour: dark/base by noise, rust and warm patches
          float pn = aBlade.y;
          vec3 green = mix(uDark, uBase, mix(1.0, pn, 0.9));
          float rust = pn * (1.0 - pn) * 4.0 * 0.21;
          float warm = clamp((pn - 0.6) * 2.5, 0.0, 1.0) * 0.48;
          vColor = mix(mix(green, uRust, rust), uWarm, warm);

          // light (per vertex): wrapped diffuse, hemisphere sky, sheen at grazing, sun backlight
          vec3 V = normalize(cameraPosition - w);
          float sndl = dot(N, uSunDir);
          float diffuse = mix(0.35, 1.0, mix(0.65, abs(sndl), 0.5));
          float skyF = N.y * 0.5 + 0.5;
          vLight = mix(uGround, uSky, skyF) * 1.15 + uSunCol * diffuse * 1.15;
          float grazing = 1.0 - clamp(abs(dot(N, V)), 0.0, 1.0);
          float back = clamp(-sndl, 0.0, 1.0);
          float align = clamp(dot(normalize(vec2(-V.x, -V.z) + 1e-5), normalize(uSunDir.xz + 1e-5)) * 0.5 + 0.5, 0.0, 1.0);
          vExtra = vec3(grazing, back, align);

          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunCol, uTip, uFogColor; uniform float uFogDensity;
        varying vec2 vUv; varying vec3 vColor; varying vec3 vLight; varying vec3 vExtra; varying float vDist;
        void main() {
          float y = vUv.y;
          vec3 alb = mix(vColor, uTip, smoothstep(0.25, 1.0, y) * 0.35);
          float edge = smoothstep(-5.0, 5.0, abs(vUv.x * 2.0 - 1.0));
          float occ = 1.0 - 0.55 * (1.0 - smoothstep(0.05, 0.8, y)) * edge;
          float detail = smoothstep(0.1, 0.9, y);
          vec3 sheen = uSunCol * vExtra.x * vExtra.x * mix(0.25, 1.0, vExtra.z) * 0.05 * detail;
          vec3 trans = mix(alb, uSunCol, 0.55) * vExtra.z * mix(0.35, 1.0, vExtra.y) * 0.22 * detail;
          vec3 col = alb * occ * vLight + sheen + trans;
          float f = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist);
          gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
          #include <colorspace_fragment>
        }`,
    });

    const mesh = new THREE.InstancedMesh(g, mat, total);
    const blade = new Float32Array(total * 4);
    const dummy = new THREE.Object3D();
    const slots = Array.from({ length: total }, (_, j) => j).sort(() => Math.random() - 0.5);
    const GOLDEN = Math.PI * (3 - Math.sqrt(5));
    const pnoise = (x: number, z: number) =>
      0.5 + 0.25 * Math.sin(x * 0.9 + Math.sin(z * 0.7) * 1.8) + 0.25 * Math.sin(z * 1.3 - x * 0.4 + Math.sin(x * 2.1));
    let n = 0;
    while (n < total) {
      // clump centre: mostly the slope the hero camera looks across, the rest all round the hill
      let cx: number, cz: number;
      if (Math.random() < 0.45) {
        cx = rand(-4.8, 5.0);
        cz = rand(1.0, 6.8);
      } else {
        const a = Math.random() * Math.PI * 2, r = 1.2 + Math.sqrt(Math.random()) * 5.8;
        cx = Math.cos(a) * r;
        cz = Math.sin(a) * r;
      }
      const fp = this.footprint;
      if (cx > fp.x0 - 0.01 && cx < fp.x1 + 0.01 && cz > fp.z0 - 0.01 && cz < fp.z1 + 0.01) continue; // not inside the ruin
      if (pondD(cx, cz) < 1.02 || pathMask(cx, cz) > 0.85) continue; // not in the water or on the trodden path
      const rot = Math.random() * Math.PI * 2;
      const clumpScale = rand(0.75, 1.25);
      const pn = Math.min(1, Math.max(0, pnoise(cx, cz) + rand(-0.08, 0.08)));
      for (let k = 0; k < PER_CLUMP && n < total; k++, n++) {
        const rr = Math.sqrt((k + 0.5) / PER_CLUMP), aa = k * GOLDEN + rot;
        const ox = Math.cos(aa) * rr, oz = Math.sin(aa) * rr;
        const x = cx + ox * CLUMP_R, z = cz + oz * CLUMP_R;
        const s = Math.random();
        const worn = 1 - pathMask(x, z) * 0.85; // trampled short along the path
        const hgt = (0.045 + s * s * 0.1) * clumpScale * (1.15 - rr * 0.35) * worn * (pondD(x, z) < 1 ? 0 : 1);
        dummy.position.set(x, groundAt(x, z) - 0.004, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(rand(0.007, 0.012), Math.min(hgt, H_MAX), 1);
        dummy.updateMatrix();
        const j = slots[n];
        mesh.setMatrixAt(j, dummy.matrix);
        blade.set([Math.random() * 100, pn, ox, oz], j * 4);
      }
    }
    g.setAttribute('aBlade', new THREE.InstancedBufferAttribute(blade, 4));
    mesh.frustumCulled = false;
    mesh.userData.total = total;
    this.group.add(mesh);
    return mesh;
  }

  /** Home scroll progress (0–1): drives the note's flight. */
  setProgress(p: number) {
    this.garden?.note.setProgress(p);
  }

  /** Quality tier: grass density and sun shadows. */
  setQuality(grassFrac: number, shadows: boolean, shadowSize: number) {
    this.grass.count = Math.floor((this.grass.userData.total as number) * grassFrac);
    this.petals?.setQuality(grassFrac);
    // slow devices keep the hero trees and thin the scatter (to half on the lowest tier)
    const keep = Math.ceil(this.fillTrees.length * THREE.MathUtils.clamp(0.5 + (grassFrac - 0.35) / 1.3, 0.5, 1));
    this.fillTrees.forEach((t, i) => (t.visible = i < keep));
    const want = shadows && !this.isMobile;
    if (this.sun.castShadow !== want || this.sun.shadow.mapSize.x !== shadowSize) {
      this.sun.castShadow = want;
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      this.sun.shadow.map?.dispose();
      (this.sun.shadow as unknown as { map: THREE.WebGLRenderTarget | null }).map = null;
    }
  }

  private buildProps() {
    // fence posts across the front slope, weathered and leaning
    const wood = new THREE.MeshStandardMaterial({ color: '#5a3a24', roughness: 1, envMap: this.env });
    this.lit.push(wood);
    const post = new THREE.CylinderGeometry(0.018, 0.022, 1, 6);
    post.translate(0, 0.5, 0);
    const posts: [number, number, number][] = [
      [-2.3, 2.6, 0.2], [-0.95, 3.3, 0.26], [-0.35, 1.75, 0.2], [1.45, 2.95, 0.3], [2.0, 1.55, 0.17], [-3.1, 1.4, 0.16],
      [3.1, -1.6, 0.2], [1.6, -2.4, 0.24], [-0.4, -2.75, 0.18], [-2.3, -2.2, 0.22],
    ];
    for (const [x, z, h] of posts) {
      if (pondD(x, z) < 1.4 || pathNearest(x, z).d < 0.35) continue; // clear of the pond bank and the path
      const m = new THREE.Mesh(post, wood);
      m.position.set(x, groundAt(x, z) - 0.02, z);
      this.perches.push(new THREE.Vector3(x, groundAt(x, z) - 0.02 + h, z));
      m.scale.set(1, h, 1);
      m.rotation.set(rand(-0.12, 0.12), rand(0, 3), rand(-0.12, 0.12));
      m.castShadow = !this.isMobile;
      this.group.add(m);
    }
    // a few boulders
    const rock = new THREE.MeshStandardMaterial({ color: '#5e4e3c', roughness: 1, envMap: this.env });
    this.lit.push(rock);
    const rocks: [number, number, number][] = [[1.7, 2.2, 0.08], [1.86, 2.32, 0.05], [-1.9, -2.6, 0.1]];
    for (const [x, z, s] of rocks) {
      const g = new THREE.IcosahedronGeometry(1, 5);
      const p = g.getAttribute('position');
      const k = rand(0, 10);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = 1 + 0.16 * Math.sin(x * 2.1 + k) * Math.cos(z * 2.6 + k) + 0.06 * Math.sin(y * 7 + x * 5 + k);
        p.setXYZ(i, x * n, Math.max(y * n, -0.3), z * n);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, rock);
      m.position.set(x, groundAt(x, z) + s * 0.05, z);
      m.scale.set(s * 1.7, s * 0.75, s * 1.1);
      m.rotation.y = rand(0, 3);
      m.castShadow = m.receiveShadow = !this.isMobile;
      this.group.add(m);
    }
    // white wildflowers
    const fc = this.isMobile ? 500 : 1400;
    const fp = new Float32Array(fc * 3);
    for (let i = 0; i < fc; i++) {
      const ang = Math.random() * Math.PI * 2, r = 1.3 + Math.pow(Math.random(), 1.4) * 7;
      let x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      if (pondD(x, z) < 1.05 || pathMask(x, z) > 0.3) (x = -x * 1.1), (z = -z * 1.1); // move it off the water / path
      fp.set([x, groundAt(x, z) + rand(0.03, 0.06), z], i * 3);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const dc = dot.getContext('2d')!;
    const grad = dc.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.45, '#fff');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    dc.fillStyle = grad;
    dc.fillRect(0, 0, 32, 32);
    const flowers = new THREE.PointsMaterial({ color: '#e9e4d6', size: 0.02, sizeAttenuation: true, map: new THREE.CanvasTexture(dot), alphaTest: 0.4 });
    this.group.add(new THREE.Points(fg, flowers));
  }

  private buildFireflies() {
    const n = this.isMobile ? 70 : 160;
    const p = new Float32Array(n * 3), r = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, d = 1.4 + Math.random() * 3.5;
      const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
      p.set([x, groundAt(x, z) + rand(0.08, 0.7), z], i * 3);
      r[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(r, 1));
    const pts = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 }, uScale: { value: 1 } },
        vertexShader: /* glsl */ `
          attribute float aRand; uniform float uTime, uScale; varying float vA;
          void main() {
            vec3 p = position;
            p.x += sin(uTime * 0.4 + aRand * 20.0) * 0.12;
            p.y += sin(uTime * 0.6 + aRand * 13.0) * 0.06;
            p.z += cos(uTime * 0.35 + aRand * 17.0) * 0.12;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vA = pow(0.5 + 0.5 * sin(uTime * (1.2 + aRand * 1.5) + aRand * 40.0), 3.0);
            gl_PointSize = (6.0 + aRand * 5.0) * uScale / -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uOpacity; varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = (smoothstep(0.5, 0.0, d) * 0.5 + smoothstep(0.12, 0.0, d)) * uOpacity * vA;
            gl_FragColor = vec4(vec3(1.0, 0.78, 0.4) * a * 1.8, a);
          }`,
      }),
    );
    pts.renderOrder = 3;
    pts.frustumCulled = false;
    this.group.add(pts);
    return pts;
  }

  /** Low far ridges for the horizon; fog turns them into soft silhouettes. */
  /**
   * Distant mountains: a real lit heightfield (an annulus from 70 to 180 units out), not flat cut-outs.
   * Ridged multifractal ranges, grassy lower slopes and bare rock on the steep faces,
   * shaded by the same sun as the hill and dissolved into the haze with distance (aerial perspective).
   * Kept low straight behind the ruin so the hero silhouette stays clean.
   */
  private buildRidges() {
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const perm = Array.from({ length: 512 }, () => rnd());
    const hash = (x: number, z: number) => perm[(((x * 73856093) ^ (z * 19349663)) >>> 0) % 512];
    const vnoise = (x: number, z: number) => {
      const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
      const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
      const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    const ridgedFbm = (x: number, z: number) => {
      let sum = 0, amp = 0.55, freq = 1, w = 1;
      for (let o = 0; o < 4; o++) { // 4 octaves: finer detail would alias into slivers at this mesh density
        let n = 1 - Math.abs(vnoise(x * freq, z * freq) * 2 - 1);
        n *= n;
        n *= w;
        w = Math.min(1, n * 1.6);
        sum += n * amp;
        freq *= 2.03;
        amp *= 0.5;
      }
      return sum;
    };
    const smooth = (a: number, b: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const BEHIND = -Math.PI / 2; // −z, straight past the ruin from the hero camera
    const A = this.isMobile ? 256 : 420, R = this.isMobile ? 32 : 48;
    const P: number[] = [], C: number[] = [], idx: number[] = [];
    for (let i = 0; i <= A; i++) {
      const a = (i / A) * Math.PI * 2;
      const behind = Math.abs(Math.atan2(Math.sin(a - BEHIND), Math.cos(a - BEHIND)));
      const sideGain = 0.55 + 0.1 * smooth(0.2, 1.2, behind); // about the same height from every viewpoint
      for (let j = 0; j <= R; j++) {
        const t = j / R, r = 70 + Math.pow(t, 1.3) * 110;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const ridge = ridgedFbm(x * 0.016 + 3.1, z * 0.016 - 7.3);
        const swell = vnoise(x * 0.006 + 11, z * 0.006 + 5);
        const rise = smooth(75, 130, r);
        const y = -16 + 4 * smooth(70, 120, r) + rise * sideGain * (ridge * 22 * (0.45 + 0.75 * swell) + swell * 4);
        P.push(x, y * 1.4 + 10.2, z); // crests just clear the hill line from the hero camera, like the reference
        C.push(swell, ridge, 0); // tint inputs for the shader
        if (i && j) {
          const cur = i * (R + 1) + j, prev = cur - (R + 1);
          idx.push(prev - 1, cur - 1, prev, prev, cur - 1, cur); // CCW seen from above/inside
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(C, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunCol: { value: new THREE.Color() },
        uSky: { value: new THREE.Color() },
        uHaze: { value: new THREE.Color() },
        uHazeK: { value: 0.0085 },
        uSnow: { value: new THREE.Color('#efe2d8') },
        uGrass: { value: new THREE.Color('#4a5a30') },
        uDry: { value: new THREE.Color('#7a6e48') },
        uRock: { value: new THREE.Color('#8a786c') },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aTint;
        varying vec3 vN; varying vec3 vW; varying vec3 vTint;
        void main() {
          vTint = aTint;
          vN = normalize(mat3(modelMatrix) * normal);
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir, uSunCol, uSky, uHaze, uGrass, uDry, uRock, uSnow; uniform float uHazeK;
        varying vec3 vN; varying vec3 vW; varying vec3 vTint;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec3 N = normalize(vN);
          float slope = 1.0 - N.y;
          // grass and dry meadow on the gentle slopes, rock on the steep faces and high crests
          vec3 col = mix(uGrass, uDry, smoothstep(0.3, 0.75, vTint.x + (h2(floor(vW.xz * 0.6)) - 0.5) * 0.2));
          float rock = smoothstep(0.22, 0.45, slope + vTint.y * 0.25 + (vW.y - 4.0) * 0.015);
          col = mix(col, uRock, rock);
          // snow lying on the flatter ground of the high crests
          float snow = smoothstep(3.0, 6.5, vW.y + vTint.y * 2.0) * smoothstep(0.25, 0.55, N.y);
          col = mix(col, uSnow, snow);
          float sun = max(dot(N, normalize(uSunDir)), 0.0);
          vec3 lit = col * (uSky * (0.55 + 0.45 * N.y) + uSunCol * sun);
          // aerial perspective: distance haze, thicker low down
          float d = length(vW.xz - cameraPosition.xz);
          float haze = 1.0 - exp(-d * uHazeK * (1.0 + 4.0 * smoothstep(2.0, -10.0, vW.y)));
          // valley floor melts fully into the haze; crests keep some contrast
          gl_FragColor = vec4(mix(lit, uHaze, clamp(haze, 0.0, mix(0.88, 1.0, smoothstep(0.0, -8.0, vW.y)))), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.terrain = new THREE.Mesh(g, mat);
    this.terrain.frustumCulled = false;
    this.terrain.receiveShadow = false;
    this.group.add(this.terrain);
  }

  update(s: LightState, time: number, viewportH: number) {
    const dt = this.lastTime < 0 ? 0 : THREE.MathUtils.clamp(time - this.lastTime, 0, 1 / 20);
    this.lastTime = time;
    if (this.group.visible) {
      this.petals?.update(dt);
      this.garden?.update(dt, s);
    }
    const lum = s.castle.r * 0.3 + s.castle.g * 0.55 + s.castle.b * 0.15;
    const night = THREE.MathUtils.smoothstep(s.windows, 0.3, 1);
    this.sun.position.lerpVectors(this.sunDay, this.sunNight, night);
    this.sun.color.copy(s.sun);
    this.sun.intensity = 3.4 * s.sunStrength * (0.35 + 0.65 * lum);
    this.hemi.color.copy(s.skyBottom).lerp(this.tmp.set('#ffffff'), 0.4);
    this.hemi.groundColor.set('#2c3318').lerp(this.tmp.set('#0b0f16'), night);
    this.hemi.intensity = (this.env ? 0.15 : 0.35) + (this.env ? 0.45 : 1.1) * lum;
    const envI = 0.08 + 0.75 * lum * lum;
    for (const m of this.lit) m.envMapIntensity = envI;
    this.lantern.intensity = s.windows * 2.2 * (0.85 + 0.15 * Math.sin(time * 9) * Math.sin(time * 5.3));

    // far ridges: a faint haze-coloured silhouette, never fully swallowed by fog

    const u = this.grass.material.uniforms;
    u.uTime.value = time;
    u.uSunDir.value.copy(this.sun.position).sub(this.sun.target.position).normalize();
    u.uSunCol.value.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.32);
    u.uSky.value.copy(this.hemi.color).multiplyScalar(this.hemi.intensity * 0.75 + 0.1);
    u.uGround.value.copy(this.hemi.groundColor).multiplyScalar(this.hemi.intensity * 0.6 + 0.05);
    u.uFogColor.value.copy(s.fog);
    u.uFogDensity.value = s.fogDensity;
    const tu = this.terrain.material.uniforms;
    tu.uSunDir.value.copy(u.uSunDir.value);
    tu.uSunCol.value.copy(u.uSunCol.value);
    tu.uSky.value.copy(u.uSky.value);
    tu.uHaze.value.copy(s.fog);

    const f = this.flies.material.uniforms;
    f.uOpacity.value = THREE.MathUtils.smoothstep(s.windows, 0.35, 0.9);
    f.uTime.value = time;
    f.uScale.value = viewportH / 900;
    this.flies.visible = f.uOpacity.value > 0.01;
  }
}
