import type Lenis from 'lenis';
import type { World } from './gl/World';
import type { FavStar } from './gl/Favourites';
import { site } from '../site';
import { sound } from './sound';
import { giveLove, loadLoves, lovesReady, paintLove } from './love';

/**
 * The shared layer over the home page's hall (backend: ../portfolio-server):
 *  - a heart for each exhibit: visitors show it some love (once each), with the running count
 *  - the sky of favourites at the end of the hall: every star is a visitor's favourite film or series (TMDB)
 *  - the picker that adds one: search, optional first name, country from the visitor's IP, Turnstile
 */

const API = site.social.api;
const regionName = (() => {
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    return (c: string) => dn.of(c) ?? c;
  } catch {
    return (c: string) => c;
  }
})();

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API + path, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

interface ScreenResult {
  id: string;
  type: 'movie' | 'tv';
  title: string;
  year: string | null;
  poster: string | null;
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}
let turnstileP: Promise<void> | null = null;
function loadTurnstile() {
  turnstileP ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      turnstileP = null;
      reject(new Error('The spam check could not load. Please try again.'));
    };
    document.head.appendChild(s);
  });
  return turnstileP;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const tmdbUrl = (ref: string) => {
  const [type, id] = ref.split(':');
  return `https://www.themoviedb.org/${type}/${id}`;
};

export function mountSocial(container: HTMLElement, world: World, lenis: Lenis) {
  const root = container.querySelector<HTMLElement>('[data-social]');
  const dialog = container.querySelector<HTMLDialogElement>('[data-fav-dialog]');
  if (!root || !dialog) return () => {};
  const $ = <T extends HTMLElement>(sel: string, from: ParentNode = container) => from.querySelector<T>(sel)!;

  const loveBtn = $<HTMLButtonElement>('[data-love]');
  const loveText = $('[data-love-text]');
  const loveBurst = $('[data-love-burst]');
  const skyCta = $('[data-sky-cta]');
  const tip = $('[data-fav-tip]');
  const slugs = site.hallWork as readonly string[];
  const ac = new AbortController();
  const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, type: K, fn: (e: HTMLElementEventMap[K]) => void) =>
    el.addEventListener(type, fn as EventListener, { signal: ac.signal });

  /* ---------- love: a heart for each exhibit, one per visitor (love.ts) ---------- */
  const loveEls = { btn: loveBtn, text: loveText, burst: loveBurst };
  loadLoves();
  let shownWork = -2;
  on(loveBtn, 'click', () => giveLove(loveEls, slugs[world.stage.work], () => (shownWork = -2)));

  /* ---------- the sky of favourites ---------- */
  const favs = world.hall?.favs;
  // the titles this visitor added, so their stars stay marked on later visits
  const MINE = 'mk.favs.mine';
  const mine = new Set<string>((() => {
    try {
      return JSON.parse(localStorage.getItem(MINE) || '[]') as string[];
    } catch {
      return [];
    }
  })());
  if (favs) favs.mine = mine;
  api<{ stars: FavStar[] }>('/api/picks?kind=screen')
    .then((d) => favs?.set(d.stars))
    .catch(() => {});

  // live: while the sky is up, look again every ~25 s (the server's edge cache is 60 s). A title someone else added in
  // the meantime flares in, or its star brightens, with a line saying who and from where.
  const live = $('[data-sky-live]');
  const queue: FavStar[] = [];
  let lastPoll = performance.now(), polling = false, liveUntil = 0;
  const poll = async () => {
    if (!favs || polling || document.hidden) return;
    polling = true;
    lastPoll = performance.now();
    try {
      const d = await api<{ stars: FavStar[] }>('/api/picks?kind=screen');
      const had = new Map(favs.picks.map((p) => [p.ref, p.count]));
      for (const s of d.stars) {
        const before = had.get(s.ref);
        if (before === undefined || s.count > before) queue.push(s);
      }
      if (queue.length > 6) queue.splice(0, queue.length - 6); // a busy minute: the latest few, not a flood
    } catch {
      /* quiet: the sky just stays as it is */
    }
    polling = false;
  };
  const showLive = (now: number) => {
    const s = queue.shift();
    if (!s || !favs) return;
    favs.add(s, false);
    sound.chime(favs.indexOf(s.ref) + 3);
    const who = s.firstName ? `${esc(s.firstName)} from ${esc(regionName(s.country))}` : `Someone in ${esc(regionName(s.country))}`;
    live.innerHTML = `<span class="sky-live-star" aria-hidden="true"></span><span>${who} just added <strong>${esc(s.title)}</strong></span>`;
    live.hidden = false;
    live.classList.remove('is-out');
    liveUntil = now + 5200;
  };
  // touch screens have no hover: a tap on a star only opens its card (with a link to the title inside it), a tap on
  // empty sky closes it. Nothing leaves the page unless the link itself is tapped. With a mouse, hover shows the card
  // and a click opens the title.
  const coarse = matchMedia('(pointer: coarse)').matches;
  tip.classList.toggle('is-touch', coarse);
  world.onStar = (i) => {
    const p = favs?.picks[i];
    if (!p || coarse) return;
    window.open(tmdbUrl(p.ref), '_blank', 'noopener');
  };
  const hint = $('[data-sky-hint]');
  $('[data-sky-hint-text]').textContent = coarse ? 'Tap a golden star to see whose favourite it is' : 'Hover a golden star to see whose favourite it is';
  let hinted = false; // the hint goes once a star has been found

  // under the sky the scroll is braked, so the view holds while people look; normal again outside it
  const wheel0 = lenis.options.wheelMultiplier ?? 1, touch0 = lenis.options.touchMultiplier ?? 1;
  let braked = false;

  let tipFor = -1;
  const paintTip = (i: number) => {
    const p = favs!.picks[i];
    const latest = p.firstName ? `${esc(p.firstName)}, ${esc(regionName(p.country))}` : `someone in ${esc(regionName(p.country))}`;
    const who = mine.has(p.ref)
      ? p.count > 1 ? `Your pick, and ${p.count - 1} other${p.count > 2 ? 's' : ''}` : 'Your pick'
      : p.count > 1
        ? `Picked by ${p.count.toLocaleString('en')} visitors · latest ${latest}`
        : p.firstName ? `${esc(p.firstName)} · ${esc(regionName(p.country))}` : `A visitor from ${esc(regionName(p.country))}`;
    tip.innerHTML = `${p.poster ? `<img src="${esc(p.poster)}" alt="" width="46" height="69" />` : ''}
      <span class="fav-tip-text"><strong>${esc(p.title)}</strong>${p.year ? ` <span class="fav-tip-year">${esc(p.year)}</span>` : ''}<span class="fav-tip-who">${who}</span>${coarse ? `<a class="fav-tip-open" href="${tmdbUrl(p.ref)}" target="_blank" rel="noopener">See it on TMDB ↗</a>` : ''}</span>`;
  };

  /* ---------- per frame: follow the stage ---------- */
  let raf = 0;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const st = world.stage;
    const work = lovesReady() && st.work >= 0 && st.work < slugs.length && !dialog.open ? st.work : -1;
    if (work !== shownWork) {
      shownWork = work;
      loveBtn.hidden = work < 0;
      if (work >= 0) paintLove(loveEls, slugs[work]);
    }
    // the sky: the invitation, and the card of the star under the pointer
    skyCta.hidden = !st.sky || dialog.open;
    const now = performance.now();
    if (st.sky && now - lastPoll > 25_000) poll();
    if (!st.sky) live.hidden = true;
    else if (liveUntil && now > liveUntil) {
      liveUntil = 0;
      live.classList.add('is-out');
    } else if (!liveUntil && queue.length && now - lastPoll > 600) showLive(now);
    root.style.setProperty('--sky', String(st.skyIn));
    if (st.sky !== braked) {
      braked = st.sky;
      lenis.options.wheelMultiplier = braked ? wheel0 * 0.4 : wheel0;
      lenis.options.touchMultiplier = braked ? touch0 * 0.45 : touch0;
    }
    const hov = st.sky && favs ? favs.hovered : -1;
    if (hov >= 0 && !hinted) {
      hinted = true;
      hint.classList.add('is-done');
    }
    if (hov !== tipFor) {
      if (hov >= 0) sound.chime(hov);
      tipFor = hov;
      tip.hidden = hov < 0;
      if (hov >= 0) paintTip(hov);
    }
    if (hov >= 0) {
      const s = favs!.screen(hov, world.camera);
      // beside the star, kept inside the screen (the card is up to 300 px wide, stars reach the right edge)
      if (s) {
        const x = Math.min(s.x, innerWidth - tip.offsetWidth - 28), y = Math.min(s.y, innerHeight - tip.offsetHeight - 28);
        tip.style.transform = `translate(${Math.round(Math.max(0, x))}px, ${Math.round(Math.max(0, y))}px)`;
      }
    }
  };
  raf = requestAnimationFrame(frame);

  /* ---------- the picker ---------- */
  const steps = dialog.querySelectorAll<HTMLElement>('[data-fav-step]');
  const show = (name: string) => steps.forEach((s) => (s.hidden = s.dataset.favStep !== name));
  const q = $<HTMLInputElement>('[data-fav-q]', dialog);
  const status = $('[data-fav-status]', dialog);
  const results = $<HTMLUListElement>('[data-fav-results]', dialog);
  const chosenEl = $('[data-fav-chosen]', dialog);
  const nameIn = $<HTMLInputElement>('[data-fav-name]', dialog);
  const whereEl = $('[data-fav-where]', dialog);
  const tsEl = $('[data-fav-turnstile]', dialog);
  const errEl = $('[data-fav-error]', dialog);
  const submit = $<HTMLButtonElement>('[data-fav-submit]', dialog);
  const doneEl = $('[data-fav-done]', dialog);

  let country: string | null | undefined;
  let chosen: ScreenResult | null = null;
  let found: ScreenResult[] = [];
  let token = '';
  let widget: string | null = null;
  let searchAc: AbortController | null = null;
  let debounce = 0;

  const resetTurnstile = () => {
    token = '';
    if (widget && window.turnstile) window.turnstile.reset(widget);
  };

  const open = () => {
    show('search');
    errEl.textContent = '';
    dialog.showModal();
    lenis.stop();
    q.focus();
    if (country === undefined) api<{ country: string | null }>('/api/whoami').then((d) => (country = d.country)).catch(() => (country = null));
    loadTurnstile().catch(() => {});
  };
  container.querySelectorAll('[data-fav-open]').forEach((b) => on(b, 'click', open));
  on(dialog, 'close', () => {
    lenis.start();
    searchAc?.abort();
  });
  // click on the backdrop closes
  on(dialog, 'click', (e) => e.target === dialog && dialog.close());

  const search = async (term: string) => {
    searchAc?.abort();
    if (term.trim().length < 2) {
      results.innerHTML = '';
      status.textContent = '';
      return;
    }
    searchAc = new AbortController();
    status.textContent = 'Searching…';
    try {
      const d = await api<{ results: ScreenResult[] }>(`/api/search/screen?q=${encodeURIComponent(term.trim())}`, { signal: searchAc.signal });
      found = d.results;
      status.textContent = found.length ? '' : 'Nothing found. Try another title.';
      results.innerHTML = found
        .map(
          (r, i) => `<li><button type="button" class="fav-result" data-i="${i}">
            ${r.poster ? `<img src="${esc(r.poster)}" alt="" loading="lazy" width="92" height="138" />` : '<span class="fav-noposter" aria-hidden="true"></span>'}
            <span class="fav-result-title">${esc(r.title)}</span>
            <span class="fav-result-meta">${r.type === 'tv' ? 'Series' : 'Film'}${r.year ? ` · ${esc(r.year)}` : ''}</span>
          </button></li>`,
        )
        .join('');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      status.textContent = (err as Error).message;
    }
  };
  on(q, 'input', () => {
    clearTimeout(debounce);
    debounce = window.setTimeout(() => search(q.value), 280);
  });

  on(results, 'click', async (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('.fav-result');
    if (!b) return;
    chosen = found[Number(b.dataset.i)];
    chosenEl.innerHTML = `${chosen.poster ? `<img src="${esc(chosen.poster)}" alt="" width="92" height="138" />` : ''}
      <span><strong>${esc(chosen.title)}</strong><span class="fav-result-meta">${chosen.type === 'tv' ? 'Series' : 'Film'}${chosen.year ? ` · ${esc(chosen.year)}` : ''}</span></span>`;
    errEl.textContent = '';
    show('confirm');
    nameIn.focus();
    if (country === undefined) country = await api<{ country: string | null }>('/api/whoami').then((d) => d.country).catch(() => null);
    whereEl.textContent = country ? `Shown as from ${regionName(country)}, detected from your connection.` : '';
    if (!country) errEl.textContent = "We couldn't detect your country, so the star can't be added from this connection.";
    submit.disabled = !country;
    try {
      await loadTurnstile();
      if (!widget && window.turnstile) {
        widget = window.turnstile.render(tsEl, {
          sitekey: site.social.turnstileSiteKey,
          theme: 'dark',
          appearance: 'interaction-only',
          callback: (t: string) => (token = t),
          'expired-callback': () => (token = ''),
          'error-callback': () => (token = ''),
        });
      }
    } catch (err) {
      errEl.textContent = (err as Error).message;
    }
  });
  on($('[data-fav-back]', dialog), 'click', () => {
    show('search');
    q.focus();
  });

  on(submit, 'click', async () => {
    if (!chosen || !country) return;
    if (!token) {
      errEl.textContent = 'One moment: the spam check is still running.';
      return;
    }
    submit.disabled = true;
    errEl.textContent = '';
    try {
      const d = await api<{ star: FavStar }>('/api/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'screen', id: chosen.id, firstName: nameIn.value.trim() || undefined, turnstile: token }),
      });
      mine.add(d.star.ref);
      try {
        localStorage.setItem(MINE, JSON.stringify([...mine].slice(-50)));
      } catch {}
      favs?.add(d.star);
      doneEl.textContent =
        d.star.count > 1
          ? `${d.star.title} was already up there. Its star just got brighter: ${d.star.count.toLocaleString('en')} visitors have picked it.`
          : `${d.star.title} is now a star over the hall. Everyone who comes here will see it.`;
      show('done');
    } catch (err) {
      errEl.textContent = (err as Error).message;
    } finally {
      submit.disabled = false;
      resetTurnstile();
    }
  });
  on($('[data-fav-finish]', dialog), 'click', () => dialog.close());

  return () => {
    ac.abort();
    cancelAnimationFrame(raf);
    clearTimeout(debounce);
    searchAc?.abort();
    world.onStar = () => {};
    lenis.options.wheelMultiplier = wheel0;
    lenis.options.touchMultiplier = touch0;
    if (dialog.open) dialog.close();
    if (widget && window.turnstile) window.turnstile.remove(widget);
    loveBtn.hidden = true;
    skyCta.hidden = true;
    tip.hidden = true;
  };
}
