/**
 * Flex Carousel: an infinite image row that flows through invisible liquid glass at its edges. Cards drift along in
 * a straight line, then grow taller and curl as they enter a lens at each end.
 *
 * Vanilla port of the creative-library "flex-carousel" resource (React, v2.0.0): same slicing, warp and momentum,
 * no framework. Additions for the work gallery: each card can carry a label (drawn onto the card) and a link,
 * opened by a click that isn't a drag; the pointer turns to a hand over a linked card.
 */

export interface FlexItem {
  src: string;
  alt?: string;
  href?: string;
  /** printed on the card */
  label?: string;
  sub?: string;
  /** background behind `contain`-fitted images (logos) */
  bg?: string;
  fit?: 'cover' | 'contain';
  /** a reel that plays in the card while it is on screen (`src` is its poster) */
  video?: string;
}

export interface FlexOptions {
  items: FlexItem[];
  speed?: number;
  itemWidth?: number;
  ratio?: number;
  gap?: number;
  edge?: number;
  reach?: number;
  squeeze?: number;
  radius?: number;
  pauseOnHover?: boolean;
  draggable?: boolean;
  wheel?: 'both' | 'horizontal' | 'off';
  onSelect?: (item: FlexItem) => void;
  /** where wheel gestures are caught: over the row only (default) or anywhere on the page */
  wheelTarget?: 'row' | 'window';
  /** largest card width as a fraction of the row (default 0.55) */
  maxFraction?: number;
  /** label that follows the pointer over a linked card */
  hint?: string;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const SLICE = 2; // px per vertical slice; the glass bends each slice by a different amount

export function flexCarousel(root: HTMLElement, opts: FlexOptions) {
  const o = {
    speed: 60, itemWidth: 230, ratio: 1.6, gap: 28, edge: 0.24, reach: 0.55, squeeze: 0.6, radius: 22,
    pauseOnHover: true, draggable: true, wheel: 'both' as const, ...opts,
  };
  const list = o.items;
  root.classList.add('fc');
  if (o.draggable) root.classList.add('fc--drag');
  const cv = document.createElement('canvas');
  cv.className = 'fc__canvas';
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', list.map((i) => i.alt).filter(Boolean).join(', ') || 'Image carousel');
  root.appendChild(cv);
  const hint = o.hint ? Object.assign(document.createElement('span'), { className: 'fc-hint', textContent: o.hint }) : null;
  if (hint) {
    // lives on <body>, positioned to the viewport, so the row's overflow can never clip it
    hint.setAttribute('aria-hidden', 'true');
    document.body.appendChild(hint);
  }
  const ctx = cv.getContext('2d')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let width = 0, w = 0, cardH = 0, pitch = 0, count = 0, height = 0;
  let offset = 0;
  let cards: (HTMLCanvasElement | null)[] = [];
  let dpr = 1;

  const warp = (x: number, E: number, k: number) => {
    if (x > width - E) {
      const d = x - (width - E);
      return width - E + d + k * (E * (1 - Math.exp(-d / E)) - d);
    }
    if (x < E) {
      const d = E - x;
      return E - d - k * (E * (1 - Math.exp(-d / E)) - d);
    }
    return x;
  };
  /** Screen x → row x (the warp is monotonic, so bisect). */
  const unwarp = (sx: number) => {
    const E = clamp(o.edge, 0.05, 0.5) * width, k = clamp(o.squeeze, 0, 1);
    let lo = -width, hi = width * 2;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (warp(mid, E, k) < sx) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };

  const draw = () => {
    if (!width) return;
    const H = height;
    const pw = Math.round(width * dpr), ph = Math.round(H * dpr);
    if (cv.width !== pw || cv.height !== ph) {
      cv.width = pw;
      cv.height = ph;
    }
    ctx.clearRect(0, 0, pw, ph);
    const E = clamp(o.edge, 0.05, 0.5) * width;
    const k = clamp(o.squeeze, 0, 1);
    const total = pitch * count;
    const grow = Math.max(0, o.reach);
    if (videos.some(Boolean)) {
      const onScreen = new Set<number>();
      for (let i = 0; i < count; i++) {
        const x0 = ((((i * pitch - offset) % total) + total) % total) - pitch;
        if (warp(x0 + w, E, k) > 0 && warp(x0, E, k) < width) onScreen.add(i % Math.max(1, list.length));
      }
      syncVideos(onScreen);
    }
    for (let i = 0; i < count; i++) {
      const card = cards[i % Math.max(1, list.length)];
      const x0 = ((((i * pitch - offset) % total) + total) % total) - pitch;
      const m = Math.max(2, Math.ceil(w / SLICE));
      for (let j = 0; j < m; j++) {
        const a = warp(x0 + (j / m) * w, E, k);
        const b = warp(x0 + ((j + 1) / m) * w, E, k);
        if (b < 0 || a > width) continue;
        const mid = (a + b) / 2;
        // 0 in the middle of the row, 1 at the very edge; smoothstep gives the curl its shape
        const t = clamp(Math.max(mid - (width - E), E - mid) / E, 0, 1);
        const dh = cardH * (1 + grow * t * t * (3 - 2 * t));
        const dy = (H - dh) / 2;
        if (card) ctx.drawImage(card, (j / m) * card.width, 0, card.width / m, card.height, a * dpr, dy * dpr, (b - a) * dpr + 0.75, dh * dpr);
        else {
          ctx.fillStyle = 'rgb(127 127 127 / 0.12)';
          ctx.fillRect(a * dpr, dy * dpr, (b - a) * dpr + 0.75, dh * dpr);
        }
      }
    }
  };

  /** Which item sits under screen x (null in the gaps). */
  const itemAt = (sx: number) => {
    if (!width || !list.length) return null;
    const total = pitch * count;
    const rx = unwarp(sx);
    for (let i = 0; i < count; i++) {
      const x0 = ((((i * pitch - offset) % total) + total) % total) - pitch;
      if (rx >= x0 && rx <= x0 + w) return list[i % list.length];
    }
    return null;
  };

  // each image is cropped to a rounded card once (with its label); the loop only slices these.
  // Cards with a reel are repainted from their <video> while they are on screen.
  let gen = 0;
  const paint = (idx: number, src: CanvasImageSource, sw: number, sh: number) => {
    const item = list[idx];
    let c = cards[idx];
    if (!c || c.width !== Math.round(w * dpr) || c.height !== Math.round(cardH * dpr)) {
      c = document.createElement('canvas');
      c.width = Math.round(w * dpr);
      c.height = Math.round(cardH * dpr);
    }
    const x = c.getContext('2d')!;
    x.save();
    x.clearRect(0, 0, c.width, c.height);
    x.beginPath();
    x.roundRect(0, 0, c.width, c.height, o.radius * dpr);
    x.clip();
    if (item.fit === 'contain') {
      x.fillStyle = item.bg ?? '#111';
      x.fillRect(0, 0, c.width, c.height);
      const s = Math.min((c.width * 0.62) / sw, (c.height * 0.8) / sh);
      const iw = sw * s, ih = sh * s;
      x.globalCompositeOperation = 'lighten';
      x.drawImage(src, (c.width - iw) / 2, (c.height - ih) / 2 - c.height * 0.06, iw, ih);
      x.globalCompositeOperation = 'source-over';
    } else {
      const s = Math.max(c.width / sw, c.height / sh);
      const iw = sw * s, ih = sh * s;
      x.drawImage(src, (c.width - iw) / 2, (c.height - ih) / 2, iw, ih);
    }
    if (item.label) {
      const gh = c.height * 0.5;
      const grd = x.createLinearGradient(0, c.height - gh, 0, c.height);
      grd.addColorStop(0, 'rgba(8,9,11,0)');
      grd.addColorStop(1, 'rgba(8,9,11,0.82)');
      x.fillStyle = grd;
      x.fillRect(0, c.height - gh, c.width, gh);
      const pad = 18 * dpr;
      x.fillStyle = '#efe9df';
      x.font = `400 ${Math.round(clamp(w * 0.055, 17, 26) * dpr)}px "Season Sans", "Helvetica Neue", Arial, sans-serif`;
      x.fillText(item.label, pad, c.height - pad - (item.sub ? 24 * dpr : 0));
      if (item.sub) {
        x.fillStyle = 'rgba(239,233,223,0.7)';
        x.font = `400 ${Math.round(15 * dpr)}px "Season Sans", "Helvetica Neue", Arial, sans-serif`;
        x.fillText(item.sub, pad, c.height - pad);
      }
    }
    x.restore();
    cards[idx] = c;
  };
  const buildCards = async () => {
    const my = ++gen;
    cards = [];
    await Promise.all([document.fonts?.load('400 24px "Season Sans"'), document.fonts?.load('400 14px "Season Sans"')]).catch(() => undefined);
    list.forEach((item, idx) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (my !== gen) return;
        // a playing reel has already painted this card: don't put the poster back over it
        const v = videos[idx];
        if (v && !v.paused && v.readyState >= 2) return;
        paint(idx, img, img.naturalWidth, img.naturalHeight);
        draw();
      };
      img.src = item.src;
    });
    draw();
  };

  // reels: one muted, looping <video> per card that has one; loaded the first time its card comes on screen
  const videos: (HTMLVideoElement | null)[] = list.map((item) => {
    if (!item.video || reduced) return null;
    const v = document.createElement('video');
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'none';
    return v;
  });
  const lastFrame: number[] = list.map(() => -1);
  /** Play the reels whose cards are on screen, pause the rest, and repaint the playing cards from their video. */
  const syncVideos = (onScreen: Set<number>) => {
    videos.forEach((v, idx) => {
      if (!v) return;
      if (onScreen.has(idx) && visible && !document.hidden) {
        if (!v.src) v.src = list[idx].video!;
        if (v.paused) v.play().catch(() => undefined);
        // repaint only when the video has a new frame
        if (v.readyState >= 2 && v.currentTime !== lastFrame[idx]) {
          lastFrame[idx] = v.currentTime;
          paint(idx, v, v.videoWidth, v.videoHeight);
        }
      } else if (!v.paused) v.pause();
    });
  };

  const layout = () => {
    width = root.clientWidth;
    dpr = Math.min(2, devicePixelRatio || 1);
    w = Math.max(80, Math.min(o.itemWidth, width * (o.maxFraction ?? 0.55) || o.itemWidth));
    cardH = Math.round(w * o.ratio);
    pitch = w + o.gap;
    count = width ? Math.ceil((width + pitch * 2) / pitch) + 1 : 0;
    height = Math.round(cardH * (1 + Math.max(0, o.reach)));
    root.style.height = `${height}px`;
    buildCards();
  };

  let lastW = -1;
  const ro = new ResizeObserver(() => {
    if (root.clientWidth === lastW) return;
    lastW = root.clientWidth;
    layout();
  });
  ro.observe(root);

  /* ---------- motion ---------- */
  let raf = 0, last = 0, mult = 1, target = 1, visible = true, vel = 0;
  let dragging = false, hovering = false, lastX = 0, lastT = 0, downX = 0, moved = 0;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    mult += (target - mult) * (1 - Math.exp(-dt * 6));
    vel *= Math.exp(-dt * 4);
    if (Math.abs(vel) < 0.5) vel = 0;
    if (!dragging) offset += (o.speed * mult + vel) * dt;
    draw();
  };
  const start = () => {
    if (!raf && visible && !document.hidden && !reduced) {
      last = 0;
      raf = requestAnimationFrame(tick);
    }
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    visible ? start() : (stop(), videos.forEach((v) => v && !v.paused && v.pause()));
  });
  io.observe(root);
  const vis = () => (document.hidden ? stop() : start());
  const settle = () => (target = dragging || (hovering && o.pauseOnHover) ? 0 : 1);
  const enter = () => ((hovering = true), settle());
  const leave = () => {
    hovering = false;
    root.classList.remove('fc--link');
    hint?.classList.remove('is-on');
    settle();
  };
  const down = (e: PointerEvent) => {
    if (reduced || !o.draggable || (e.pointerType === 'mouse' && e.button !== 0)) return;
    dragging = true;
    vel = 0;
    lastX = downX = e.clientX;
    moved = 0;
    lastT = e.timeStamp;
    cv.setPointerCapture(e.pointerId);
    root.dataset.dragging = '';
    root.dataset.dragged = '';
    hint?.classList.remove('is-on');
    settle();
  };
  const move = (e: PointerEvent) => {
    if (!dragging) {
      const r = cv.getBoundingClientRect();
      const over = e.pointerType === 'mouse' && !!itemAt(e.clientX - r.left)?.href;
      root.classList.toggle('fc--link', over);
      if (hint) {
        hint.classList.toggle('is-on', over);
        // keep the pill on screen: never above the top bar or past either side
        const half = hint.offsetWidth / 2 + 12;
        const x = Math.min(innerWidth - half, Math.max(half, e.clientX));
        const y = Math.max(hint.offsetHeight + 90, e.clientY);
        hint.style.translate = `${x}px ${y}px`;
      }
      return;
    }
    const dx = e.clientX - lastX;
    const dtm = Math.max(1, e.timeStamp - lastT);
    offset -= dx;
    moved = Math.max(moved, Math.abs(e.clientX - downX));
    vel = vel * 0.4 - (dx / dtm) * 1000 * 0.6; // smoothed release velocity
    lastX = e.clientX;
    lastT = e.timeStamp;
  };
  const up = () => {
    if (!dragging) return;
    dragging = false;
    delete root.dataset.dragging;
    settle();
  };
  const click = (e: MouseEvent) => {
    if (moved > 6) return; // that was a drag
    const r = cv.getBoundingClientRect();
    const it = itemAt(e.clientX - r.left);
    if (it?.href) o.onSelect?.(it);
  };
  const wheelMove = (e: WheelEvent) => {
    if (o.wheel === 'off' || reduced) return;
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (!horizontal && o.wheel !== 'both') return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? width : 1;
    vel += (horizontal ? e.deltaX : e.deltaY) * unit * 5;
  };
  document.addEventListener('visibilitychange', vis);
  root.addEventListener('pointerenter', enter);
  root.addEventListener('pointerleave', leave);
  cv.addEventListener('pointerdown', down);
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('click', click);
  const wheelEl: HTMLElement | Window = o.wheelTarget === 'window' ? window : cv;
  wheelEl.addEventListener('wheel', wheelMove as EventListener, { passive: false });
  start();

  return () => {
    stop();
    gen++;
    ro.disconnect();
    io.disconnect();
    document.removeEventListener('visibilitychange', vis);
    root.removeEventListener('pointerenter', enter);
    root.removeEventListener('pointerleave', leave);
    cv.removeEventListener('pointerdown', down);
    cv.removeEventListener('pointermove', move);
    cv.removeEventListener('pointerup', up);
    cv.removeEventListener('pointercancel', up);
    cv.removeEventListener('click', click);
    wheelEl.removeEventListener('wheel', wheelMove as EventListener);
    cv.remove();
    hint?.remove();
    videos.forEach((v) => {
      if (!v) return;
      v.pause();
      v.removeAttribute('src');
      v.load();
    });
  };
}
