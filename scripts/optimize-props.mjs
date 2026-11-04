/**
 * Build the garden props from assets-src/props/*-source.glb into public/models/:
 *
 *   npm run props
 *
 *   lanterns.glb     five Japanese stone lanterns, roots lantern_1..lantern_5 (each standing on y = 0)
 *   hummingbird.glb  the rigged bird and its six clips, without the perch branch and flower it shipped with
 *   pond.glb         the pond diorama's rocks, logs, bushes and plants (its ground and water are rebuilt in code)
 *
 * Textures -> WebP, geometry quantized + meshopt compressed (World.ts sets the decoder).
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, textureCompress, meshopt, resample, flatten } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
await MeshoptEncoder.ready;
const log = (...a) => console.log('[props]', ...a);

function dispose(n) {
  for (const c of n.listChildren()) dispose(c);
  n.getMesh()?.dispose();
  n.dispose();
}
const finish = (size) => [
  prune(),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
];

/* ---------- lanterns ---------- */
{
  const doc = await io.read('assets-src/props/lanterns-source.glb');
  const root = doc.getRoot();
  const scene = root.listScenes()[0];
  await doc.transform(flatten()); // bake the FBX wrapper transforms into the five lantern nodes
  for (const n of root.listNodes()) {
    if (!/^\d_Japanese_lanterns_0$/.test(n.getName())) continue;
    const id = n.getName()[0];
    const group = doc.createNode(`lantern_${id}`);
    scene.addChild(group);
    n.getParentNode()?.removeChild(n);
    scene.removeChild(n);
    group.addChild(n);
  }
  for (const n of scene.listChildren()) if (!n.getName().startsWith('lantern_')) dispose(n);
  await doc.transform(weld(), ...finish(1024));
  await io.write('public/models/lanterns.glb', doc);
  log('lanterns.glb');
}

/* ---------- hummingbird ---------- */
{
  const doc = await io.read('assets-src/props/hummingbird-source.glb');
  const root = doc.getRoot();
  const PROPS = ['HB_Bark', 'HB_Petal', 'HB_Stem'];
  for (const n of root.listNodes()) {
    const m = n.getMesh();
    if (m && m.listPrimitives().every((p) => PROPS.includes(p.getMaterial()?.getName()))) {
      n.setMesh(null);
      m.dispose();
    }
  }
  // extra UV sets and tangents are unused by our materials
  for (const m of root.listMeshes())
    for (const p of m.listPrimitives()) for (const s of ['TEXCOORD_1', 'TEXCOORD_2', 'TEXCOORD_3', 'TANGENT']) p.getAttribute(s) && p.setAttribute(s, null);
  await doc.transform(resample(), ...finish(512));
  await io.write('public/models/hummingbird.glb', doc);
  log('hummingbird.glb', root.listAnimations().map((a) => a.getName()).join(', '));
}

/* ---------- pond dressing ---------- */
{
  const doc = await io.read('assets-src/props/pond-source.glb');
  const root = doc.getRoot();
  for (const a of root.listAnimations()) a.dispose(); // the water's morph ripple; our water is a shader
  for (const n of root.listNodes()) if (['ground', 'water'].includes(n.getName())) dispose(n);
  // clover: 32k verts of tiny leaves the grass already covers
  for (const n of root.listNodes()) if (/^clover/i.test(n.getName())) dispose(n);
  await doc.transform(flatten(), weld(), ...finish(512));
  await io.write('public/models/pond.glb', doc);
  log('pond.glb', root.listNodes().filter((n) => n.getMesh()).length, 'prop meshes');
}
