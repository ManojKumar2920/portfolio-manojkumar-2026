import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// Every public page, with the home and About first: what search engines should know about.
export const GET: APIRoute = async ({ site }) => {
  const projects = (await getCollection('projects')).sort((a, b) => a.data.order - b.data.order);
  const today = new Date().toISOString().slice(0, 10);
  const pages: [string, string][] = [
    ['/', '1.0'],
    ['/about', '0.9'],
    ['/work', '0.8'],
    ...projects.map((p): [string, string] => [`/work/${p.id}`, '0.7']),
    ['/credits', '0.3'],
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(([path, pr]) => `  <url><loc>${new URL(path, site)}</loc><lastmod>${today}</lastmod><priority>${pr}</priority></url>`).join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
