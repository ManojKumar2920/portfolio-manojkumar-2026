/**
 * The home page's soundscape, made in Web Audio (no audio files to load or license):
 *   outside  · wind over the hill and the odd bird
 *   the hall · the hearth (a low roar and crackles), and the room's hush
 *   the sky  · a soft high pad under the stars; a chime when a star is found
 *   flight   · the rush of air and the engines, winding up with the push toward About
 *
 * Browsers only let sound start from a click, tap or key, so it begins on the first one (unless the visitor turned it
 * off before, or prefers reduced motion), and the toggle in the nav switches it on and off; the choice is remembered.
 */

export interface SoundStage {
  scene: 'exterior' | 'interior' | 'sky';
  /** 0–1 within the scene */
  local: number;
  /** under the sky of favourites */
  sky: boolean;
  /** 0–1: speed felt in the flight */
  thrust: number;
}

const KEY = 'mk.sound';
/** seconds per chord */
const BAR = 6.4;
/** D major, slow and open: Dmaj9 · Bm11 · Gmaj9 · A(add9)sus, as MIDI notes (pad from the first three, bells from all) */
const CHORDS = [
  [62, 66, 69, 73, 76],
  [59, 62, 66, 69, 76],
  [55, 59, 62, 66, 69],
  [57, 62, 64, 69, 71],
];
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];

class Soundscape {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private bus: Record<'wind' | 'birds' | 'fire' | 'pad' | 'air' | 'engine' | 'music', GainNode> = {} as never;
  private engineOsc: OscillatorNode[] = [];
  private engineLp!: BiquadFilterNode;
  private airLp!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private musicIn!: GainNode;
  private musicLp!: BiquadFilterNode;
  private bar = 0;
  private nextBar = 0;
  private brown!: AudioBuffer;
  private timers: number[] = [];
  on = false;
  /** where the home page is, read each frame; null off home (silence) */
  follow: (() => SoundStage) | null = null;
  private get stage() {
    return this.follow?.() ?? null;
  }
  private listeners = new Set<(on: boolean) => void>();

  /** the visitor's saved choice: true, false, or null when they have not chosen */
  get saved() {
    try {
      const v = localStorage.getItem(KEY);
      return v === null ? null : v === 'on';
    } catch {
      return null;
    }
  }

  onChange(fn: (on: boolean) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async set(on: boolean, remember = true) {
    if (remember) {
      try {
        localStorage.setItem(KEY, on ? 'on' : 'off');
      } catch {
        /* private mode: only for this visit */
      }
    }
    this.on = on;
    if (on) {
      this.build();
      await this.ctx!.resume().catch(() => undefined);
      this.master.gain.setTargetAtTime(0.7, this.ctx!.currentTime, 0.4);
      this.schedule();
    } else if (this.ctx) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
      this.timers.forEach(clearTimeout);
      this.timers = [];
      setTimeout(() => !this.on && this.ctx?.suspend(), 600);
    }
    this.listeners.forEach((f) => f(on));
  }

  private build() {
    if (this.ctx) return;
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // two seconds of white noise and of brown (deep, rumbling) noise, looped by every layer that needs one
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.noise.getChannelData(0), b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * w[i]) / 1.02;
      b[i] = last * 3.5;
    }

    for (const k of ['wind', 'birds', 'fire', 'pad', 'air', 'engine', 'music'] as const) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.master);
      this.bus[k] = g;
    }
    const loop = (buf: AudioBuffer) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.loopStart = Math.random();
      s.start(0, Math.random() * 2);
      return s;
    };
    const filter = (type: BiquadFilterType, f: number, q = 0.7) => {
      const n = ctx.createBiquadFilter();
      n.type = type;
      n.frequency.value = f;
      n.Q.value = q;
      return n;
    };
    const lfo = (target: AudioParam, rate: number, depth: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = rate;
      g.gain.value = depth;
      o.connect(g).connect(target);
      o.start();
    };

    // wind: brown noise through a wandering band-pass, in slow gusts
    const windBp = filter('bandpass', 380, 0.6);
    const windG = ctx.createGain();
    windG.gain.value = 0.6;
    loop(this.brown).connect(windBp).connect(windG).connect(this.bus.wind);

    // the music's room: a long, soft hall made from decaying noise (no impulse file to load)
    const ir = ctx.createBuffer(2, ctx.sampleRate * 3.5, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.6);
    }
    const verb = ctx.createConvolver();
    verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.musicIn = ctx.createGain();
    this.musicIn.connect(this.bus.music);
    this.musicIn.connect(verb).connect(wet).connect(this.bus.music);
    this.musicLp = filter('lowpass', 2400);
    this.musicLp.connect(this.musicIn);
    lfo(windBp.frequency, 0.07, 160);
    lfo(windG.gain, 0.11, 0.35);

    // the hearth: a low roar (crackles are scheduled, see schedule)
    const roar = filter('lowpass', 260);
    loop(this.brown).connect(roar).connect(this.bus.fire);

    // the stars: three soft sines, a slow shimmer
    const padG = ctx.createGain();
    padG.gain.value = 0.05;
    padG.connect(this.bus.pad);
    for (const f of [220, 329.63, 493.88, 659.25]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      o.connect(g).connect(padG);
      lfo(g.gain, 0.05 + Math.random() * 0.08, 0.2);
      o.start();
    }

    // flight: rushing air, and the engines' hum
    this.airLp = filter('lowpass', 700);
    loop(this.noise).connect(this.airLp).connect(this.bus.air);
    this.engineLp = filter('lowpass', 180, 1.2);
    this.engineLp.connect(this.bus.engine);
    for (const f of [58, 58.7, 116.4]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = f > 100 ? 0.15 : 0.3;
      o.connect(g).connect(this.engineLp);
      o.start();
      this.engineOsc.push(o);
    }
  }

  /** the random events: a bird now and then outside, the fire's crackles */
  private schedule() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    const birds = () => {
      if (!this.on) return;
      if (this.stage?.scene === 'exterior') this.chirp();
      this.timers.push(window.setTimeout(birds, 2200 + Math.random() * 5200));
    };
    const crackle = () => {
      if (!this.on) return;
      if (this.stage?.scene === 'interior') this.crack();
      this.timers.push(window.setTimeout(crackle, 40 + Math.random() * 260));
    };
    birds();
    crackle();
    // the music: a bar every ~6.4 s, scheduled a little ahead so timers can be late without a gap
    this.nextBar = Math.max(this.nextBar, this.ctx!.currentTime + 0.2);
    const music = () => {
      if (!this.on) return;
      while (this.nextBar < this.ctx!.currentTime + 1.5) {
        this.playBar(this.bar++, this.nextBar);
        this.nextBar += BAR;
      }
      this.timers.push(window.setTimeout(music, 400));
    };
    music();
  }

  /**
   * One bar of the music: a warm chord held under it, and a few soft, bell-like notes picked from the chord, higher in
   * the sky. Slow (about 6 s a chord) and quiet: it sits under the place, not over it.
   */
  private playBar(n: number, t0: number) {
    const ctx = this.ctx!;
    const chord = CHORDS[n % CHORDS.length];
    const st = this.stage;
    const up = st?.scene === 'sky' || st?.sky ? 12 : 0; // an octave brighter under the stars and in the flight
    const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    // the pad: the chord's lower notes, two slightly detuned triangles each, swelling in and out over the bar
    for (const m of chord.slice(0, 3)) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = hz(m - 12);
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.022, t0 + BAR * 0.35);
        g.gain.linearRampToValueAtTime(0, t0 + BAR * 1.15);
        o.connect(g).connect(this.musicLp);
        o.start(t0);
        o.stop(t0 + BAR * 1.2);
      }
    }
    // the bells: three to five notes from the chord, loosely in time, never the same twice
    const k = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < k; i++) {
      const at = t0 + (i / k) * BAR * 0.9 + Math.random() * 0.25;
      const m = chord[Math.floor(Math.random() * chord.length)] + up;
      const vel = 0.03 + Math.random() * 0.025;
      for (const [mul, amp, dec] of [[1, 1, 2.6], [2, 0.25, 1.2], [3, 0.08, 0.6]] as const) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = hz(m) * mul;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(vel * amp, at + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dec);
        o.connect(g).connect(this.musicIn);
        o.start(at);
        o.stop(at + dec + 0.05);
      }
    }
  }

  private chirp() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 3);
    const base = 2600 + Math.random() * 1600;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const t0 = t + i * (0.09 + Math.random() * 0.05);
      o.frequency.setValueAtTime(base, t0);
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), t0 + 0.06);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.05, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
      o.connect(g).connect(this.bus.birds);
      o.start(t0);
      o.stop(t0 + 0.1);
    }
  }

  private crack() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 1500 + Math.random() * 3500;
    hp.Q.value = 1.5;
    const g = ctx.createGain();
    const v = Math.random() ** 3 * 0.9;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.01 + Math.random() * 0.03);
    s.connect(hp).connect(g).connect(this.bus.fire);
    s.start(t, Math.random() * 1.9);
    s.stop(t + 0.05);
  }

  /** a star found under the pointer: one note of a pentatonic chime, picked by the star */
  chime(i: number) {
    if (!this.on || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const f = PENTA[Math.abs(i) % PENTA.length];
    for (const [mul, amp] of [[1, 0.09], [2.01, 0.03], [3.02, 0.012]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8 / mul);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 2);
    }
  }

  /** per frame: the mix follows where the reader is */
  update() {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    const st = this.stage;
    const level = (k: keyof Soundscape['bus'], v: number, tc = 0.35) => this.bus[k].gain.setTargetAtTime(v, t, tc);
    if (!st) {
      for (const k of Object.keys(this.bus) as (keyof Soundscape['bus'])[]) level(k, 0, 0.3);
      return;
    }
    const ext = st.scene === 'exterior', hall = st.scene === 'interior', sky = st.scene === 'sky';
    // the hearth is at the far end of the hall: louder the deeper in, softer looking up at the sky
    const deep = hall ? 0.35 + st.local * 0.55 : 0;
    // leaving the hall through the roof, the hall's sounds drop away as the wind comes up
    const roof = hall ? Math.max(0, (st.local - 0.955) / 0.045) : 0;
    // the music runs under everything, a touch softer in the hall where the fire speaks, fuller in the open sky
    level('music', ext ? 0.85 : hall ? 0.7 : 0.95, 1.2);
    level('wind', ext ? 0.2 : hall ? 0.04 + roof * 0.3 : 0);
    level('birds', ext ? 1 : 0);
    level('fire', hall ? deep * (st.sky ? 0.45 : 1) * (1 - roof) * 0.9 : 0);
    level('pad', st.sky ? 0.9 : 0, 0.8);
    level('air', sky ? 0.1 + st.thrust * 0.32 : 0, 0.2);
    level('engine', sky ? 0.12 + st.thrust * 0.22 : 0, 0.2);
    if (sky) {
      this.airLp.frequency.setTargetAtTime(700 + st.thrust * 2600, t, 0.2);
      this.engineLp.frequency.setTargetAtTime(180 + st.thrust * 520, t, 0.2);
      this.engineOsc.forEach((o, i) => o.frequency.setTargetAtTime([58, 58.7, 116.4][i] * (1 + st.thrust * 0.7), t, 0.25));
    }
  }

  /** the tab is hidden: silence it (and the CPU) until it is back */
  pause(hidden: boolean) {
    if (!this.ctx || !this.on) return;
    if (hidden) this.ctx.suspend();
    else this.ctx.resume();
  }
}

export const sound = new Soundscape();

/** Once per site visit: the nav toggle, the first-gesture start, and pausing in background tabs. */
let wired = false;
export function wireSound() {
  if (wired) return;
  wired = true;
  const btn = document.querySelector<HTMLButtonElement>('[data-sound]');
  const paint = (on: boolean) => {
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Sound on. Turn sound off' : 'Sound off. Turn sound on');
    btn.classList.toggle('is-on', on);
  };
  sound.onChange(paint);
  paint(false);
  btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    sound.set(!sound.on);
  });
  // the first click, tap or key on the site starts it, unless the visitor said no before or prefers reduced motion
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (sound.saved !== false && !reduced) {
    const first = (e: Event) => {
      if (btn && e.target instanceof Node && btn.contains(e.target)) return cleanup(); // the toggle decides for itself
      cleanup();
      if (!sound.on) sound.set(true, false);
    };
    const cleanup = () => ['pointerdown', 'keydown'].forEach((t) => removeEventListener(t, first, true));
    ['pointerdown', 'keydown'].forEach((t) => addEventListener(t, first, true));
  }
  document.addEventListener('visibilitychange', () => sound.pause(document.hidden));
  const frame = () => {
    requestAnimationFrame(frame);
    sound.update();
  };
  requestAnimationFrame(frame);
}
