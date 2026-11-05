import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { ARRIVAL, workStops } from './timeline';
// Season Sans / Season Mix, served from /public/fonts (troika needs woff, not woff2)
const fontLight = '/fonts/season-sans-300.woff';
const fontRegular = '/fonts/season-sans-400.woff';
const fontSerif = '/fonts/season-mix-400-italic.woff';
const fontDisplay = '/fonts/season-mix-300.woff'; // the name

/**
 * Everything readable on the home page, drawn in WebGL. Lives in a group parented to the camera at a fixed
 * depth, laid out in CSS pixels so it stays responsive. Each section fades in and out over a scroll range.
 */

export interface HomeProject {
  slug: string;
  title: string;
  client: string;
  category: string;
  year?: number;
  color: string;
  sample: boolean;
  summary: string;
  stack: readonly string[];
  metrics: readonly { value: string; label: string }[];
  role?: string;
  kind: 'fullstack' | '3d';
  note?: string;
  wall?: boolean;
  media?: { type: 'video' | 'image' | 'logo'; src: string; poster?: string; bg?: string; caption?: string };
}
export interface HomeData {
  site: {
    name: string;
    role: string;
    focus: string;
    pitch: string;
    email: string;
    availability: string;
    location: string;
    stack: readonly string[];
    experience: readonly {
      role: string;
      org: string;
      place: string;
      period: string;
      line: string;
      tags: readonly string[];
      metrics: readonly { value: string; label: string }[];
    }[];
    education: { degree: string; school: string; detail: string };
    principles: readonly { title: string; line: string }[];
    credits: readonly { label: string; license: string; href: string }[];
    socials: readonly { label: string; href: string }[];
    stats: readonly { value: string; label: string }[];
    hallWork: readonly string[];
  };
  projects: HomeProject[];
}

const BONE = '#e7e3dc';
const ASH = '#9a9ea6';
const SUN = '#e0814f';
/** Dark ink for text over the bright daylight sky (hero). */
const INK = '#22231f';
const DEPTH = 2;
// `mono` is kept as a role name for small captions but is set in the text face: no tracked monospace capitals anywhere
const FONTS = { light: fontLight, regular: fontRegular, serif: fontSerif, display: fontDisplay, mono: fontRegular };

type FontKey = keyof typeof FONTS;
interface Spec {
  text: string;
  font: FontKey;
  size: number; // css px
  color?: string;
  ls?: number; // em
  lh?: number;
  maxW?: number; // css px
  ax?: 'left' | 'center' | 'right';
  ay?: 'top' | 'middle' | 'bottom' | 'top-baseline' | 'bottom-baseline';
  align?: 'left' | 'center' | 'right';
  alpha?: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / Math.max(1e-5, b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function makeText(spec: Spec) {
  const t = new Text();
  t.material = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false });
  t.renderOrder = 20;
  t.userData.spec = spec;
  t.userData.alpha = spec.alpha ?? 1;
  return t;
}

function applySpec(t: Text, px: number) {
  const s = t.userData.spec as Spec;
  t.text = s.text;
  t.font = FONTS[s.font];
  t.fontSize = s.size * px;
  t.color = s.color ?? BONE;
  t.letterSpacing = s.ls ?? (s.font === 'mono' ? 0 : s.font === 'serif' ? -0.01 : -0.035);
  t.lineHeight = s.lh ?? (s.font === 'mono' ? 1.35 : 1.05);
  t.maxWidth = s.maxW ? s.maxW * px : Infinity;
  t.anchorX = s.ax ?? 'left';
  t.anchorY = s.ay ?? 'top';
  t.textAlign = s.align ?? (s.ax === 'center' ? 'center' : s.ax === 'right' ? 'right' : 'left');
}

/** troika only calls back when a sync was needed, so handle the "nothing changed" and "already syncing" cases. */
const syncP = (t: Text) =>
  new Promise<void>((r) => {
    const state = t as unknown as { _needsSync?: boolean; _isSyncing?: boolean };
    if (state._needsSync) return t.sync(() => r());
    if (state._isSyncing) {
      const done = () => {
        t.removeEventListener('synccomplete' as never, done);
        r();
      };
      return t.addEventListener('synccomplete' as never, done);
    }
    r();
  });
const widthOf = (t: Text) => {
  const b = t.textRenderInfo?.blockBounds;
  return b ? b[2] - b[0] : 0;
};

/** Rounded rectangle surface used by cards and buttons. */
function panel(color: string, fill = 0.85, pattern = -1) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uSize: { value: new THREE.Vector2(1, 1) },
      uRadius: { value: 16 },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 1 },
      uHover: { value: 0 },
      uFill: { value: fill },
      uPattern: { value: pattern },
    },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec2 uSize; uniform float uRadius, uOpacity, uHover, uFill, uPattern; uniform vec3 uColor; varying vec2 vUv;
      float sd(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      float hsh(float n){ return fract(sin(n * 91.345) * 47453.12); }
      // faint line-art motif per project, in css px space so it stays crisp at any card size
      float motif(vec2 uv, vec2 size){
        vec2 p = uv * size;
        float w = 1.0;
        if (uPattern < 0.5) {
          // dispatch radar: rings round a hub + scattered driver dots
          vec2 c = vec2(size.x * 0.78, size.y * 0.56);
          float r = length(p - c);
          float ring = 1.0 - smoothstep(0.0, w, abs(mod(r, 26.0) - 13.0) - 0.0);
          ring *= smoothstep(150.0, 40.0, r);
          vec2 cell = floor(p / 34.0);
          vec2 dp = (cell + 0.5 + (vec2(hsh(cell.x * 7.0 + cell.y), hsh(cell.y * 3.0 - cell.x)) - 0.5) * 0.6) * 34.0;
          float dotm = (1.0 - smoothstep(1.2, 2.2, length(p - dp))) * step(0.55, hsh(cell.x * 13.0 + cell.y * 5.0));
          return max(ring * 0.7, dotm) * smoothstep(0.3, 0.75, uv.y);
        } else if (uPattern < 1.5) {
          // traffic: bars rising to a spike
          float bw = 9.0;
          float i = floor(p.x / bw);
          float x = i / (size.x / bw);
          float h = (0.12 + 0.18 * hsh(i) + 0.55 * exp(-pow((x - 0.68) * 7.0, 2.0))) * size.y * 0.42;
          float base = size.y * 0.36;
          float inBar = step(1.5, mod(p.x, bw)) * step(base, p.y) * step(p.y, base + h);
          return inBar * 0.55;
        } else if (uPattern < 2.5) {
          // modules: a grid of tiles, some lit
          float g = 30.0;
          vec2 cell = floor(p / g);
          vec2 f = mod(p, g) - g * 0.5;
          float box = sd(f, vec2(g * 0.36), 4.0);
          float outline = 1.0 - smoothstep(0.0, w, abs(box));
          float lit = step(0.72, hsh(cell.x * 17.0 + cell.y * 31.0)) * (1.0 - smoothstep(-1.0, 0.0, box));
          return max(outline * 0.6, lit * 0.45) * smoothstep(0.32, 0.7, uv.y) * smoothstep(0.98, 0.8, uv.y);
        }
        // speed: streaks of varying length
        float row = floor(p.y / 11.0);
        float len = (0.25 + 0.7 * hsh(row * 3.1)) * size.x;
        float start = hsh(row * 7.7) * (size.x - len);
        float line = (1.0 - smoothstep(0.0, w, abs(mod(p.y, 11.0) - 5.5))) * step(start, p.x) * step(p.x, start + len);
        return line * step(0.35, hsh(row)) * smoothstep(0.32, 0.72, uv.y) * 0.6;
      }
      void main(){
        vec2 p = (vUv - 0.5) * uSize;
        float d = sd(p, uSize * 0.5, uRadius);
        float aa = fwidth(d);
        float a = 1.0 - smoothstep(-aa, aa, d);
        vec3 base = vec3(0.07, 0.078, 0.092);
        float g = 1.0 - smoothstep(0.0, 1.0, length((vUv - vec2(0.72, 1.08)) * vec2(1.0, 1.25)));
        vec3 col = uFill >= 1.0 ? uColor : mix(base, uColor, g * uFill * (0.75 + 0.35 * uHover));
        if (uPattern > -0.5) col += uColor * motif(vUv, uSize) * (0.32 + 0.15 * uHover);
        float edge = 1.0 - smoothstep(0.0, aa * 1.5, abs(d + aa * 0.75));
        col += edge * (0.08 + 0.12 * uHover);
        gl_FragColor = vec4(col, a * uOpacity);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.renderOrder = 15;
  mesh.userData.alpha = 1;
  return mesh;
}

interface Section {
  name: string;
  range: [number, number, number, number];
  group: THREE.Group;
  opacity: number;
  layout: () => Promise<void>;
  update?: (local: number, o: number) => void;
}

interface Target {
  mesh: THREE.Object3D;
  href: string;
  external?: boolean;
  section: Section;
  hover: number;
  scaleBase: number;
}

export class HomeUI {
  root = new THREE.Group();
  private sections: Section[] = [];
  private targets: Target[] = [];
  private px = 1;
  private vw = 1;
  private vh = 1;
  private hud!: { scroll: Text; group: THREE.Group };
  private ray = new THREE.Raycaster();
  hovered: Target | null = null;

  constructor(private data: HomeData, private camera: THREE.PerspectiveCamera) {
    this.root.position.z = -DEPTH;
    camera.add(this.root);
    this.build();
  }

  private section(name: string, range: Section['range'], layout: (g: THREE.Group, s: Section) => Promise<void>, update?: Section['update']) {
    const group = new THREE.Group();
    this.root.add(group);
    const s: Section = { name, range, group, opacity: 0, layout: () => layout(group, s), update };
    this.sections.push(s);
    return s;
  }

  private add(g: THREE.Group, spec: Spec) {
    const t = makeText(spec);
    g.add(t);
    return t;
  }

  private target(mesh: THREE.Object3D, href: string, section: Section, external = false) {
    this.targets.push({ mesh, href, external, section, hover: 0, scaleBase: 1 });
  }

  /** Lay out a row of texts side by side, centred on x=0. Returns the texts' x centres. */
  private async inline(parts: Text[], gapPx: number) {
    parts.forEach((t) => applySpec(t, this.px));
    await Promise.all(parts.map(syncP));
    const ws = parts.map(widthOf);
    const total = ws.reduce((a, b) => a + b, 0) + gapPx * this.px * (parts.length - 1);
    let x = -total / 2;
    parts.forEach((t, i) => {
      t.anchorX = 'left';
      t.position.x = x;
      x += ws[i] + gapPx * this.px;
    });
    await Promise.all(parts.map(syncP));
    return ws;
  }

  private build() {
    const d = this.data;
    const s = d.site;

    // HUD (persistent)
    const hudGroup = new THREE.Group();
    this.root.add(hudGroup);
    this.hud = {
      group: hudGroup,
      scroll: this.add(hudGroup, { text: 'Scroll to climb ↓', font: 'mono', size: 14, color: BONE, ax: 'center', ay: 'bottom' }),
    };

    // 01 · Keep (hero): only the name, across the full width at the foot of the frame
    this.section('THE KEEP', [-1, -0.5, 0.012, 0.03], async (g) => {
      if (!g.children.length) {
        this.add(g, { text: s.name, font: 'display', size: 200, ax: 'center', ay: 'bottom', ls: -0.025, lh: 0.88 });
      }
      const name = g.children[0] as Text;
      // soft shadow so it holds up over the sunlit grass
      name.outlineBlur = '40%';
      name.outlineWidth = 0;
      name.outlineColor = '#0b0e07';
      name.userData.shadow = 0.4;
      const mobile = this.vw < 760;
      const margin = mobile ? 16 : 28;
      const P = this.px;

      // fit the name to the full width: measure at a reference size, then scale
      const spec = name.userData.spec as Spec;
      spec.size = 200;
      applySpec(name, P);
      await syncP(name);
      const w = widthOf(name) / P;
      spec.size = 200 * ((this.vw - margin * 2) / Math.max(1, w));
      applySpec(name, P);
      name.position.set(0, 0, 0);
      await syncP(name);
      // seat it by its visible ink (the j's descender), not the line box, just above the scroll hint
      const info = name.textRenderInfo as { visibleBounds?: number[]; blockBounds: number[] } | undefined;
      const vb = info?.visibleBounds ?? info?.blockBounds;
      name.position.y = (-this.vh / 2 + (mobile ? 50 : 48)) * P - (vb ? vb[1] : 0);
    });

    // 02 · The note: the camera stops over the old paper on the path (Note.ts); only a quiet prompt here
    this.section('THE NOTE', [0.036, 0.046, 0.074, 0.084], async (g) => {
      if (!g.children.length) this.add(g, { text: 'Scroll, and let the wind take it', font: 'mono', size: 15, color: BONE, ax: 'center', alpha: 0.85 });
      const hint = g.children[0] as Text;
      applySpec(hint, this.px);
      hint.position.set(0, (-this.vh / 2 + 64) * this.px, 0);
      await syncP(hint);
    });

    // 03 · Statement
    this.section(
      'THE NORTH WALL',
      [0.136, 0.158, 0.215, 0.245],
      async (g, sec) => {
        if (!g.children.length) {
          this.add(g, { text: 'What I do', font: 'mono', size: 16, color: SUN, ax: 'center' });
          this.add(g, { text: 'I build the', font: 'light', size: 96 });
          this.add(g, { text: 'systems', font: 'serif', size: 104, color: SUN });
          this.add(g, { text: 'behind the products', font: 'light', size: 96, ax: 'center' });
          this.add(g, { text: 'people use.', font: 'light', size: 96, ax: 'center' });
          this.add(g, {
            text: 'I focus on designing reliable architectures, engineering scalable backend systems and delivering full-stack applications that perform beyond the development environment.',
            font: 'regular', size: 16, color: ASH, ax: 'center', maxW: 460, lh: 1.4,
          });
          const ring = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(
              Array.from({ length: 97 }, (_, i) => {
                const a = (i / 96) * Math.PI * 2.15 + 2.6;
                return new THREE.Vector3(Math.cos(a) * (1 + 0.04 * Math.sin(a * 3)), Math.sin(a) * (1 + 0.03 * Math.cos(a * 2)), 0);
              }),
            ),
            new THREE.LineBasicMaterial({ color: SUN, transparent: true, depthTest: false, depthWrite: false }),
          );
          ring.renderOrder = 21;
          ring.userData.alpha = 0.9;
          g.add(ring);
        }
        const [fig, l1a, l1b, l2, l3, sub] = g.children as Text[];
        const ring = g.children[6] as THREE.Line;
        const size = Math.min(this.vw * 0.085, 96);
        [l1a, l2, l3].forEach((t) => ((t.userData.spec as Spec).size = size));
        (l1b.userData.spec as Spec).size = size * 1.08;
        (sub.userData.spec as Spec).maxW = Math.min(520, this.vw - 64);
        [fig, l2, l3, sub].forEach((t) => applySpec(t, this.px));
        const lineH = size * 1.0 * this.px;
        const top = lineH * 1.6;
        fig.position.set(0, top + 44 * this.px, 0);
        const ws = await this.inline([l1a, l1b], size * 0.22);
        l1a.position.y = l1b.position.y = top;
        l2.position.set(0, top - lineH, 0);
        l3.position.set(0, top - lineH * 2, 0);
        sub.position.set(0, top - lineH * 3 - 18 * this.px, 0);
        await Promise.all([fig, l2, l3, sub].map(syncP));
        ring.position.set(l1b.position.x + ws[1] / 2, top - lineH * 0.5, 0);
        ring.scale.set(ws[1] / 2 + 18 * this.px, lineH * 0.55, 1);
        sec.update = (local) => {
          const n = Math.floor(THREE.MathUtils.clamp((local - 0.15) / 0.4, 0, 1) * 97);
          ring.geometry.setDrawRange(0, n);
        };
      },
    );

    // 03 · Work: the exhibits hang on the hall walls (WorkPanels); here only a caption and a counter
    const stops = workStops();
    const wallWork = d.site.hallWork.map((id) => d.projects.find((p) => p.slug === id)).filter((p): p is HomeProject => !!p);
    const workCount = Math.min(stops.length, wallWork.length);
    const kinds = new Set(wallWork.map((p) => p.kind));
    const sub = `${kinds.size > 1 ? 'Full-stack and 3D web' : kinds.has('3d') ? '3D web' : 'Full-stack'} · ${workCount} projects`;
    // 03a · Arrival: in through the door, the whole hall, and a word to whoever just walked in
    const G = (local: number) => 0.27 + 0.44 * local;
    this.section('THE ARRIVAL', [G(ARRIVAL.in - 0.02), G(ARRIVAL.in + 0.005), G(ARRIVAL.out - 0.005), G(ARRIVAL.out + 0.02)], async (g) => {
      if (!g.children.length) {
        this.add(g, { text: 'Everything in here\nwas built for someone.', font: 'light', size: 76, ax: 'center', ay: 'bottom', align: 'center', ls: -0.025, lh: 1.02 });
        this.add(g, {
          text: 'A founder with an idea, a team up against a deadline, a brand that wanted to be remembered. Walk on and meet a few of them.',
          font: 'regular', size: 20, ax: 'center', ay: 'top', align: 'center', lh: 1.45, alpha: 0.86,
        });
      }
      const [head, line] = g.children as Text[];
      const mobile = this.vw < 760;
      const size = Math.min(this.vw * (mobile ? 0.085 : 0.056), 78);
      (head.userData.spec as Spec).size = size;
      (head.userData.spec as Spec).maxW = Math.min(this.vw - 32, mobile ? 480 : 980);
      (line.userData.spec as Spec).size = mobile ? 17 : 20;
      (line.userData.spec as Spec).maxW = Math.min(this.vw - 48, 560);
      for (const t of [head, line]) {
        applySpec(t, this.px);
        // a soft shadow, so the words hold over the candlelit nave
        t.outlineBlur = '45%';
        t.outlineWidth = 0;
        t.outlineColor = '#050403';
        t.userData.shadow = 0.55;
      }
      head.position.set(0, (mobile ? 40 : 30) * this.px, 0);
      line.position.set(0, (mobile ? 16 : 6) * this.px, 0);
      await Promise.all([head, line].map(syncP));
    });

    this.section('THE GREAT HALL', [G(ARRIVAL.out + 0.015), G(ARRIVAL.out + 0.035), stops[workCount - 1] + 0.012, stops[workCount - 1] + 0.026], async (g, sec) => {
      if (!g.children.length) {
        this.add(g, { text: 'Selected work', font: 'mono', size: 16, color: SUN });
        this.add(g, { text: sub, font: 'mono', size: 14, color: BONE, alpha: 0.75 });
        this.add(g, { text: `01 / ${String(workCount).padStart(2, '0')}`, font: 'mono', size: 15, color: BONE, ax: 'center', ay: 'bottom' });
        this.add(g, { text: 'Click to open the case study', font: 'mono', size: 14, color: BONE, ax: 'center', ay: 'bottom', alpha: 0.6 });
      }
      const [lbl, subT, counter, hint] = g.children as Text[];
      const mobile = this.vw < 760;
      const P = this.px;
      (hint.userData.spec as Spec).text = mobile ? 'Tap to open the case study' : 'Click to open the case study';
      [lbl, subT, counter, hint].forEach((t) => applySpec(t, P));
      const x = (-this.vw / 2 + (mobile ? 16 : 28)) * P;
      lbl.position.set(x, (this.vh / 2 - (mobile ? 76 : 92)) * P, 0);
      subT.position.set(x, (this.vh / 2 - (mobile ? 94 : 110)) * P, 0);
      counter.position.set(0, (-this.vh / 2 + 52) * P, 0);
      hint.position.set(0, (-this.vh / 2 + 30) * P, 0);
      await Promise.all([lbl, subT, counter, hint].map(syncP));
      let last = -1;
      sec.update = () => {
        let idx = 0;
        stops.slice(0, workCount).forEach((w, i) => Math.abs(this.p - w) < Math.abs(this.p - stops[idx]) && (idx = i));
        if (idx === last) return;
        last = idx;
        counter.text = `${String(idx + 1).padStart(2, '0')} / ${String(workCount).padStart(2, '0')}`;
        counter.sync();
      };
    });

    // 06 · Climb
    this.section('THE CLOUD DECK', [0.735, 0.765, 0.8, 0.83], async (g) => {
      if (!g.children.length) {
        this.add(g, { text: "Next one's", font: 'light', size: 92 });
        this.add(g, { text: 'yours.', font: 'serif', size: 100, color: '#f3a77a' });
        // the bridge back to the hall ("Everything in here was built for someone") and on to the call below
        this.add(g, {
          text: 'Every project in that hall started as somebody’s idea. Bring yours, and we’ll build it to last.',
          font: 'regular', size: 20, color: '#16181d', ax: 'center', ay: 'top', align: 'center', lh: 1.45,
        });
      }
      const [a, b, line] = g.children as Text[];
      const mobile = this.vw < 760;
      const size = Math.min(this.vw * (mobile ? 0.105 : 0.09), 104);
      (a.userData.spec as Spec).size = size;
      (b.userData.spec as Spec).size = size * 1.08;
      (line.userData.spec as Spec).size = mobile ? 17 : 20;
      (line.userData.spec as Spec).maxW = Math.min(this.vw - 48, 520);
      applySpec(line, this.px); // dark ink on the bright dawn sky, like the finale's lines below it
      await this.inline([a, b], size * 0.22);
      a.position.y = b.position.y = size * 0.55 * this.px;
      line.position.set(0, -(size * 0.42 + 30) * this.px, 0);
      await syncP(line);
    });

    // 07 · Finale: CTA, then a footer row (email · elsewhere · pages) and credits
    this.section('OPEN SKY', [0.86, 0.9, 2, 3], async (g, sec) => {
      if (!g.children.length) {
        const named = (t: Text, n: string) => ((t.name = n), t);
        named(this.add(g, { text: "Let's take", font: 'light', size: 120, color: '#1a1b21' }), 'h1');
        named(this.add(g, { text: 'off', font: 'serif', size: 130, color: '#a8401a' }), 'h2');
        named(this.add(g, { text: s.availability, font: 'mono', size: 15, color: '#2e2320', ax: 'center' }), 'avail');
        const btn = panel('#16181d', 1);
        btn.name = 'btn';
        g.add(btn);
        named(this.add(g, { text: 'Tell me about yours  →', font: 'regular', size: 16, color: BONE, ax: 'center', ay: 'middle' }), 'btnLabel');
        this.target(btn, '#book', sec); // opens the Cal.com booking popup
        // no footer: keep scrolling and the flight carries on to About (World.charge fills the bar)
        named(this.add(g, { text: 'Keep scrolling', font: 'mono', size: 14, color: '#2e2320', ax: 'center', ay: 'top', alpha: 0.8 }), 'more');
        named(this.add(g, { text: 'About me ↓', font: 'display', size: 30, color: '#16181d', ax: 'center', ay: 'top' }), 'next');
        const bar = (n: string, color: string, alpha: number) => {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false, depthWrite: false }));
          m.name = n;
          m.renderOrder = 21;
          m.userData.alpha = alpha;
          g.add(m);
          return m;
        };
        bar('track', '#2a201c', 0.18);
        bar('fill', '#a8401a', 1);
      }
      const get = (n: string) => g.getObjectByName(n) as Text;
      const [h1, h2, avail, btnLabel, more, next] = ['h1', 'h2', 'avail', 'btnLabel', 'more', 'next'].map(get);
      const btn = g.getObjectByName('btn') as THREE.Mesh;
      const track = g.getObjectByName('track') as THREE.Mesh;
      const fill = g.getObjectByName('fill') as THREE.Mesh;
      const mobile = this.vw < 760;
      const P = this.px;
      const size = Math.min(this.vw * (mobile ? 0.15 : 0.11), 150);
      (h1.userData.spec as Spec).size = size;
      (h2.userData.spec as Spec).size = size * 1.08;
      const all = [avail, btnLabel, more, next];
      all.forEach((t) => applySpec(t, P));
      const top = (this.vh / 2 - (mobile ? 150 : 120)) * P;
      await this.inline([h1, h2], size * 0.24);
      h1.position.y = h2.position.y = top;
      avail.position.set(0, top - size * 1.06 * P, 0);
      const bw = 236, bh = 52;
      const by = top - (size * 1.06 + 62) * P;
      btn.scale.set(bw * P, bh * P, 1);
      btn.position.set(0, by, 0);
      const bu = (btn.material as THREE.ShaderMaterial).uniforms;
      bu.uSize.value.set(bw, bh);
      bu.uRadius.value = bh / 2;
      btnLabel.position.set(0, by, 0.001);
      // the way on: under the button, in open sky above the plane
      const moreY = by - (bh / 2 + 40) * P;
      const barW = Math.min(220, this.vw * 0.55);
      more.position.set(0, moreY, 0);
      next.position.set(0, moreY - 20 * P, 0);
      const base = moreY - 66 * P;
      track.scale.set(barW * P, 1.5 * P, 1);
      track.position.set(0, base, 0);
      fill.position.set(0, base, 0.001);
      await Promise.all(all.map(syncP));
      sec.update = () => {
        const c = this.charge;
        fill.scale.set(Math.max(0.0001, c) * barW * P, 2 * P, 1);
        fill.position.x = (-barW / 2 + (c * barW) / 2) * P;
        next.scale.setScalar(1 + c * 0.12);
      };
    });
  }

  async layout(vw: number, vh: number) {
    this.vw = vw;
    this.vh = vh;
    const viewH = 2 * DEPTH * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.px = viewH / vh;
    const { scroll } = this.hud;
    applySpec(scroll, this.px);
    scroll.position.set(0, (-vh / 2 + 28) * this.px, 0);
    await syncP(scroll);
    await Promise.all(this.sections.map((s) => s.layout()));
  }

  private p = 0;
  /** 0–1: how far the reader has pushed on past the end toward About (World). */
  charge = 0;
  update(p: number, time: number, dt: number, intro: number) {
    this.p = p;
    for (const s of this.sections) {
      const [a, b, c, d] = s.range;
      const o = smooth(a, b, p) * (1 - smooth(c, d, p)) * intro;
      s.opacity = o;
      s.group.visible = o > 0.002;
      if (!s.group.visible) continue;
      s.group.position.y = (1 - o) * -14 * this.px * (p > (b + c) / 2 ? -1 : 1);
      s.update?.(THREE.MathUtils.clamp((p - b) / Math.max(1e-5, c - b), 0, 1), o);
      s.group.traverse((obj) => {
        const alpha = (obj.userData.alpha as number | undefined) ?? 1;
        if (obj instanceof Text) {
          obj.fillOpacity = o * alpha;
          if (obj.userData.shadow) obj.outlineOpacity = o * alpha * obj.userData.shadow;
        }
        else if ((obj as THREE.Mesh).material) {
          const m = (obj as THREE.Mesh).material as THREE.ShaderMaterial & THREE.LineBasicMaterial;
          if (m.uniforms?.uOpacity) m.uniforms.uOpacity.value = o * alpha;
          else if (m.isLineBasicMaterial || (m as unknown as THREE.MeshBasicMaterial).isMeshBasicMaterial) m.opacity = o * alpha;
        }
      });
    }

    // HUD
    const finale = smooth(0.84, 0.88, p);
    const hudO = intro * (1 - finale);
    this.hud.group.visible = hudO > 0.002;
    this.hud.scroll.fillOpacity = hudO * (1 - smooth(0.0, 0.04, p)) * (0.55 + 0.45 * Math.sin(time * 2.4));

    // hover easing
    for (const t of this.targets) {
      t.hover = THREE.MathUtils.damp(t.hover, this.hovered === t ? 1 : 0, 10, dt);
      const m = (t.mesh as THREE.Mesh).material as THREE.ShaderMaterial;
      if (m?.uniforms?.uHover) m.uniforms.uHover.value = t.hover;
      const parent = t.mesh.parent;
      if (parent && parent !== t.section.group && parent.type === 'Group') {
        const s = 1 + t.hover * 0.025;
        parent.scale.setScalar(s);
      }
    }
  }

  /** Returns the target under the pointer (NDC), if its section is visible enough. */
  pick(ndc: THREE.Vector2) {
    this.ray.setFromCamera(ndc, this.camera);
    const live = this.targets.filter((t) => t.section.opacity > 0.6);
    const hits = this.ray.intersectObjects(live.map((t) => t.mesh), false);
    const hit = hits[0]?.object;
    this.hovered = hit ? live.find((t) => t.mesh === hit) ?? null : null;
    return this.hovered;
  }
}
