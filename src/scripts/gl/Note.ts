import * as THREE from 'three';
import { NOTE, groundAt } from './landscape';
import { WIND_DIR } from './Petals';
import { site } from '../../site';

/**
 * An old sheet of paper lying on the path: the portrait, name, tagline and role, printed on weathered parchment
 * with torn edges, stains and fold creases. The camera stops over it on the first scroll (timeline.ts); scrolling
 * on, a gust snatches it: it jolts up, tumbles and flutters away over the ruin. The flight is scrubbed by scroll,
 * so scrolling back lays it down again.
 */

/** Scroll progress over which the gust carries the note away (between the close-up and the statement). */
export const NOTE_FLIGHT: [number, number] = [0.084, 0.132];

const W = 0.34, H = 0.44;

const smooth = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export class Note {
  group = new THREE.Group();
  material: THREE.MeshStandardMaterial;
  private sheet: THREE.Mesh;
  private rest = new THREE.Quaternion();
  private base = new THREE.Vector3();
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpC = new THREE.Vector3();
  private progress = 0;
  private time = 0;
  private u = { uTime: { value: 0 }, uFly: { value: 0 }, uStir: { value: 0 }, uW: { value: W }, uH: { value: H } };

  constructor(isMobile: boolean, env: THREE.Texture | null) {
    const { x, z, y } = NOTE;
    // lie on the slope: up = ground normal, the top of the page pointing up the path (away from the camera)
    const e = 0.05;
    const n = new THREE.Vector3(groundAt(x - e, z) - groundAt(x + e, z), 2 * e, groundAt(x, z - e) - groundAt(x, z + e)).normalize();
    // page frame: +z = ground normal, +y (the top of the print) up the path, away from the camera
    const up = new THREE.Vector3(0, 0, -1).projectOnPlane(n).normalize();
    const right = new THREE.Vector3().crossVectors(up, n);
    this.rest.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
    this.rest.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.12)); // dropped, not placed
    this.base.set(x, y + 0.012, z);

    const geo = new THREE.PlaneGeometry(W, H, 20, 26);
    this.material = new THREE.MeshStandardMaterial({
      map: this.texture(),
      alphaTest: 0.5,
      color: '#c9bfae', // old paper in the sun, not a lit screen
      roughness: 0.95,
      side: THREE.DoubleSide,
      envMap: env,
    });
    const u = this.u;
    this.material.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      // bend: corners curl up at rest, stir before the gust, and the whole sheet flaps in flight
      const bend = /* glsl */ `
        float nx = position.x / (uW * 0.5), ny = position.y / (uH * 0.5);
        float curl = 0.012 * pow(abs(nx), 3.0) + 0.008 * pow(max(ny, 0.0), 3.0) + 0.006 * pow(abs(nx * ny), 2.0);
        float stir = uStir * 0.018 * max(ny, 0.0) * (0.6 + 0.4 * sin(uTime * 9.0 + nx * 3.0));
        float flap = uFly * (0.05 * sin(uTime * 11.0 + ny * 3.2 + nx * 1.4) * (0.4 + 0.6 * abs(ny)) + 0.06 * nx * nx);
        float dz = curl * (1.0 - uFly) + stir + flap;`;
      sh.vertexShader =
        'uniform float uTime, uFly, uStir, uW, uH;\n' +
        sh.vertexShader
          .replace('#include <begin_vertex>', `vec3 transformed = vec3(position); { ${bend} transformed.z += dz; }`)
          .replace(
            '#include <beginnormal_vertex>',
            `vec3 objectNormal = vec3(normal); {
              float h = 0.01; vec3 p0 = position;
              ${bend.replace(/position/g, 'p0')} float z0 = dz;
              p0 = position + vec3(h, 0.0, 0.0); ${bend.replace(/position/g, 'p0').replace(/float /g, '')} float zx = dz;
              p0 = position + vec3(0.0, h, 0.0); ${bend.replace(/position/g, 'p0').replace(/float /g, '')} float zy = dz;
              objectNormal = normalize(vec3(-(zx - z0) / h, -(zy - z0) / h, 1.0));
            }`,
          );
      // the back of the sheet is plain paper, not the print seen through
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.70, 0.60, 0.44) * (0.9 + 0.1 * diffuseColor.r);`,
      );
    };
    this.sheet = new THREE.Mesh(geo, this.material);
    this.sheet.castShadow = !isMobile;
    this.sheet.receiveShadow = !isMobile;
    this.group.add(this.sheet);
    this.place(0);
  }

  setProgress(p: number) {
    this.progress = p;
  }

  /** Pose for flight progress f (0 on the path, 1 gone over the ruin). */
  private place(f: number) {
    const s = this.sheet;
    // sudden: a cubic path whose parameter races early (snatched up), then sails up over the ruin;
    // it stays ahead of the camera as it tilts from the path up to the tower
    const t = 1 - Math.pow(1 - f, 1.6);
    const b = this.base;
    const c1 = this.tmpA.set(b.x + 0.05, b.y + 0.4, b.z - 0.1);
    const c2 = this.tmpB.set(b.x + 0.45, b.y + 0.75, b.z - 1.7);
    const end = this.tmpC.set(0.7, 2.6, -1.6); // past the tower, into the sky
    const it = 1 - t;
    s.position
      .copy(b).multiplyScalar(it * it * it)
      .addScaledVector(c1, 3 * it * it * t)
      .addScaledVector(c2, 3 * it * t * t)
      .addScaledVector(end, t * t * t);
    // flutter across the wind on the way up
    s.position.x += Math.sin(f * 17) * 0.06 * f * WIND_DIR.y;
    s.position.z -= Math.sin(f * 17) * 0.06 * f * WIND_DIR.x;
    s.quaternion.copy(this.rest);
    if (f > 0) {
      // tumble: a few turns about a wandering axis, faster as the gust takes hold
      const ax = new THREE.Vector3(Math.sin(f * 5.0), 0.6, Math.cos(f * 3.0)).normalize();
      s.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(ax, f * 7.5 + Math.sin(f * 14) * 0.3));
    }
    s.visible = f < 0.995;
    this.material.opacity = 1 - smooth(0.82, 1, f);
    this.material.transparent = f > 0.82;
  }

  update(dt: number, gust: number) {
    this.time += dt;
    const f = smooth(NOTE_FLIGHT[0], NOTE_FLIGHT[1], this.progress);
    // the breeze worries at the free edge more and more just before the gust
    const anticipation = smooth(NOTE_FLIGHT[0] - 0.03, NOTE_FLIGHT[0], this.progress);
    this.u.uTime.value = this.time;
    this.u.uFly.value = f;
    this.u.uStir.value = f > 0 ? 0 : 0.25 * gust + anticipation;
    this.place(f);
  }

  /** Weathered parchment print. Drawn once fonts and photo are ready; the sheet shows plain paper until then. */
  private texture() {
    const Wpx = 1024, Hpx = Math.round(1024 * (H / W));
    const c = document.createElement('canvas');
    c.width = Wpx;
    c.height = Hpx;
    const g = c.getContext('2d')!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    // torn outline (alpha): an irregular edge a little inside the canvas
    const torn = () => {
      g.beginPath();
      const pts: [number, number][] = [];
      const m = 18;
      const edge = (x0: number, y0: number, x1: number, y1: number, n: number) => {
        for (let i = 0; i < n; i++) {
          const t = i / n;
          const j = rnd(-1, 1) * 7 + (Math.random() < 0.06 ? rnd(4, 16) : 0); // ragged, with the odd bite
          const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny);
          pts.push([x0 + (x1 - x0) * t + (nx / l) * j, y0 + (y1 - y0) * t + (ny / l) * j]);
        }
      };
      edge(m, m, Wpx - m, m, 60);
      edge(Wpx - m, m, Wpx - m, Hpx - m, 80);
      edge(Wpx - m, Hpx - m, m, Hpx - m, 60);
      edge(m, Hpx - m, m, m, 80);
      pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.closePath();
    };

    const paper = () => {
      g.clearRect(0, 0, Wpx, Hpx);
      g.save();
      torn();
      g.clip();
      g.fillStyle = '#d8c398';
      g.fillRect(0, 0, Wpx, Hpx);
      // fibres and grain
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(120,90,50,0.06)' : 'rgba(255,245,220,0.07)';
        g.fillRect(rnd(0, Wpx), rnd(0, Hpx), rnd(1, 3), rnd(1, 2));
      }
      // stains
      for (let i = 0; i < 7; i++) {
        const sx = rnd(0, Wpx), sy = rnd(0, Hpx), r = rnd(60, 220);
        const s = g.createRadialGradient(sx, sy, r * 0.6, sx, sy, r);
        s.addColorStop(0, 'rgba(140,100,50,0.05)');
        s.addColorStop(0.92, 'rgba(110,75,35,0.16)');
        s.addColorStop(1, 'rgba(110,75,35,0)');
        g.fillStyle = s;
        g.fillRect(0, 0, Wpx, Hpx);
      }
      g.restore();
    };
    paper();
    tex.needsUpdate = true;

    const img = new Image();
    img.src = '/images/note-portrait.jpg';
    Promise.all([
      img.decode(),
      document.fonts?.load('300 90px "Season Mix"'),
      document.fonts?.load('italic 400 60px "Season Mix"'),
      document.fonts?.load('400 26px "Season Sans"'),
    ])
      .catch(() => undefined)
      .then(() => {
        g.save();
        torn();
        g.clip();
        const P = 96;
        const ink = '#2a2118';
        // masthead
        g.fillStyle = ink;
        g.font = '400 28px "Season Sans", "Helvetica Neue", Arial, sans-serif';
        g.globalAlpha = 0.75;
        g.fillText(`No. 01 · ${site.location.split(',')[0]}`, P, P + 10);
        g.textAlign = 'right';
        g.fillText(String(new Date().getFullYear()), Wpx - P, P + 10);
        g.textAlign = 'left';
        g.globalAlpha = 1;
        g.fillRect(P, P + 30, Wpx - P * 2, 2);

        // photo: a faded print pressed into the paper
        const ph = Wpx - P * 2;
        const top = P + 56;
        if (img.complete && img.naturalWidth) {
          g.filter = 'sepia(0.55) contrast(1.06) brightness(0.98) saturate(0.8)';
          g.drawImage(img, P, top, ph, ph);
          g.filter = 'none';
          g.globalCompositeOperation = 'multiply';
          g.fillStyle = 'rgba(216,195,152,0.45)';
          g.fillRect(P, top, ph, ph);
          g.globalCompositeOperation = 'source-over';
          g.strokeStyle = 'rgba(42,33,24,0.6)';
          g.lineWidth = 3;
          g.strokeRect(P, top, ph, ph);
        }

        // name, fitted to the column
        let y = top + ph + 40;
        let size = 120;
        g.font = `300 ${size}px "Season Mix", Georgia, serif`;
        (g as unknown as { letterSpacing: string }).letterSpacing = '0px';
        size *= Math.min(1, ph / g.measureText(site.name).width);
        g.font = `300 ${size}px "Season Mix", Georgia, serif`;
        g.fillStyle = ink;
        y += size * 0.78;
        g.fillText(site.name, P - 3, y);
        // tagline
        g.font = 'italic 400 52px "Season Mix", Georgia, serif';
        g.fillStyle = '#7a2e18';
        y += 74;
        g.fillText(site.tagline, P, y);
        // role
        const role = `${site.role} · ${site.focus}`;
        let rs = 30;
        g.font = `400 ${rs}px "Season Sans", "Helvetica Neue", Arial, sans-serif`;
        rs = Math.floor(rs * Math.min(1, ph / g.measureText(role).width)); // fit the column
        g.font = `400 ${rs}px "Season Sans", "Helvetica Neue", Arial, sans-serif`;
        g.fillStyle = ink;
        g.globalAlpha = 0.8;
        y += 56;
        g.fillText(role, P, y);
        g.globalAlpha = 1;

        // fold creases: a dark valley with a light ridge beside it
        for (const [x0, y0, x1, y1] of [[0, Hpx * 0.5, Wpx, Hpx * 0.49], [Wpx * 0.5, 0, Wpx * 0.51, Hpx]]) {
          g.lineWidth = 3;
          g.strokeStyle = 'rgba(90,65,35,0.22)';
          g.beginPath();
          g.moveTo(x0, y0);
          g.lineTo(x1, y1);
          g.stroke();
          g.strokeStyle = 'rgba(255,248,230,0.25)';
          g.beginPath();
          g.moveTo(x0 + 3, y0 + 3);
          g.lineTo(x1 + 3, y1 + 3);
          g.stroke();
        }
        // age: browned, darker edges
        const v = g.createRadialGradient(Wpx / 2, Hpx / 2, Hpx * 0.25, Wpx / 2, Hpx / 2, Hpx * 0.72);
        v.addColorStop(0, 'rgba(90,60,25,0)');
        v.addColorStop(1, 'rgba(90,60,25,0.35)');
        g.fillStyle = v;
        g.fillRect(0, 0, Wpx, Hpx);
        g.restore();
        tex.needsUpdate = true;
      });
    return tex;
  }
}
