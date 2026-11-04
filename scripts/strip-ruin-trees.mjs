/**
 * Remove the source model's bq_Tree_* trees from public/models/ruin.glb; the set's trees come from trees.glb
 * (scripts/optimize-trees.mjs). Runs after `gltf-transform optimize` in `npm run models`.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const FILE = 'public/models/ruin.glb';
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(FILE);
const drop = (n) => {
  n.listChildren().forEach(drop);
  n.getMesh()?.dispose();
  n.dispose();
};
let count = 0;
for (const n of doc.getRoot().listNodes()) if (/bq_Tree/i.test(n.getName())) (drop(n), count++);
await doc.transform(prune());
await io.write(FILE, doc);
console.log(`[ruin] removed ${count} trees from ${FILE}`);
