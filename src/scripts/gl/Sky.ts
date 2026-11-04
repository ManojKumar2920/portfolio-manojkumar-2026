import * as THREE from 'three';
import type { LightState } from './timeline';

/** Gradient sky dome with a soft sun/moon glow, plus a star field. Both follow the camera. */
export class Sky {
  group = new THREE.Group();
  private dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private stars: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uBottom: { value: new THREE.Color() },
        uSun: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 0, -1) },
        uSunStrength: { value: 1 },
        uClouds: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uBottom, uSun, uSunDir;
        uniform float uSunStrength, uClouds, uTime;
        varying vec3 vDir;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), u.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), u.x), u.y); }
        float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
        void main() {
          float h = vDir.y;
          float t = smoothstep(-0.04, 0.32, h);
          vec3 col = mix(uBottom, uTop, pow(t, 0.7));
          float d = max(dot(vDir, uSunDir), 0.0);
          col += uSun * (pow(d, 6.0) * 0.35 + pow(d, 64.0) * 0.6 + pow(d, 900.0) * 2.4) * uSunStrength;
          // soft painted cloud layer (cheap: one fbm per sky pixel, no billboards)
          if (uClouds > 0.001 && h > 0.0) {
            vec2 uv = vDir.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.006, uTime * 0.002);
            float c = fbm(uv);
            float cov = smoothstep(0.62 - uClouds * 0.28, 0.9, c) * smoothstep(0.0, 0.12, h);
            float lit = smoothstep(0.35, 0.95, fbm(uv + uSunDir.xz * 0.35));
            vec3 cc = mix(uBottom * 0.92, mix(uBottom, vec3(1.0), 0.55), lit) + uSun * pow(max(dot(vDir, uSunDir), 0.0), 8.0) * 0.25;
            col = mix(col, cc, cov * 0.85 * (1.0 - smoothstep(0.55, 0.95, h)));
          }
          col = mix(col, uBottom * 0.55, smoothstep(0.0, -0.4, h)); // below horizon
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    const n = 1600;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const y = Math.abs(u) * 0.95 + 0.03;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(th) * r * 350, y * 350, Math.sin(th) * r * 350], i * 3);
      size[i] = Math.random() ** 3 * 2.4 + 0.6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.stars = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 }, uDpr: { value: 1 } },
        vertexShader: /* glsl */ `
          attribute float aSize; uniform float uTime, uDpr; varying float vTw;
          void main() {
            vTw = 0.6 + 0.4 * sin(uTime * 1.3 + position.x * 0.13 + position.z * 0.07);
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p.xyww;
            gl_PointSize = aSize * uDpr;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uOpacity; varying float vTw;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d) * uOpacity * vTw;
            gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a, a);
          }`,
      }),
    );
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    this.group.add(this.stars);
  }

  /** 0–1: painted cloud cover in the dome (used where the billboard clouds are off). */
  clouds = 0;

  update(s: LightState, camera: THREE.Camera, time: number, dpr: number) {
    this.group.position.copy(camera.position);
    const u = this.dome.material.uniforms;
    u.uTop.value.copy(s.skyTop);
    u.uBottom.value.copy(s.skyBottom);
    u.uSun.value.copy(s.sun);
    u.uSunDir.value.copy(s.sunDir);
    u.uSunStrength.value = s.sunStrength;
    u.uClouds.value = this.clouds;
    u.uTime.value = time;
    const su = this.stars.material.uniforms;
    su.uOpacity.value = s.stars;
    su.uTime.value = time;
    su.uDpr.value = dpr;
    this.stars.visible = s.stars > 0.01;
  }
}
