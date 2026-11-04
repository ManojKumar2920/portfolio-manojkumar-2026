import { site } from '../site';

/**
 * Cal.com booking popup ("Let's talk", "Get in touch", "Contact", …).
 * The embed script is only fetched the first time someone hovers or clicks a booking link; until it arrives,
 * calls are queued by the official bootstrap below and run as soon as it loads.
 */

type CalApi = ((...args: unknown[]) => void) & {
  ns: Record<string, (...args: unknown[]) => void>;
  config?: Record<string, unknown>;
  loaded?: boolean;
  q?: unknown[];
};
declare global {
  interface Window {
    Cal?: CalApi;
  }
}

const NS = site.booking.namespace;
let ready = false;

function init() {
  if (ready) return;
  ready = true;
  // Cal.com element-click embed bootstrap (verbatim logic from the Cal.com embed snippet)
  /* eslint-disable */
  (function (C: any, A: string, L: string) {
    let p = function (a: any, ar: any) { a.q.push(ar); };
    let d = C.document;
    C.Cal = C.Cal || function () {
      let cal = C.Cal; let ar = arguments;
      if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; d.head.appendChild(d.createElement('script')).src = A; cal.loaded = true; }
      if (ar[0] === L) {
        const api: any = function () { p(api, arguments); };
        const namespace = ar[1];
        api.q = api.q || [];
        if (typeof namespace === 'string') { cal.ns[namespace] = cal.ns[namespace] || api; p(cal.ns[namespace], ar); p(cal, ['initNamespace', namespace]); }
        else p(cal, ar);
        return;
      }
      p(cal, ar);
    };
  })(window, 'https://app.cal.com/embed/embed.js', 'init');
  /* eslint-enable */
  const Cal = window.Cal!;
  Cal('init', NS, { origin: 'https://app.cal.com' });
  Cal.config = Cal.config || {};
  Cal.config.forwardQueryParams = true;
  Cal.ns[NS]('ui', { theme: 'dark', hideEventTypeDetails: false, layout: 'month_view' });
}

/** Start fetching the embed (e.g. on hover) so the popup opens instantly on click. */
export function warmBooking() {
  init();
}

/** Open the booking popup; `note` pre-fills the booking's notes (e.g. which plan the visitor chose). */
export function openBooking(note?: string) {
  init();
  window.Cal!.ns[NS]('modal', {
    calLink: site.booking.link,
    config: { layout: 'month_view', useSlotsViewOnSmallScreen: 'true', theme: 'dark', ...(note ? { notes: note } : {}) },
  });
}
