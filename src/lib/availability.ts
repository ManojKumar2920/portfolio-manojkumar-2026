// Freelance availability line, by the date in India: three slots early in the month, two from mid-month, and from the
// 26th the next month opens ("December slots are open"). Rendered at build time and re-computed in the browser on
// every visit (app.ts), so the static page never shows a stale month.
export const AVAILABILITY = { early: 3, mid: 2, midFrom: 15, nextFrom: 26, timeZone: 'Asia/Kolkata' };

export function availabilityText(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: AVAILABILITY.timeZone, day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const day = get('day'), month = get('month'), year = get('year');
  if (day >= AVAILABILITY.nextFrom) {
    const next = new Date(Date.UTC(year, month, 1)); // month is 1-based, so this is the 1st of next month
    return `${next.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} slots are open`;
  }
  const n = day >= AVAILABILITY.midFrom ? AVAILABILITY.mid : AVAILABILITY.early;
  return `Available for ${n} new project${n === 1 ? '' : 's'} this month`;
}
