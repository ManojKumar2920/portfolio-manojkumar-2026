import barba from '@barba/core';
import { gsap } from 'gsap';
import Lenis from 'lenis';
import type { World } from './gl/World';
import type { HomeData } from './gl/HomeUI';
import { openBooking, warmBooking } from './booking';
import { availabilityText } from '../lib/availability';
import { hideLoader, loaderProgress, showLoader } from './loader';
import { mountSocial } from './social';
import { mountLovePage } from './love';
import { sound, wireSound } from './sound';

const html = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- smooth scroll, one RAF for everything ---------- */
const lenis = new Lenis({ lerp: reduced ? 1 : 0.085, wheelMultiplier: 0.9, touchMultiplier: 1.4 });
let world: World | null = null;

gsap.ticker.lagSmoothing(0);
gsap.ticker.add((time, deltaMs) => {
  lenis.raf(time * 1000);
  if (world) {
    const max = Math.max(1, lenis.limit);
    world.setScroll(Math.min(1, Math.max(0, lenis.scroll / max)), lenis.velocity);
    world.tick(Math.min(deltaMs / 1000, 1 / 20));
  }
});

/* ---------- top bar ---------- */
// live local time (the site's location is IST)
const clock = document.querySelector<HTMLElement>('[data-clock]');
const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const tickClock = () => clock && (clock.textContent = fmt.format(new Date()));
tickClock();
setInterval(tickClock, 15_000);

function syncNav(path: string) {
  document.querySelectorAll<HTMLAnchorElement>('.nav .links a:not([data-book])').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const p = path.replace(/\/$/, '') || '/';
    const here = href === p || (href !== '/' && p.startsWith(`${href}/`));
    if (here) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

/* ---------- per-page setup ---------- */
function homeData(container: Element): HomeData | null {
  const el = container.querySelector('#home-data');
  return el ? (JSON.parse(el.textContent || '{}') as HomeData) : null;
}

/* ---------- per-page widgets: mounted on enter, torn down on leave ---------- */
let unmount: (() => void)[] = [];
/** The footer sign-off: fitted to the full width, lit in orange round the cursor (or drifting light on touch screens). */
function mountGlow(mark: HTMLElement) {
  const base = mark.querySelector<HTMLElement>('[data-fit-text]');
  const footer = mark.closest<HTMLElement>('[data-footer]') ?? mark;
  const fit = () => {
    if (!base) return;
    mark.style.setProperty('--fs', '100px');
    const w = base.getBoundingClientRect().width;
    if (w) mark.style.setProperty('--fs', `${(100 * mark.clientWidth) / w}px`);
  };
  fit();
  document.fonts?.ready.then(fit);
  const ro = new ResizeObserver(fit);
  ro.observe(mark);

  const set = (x: number, y: number, on: number) => {
    mark.style.setProperty('--mx', `${x}px`);
    mark.style.setProperty('--my', `${y}px`);
    mark.style.setProperty('--on', String(on));
  };
  if (reduced) {
    set(mark.clientWidth * 0.3, mark.clientHeight * 0.5, 0.75);
    return () => ro.disconnect();
  }
  // the light trails the pointer a little, so it glides instead of snapping
  const target = { x: mark.clientWidth * 0.5, y: mark.clientHeight * 0.5 };
  const pos = { ...target };
  let on = 0, raf = 0, visible = false, last = 0, pointer = false;
  const touch = matchMedia('(hover: none)').matches;
  const tick = (t: number) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;
    if (touch || !pointer) {
      // no mouse over the footer: on touch screens the light drifts across the words by itself
      if (touch) {
        const w = mark.clientWidth, h = mark.clientHeight, k = t / 1000;
        target.x = w * (0.5 + 0.42 * Math.sin(k * 0.45));
        target.y = h * (0.5 + 0.35 * Math.sin(k * 0.9 + 1));
      }
    }
    const e = 1 - Math.exp(-dt * 9);
    pos.x += (target.x - pos.x) * e;
    pos.y += (target.y - pos.y) * e;
    on += ((touch ? 0.9 : pointer ? 1 : 0) - on) * (1 - Math.exp(-dt * 5));
    set(pos.x, pos.y, on);
  };
  const io = new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(tick);
    if (!visible) (cancelAnimationFrame(raf), (raf = 0), (last = 0));
  });
  io.observe(footer);
  const move = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const r = mark.getBoundingClientRect();
    target.x = e.clientX - r.left;
    target.y = e.clientY - r.top;
    pointer = true;
  };
  const leave = () => (pointer = false);
  footer.addEventListener('pointermove', move);
  footer.addEventListener('pointerleave', leave);
  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    footer.removeEventListener('pointermove', move);
    footer.removeEventListener('pointerleave', leave);
  };
}

async function mountWidgets(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>('[data-glow]').forEach((m) => unmount.push(mountGlow(m)));
  // case studies: the same heart as in the hall
  unmount.push(mountLovePage(container));
  // freelance availability follows today's date (the page itself is static)
  const avail = availabilityText();
  container.querySelectorAll<HTMLElement>('[data-availability]').forEach((el) => (el.textContent = avail));
  // entrances: [data-reveal] parts rise in as they come into view, staggered within their section
  const reveals = container.querySelectorAll<HTMLElement>('[data-reveal]');
  if (reveals.length) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target as HTMLElement;
        const sibs = [...(el.parentElement?.children ?? [])].filter((c) => c.hasAttribute('data-reveal'));
        el.style.setProperty('--d', `${Math.max(0, sibs.indexOf(el)) * 80}ms`);
        el.classList.add('in');
        io.unobserve(el);
      }),
      { rootMargin: '0px 0px -8% 0px' },
    );
    reveals.forEach((el) => io.observe(el));
    unmount.push(() => io.disconnect());
  }
  // wide calendars on narrow screens open on their latest weeks
  container.querySelectorAll<HTMLElement>('[data-scroll-end]').forEach((el) => el.scrollWidth > el.clientWidth + 24 && (el.scrollLeft = el.scrollWidth));
  // reels play only while on screen
  const reels = container.querySelectorAll<HTMLVideoElement>('video[data-inview-play]');
  if (reels.length) {
    const vo = new IntersectionObserver((entries) => entries.forEach((e) => {
      const v = e.target as HTMLVideoElement;
      if (e.isIntersecting && !reduced) {
        if (v.preload === 'none') v.preload = 'auto';
        v.play().catch(() => undefined);
      } else v.pause();
    }), { threshold: 0.4 });
    reels.forEach((v) => vo.observe(v));
    unmount.push(() => vo.disconnect());
  }
  // profile: "Hire me" / "Start a project" switch, mirrored in the URL hash so either side can be linked
  const profile = container.querySelector<HTMLElement>('[data-profile]');
  if (profile) {
    const set = (mode: string, push = false) => {
      if (mode !== 'hire' && mode !== 'project') return;
      profile.dataset.mode = mode;
      profile.querySelectorAll<HTMLButtonElement>('[data-mode-btn]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.modeBtn === mode)));
      profile.querySelectorAll<HTMLElement>('[data-mode-panel]').forEach((p) => (p.hidden = p.dataset.modePanel !== mode));
      if (push) history.replaceState(history.state, '', `#${mode}`);
    };
    const onClick = (e: Event) => {
      const b = (e.target as Element).closest<HTMLButtonElement>('[data-mode-btn]');
      if (!b) return;
      set(b.dataset.modeBtn!, true);
      lenis.resize();
      // the newly shown side's parts are already "in" view: show them (and let its reels play)
      profile.querySelectorAll<HTMLElement>(`[data-mode-panel="${b.dataset.modeBtn}"] [data-scroll-end]`).forEach((el) => el.scrollWidth > el.clientWidth + 24 && (el.scrollLeft = el.scrollWidth));
      profile.querySelectorAll<HTMLElement>(`[data-mode-panel="${b.dataset.modeBtn}"] [data-reveal]`).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < innerHeight) el.classList.add('in');
      });
    };
    profile.addEventListener('click', onClick);
    set(location.hash.slice(1) || 'project'); // freelance is the default side
    unmount.push(() => profile.removeEventListener('click', onClick));
  }
  // the work gallery's liquid-glass carousel
  const row = container.querySelector<HTMLElement>('[data-flex-carousel]');
  if (row) {
    const { flexCarousel } = await import('./flexCarousel');
    const mobile = matchMedia('(max-width: 760px)').matches;
    unmount.push(
      flexCarousel(row, {
        items: JSON.parse(row.dataset.items || '[]'),
        speed: mobile ? 80 : 120,
        // as big as the screen allows: the row (cards + glass reach) fits under the title without scrolling
        itemWidth: Math.max(240, Math.min(mobile ? 340 : 720, (innerHeight - 330) / (0.6 * 1.4))),
        ratio: 0.6,
        maxFraction: mobile ? 0.8 : 0.55,
        gap: mobile ? 16 : 32,
        edge: mobile ? 0.14 : 0.2,
        reach: 0.4,
        radius: mobile ? 14 : 20,
        wheel: 'both', // the page fits one screen: any wheel or trackpad scroll moves the row
        wheelTarget: 'window',
        hint: 'Drag · Click for details →',
        onSelect: (it) => it.href && barba.go(it.href),
      }),
    );
  }
  // scroll on past the end of the page and it carries on to the next one (no footer)
  const cont = container.querySelector<HTMLElement>('[data-continue]');
  if (cont) {
    let fired = false, hold = 0;
    const onScroll = () => {
      const r = cont.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight - r.top) / r.height));
      cont.style.setProperty('--p', p.toFixed(3));
      const atEnd = lenis.limit > 0 && lenis.scroll >= lenis.limit - 2;
      clearTimeout(hold);
      if (atEnd && !fired) hold = window.setTimeout(() => {
        if (fired) return;
        fired = true;
        cont.classList.add('is-going');
        barba.go(cont.dataset.continue!);
      }, 380);
    };
    lenis.on('scroll', onScroll);
    onScroll();
    unmount.push(() => {
      clearTimeout(hold);
      lenis.off('scroll', onScroll);
    });
  }
}
function unmountWidgets() {
  unmount.forEach((f) => f());
  unmount = [];
}

async function enterPage(container: HTMLElement) {
  const ns = container.dataset.barbaNamespace || 'page';
  html.dataset.page = ns;
  mountWidgets(container);
  html.classList.toggle('is-home', ns === 'home');
  syncNav(location.pathname);
  if (ns === 'home') {
    // the 3D scene only exists for the home page; load it the first time home is entered
    const fresh = !world;
    if (fresh) showLoader();
    const w = await ensureWorld();
    if (!w) return void hideLoader();
    const data = homeData(container);
    // text layout (troika, worker-based) finishes the fill; capped so a slow device never strands the loader
    if (data)
      await Promise.race([w.buildHome(data), new Promise((r) => setTimeout(r, 4000))]).catch((err) => console.error('[gl] home build failed', err));
    w.setMode('home');
    // candles, the sky of favourites and the picker (skipped if the visitor already left home while it loaded)
    if (container.isConnected) unmount.push(mountSocial(container, w, lenis));
    // the soundscape follows the walk (sound.ts); off home it falls silent
    if (container.isConnected) {
      sound.follow = () => w.stage;
      unmount.push(() => (sound.follow = null));
    }
    // camera intro starts as the curtain begins to lift, so the reveal reads as one move
    if (fresh) gsap.fromTo(w, { intro: 0 }, { intro: 1, duration: reduced ? 0.01 : 2.4, ease: 'expo.out', delay: reduced ? 0 : 0.9 });
    hideLoader();
  } else {
    world?.setMode('page');
  }
}

/* ---------- the WebGL world: created lazily, on the first visit to home ---------- */
let worldLoading: Promise<World | null> | null = null;
function ensureWorld() {
  if (!worldLoading) {
    worldLoading = (async () => {
      if (!webglSupported()) {
        html.classList.add('no-webgl');
        return null;
      }
      try {
        const { World } = await import('./gl/World');
        const w = new World(document.getElementById('gl') as HTMLCanvasElement);
        w.onNavigate = navigate;
        await w.load((f) => loaderProgress(f * 0.92)); // last stretch is buildHome (text layout)
        world = w;
        return w;
      } catch (err) {
        console.error('[gl] failed, falling back to DOM', err);
        html.classList.add('no-webgl');
        return null;
      }
    })();
  }
  return worldLoading;
}

/* ---------- booking: every [data-book] link opens the Cal.com popup (the link itself is the no-JS fallback) ---------- */
addEventListener(
  'click',
  (e) => {
    const a = (e.target as Element).closest?.<HTMLElement>('[data-book]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation(); // keep Barba out of it
    openBooking(a.dataset.book || undefined); // data-book="…" carries a note into the booking (which plan, etc.)
  },
  true,
);
addEventListener('pointerover', (e) => (e.target as Element).closest?.('[data-book]') && warmBooking(), { passive: true });

/* ---------- canvas interaction (home) ---------- */
function navigate(href: string, external: boolean) {
  if (href === '#book') return openBooking();
  if (external) {
    if (href.startsWith('mailto:')) location.href = href;
    else window.open(href, '_blank', 'noopener');
    return;
  }
  barba.go(href);
}
addEventListener('pointermove', (e) => {
  if (!world || world.mode !== 'home') return;
  const overUi = (e.target as Element).closest('.nav a');
  html.classList.toggle('is-pointer', !overUi && world.hoverCheck(e.clientX, e.clientY));
});
addEventListener('click', (e) => {
  if (!world || world.mode !== 'home') return;
  if ((e.target as Element).closest('a, button')) return;
  world.hoverCheck(e.clientX, e.clientY); // taps have no pointermove before them: aim at where the click landed
  if (world.click()) e.preventDefault();
});

/* ---------- scrolling on past the end of home: thrust for the finale flight ---------- */
const atEnd = () => lenis.limit > 0 && lenis.scroll >= lenis.limit - 4;
const thrust = (amount: number) => {
  if (world && world.mode === 'home' && atEnd()) world.addThrust(amount);
};
addEventListener('wheel', (e) => e.deltaY > 0 && thrust(Math.min(e.deltaY, 150) / 700), { passive: true });
let touchY = 0;
addEventListener('touchstart', (e) => (touchY = e.touches[0].clientY), { passive: true });
addEventListener('touchmove', (e) => {
  const y = e.touches[0].clientY;
  if (touchY - y > 0) thrust((touchY - y) / 450);
  touchY = y;
}, { passive: true });
addEventListener('keydown', (e) => {
  if (['ArrowDown', 'PageDown', ' ', 'End'].includes(e.key)) thrust(0.3);
});

/* ---------- boot ---------- */
function webglSupported() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

let homeScroll = 0;

async function boot() {
  wireSound();
  const container = document.querySelector<HTMLElement>('[data-barba="container"]')!;
  await enterPage(container);
  hideLoader();

  /* ---------- page transitions ---------- */
  barba.init({
    preventRunning: true,
    prevent: ({ el }) => !!el?.closest('[data-no-barba]') || (el as HTMLAnchorElement)?.target === '_blank',
    transitions: [
      {
        name: 'fog',
        async leave({ current }) {
          // remember where we were in the hall, so "back" from a case study returns to the same print
          if (current.namespace === 'home') homeScroll = lenis.scroll;
          unmountWidgets();
          lenis.stop();
          const tl = gsap.timeline();
          tl.to(current.container, { opacity: 0, y: -24, duration: reduced ? 0.01 : 0.6, ease: 'expo.in' }, 0);
          if (world) tl.to(world.post, { wipe: 1, duration: reduced ? 0.01 : 0.9, ease: 'power2.inOut' }, 0);
          await tl.then();
        },
        async enter({ next }) {
          const title = next.container.dataset.title;
          if (title) document.title = title;
          lenis.scrollTo(0, { immediate: true, force: true });
          await enterPage(next.container);
          lenis.resize();
          if (next.namespace === 'home' && homeScroll > 0) lenis.scrollTo(homeScroll, { immediate: true, force: true });
          lenis.start();
          const tl = gsap.timeline();
          tl.from(next.container, { opacity: 0, y: 24, duration: reduced ? 0.01 : 0.9, ease: 'expo.out' }, 0.15);
          if (world) tl.to(world.post, { wipe: 0, duration: reduced ? 0.01 : 1.1, ease: 'power2.inOut' }, 0);
          await tl.then();
        },
      },
    ],
  });
}

boot();
