import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(process.argv[2]);
const r = doc.getRoot(); const f = (v) => v.map((x) => x.toFixed(2)).join(',');
let lines = 0;
function walk(n, d) {
  if (lines++ > 60) return;
  const m = n.getMesh(), sk = n.getSkin();
  const b = getBounds(n);
  const v = m ? m.listPrimitives().reduce((a, p) => a + p.getAttribute('POSITION').getCount(), 0) : 0;
  console.log('  '.repeat(d) + n.getName() + (m ? ` mesh(${v}v ${m.listPrimitives().map((p) => p.getMaterial()?.getName()).join('/')})` : '') + (sk ? ' SKIN' : '') + ` bb=${f(b.min)}..${f(b.max)}`);
  n.listChildren().forEach((c) => walk(c, d + 1));
}
r.listScenes()[0].listChildren().forEach((n) => walk(n, 0));
for (const a of r.listAnimations()) { let mx = 0; a.listSamplers().forEach((s) => { const t = s.getInput().getArray(); mx = Math.max(mx, t[t.length - 1]); }); console.log('ANIM', a.getName(), mx.toFixed(2) + 's', a.listChannels().length + 'ch'); }
for (const m of r.listMaterials()) console.log('MAT', m.getName(), m.getAlphaMode(), m.getBaseColorFactor().map((x) => x.toFixed(2)).join(','), [m.getBaseColorTexture() && 'base', m.getNormalTexture() && 'nrm', m.getMetallicRoughnessTexture() && 'mr', m.getEmissiveTexture() && 'emis'].filter(Boolean).join('+'), 'emisF', f(m.getEmissiveFactor()));
for (const t of r.listTextures()) console.log('TEX', t.getName(), t.getMimeType(), t.getSize()?.join('x'), (t.getImage().byteLength / 1e6).toFixed(2) + 'MB');
