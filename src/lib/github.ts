// GitHub contribution calendar, read at build time from the public profile page (no token): each day's date,
// level (0–4) and count, plus the yearly total. A committed snapshot is the fallback when the build has no network.
import snapshot from '../data/github-contributions.json';

export interface Day { date: string; level: number; count: number }
export interface Contributions { user: string; total: number; days: Day[]; fetched: string }

export function parseContributions(html: string, user: string): Contributions | null {
  const counts = new Map<string, number>();
  for (const m of html.matchAll(/<tool-tip[^>]*for="(contribution-day-component-[\d-]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    const n = /^(\d[\d,]*) contribution/.exec(m[2].trim());
    counts.set(m[1], n ? Number(n[1].replace(/,/g, '')) : 0);
  }
  const days: Day[] = [];
  for (const m of html.matchAll(/data-date="(\d{4}-\d{2}-\d{2})"\s+id="(contribution-day-component-[\d-]+)"\s+data-level="(\d)"/g)) {
    days.push({ date: m[1], level: Number(m[3]), count: counts.get(m[2]) ?? 0 });
  }
  if (days.length < 300) return null;
  days.sort((a, b) => a.date.localeCompare(b.date));
  const t = /([\d,]+)\s+contributions?\s+in the last year/.exec(html.replace(/\s+/g, ' '));
  const total = t ? Number(t[1].replace(/,/g, '')) : days.reduce((a, d) => a + d.count, 0);
  return { user, total, days, fetched: new Date().toISOString().slice(0, 10) };
}

export async function getContributions(user: string): Promise<Contributions> {
  try {
    const res = await fetch(`https://github.com/users/${user}/contributions`, { headers: { 'User-Agent': 'portfolio-build' }, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = parseContributions(await res.text(), user);
      if (data) return data;
    }
  } catch {
    /* offline build: use the snapshot */
  }
  return snapshot as Contributions;
}
