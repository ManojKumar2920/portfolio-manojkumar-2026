import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Finale: chase camera behind the aeroplane. The plane rises into frame from the bottom edge and flies
 * up until it sits big on the bottom edge of the screen (about 80% in view, the belly cut off by the frame),
 * flying toward the sunrise with a small flock alongside.
 * Clouds stream past (see Clouds). Scrolling on past the end adds "thrust": the plane surges and shakes,
 * speed streaks rush by, and the flock falls behind; it settles back as soon as the scrolling stops.
 */

const smooth = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export class Flight {
  group = new THREE.Group();
  private plane = new THREE.Group();
  private birds: THREE.InstancedMesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private birdOffsets: THREE.Vector3[] = [];
  private birdPos: THREE.Vector3[] = [];
  private birdsReady = false;
  private bank = 0;
  private pitch = 0;
  private prevY = 0;
  private dummy = new THREE.Object3D();
  private target = new THREE.Vector3();
  private lines: THREE.InstancedMesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private lineData: { a: number; r: number; z: number; speed: number }[] = [];
  private lineTravel = 0;
  private planeH = 0.5; // world height of the plane (rear view), for anchoring it on the screen's bottom edge
  private ray = new THREE.Vector3();

  constructor(gltf: GLTF, isMobile: boolean) {
    const model = gltf.scene;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.envMapIntensity = 0;
        mat.fog = false;
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    model.position.sub(box.getCenter(new THREE.Vector3()));
    // The model's nose points along +Z. Turn it to face −Z: flying away from the camera.
    model.rotation.y = Math.PI;
    const holder = new THREE.Group();
    holder.add(model);
    holder.scale.setScalar(1.1);
    this.planeH = box.getSize(new THREE.Vector3()).y * 1.1;
    this.plane.add(holder);

    // Flying into the sun: dark underside, warm light on the top surfaces and tail.
    const target = new THREE.Object3D();
    this.plane.add(target);
    const hemi = new THREE.HemisphereLight('#e2b9a8', '#2a2430', 1.1);
    const sun = new THREE.DirectionalLight('#ffc48e', 3.6);
    sun.position.set(0, 2.5, -4);
    sun.target = target;
    const rim = new THREE.DirectionalLight('#ffd8b8', 1.6);
    rim.position.set(1.5, 1, 2);
    rim.target = target;
    this.plane.add(hemi, sun, rim);
    this.group.add(this.plane);

    // Birds: a two-triangle "V" whose wings flap in the vertex shader.
    const count = isMobile ? 16 : 28;
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, -0.06, -0.5, 0.06, 0.08, 0, 0, 0.06, 0, 0, -0.06, 0, 0, 0.06, 0.5, 0.06, 0.08], 3),
    );
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(count).map(() => Math.random() * 10), 1));
    this.birds = new THREE.InstancedMesh(
      g,
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#1a1a20') }, uOpacity: { value: 1 } },
        vertexShader: /* glsl */ `
          attribute float aPhase; uniform float uTime;
          void main() {
            vec3 p = position;
            p.y += sin(uTime * 10.0 + aPhase) * abs(p.x) * 0.8;
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uOpacity; void main() { gl_FragColor = vec4(uColor, uOpacity); }`,
      }),
      count,
    );
    this.birds.frustumCulled = false;
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? 1 : -1;
      this.birdOffsets.push(new THREE.Vector3(side * (0.5 + Math.random() * 1.8), 0.1 + Math.random() * 0.8, -0.5 - Math.random() * 3));
      this.birdPos.push(new THREE.Vector3());
    }
    this.group.add(this.birds);

    // Speed streaks: thin quads parallel to the flight path, arranged round the camera axis, facing it.
    const nLines = isMobile ? 50 : 110;
    const lg = new THREE.PlaneGeometry(1, 1);
    lg.rotateX(-Math.PI / 2); // width on x, length on z, facing +y
    this.lines = new THREE.InstancedMesh(
      lg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
        uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#ffe6cf') } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uOpacity; uniform vec3 uColor; varying vec2 vUv;
          void main() {
            float a = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x); // soft across
            a *= smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.8, vUv.y);    // tapered along
            gl_FragColor = vec4(uColor * a * uOpacity, a * uOpacity);
          }`,
      }),
      nLines,
    );
    this.lines.frustumCulled = false;
    for (let i = 0; i < nLines; i++) {
      this.lineData.push({ a: Math.random() * Math.PI * 2, r: 0.9 + Math.random() * 3.2, z: Math.random(), speed: 0.7 + Math.random() * 0.6 });
    }
    this.group.add(this.lines);
    this.group.visible = false;
  }

  /** local: progress through the sky scene (0–1). pointer: −1..1. thrust: 0–1, from scrolling past the end. */
  update(active: boolean, local: number, time: number, dt: number, pointer: THREE.Vector2, camera: THREE.Camera, thrust = 0) {
    const show = active ? smooth(0.04, 0.16, local) : 0;
    this.group.visible = show > 0.001;
    if (!this.group.visible) {
      this.birdsReady = false;
      return;
    }

    const rise = smooth(0.03, 0.35, local); // up from below the frame
    const cam = camera.position;
    const shake = thrust * thrust;
    // Distance ahead: close and big; pushed back on narrow (portrait) screens so the wings still read.
    const aspect = (camera as THREE.PerspectiveCamera).aspect || 1.6;
    const dist = 2.25 * Math.max(1, 1.15 / aspect) + thrust * 1.6; // surges ahead under thrust
    // Where the bottom edge of the screen is at that distance (works for any fov / aspect / camera pitch).
    this.ray.set(0, -1, 0.5).unproject(camera).sub(cam).normalize();
    const edgeY = cam.y + this.ray.y * (dist / Math.max(1e-3, -this.ray.z));
    // Resting: wings at ~75% of the screen height, engines and gear in full view, only the lower belly cut off.
    const fov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov || 38);
    const frameH = 2 * dist * Math.tan(fov / 2);
    const restY = edgeY + this.planeH * 0.3 + frameH * 0.2;
    const x = cam.x + pointer.x * 0.25 + Math.sin(time * 0.45) * 0.06 + Math.sin(time * 47) * 0.02 * shake;
    const y =
      THREE.MathUtils.lerp(edgeY - this.planeH * 1.2, restY, rise) + Math.sin(time * 0.8) * 0.015 + pointer.y * 0.03 +
      Math.sin(time * 61 + 1.3) * 0.016 * shake;
    const z = cam.z - dist;
    this.plane.position.set(x, y, z);

    const climb = (y - this.prevY) / Math.max(dt, 1e-3);
    this.prevY = y;
    this.bank = THREE.MathUtils.damp(this.bank, -pointer.x * 0.45 + Math.sin(time * 0.45) * 0.08, 2.5, dt);
    this.pitch = THREE.MathUtils.damp(this.pitch, THREE.MathUtils.clamp(climb * 0.15, -0.05, 0.22), 3, dt);
    this.plane.rotation.set(this.pitch, -pointer.x * 0.12, this.bank, 'YXZ');

    // Birds keep station around the plane with lag, starting from below the frame.
    if (!this.birdsReady) {
      this.birdPos.forEach((b, i) => b.set(x + this.birdOffsets[i].x * 1.5, y - 2.5, z + 2));
      this.birdsReady = true;
    }
    for (let i = 0; i < this.birdPos.length; i++) {
      const o = this.birdOffsets[i];
      this.target.set(x + o.x + Math.sin(time * 0.5 + i) * 0.3, y + o.y + Math.sin(time * 0.9 + i * 1.7) * 0.15, z + o.z + thrust * 4.5);
      const bp = this.birdPos[i];
      const lag = 0.9 + (i % 5) * 0.25;
      bp.x = THREE.MathUtils.damp(bp.x, this.target.x, lag, dt);
      bp.y = THREE.MathUtils.damp(bp.y, this.target.y, lag, dt);
      bp.z = THREE.MathUtils.damp(bp.z, this.target.z, lag, dt);
      this.dummy.position.copy(bp);
      this.dummy.rotation.set(0.15, Math.sin(time * 0.7 + i) * 0.25, Math.sin(time * 1.6 + i) * 0.2);
      this.dummy.scale.setScalar(0.12 + (i % 4) * 0.02);
      this.dummy.updateMatrix();
      this.birds.setMatrixAt(i, this.dummy.matrix);
    }
    this.birds.instanceMatrix.needsUpdate = true;
    this.birds.material.uniforms.uTime.value = time;
    this.birds.material.uniforms.uOpacity.value = show;

    // speed streaks
    const lo = show * smooth(0.02, 0.35, thrust);
    this.lines.visible = lo > 0.002;
    if (this.lines.visible) {
      this.lineTravel += dt * (6 + thrust * 90);
      const len = 1.2 + thrust * 7;
      for (let i = 0; i < this.lineData.length; i++) {
        const d = this.lineData[i];
        const span = 34;
        const zz = cam.z + 3 - ((d.z * span + this.lineTravel * d.speed) % span); // from far ahead to just behind the camera
        this.dummy.position.set(cam.x + Math.cos(d.a) * d.r, cam.y + Math.sin(d.a) * d.r * 0.65, zz);
        this.dummy.rotation.set(0, 0, d.a - Math.PI / 2);
        this.dummy.scale.set(0.012 + d.r * 0.004, 1, len * d.speed);
        this.dummy.updateMatrix();
        this.lines.setMatrixAt(i, this.dummy.matrix);
      }
      this.lines.instanceMatrix.needsUpdate = true;
      this.lines.material.uniforms.uOpacity.value = lo * 0.55;
    }
  }
}
