import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  ChromaticAberrationEffect,
  Effect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  VignetteEffect,
} from 'postprocessing';

/** Fog wipe for page transitions + a dim control for DOM pages. */
class FinishEffect extends Effect {
  constructor() {
    super(
      'FinishEffect',
      /* glsl */ `
      uniform float wipe;
      uniform float dim;
      uniform float uTime;
      uniform vec3 wipeColor;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y);
      }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb * (1.0 - dim);
        float v = n(uv * 3.0 + uTime * 0.15) * 0.45 + n(uv * 8.0 - uTime * 0.2) * 0.2 + (1.0 - uv.y) * 0.35;
        float m = smoothstep(v - 0.12, v + 0.12, wipe * 1.3 - 0.15);
        outputColor = vec4(mix(c, wipeColor, m), inputColor.a);
      }`,
      {
        blendFunction: BlendFunction.NORMAL,
        uniforms: new Map<string, THREE.Uniform>([
          ['wipe', new THREE.Uniform(0)],
          ['dim', new THREE.Uniform(0)],
          ['uTime', new THREE.Uniform(0)],
          ['wipeColor', new THREE.Uniform(new THREE.Color('#0c0e11'))],
        ]),
      },
    );
  }
}

export class Post {
  composer: EffectComposer;
  finish = new FinishEffect();
  private ca: ChromaticAberrationEffect;
  private bloom: BloomEffect;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, lite: boolean) {
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new BloomEffect({ luminanceThreshold: 0.78, luminanceSmoothing: 0.25, intensity: 0.85, mipmapBlur: true, radius: 0.7 });
    const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
    noise.blendMode.opacity.value = 0.22;
    const vignette = new VignetteEffect({ offset: 0.28, darkness: 0.72 });
    this.composer.addPass(new EffectPass(camera, this.bloom, this.finish, vignette, noise));
    this.ca = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0007, 0.0007), radialModulation: true, modulationOffset: 0.35 });
    if (!lite) this.composer.addPass(new EffectPass(camera, this.ca));
  }

  set wipe(v: number) { this.finish.uniforms.get('wipe')!.value = v; }
  get wipe() { return this.finish.uniforms.get('wipe')!.value as number; }
  set dim(v: number) { this.finish.uniforms.get('dim')!.value = v; }
  get dim() { return this.finish.uniforms.get('dim')!.value as number; }

  /** Brief extra fringing while scrolling fast. */
  setVelocity(v: number) {
    const o = 0.0007 + Math.min(Math.abs(v) * 0.00004, 0.0025);
    this.ca.offset.set(o, o);
  }

  setSize(w: number, h: number) { this.composer.setSize(w, h); }
  render(dt: number, time: number) {
    this.finish.uniforms.get('uTime')!.value = time;
    this.composer.render(dt);
  }
}
