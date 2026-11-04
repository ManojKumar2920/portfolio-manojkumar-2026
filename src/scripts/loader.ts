import { gsap } from 'gsap';

/**
 * The boot loader. Progress is eased toward the latest reported value (asset progress arrives in bursts) and
 * drives the name's fill, the bar, the percentage and the status line. The name sits where the hero's name
 * will be, so the exit fades the backdrop and the chrome away behind it and hands over to the scene.
 */
const html = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const el = document.querySelector<HTMLElement>('[data-loader]');
const q = <T extends HTMLElement>(s: string) => el?.querySelector<T>(s) ?? null;
const pctEl = q('[data-loader-pct]');
const statusEl = q('[data-loader-status]');
const markEl = q('[data-loader-mark]');
const rows = el ? Array.from(el.querySelectorAll<HTMLElement>('.loader-row, .loader-meta, .loader-bar')) : [];

const STAGES: [number, string][] = [
  [0.3, 'Surveying the hills'],
  [0.65, 'Raising the keep'],
  [0.97, 'Fueling the plane'],
  [Infinity, 'Clear for take-off'],
];

const state = { p: 0 };
let target = 0;
let ease: gsap.core.Tween | null = null;
let hiding: Promise<void> | null = null;

function render() {
  if (!el) return;
  const p = state.p;
  el.style.setProperty('--p', p.toFixed(4));
  if (pctEl) pctEl.textContent = String(Math.round(p * 100));
  if (statusEl) {
    const label = STAGES.find(([max]) => p < max)![1];
    if (statusEl.textContent !== label) statusEl.textContent = label;
  }
}

function easeTo(p: number, duration: number) {
  ease?.kill();
  ease = gsap.to(state, { p, duration: reduced ? 0.01 : duration, ease: 'power2.out', onUpdate: render });
  return ease;
}

/** Report raw load progress, 0..1. Never goes backwards. */
export function loaderProgress(f: number) {
  if (f <= target) return;
  target = Math.min(1, f);
  easeTo(target, 0.7);
}

/** Put the loader back up (first visit to home after starting on another page). */
export function showLoader() {
  if (!el) return;
  hiding = null;
  ease?.kill();
  gsap.killTweensOf([el, markEl, ...rows]);
  gsap.set([el, markEl, ...rows], { clearProps: 'backgroundColor,opacity,transform' });
  state.p = target = 0;
  render();
  html.classList.remove('loaded');
}

/** Finish the fill, wait for fonts, then lift the curtain. Safe to call repeatedly. */
export function hideLoader(): Promise<void> {
  if (!el || html.classList.contains('loaded')) return Promise.resolve();
  if (hiding) return hiding;
  hiding = (async () => {
    target = 1;
    await Promise.all([easeTo(1, 0.45).then(), document.fonts?.ready]);
    if (reduced) {
      html.classList.add('loaded');
      return;
    }
    // chrome out, then the backdrop fades behind the (already full) name while the scene's own name fades in
    const tl = gsap.timeline();
    tl.to(rows, { opacity: 0, y: -6, duration: 0.4, ease: 'power2.out' }, 0)
      .to(el, { backgroundColor: 'rgba(12, 14, 17, 0)', duration: 1.2, ease: 'power2.inOut' }, 0.25)
      .to(markEl, { opacity: 0, duration: 0.9, ease: 'power1.inOut' }, 0.75);
    await tl.then();
    html.classList.add('loaded');
  })();
  return hiding;
}
