import * as THREE from 'three';
import type { LightState } from './timeline';

/**
 * Soft billboard clouds in one instanced draw call, in four layers:
 *   0 mist     · low ground mist around the castle (static)
 *   1 deck     · the cloud sea below the flight, streaming toward the camera
 *   2 stream   · wisps at flight height on both sides, passing close for parallax
 *   3 horizon  · huge, far, static banks that sit on the horizon
 */

const Z_NEAR = 14;
const Z_FAR = -170;

function cloudTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  // a cumulus-like silhouette: flat-ish bottom, billowy top
  for (let i = 0; i < 46; i++) {
    const t = Math.random();
    const x = s * (0.18 + t * 0.64);
    const top = Math.sin(t * Math.PI);
    const y = s * (0.62 - top * 0.22 * Math.random());
    const r = s * (0.08 + Math.random() * 0.12) * (0.6 + top * 0.6);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
  // soften the base
  ctx.globalCompositeOperation = 'destination-out';
  const fade = ctx.createLinearGradient(0, s * 0.62, 0, s);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export class Clouds {
  mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  constructor(isMobile: boolean) {
    // no ground mist: it hugged the camera at the castle as a white veil and cost a lot of overdraw
    const counts = isMobile ? [0, 110, 20, 34] : [0, 220, 40, 64];
    const count = counts.reduce((a, b) => a + b, 0);
    const geo = new THREE.PlaneGeometry(1, 1);
    const rand = new Float32Array(count);
    const kind = new Float32Array(count);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uMap: { value: cloudTexture() },
        uColor: { value: new THREE.Color() },
        uLight: { value: new THREE.Color() },
        uSun: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3() },
        uFogColor: { value: new THREE.Color() },
        uFogDensity: { value: 0.03 },
        uTime: { value: 0 },
        uCamY: { value: 0 },
        uFlow: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute float aRand; attribute float aKind;
        uniform float uTime, uFlow;
        varying vec2 vUv; varying float vDepth; varying float vRand; varying float vKind; varying vec3 vWorld;
        void main() {
          vUv = uv; vRand = aRand; vKind = aKind;
          vec3 inst = vec3(instanceMatrix[3]);
          float s = length(instanceMatrix[0].xyz);
          if (aKind < 0.5) {
            inst.x += sin(uTime * 0.05 + aRand * 40.0) * 0.06 * s;
          } else if (aKind < 2.5) {
            float speed = aKind > 1.5 ? 1.6 : 1.0; // side wisps pass faster
            inst.z = mod(inst.z + uFlow * speed - (${Z_FAR.toFixed(1)}), ${(Z_NEAR - Z_FAR).toFixed(1)}) + (${Z_FAR.toFixed(1)});
            inst.x += sin(uTime * 0.07 + aRand * 30.0) * 0.4;
          }
          vWorld = inst;
          vec4 mv = viewMatrix * vec4(inst, 1.0);
          float a = (aRand - 0.5) * 0.35;
          vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy;
          mv.xy += q * s * vec2(1.9, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform vec3 uColor, uLight, uSun, uFogColor, uSunDir; uniform float uFogDensity, uCamY;
        varying vec2 vUv; varying float vDepth; varying float vRand; varying float vKind; varying vec3 vWorld;
        void main() {
          float a = texture2D(uMap, vUv).a;
          // lit from above, warm rim toward the sun
          float top = smoothstep(0.2, 0.85, vUv.y);
          vec3 col = mix(uColor, uLight, top * 0.85 + 0.1);
          float rim = smoothstep(0.35, 0.0, a) * smoothstep(0.0, 0.08, a);
          col += uSun * rim * 0.35 * max(uSunDir.y + 0.6, 0.0);
          // depth cues: fade when very near, fade at the stream's wrap edges, aerial perspective
          a *= smoothstep(0.4, 3.0, vDepth);
          if (vKind > 0.5 && vKind < 2.5) a *= smoothstep(${Z_FAR.toFixed(1)}, ${(Z_FAR + 30).toFixed(1)}, vWorld.z) * (1.0 - smoothstep(${(Z_NEAR - 8).toFixed(1)}, ${Z_NEAR.toFixed(1)}, vWorld.z));
          if (vWorld.y > 3.0) a *= mix(0.35, 1.0, smoothstep(4.0, 6.8, uCamY));
          float f = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
          col = mix(col, uFogColor, f * 0.9);
          float k = vKind < 0.5 ? 0.3 : vKind < 1.5 ? 1.35 : vKind < 2.5 ? 0.9 : 1.1;
          gl_FragColor = vec4(col, min(1.0, a * (0.75 + 0.25 * vRand) * k));
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    let i = 0;
    // shuffled slots, so lowering mesh.count (quality) thins every layer evenly
    const slots = Array.from({ length: count }, (_, j) => j).sort(() => Math.random() - 0.5);
    const put = (k: number, x: number, y: number, z: number, s: number) => {
      const j = slots[i++];
      p.set(x, y, z);
      sc.setScalar(s);
      m.compose(p, q, sc);
      this.mesh.setMatrixAt(j, m);
      rand[j] = Math.random();
      kind[j] = k;
    };
    const R = Math.random;
    for (let k = 0; k < counts[0]; k++) {
      const a = R() * Math.PI * 2, r = 1.2 + R() * 9;
      put(0, Math.cos(a) * r, -0.75 + R() * 0.45, Math.sin(a) * r, 1.6 + R() * 2.6);
    }
    for (let k = 0; k < counts[1]; k++) {
      // denser near the flight line, thinner far out
      const x = (R() - 0.5) * (R() < 0.6 ? 40 : 130);
      put(1, x, 3.6 + R() * 2.2, Z_FAR + R() * (Z_NEAR - Z_FAR), 4.5 + R() * 8);
    }
    for (let k = 0; k < counts[2]; k++) {
      const side = R() < 0.5 ? -1 : 1;
      put(2, side * (4.5 + R() * 18), 7.4 + R() * 3.6, Z_FAR + R() * (Z_NEAR - Z_FAR), 1.6 + R() * 3.4);
    }
    for (let k = 0; k < counts[3]; k++) {
      put(3, (R() - 0.5) * 360, 4.5 + R() * 3.5, -190 - R() * 90, 24 + R() * 30);
    }
    geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 1));
    geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1));
    this.mesh.renderOrder = 2;
    this.total = count;
  }

  private total = 0;

  /** Fraction of cloud instances drawn (adaptive quality). */
  setQuality(frac: number) {
    this.mesh.count = Math.max(1, Math.floor(this.total * frac));
  }

  update(s: LightState, time: number, camY: number, flow: number) {
    const u = this.mesh.material.uniforms;
    u.uColor.value.copy(s.cloud);
    u.uLight.value.copy(s.cloudLight);
    u.uSun.value.copy(s.sun);
    u.uSunDir.value.copy(s.sunDir);
    u.uFogColor.value.copy(s.fog);
    u.uFogDensity.value = s.fogDensity * 0.55;
    u.uTime.value = time;
    u.uCamY.value = camY;
    u.uFlow.value = flow;
  }
}
