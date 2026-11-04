import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Hummingbirds working the cherry blossoms. Each bird runs a small state machine over the model's six clips:
 * hover-feed at a blossom on the canopy's outer shell, dart to the next one (often on the same tree), now and then
 * land on a perch (fence post or lantern top), preen, and take off again. At night they all roost.
 */

export interface Blossom {
  pos: THREE.Vector3;
  /** horizontal unit vector pointing out of the canopy */
  out: THREE.Vector3;
}

const CLIP = {
  hover: '01_Hover_Idle_Loop',
  fly: '02_Forward_Flight_Loop',
  perch: '03_Perched_Idle_Loop',
  takeoff: '04_Takeoff',
  land: '05_Landing',
  feed: '06_Flower_Feeding',
} as const;
type ClipKey = keyof typeof CLIP;

type State = 'fly' | 'feed' | 'land' | 'perch' | 'takeoff';

/** World size: a real hummingbird would be invisible at this scale, so they are drawn a few times life size. */
const SIZE = 0.075;
const SPEED = 1.1;

class Bird {
  root = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = {} as Record<ClipKey, THREE.AnimationAction>;
  private current: ClipKey | null = null;
  private state: State = 'fly';
  private timer = 0;
  private vel = new THREE.Vector3();
  private target = new THREE.Vector3();
  private face = 0; // yaw to hold while hovering / perched
  private yaw = 0;
  private blossom = -1;
  private perch = -1;
  private landFrom = new THREE.Vector3();
  private phase = Math.random() * 10;
  private tmp = new THREE.Vector3();

  constructor(
    gltf: GLTF,
    scale: number,
    private yawOffset: number,
    private blossoms: Blossom[],
    private perches: THREE.Vector3[],
    private occupied: Set<number>,
  ) {
    const model = cloneSkinned(gltf.scene);
    model.scale.setScalar(scale);
    model.rotation.y = yawOffset;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = false;
        m.frustumCulled = false; // skinned bounds are the bind pose
      }
    });
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const k of Object.keys(CLIP) as ClipKey[]) {
      const clip = gltf.animations.find((a) => a.name === CLIP[k]);
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      if (k === 'takeoff' || k === 'land') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions[k] = a;
    }
    this.goFeed(Math.floor(Math.random() * blossoms.length), true);
  }

  private play(k: ClipKey, fade = 0.25) {
    if (this.current === k) return;
    const next = this.actions[k];
    if (!next) return;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    next.time = k === 'takeoff' || k === 'land' ? 0 : Math.random() * next.getClip().duration;
    if (this.current) this.actions[this.current]?.fadeOut(fade);
    this.current = k;
  }

  private hoverPoint(i: number, out = this.tmp) {
    const b = this.blossoms[i];
    return out.copy(b.pos).addScaledVector(b.out, SIZE * 1.8); // bill's length out from the petals
  }

  private goFeed(i: number, snap = false) {
    this.blossom = i;
    this.hoverPoint(i, this.target);
    if (snap) {
      this.root.position.copy(this.target);
      this.state = 'feed';
      this.timer = 1 + Math.random() * 4;
      this.face = Math.atan2(-this.blossoms[i].out.x, -this.blossoms[i].out.z);
      this.yaw = this.face;
      this.play(Math.random() < 0.6 ? 'feed' : 'hover', 0);
    } else {
      this.state = 'fly';
      this.play('fly');
    }
  }

  private goPerch(): boolean {
    const free = this.perches.map((_, i) => i).filter((i) => !this.occupied.has(i));
    if (!free.length) return false;
    // nearest few, pick one
    free.sort((a, b) => this.perches[a].distanceToSquared(this.root.position) - this.perches[b].distanceToSquared(this.root.position));
    this.perch = free[Math.floor(Math.random() * Math.min(3, free.length))];
    this.occupied.add(this.perch);
    this.target.copy(this.perches[this.perch]).y += 0.35; // approach from above
    this.state = 'fly';
    this.play('fly');
    return true;
  }

  /** Next blossom: usually a near one on the same canopy, sometimes anywhere. */
  private nextBlossom() {
    const here = this.blossoms[this.blossom]?.pos ?? this.root.position;
    const near = this.blossoms.map((b, i) => [b.pos.distanceTo(here), i]).filter(([d]) => d > 0.05 && d < 0.8);
    if (near.length && Math.random() < 0.75) return near[Math.floor(Math.random() * near.length)][1];
    return Math.floor(Math.random() * this.blossoms.length);
  }

  update(dt: number, night: boolean) {
    this.mixer.update(dt);
    this.timer -= dt;
    const p = this.root.position;

    switch (this.state) {
      case 'fly': {
        const to = this.tmp.copy(this.target).sub(p);
        const dist = to.length();
        const speed = SPEED * THREE.MathUtils.clamp(dist / 0.35, 0.25, 1);
        to.normalize().multiplyScalar(speed);
        to.y += Math.sin(performance.now() * 0.004 + this.phase) * 0.12; // the darting weave
        this.vel.lerp(to, Math.min(1, dt * 5));
        p.addScaledVector(this.vel, dt);
        const v = this.vel;
        if (v.x * v.x + v.z * v.z > 0.01) this.face = Math.atan2(v.x, v.z);
        if (dist < 0.03) {
          this.vel.set(0, 0, 0);
          if (this.perch >= 0) {
            this.state = 'land';
            this.landFrom.copy(p);
            this.timer = this.actions.land?.getClip().duration ?? 2.5;
            this.play('land', 0.15);
          } else {
            this.state = 'feed';
            this.timer = 1.5 + Math.random() * 4;
            const out = this.blossoms[this.blossom].out;
            this.face = Math.atan2(-out.x, -out.z);
            this.play(Math.random() < 0.65 ? 'feed' : 'hover');
          }
        }
        break;
      }
      case 'feed': {
        // hold station with a little hover drift
        const t = performance.now() * 0.001 + this.phase;
        this.hoverPoint(this.blossom, this.tmp);
        p.lerp(this.tmp.set(this.tmp.x + Math.sin(t * 2.1) * 0.008, this.tmp.y + Math.sin(t * 3.3) * 0.006, this.tmp.z + Math.cos(t * 1.7) * 0.008), Math.min(1, dt * 6));
        if (night && this.goPerch()) break;
        if (this.timer <= 0) {
          if (Math.random() < 0.18 && this.goPerch()) break;
          this.goFeed(this.nextBlossom());
        }
        break;
      }
      case 'land': {
        const dur = this.actions.land?.getClip().duration ?? 2.5;
        const k = THREE.MathUtils.smootherstep(1 - this.timer / dur, 0, 1);
        p.lerpVectors(this.landFrom, this.perches[this.perch], k);
        if (this.timer <= 0) {
          this.state = 'perch';
          this.timer = 5 + Math.random() * 10;
          this.play('perch', 0.3);
        }
        break;
      }
      case 'perch': {
        if (this.timer <= 0 && !night) {
          this.state = 'takeoff';
          this.timer = this.actions.takeoff?.getClip().duration ?? 1.5;
          this.play('takeoff', 0.15);
        }
        break;
      }
      case 'takeoff': {
        p.y += dt * 0.22;
        if (this.timer <= 0) {
          this.occupied.delete(this.perch);
          this.perch = -1;
          this.goFeed(this.nextBlossom());
        }
        break;
      }
    }

    // turn toward the heading (hummingbirds pivot fast)
    let d = this.face - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 8);
    this.root.rotation.y = this.yaw;
  }
}

export class Birds {
  group = new THREE.Group();
  private birds: Bird[] = [];

  /**
   * @param yawOffset rotation that turns the model's beak to +Z
   * @param footOffset height of the model's origin above its feet, in model units
   */
  constructor(gltf: GLTF, count: number, blossoms: Blossom[], perches: THREE.Vector3[], yawOffset = 0, footOffset = 0) {
    if (!blossoms.length) return;
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const scale = SIZE / Math.max(size.x, size.z);
    const seats = perches.map((p) => p.clone().setY(p.y + footOffset * scale));
    const occupied = new Set<number>();
    for (let i = 0; i < count; i++) {
      const b = new Bird(gltf, scale, yawOffset, blossoms, seats, occupied);
      this.birds.push(b);
      this.group.add(b.root);
    }
  }

  update(dt: number, night: boolean) {
    for (const b of this.birds) b.update(dt, night);
  }
}
