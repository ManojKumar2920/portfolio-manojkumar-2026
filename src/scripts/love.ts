import { site } from '../site';

/**
 * "Love this project": one heart per visitor per project (backend: ../portfolio-server, /api/loves). Shared by the
 * home page's hall (social.ts, the pill follows the exhibit in view) and every case study page (mountLovePage).
 * The counts load once per visit and are kept here, so a heart given in the hall shows on the case study and back.
 */

const API = site.social.api;
const state = { counts: {} as Record<string, number>, mine: new Set<string>(), ready: false, busy: false };
let loading: Promise<boolean> | null = null;

/** Load the counts (once; again only after a failure). Resolves true when they are in. */
export function loadLoves() {
  loading ??= fetch(API + '/api/loves')
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((d: { counts: Record<string, number>; mine: string[] }) => {
      state.counts = d.counts;
      state.mine = new Set(d.mine);
      return (state.ready = true);
    })
    .catch(() => ((loading = null), false));
  return loading;
}

export interface LoveEls {
  btn: HTMLButtonElement;
  text: HTMLElement;
  burst: HTMLElement;
}

const fmt = (n: number) => n.toLocaleString('en');

/** Paint the pill for a project: filled heart and "You love this", or the count. */
export function paintLove({ btn, text }: LoveEls, slug: string) {
  const n = state.counts[slug] ?? 0;
  const loved = state.mine.has(slug);
  btn.classList.toggle('is-loved', loved);
  btn.setAttribute('aria-pressed', String(loved));
  btn.disabled = state.busy;
  text.textContent = loved
    ? n > 1 ? `You and ${fmt(n - 1)} other${n > 2 ? 's' : ''} love this` : 'You love this'
    : n ? `Love this project · ${fmt(n)}` : 'Love this project';
}

function burst(el: HTMLElement) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.innerHTML = '';
  for (let k = 0; k < 9; k++) {
    const h = document.createElement('i');
    h.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 90)}px`);
    h.style.setProperty('--dy', `${-50 - Math.round(Math.random() * 70)}px`);
    h.style.setProperty('--r', `${Math.round((Math.random() - 0.5) * 50)}deg`);
    h.style.setProperty('--d', `${k * 35}ms`);
    h.style.setProperty('--s', String(0.5 + Math.random() * 0.6));
    el.appendChild(h);
  }
}

/** A click on the pill: the heart fills at once (optimistic), the server confirms; a second click only bursts again. */
export async function giveLove(els: LoveEls, slug: string | undefined, repaint: () => void) {
  if (!slug || !state.ready || state.busy) return;
  burst(els.burst);
  if (state.mine.has(slug)) return; // already loved: still a little joy, no second vote
  state.busy = true;
  state.mine.add(slug);
  state.counts[slug] = (state.counts[slug] ?? 0) + 1;
  repaint();
  try {
    const r = await fetch(`${API}/api/loves/${slug}`, { method: 'POST' });
    if (!r.ok) throw new Error();
    state.counts[slug] = ((await r.json()) as { count: number }).count;
  } catch {
    state.mine.delete(slug);
    state.counts[slug] = Math.max(0, (state.counts[slug] ?? 1) - 1);
  }
  state.busy = false;
  repaint();
}

export const lovesReady = () => state.ready;

/** A case study page: the pill beside its actions, for that project. */
export function mountLovePage(container: HTMLElement) {
  const btn = container.querySelector<HTMLButtonElement>('[data-love-page]');
  if (!btn?.dataset.slug) return () => {};
  const slug = btn.dataset.slug;
  const els: LoveEls = { btn, text: btn.querySelector('[data-love-text]')!, burst: btn.querySelector('[data-love-burst]')! };
  let alive = true;
  const paint = () => alive && paintLove(els, slug);
  loadLoves().then((ok) => {
    if (!ok || !alive) return;
    paint();
    btn.hidden = false;
  });
  const onClick = () => giveLove(els, slug, paint);
  btn.addEventListener('click', onClick);
  return () => {
    alive = false;
    btn.removeEventListener('click', onClick);
  };
}
