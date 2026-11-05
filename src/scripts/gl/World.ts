import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { Sky } from './Sky';
import { Clouds } from './Clouds';
import { Ruin } from './Ruin';
import { Flight } from './Flight';
import { Post } from './Post';
import { HomeUI, type HomeData } from './HomeUI';
import { Hall, HALL_FOG, HALL_FOG_DENSITY, HALL_ORIGIN } from './Hall';

const DEBUG_CAM = import.meta.env.DEV ? new URLSearchParams(location.search).get('cam')?.split(',').map(Number) ?? null : null;
import { blackout, cloudout, fitInterior, setHall, skyHold, workStops, makeLightState, sceneAt, sampleCamera, sampleLight } from './timeline';
import type { WorkItem } from './WorkPanels';

export type Mode = 'home' | 'page';

/** Quality tiers, stepped down automatically when frames run slow. */
const TIERS = [
  { name: 'low', pr: 1, grass: 0.35, shadows: false, shadowSize: 1024, clouds: 0.45 },
  { name: 'medium', pr: 1.25, grass: 0.55, shadows: true, shadowSize: 1024, clouds: 0.7 },
  { name: 'high', pr: 1.5, grass: 1, shadows: true, shadowSize: 2048, clouds: 1 },
];

/** One renderer, one scene, alive for the whole visit. It only renders on the home page; other pages are plain DOM. */
export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.05, 1000);
  post: Post;
  mode: Mode = 'home';
  progress = 0;
  intro = 0;
  /** Darkening applied on DOM pages so text stays readable. */
  ui?: HomeUI;
  onNavigate: (href: string, external: boolean) => void = () => {};

  private sky = new Sky();
  private clouds: Clouds;
  castle?: Ruin;
  private flight?: Flight;
  hall?: Hall;
  private flow = 0;
  /** Scrolling on past the end of the page: builds up, decays when it stops. */
  private thrust = 0;
  private thrustEased = 0;
  private interiorBg = new THREE.Color('#06070a');
  private light = makeLightState();
  private fog = new THREE.FogExp2(0x000000, 0.05);
  private pointer = new THREE.Vector2();
  private pointerEased = new THREE.Vector2();
  private ndc = new THREE.Vector2(-10, -10);
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private isMobile: boolean;
  private reduced: boolean;
  private velocity = 0;
  private time = 0;
  private moonGltf: { scene: THREE.Object3D } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.isMobile = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.camera.layers.enable(1); // grass (see Ruin): drawn by the main camera, skipped by the pond's mirror
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = !this.isMobile;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.tier = this.initialTier();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, TIERS[this.tier].pr));
    this.scene.fog = this.fog;
    this.scene.add(this.sky.group);
    this.clouds = new Clouds(this.isMobile);
    this.scene.add(this.clouds.mesh);
    this.scene.add(this.camera);
    this.post = new Post(this.renderer, this.scene, this.camera, this.isMobile || this.reduced);
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('pointermove', (e) => {
      this.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this.ndc.copy(this.pointer);
    });
  }

  async load(onProgress: (f: number) => void) {
    const manager = new THREE.LoadingManager();
    const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
    // byte sizes of public/models/*.glb, for the loader's progress
    const sizes = { castle: 1_350_000, trees: 2_210_000, lanterns: 522_000, pond: 1_729_000, bird: 959_000, plane: 250_000, moon: 1_151_000 };
    const got = { castle: 0, trees: 0, lanterns: 0, pond: 0, bird: 0, plane: 0, moon: 0 };
    const total = Object.values(sizes).reduce((a, b) => a + b, 0);
    const report = () => onProgress(Math.min(1, Object.values(got).reduce((a, b) => a + b, 0) / total));
    const get = (url: string, key: keyof typeof got) => loader.loadAsync(url, (e) => { got[key] = e.loaded; report(); });
    const envP = new RGBELoader(manager).loadAsync('/env/hills.hdr').catch(() => null);
    const [castle, trees, lanterns, pond, bird, plane, moon, hdr] = await Promise.all([
      get('/models/ruin.glb', 'castle'),
      get('/models/trees.glb', 'trees'),
      get('/models/lanterns.glb', 'lanterns'),
      get('/models/pond.glb', 'pond'),
      get('/models/hummingbird.glb', 'bird'),
      get('/models/airplane.glb', 'plane'),
      get('/moon.glb', 'moon').catch(() => null), // the hall's moon; the sky still glows without it
      envP,
    ]);
    let env: THREE.Texture | null = null;
    if (hdr) {
      // HDRI (Poly Haven "Golden Gate Hills") as image-based light for the hillside set only
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pm = new THREE.PMREMGenerator(this.renderer);
      env = pm.fromEquirectangular(hdr).texture;
      hdr.dispose();
      pm.dispose();
    }
    this.castle = new Ruin(castle, { trees, lanterns, pond, bird }, this.isMobile, env);
    if (import.meta.env.DEV) (window as unknown as { __world: World }).__world = this; // dev: poke at the set from the console
    this.scene.add(this.castle.group);
    this.moonGltf = moon;
    this.flight = new Flight(plane, this.isMobile);
    this.scene.add(this.flight.group);
    this.applyTier();
    this.renderer.compile(this.scene, this.camera);
    onProgress(1);
  }

  async buildHome(data: HomeData) {
    if (this.ui) return;
    // the work on the hall walls, in order: each opens its case study
    const pad = (i: number) => String(i + 1).padStart(2, '0');
    const byId = new Map(data.projects.map((p) => [p.slug, p]));
    const items: WorkItem[] = data.site.hallWork
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p, i) => ({
        href: `/work/${p.slug}`, no: pad(i), kind: p.kind, client: p.client, title: p.title, category: p.category, year: p.year,
        role: p.role, note: p.note, summary: p.summary, stack: p.stack, metrics: p.metrics, color: p.color, media: p.media,
      }));
    const stacked = this.isMobile || innerWidth < innerHeight;
    setHall(items.length, stacked);
    this.fitScroll(items.length);
    this.hall = new Hall(items, this.isMobile, stacked);
    this.hall.favs.frame(this.camera.fov, this.camera.aspect);
    if (matchMedia('(pointer: coarse)').matches) this.hall.favs.reach = 36;
    if (this.moonGltf) this.hall.setMoon(this.moonGltf);
    this.scene.add(this.hall.group);
    await this.hall.works.paint();
    this.ui = new HomeUI(data, this.camera);
    await this.ui.layout(innerWidth, innerHeight);
  }

  setMode(mode: Mode) {
    this.mode = mode;
    if (mode === 'home') this.applyScrollHeight(); // a fresh home container comes with the default height
    this.charge = 0;
    this.leaving = false;
    this.perf.start = 0; // time away on other pages is not a slow frame
    if (this.ui) this.ui.root.visible = mode === 'home';
  }

  /** The user keeps scrolling at the very end (wheel / swipe / keys): push the flight faster for a moment. */
  addThrust(amount: number) {
    if (!this.reduced) this.thrust = Math.min(1, this.thrust + amount);
    // keep pushing and the flight carries on to About
    // about three times the push of before: the reader has to mean it, and gets to feel the plane wind up
    this.charge = Math.min(1, this.charge + amount * 0.28);
    if (this.charge >= 1 && !this.leaving) {
      this.leaving = true;
      this.onNavigate('/about', false);
    }
  }
  /** 0–1, built up by scrolling on past the end; drains when the reader stops. */
  charge = 0;
  private leaving = false;

  /**
   * The page's scroll length per set, in viewport heights: the ruin and the sky keep theirs, the hall gets room for
   * its exhibits only. Raw scroll is mapped onto the story's fixed progress (exterior 0–0.27, hall 0.27–0.71,
   * sky 0.71–1), so every timed caption and camera key keeps working whatever the hall's length.
   */
  private scrollPlan = { ext: 337.5, int: 550, sky: 362.5 };
  private fitScroll(exhibits: number) {
    this.scrollPlan.int = 520 + 57 * Math.max(1, exhibits); // + the poster lightboxes, the walk out and a long hold under the sky
    this.applyScrollHeight();
  }
  private applyScrollHeight() {
    const { ext, int, sky } = this.scrollPlan;
    document.querySelector<HTMLElement>('.home-scroll')?.style.setProperty('height', `${ext + int + sky}vh`);
  }
  private story(raw: number) {
    const { ext, int, sky } = this.scrollPlan;
    const total = ext + int + sky, a = ext / total, b = (ext + int) / total;
    if (raw < a) return (raw / a) * 0.27;
    if (raw < b) return 0.27 + ((raw - a) / (b - a)) * 0.44;
    return 0.71 + ((raw - b) / (1 - b)) * 0.29;
  }

  setScroll(raw: number, velocity: number) {
    const progress = this.story(raw);
    this.progress = progress;
    this.velocity = velocity;
  }

  private ray = new THREE.Raycaster();
  private stops: number[] = [];
  /** The exhibit the camera is at or walking toward (its reel plays). */
  private nearestWork(reach = 0.04) {
    if (!this.stops.length) this.stops = workStops();
    let best = -1, bd = reach;
    this.stops.forEach((s, i) => {
      const d = Math.abs(this.progress - s);
      if (d < bd) (bd = d), (best = i);
    });
    return best;
  }
  /** The framed print under the pointer, when the hall is on stage. */
  private pickWork() {
    if (!this.hall?.group.visible || this.post.dim > 0.3) return null;
    this.ray.setFromCamera(this.ndc, this.camera);
    const i = this.hall.works.pick(this.ray);
    return i < 0 ? null : this.hall.works.href(i);
  }

  /** Returns true when the pointer is over a clickable canvas element. */
  hoverCheck(x?: number, y?: number) {
    if (this.mode !== 'home' || !this.ui) return false;
    if (x !== undefined && y !== undefined) this.ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    const ui = !!this.ui.pick(this.ndc);
    if (ui) {
      if (this.hall) this.hall.works.hovered = -1;
      return true;
    }
    if (this.pickWork()) return true;
    return this.starAt(x, y) >= 0;
  }


  /** The visitor's favourite (a star over the roof) under the pointer, or −1; also marks it hovered. */
  starAt(x?: number, y?: number) {
    const favs = this.hall?.favs;
    if (!favs) return -1;
    const on = this.stage.sky && x !== undefined && y !== undefined;
    favs.hovered = on ? favs.hit(x, y, this.camera) : -1;
    return favs.hovered;
  }

  /** What is on stage, for the DOM layer (social.ts): the exhibit being looked at, and whether the sky of favourites is up. */
  stage = { work: -1, sky: false, skyIn: 0, scene: 'exterior' as 'exterior' | 'interior' | 'sky', local: 0, thrust: 0 };
  /** Called when a star is clicked. */
  onStar: (index: number) => void = () => {};

  click() {
    if (this.mode !== 'home' || !this.ui) return false;
    const t = this.ui.pick(this.ndc);
    if (t) {
      this.onNavigate(t.href, !!t.external);
      return true;
    }
    const href = this.pickWork();
    if (!href) {
      const star = this.hall?.favs.hovered ?? -1;
      if (star < 0) return false;
      this.onStar(star);
      return true;
    }
    this.onNavigate(href, false);
    return true;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    // keep the castle framed on tall phone screens
    this.camera.fov = w < h ? 52 : 38;
    this.camera.updateProjectionMatrix();
    fitInterior(w / h);
    this.hall?.favs.frame(this.camera.fov, w / h);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h);
    this.ui?.layout(w, h);
  }

  tier = 2;
  private perf = { start: 0, frames: 0, slow: 0, grace: 0 };

  private initialTier() {
    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    if (/swiftshader|llvmpipe|software/i.test(gpu)) return 0;
    if (this.isMobile || /intel|mali-[gt]?[1-7]\d|adreno.{0,6}[1-5]\d\d/i.test(gpu)) return 1;
    return 2;
  }

  private applyTier() {
    const q = TIERS[this.tier];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, q.pr));
    this.resize();
    this.castle?.setQuality(q.grass, q.shadows, q.shadowSize);
    this.clouds.setQuality(q.clouds);
  }

  /** Watch real frame times; if they stay slow, drop one tier (never climbs back, to avoid flicker). */
  private watchPerf() {
    const now = performance.now();
    const p = this.perf;
    if (document.hidden || !this.castle || (this.mode === 'home' && this.intro < 1)) {
      p.start = 0;
      return;
    }
    if (!p.start) {
      p.start = now;
      p.frames = 0;
      p.grace = p.grace || now + 4000; // let shaders compile and the intro settle first
      return;
    }
    p.frames++;
    if (now < p.grace) {
      p.start = now;
      p.frames = 0;
      return;
    }
    const span = now - p.start;
    if (span < 2000) return;
    const ms = span / p.frames;
    p.start = now;
    p.frames = 0;
    p.slow = ms > 1000 / 40 ? p.slow + 1 : 0;
    if (p.slow >= 3 && this.tier > 0) {
      p.slow = 0;
      this.tier--;
      this.applyTier();
      p.grace = now + 1500;
    }
  }

  tick(dt: number) {
    if (this.mode !== 'home') return; // other pages are plain DOM: the canvas is hidden and nothing renders
    this.watchPerf();
    this.time += dt;
    const t = this.time;
    const damp = this.reduced ? 20 : 4;
    this.pointerEased.x = THREE.MathUtils.damp(this.pointerEased.x, this.pointer.x, damp, dt);
    this.pointerEased.y = THREE.MathUtils.damp(this.pointerEased.y, this.pointer.y, damp, dt);
    const sway = this.reduced ? 0 : 1;

    let scene: 'exterior' | 'interior' | 'sky' = 'exterior';
    let local = 0;
    if (this.mode === 'home') {
      ({ scene, local } = sceneAt(this.progress));
      sampleCamera(scene, local, this.camPos, this.camLook);
      if (scene === 'exterior') {
        // intro: start further out and settle in
        const back = (1 - this.intro) * 0.6;
        this.camPos.sub(this.camLook).multiplyScalar(1 + back).add(this.camLook);
        sampleLight('exterior', local, this.light);
      } else if (scene === 'interior') {
        this.camPos.add(HALL_ORIGIN);
        this.camLook.add(HALL_ORIGIN);
      } else {
        sampleLight('sky', local, this.light);
        // at speed the whole view buffets, not just the plane
        const s2 = this.thrustEased * this.thrustEased * sway;
        this.camPos.x += (Math.sin(t * 53) * 0.6 + Math.sin(t * 31 + 1) * 0.4) * 0.03 * s2;
        this.camPos.y += (Math.sin(t * 67 + 2) * 0.6 + Math.sin(t * 23) * 0.4) * 0.022 * s2;
      }
      let k = scene === 'exterior' ? 0.09 : scene === 'interior' ? 0.25 : 0.2;
      if (scene === 'interior') {
        // looking up at the sky of favourites the view barely follows the pointer, so stars stay put to be hovered
        const h = skyHold();
        const up = THREE.MathUtils.smoothstep(local, h.from - 0.03, h.from) * (1 - THREE.MathUtils.smoothstep(local, h.to, h.to + 0.03));
        k = THREE.MathUtils.lerp(k, 0.025, up);
      }
      this.camPos.x += (Math.sin(t * 0.13) * 0.04 + this.pointerEased.x * k) * sway;
      this.camPos.y += (Math.sin(t * 0.17) * 0.03 + this.pointerEased.y * k * 0.5) * sway;
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    const pin = import.meta.env.DEV ? ((window as unknown as { __cam?: number[] }).__cam ?? DEBUG_CAM) : null;
    if (pin) {
      // dev only: /?cam=x,y,z,lookX,lookY,lookZ (or window.__cam) pins the camera for inspecting the set
      this.camera.position.set(pin[0], pin[1], pin[2]);
      this.camera.lookAt(pin[3], pin[4], pin[5]);
    }

    // which set is on stage
    const inside = scene === 'interior';
    const inSky = scene === 'sky';
    if (this.castle) this.castle.group.visible = !inside && !inSky;
    if (this.hall) this.hall.group.visible = inside;
    this.sky.group.visible = !inside;
    // billboard clouds only for the flight; elsewhere the sky dome paints soft clouds
    this.clouds.mesh.visible = inSky;
    this.sky.clouds = inSky ? 0 : 0.6;
    this.scene.background = inside ? this.interiorBg : null;

    if (inside) {
      this.fog.color.copy(HALL_FOG);
      this.fog.density = HALL_FOG_DENSITY;
    } else {
      this.fog.color.copy(this.light.fog);
      this.fog.density = this.light.fogDensity;
    }
    this.thrust = Math.max(0, this.thrust - dt * 0.8);
    if (!this.leaving) this.charge = Math.max(0, this.charge - dt * 0.12);
    if (this.ui) this.ui.charge = this.charge;
    // speed felt in the sky: the momentary thrust of each flick, or the built-up charge toward About, whichever is higher.
    // Everything that reads as velocity (clouds streaming, the plane surging and shaking, speed lines, colour fringing)
    // follows it, so the flight winds up as the bar fills and is flat out at the moment it leaves for About.
    const speedTarget = inSky && !this.reduced ? Math.max(this.thrust, this.leaving ? 1 : Math.pow(this.charge, 0.8)) : 0;
    this.thrustEased = THREE.MathUtils.damp(this.thrustEased, speedTarget, speedTarget > this.thrustEased ? 5 : 1.6, dt);
    this.flow += dt * (inSky ? 7 + this.velocity * 0.02 + this.thrustEased * 95 : 0.15);
    if (!inside) {
      this.sky.update(this.light, this.camera, t, this.renderer.getPixelRatio());
      this.clouds.update(this.light, t, this.camera.position.y, this.flow);
    }
    this.castle?.setProgress(this.progress);
    this.castle?.update(this.light, t, innerHeight);
    this.hall?.update(t, dt, innerHeight);
    const work = inside && this.post.dim < 0.95 ? this.nearestWork() : -1;
    if (this.hall) {
      this.hall.works.setActive(work);
      // the piece in view leans a touch toward the pointer (still for reduced motion and on touch screens)
      if (this.reduced || this.isMobile) this.hall.works.pointer.set(0, 0);
      else this.hall.works.pointer.copy(this.pointerEased);
    }
    const hold = skyHold();
    // the love button only while the camera is really at the piece, not walking to it
    this.stage.work = work >= 0 ? this.nearestWork(0.016) : -1;
    this.stage.sky = this.mode === 'home' && inside && local > hold.from && local < hold.to;
    this.stage.skyIn = inside ? THREE.MathUtils.clamp((local - hold.from) / 0.03, 0, 1) * THREE.MathUtils.clamp((hold.to - local) / 0.02, 0, 1) : 0;
    if (!this.stage.sky && this.hall) this.hall.favs.hovered = -1;
    this.stage.scene = scene;
    this.stage.local = local;
    this.stage.thrust = Math.min(1, this.thrustEased);
    this.flight?.update(this.mode === 'home' && inSky, local, t, dt, this.pointerEased, this.camera, this.thrustEased);
    if (this.ui && this.mode === 'home') this.ui.update(this.progress, t, dt, this.intro);

    this.post.dim = blackout(this.progress);
    const cl = cloudout(this.progress);
    this.post.setCloud(cl.amount, cl.dawn);
    this.post.setVelocity(this.reduced ? 0 : this.velocity + this.thrustEased * 55);
    this.post.render(dt, t);
  }
}
