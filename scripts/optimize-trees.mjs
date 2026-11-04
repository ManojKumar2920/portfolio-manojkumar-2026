/**
 * Build public/models/trees.glb from assets-src/trees/trees-source.glb (338 MB, ~6M verts).
 *
 *   npm run trees
 *
 * - keeps only the cherry blossom: drops the ground plane, the other species, the duplicate cherry and the
 *   cherry's flower stalks (1.8M verts of hair-thin twigs) and untextured buds
 * - solid meshes (bark, branches) are edge-collapse simplified
 * - foliage (petals, leaf cards) is made of thousands of disconnected quads that cannot be simplified, so whole
 *   clusters are thinned out and the survivors scaled up about their centre to keep the canopy's coverage
 * - textures -> WebP, capped at 1024; geometry quantized + meshopt compressed (World.ts sets the decoder)
 *
 * Output roots: tree_cherry (near) and tree_cherry_far (LOD for the fill trees); Ruin.ts clones them around the set.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplifyPrimitive, compactPrimitive, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const SRC = 'assets-src/trees/trees-source.glb';
const OUT = 'public/models/trees.glb';

/** source root nodes -> output tree name. The set uses the cherry blossom only. */
const TREES = {
  tree_cherry: ['v176CherryTree01'],
};
// ground plane, the duplicate cherry (same tree, branches merged) and the other species
const DROP_NODES = ['Plane', 'v176CherryTree01.001', 'tree', 'leaves.002', 'Leaf_6.001', 'Bark_9.001', 'Leaf_6.002', 'Bark_9.002'];
const DROP_MATERIALS = ['v176CherryFlowerStalk.001', 'v176CherryBud.001']; // stalks: hair-thin; buds: untextured, read as dark blobs

/** per material: drop tiny parts / simplify (solids) or thin keep/grow (petal clusters) */
const PLAN = {
  'v176CherryBark01.001': { cutRoots: true, minSize: 0.03, simplify: 0.12, error: 0.03 },
  'v176CherryFlower.002': { keep: 0.24, grow: 1.75 },
};
/** the far LOD, tree_cherry_far, for the trees that fill out the hill: about a third of the vertices */
const PLAN_FAR = {
  'v176CherryBark01.001': { cutRoots: true, minSize: 0.06, simplify: 0.12, error: 0.06 },
  'v176CherryFlower.002': { keep: 0.1, grow: 2.5 },
};

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
await MeshoptSimplifier.ready;
const doc = await io.read(SRC);
const root = doc.getRoot();
const scene = root.listScenes()[0];
const log = (...a) => console.log('[trees]', ...a);

// 1. drop what we don't ship
for (const n of root.listNodes()) if (DROP_NODES.includes(n.getName())) disposeTree(n);
for (const m of root.listMeshes())
  for (const p of m.listPrimitives()) if (DROP_MATERIALS.includes(p.getMaterial()?.getName())) p.dispose();

// 2. one named root per tree
for (const [name, parts] of Object.entries(TREES)) {
  const group = doc.createNode(name);
  scene.addChild(group);
  for (const part of parts) {
    const n = root.listNodes().find((x) => x.getName() === part);
    if (!n) throw new Error(`missing node ${part}`);
    scene.removeChild(n);
    group.addChild(n);
  }
}

await doc.transform(dedup(), weld());

// far LOD: a deep copy of the cherry (own geometry, shared materials)
const far = cloneNode(root.listNodes().find((n) => n.getName() === 'tree_cherry'), 'tree_cherry_far');
scene.addChild(far);
const farMeshes = new Set();
far.traverse((n) => n.getMesh() && farMeshes.add(n.getMesh()));

// 3. per-primitive reduction
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial()?.getName() ?? '';
    const plan = (farMeshes.has(mesh) ? PLAN_FAR : PLAN)[mat];
    if (!plan) continue;
    const before = prim.getAttribute('POSITION').getCount();
    if (plan.cutRoots) cutRoots(prim, root.listNodes().find((n) => n.getMesh() === mesh));
    if (plan.minSize) dropSmall(prim, plan.minSize);
    if (plan.keep) thin(prim, plan.keep, plan.grow);
    if (plan.simplify) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: plan.simplify, error: plan.error, lockBorder: false });
    log((farMeshes.has(mesh) ? 'far ' : '') + mat.padEnd(26), before, '->', prim.getAttribute('POSITION').getCount(), 'verts');
  }
}

// 4. textures + compression
await doc.transform(
  prune(),
  dedup(),
  // bark knots cover a few hundred texels on screen
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [256, 256], quality: 80, pattern: /TreeCap/ }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await io.write(OUT, doc);
log('wrote', OUT);

function cloneNode(n, name = n.getName()) {
  const c = doc.createNode(name).setTranslation(n.getTranslation()).setRotation(n.getRotation()).setScale(n.getScale());
  const mesh = n.getMesh();
  if (mesh) {
    const m = doc.createMesh(mesh.getName());
    for (const p of mesh.listPrimitives()) {
      const q = doc.createPrimitive().setMode(p.getMode()).setMaterial(p.getMaterial()).setIndices(p.getIndices()?.clone() ?? null);
      for (const sem of p.listSemantics()) q.setAttribute(sem, p.getAttribute(sem).clone());
      m.addPrimitive(q);
    }
    c.setMesh(m);
  }
  for (const k of n.listChildren()) c.addChild(cloneNode(k));
  return c;
}

function disposeTree(n) {
  for (const c of n.listChildren()) disposeTree(c);
  n.getMesh()?.dispose();
  n.dispose();
}

/**
 * Keep a deterministic `keep` fraction of the primitive's connected components (petals, leaf cards) and scale the
 * survivors by `grow` about their own centroid.
 */
function thin(prim, keep, grow) {
  const pos = prim.getAttribute('POSITION');
  const comp = components(prim);
  const n = pos.getCount();
  const idx = prim.getIndices().getArray();

  // deterministic per-component coin flip
  const kept = (c) => (((Math.imul(c ^ 0x9e3779b9, 0x85ebca6b) >>> 0) % 10007) / 10007) < keep;

  // centroid per component
  const sum = new Map();
  const v = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    if (!kept(comp[i])) continue;
    pos.getElement(i, v);
    const s = sum.get(comp[i]) ?? [0, 0, 0, 0];
    s[0] += v[0]; s[1] += v[1]; s[2] += v[2]; s[3]++;
    sum.set(comp[i], s);
  }
  for (let i = 0; i < n; i++) {
    const s = sum.get(comp[i]);
    if (!s) continue;
    pos.getElement(i, v);
    const cx = s[0] / s[3], cy = s[1] / s[3], cz = s[2] / s[3];
    pos.setElement(i, [cx + (v[0] - cx) * grow, cy + (v[1] - cy) * grow, cz + (v[2] - cz) * grow]);
  }
  const out = [];
  for (let i = 0; i < idx.length; i += 3) if (kept(comp[idx[i]])) out.push(idx[i], idx[i + 1], idx[i + 2]);
  prim.getIndices().setArray(n > 65535 ? new Uint32Array(out) : new Uint16Array(out));
  compactPrimitive(prim);
}

/** Union-find over the index buffer: component id per vertex. */
function components(prim) {
  const idx = prim.getIndices().getArray();
  const n = prim.getAttribute('POSITION').getCount();
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  for (let i = 0; i < idx.length; i += 3) {
    const r = find(idx[i]);
    parent[find(idx[i + 1])] = r;
    parent[find(idx[i + 2])] = r;
  }
  const comp = new Int32Array(n);
  for (let i = 0; i < n; i++) comp[i] = find(i);
  return comp;
}

/** Remove disconnected parts (twigs, knots) whose bounding diagonal is under `frac` of the whole primitive's. */
function dropSmall(prim, frac) {
  const pos = prim.getAttribute('POSITION');
  const idx = prim.getIndices().getArray();
  const n = pos.getCount();
  const comp = components(prim);
  const box = new Map();
  const all = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  const v = [0, 0, 0];
  const grow = (b) => { for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], v[k]); b[k + 3] = Math.max(b[k + 3], v[k]); } };
  for (let i = 0; i < n; i++) {
    pos.getElement(i, v);
    let b = box.get(comp[i]);
    if (!b) box.set(comp[i], (b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]));
    grow(b);
    grow(all);
  }
  const diag = (b) => Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
  const min = diag(all) * frac;
  const out = [];
  for (let i = 0; i < idx.length; i += 3) if (diag(box.get(comp[idx[i]])) >= min) out.push(idx[i], idx[i + 1], idx[i + 2]);
  prim.getIndices().setArray(n > 65535 ? new Uint32Array(out) : new Uint16Array(out));
  compactPrimitive(prim);
}

/**
 * The cherry's surface roots splay out flat around the trunk and float over the sloped hill wherever it is planted.
 * Remove every triangle low on the tree (bottom `low` of its height, world Y up) that sits outside the trunk, whose
 * radius is measured in a band just above the root flare. The trunk itself is kept and buried a little in Ruin.ts.
 */
function cutRoots(prim, node, low = 0.16, band = [0.18, 0.32], slack = 1.5) {
  const pos = prim.getAttribute('POSITION');
  const idx = prim.getIndices().getArray();
  const n = pos.getCount();
  const m = node.getWorldMatrix();
  const w = new Float32Array(n * 3);
  const v = [0, 0, 0];
  const o = [0, 0, 0];
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    pos.getElement(i, v);
    for (let k = 0; k < 3; k++) o[k] = m[k] * v[0] + m[4 + k] * v[1] + m[8 + k] * v[2] + m[12 + k]; // column-major
    w.set(o, i * 3);
    y0 = Math.min(y0, o[1]);
    y1 = Math.max(y1, o[1]);
  }
  const H = y1 - y0;
  // trunk centre + radius from the band above the flare
  let cx = 0, cz = 0, c = 0;
  for (let i = 0; i < n; i++) {
    const y = (w[i * 3 + 1] - y0) / H;
    if (y >= band[0] && y <= band[1]) (cx += w[i * 3], cz += w[i * 3 + 2], c++);
  }
  cx /= c; cz /= c;
  let r = 0;
  for (let i = 0; i < n; i++) {
    const y = (w[i * 3 + 1] - y0) / H;
    if (y >= band[0] && y <= band[1]) r = Math.max(r, Math.hypot(w[i * 3] - cx, w[i * 3 + 2] - cz));
  }
  const root = (i) => (w[i * 3 + 1] - y0) / H < low && Math.hypot(w[i * 3] - cx, w[i * 3 + 2] - cz) > r * slack;
  const out = [];
  for (let i = 0; i < idx.length; i += 3) if (!root(idx[i]) && !root(idx[i + 1]) && !root(idx[i + 2])) out.push(idx[i], idx[i + 1], idx[i + 2]);
  log(`roots: trunk r=${(r / H).toFixed(3)}H, removed ${(idx.length - out.length) / 3} tris`);
  prim.getIndices().setArray(n > 65535 ? new Uint32Array(out) : new Uint16Array(out));
  compactPrimitive(prim);
}
