import type { APIRoute } from 'astro';

// Everyone may read the site, search engines and AI answer engines alike (so they can say who Manoj Kumar is).
export const GET: APIRoute = ({ site }) =>
  new Response(
    [
      'User-agent: *',
      'Allow: /',
      '',
      '# AI search and answer engines are welcome too',
      ...['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'CCBot']
        .flatMap((b) => [`User-agent: ${b}`, 'Allow: /', '']),
      `Sitemap: ${new URL('/sitemap.xml', site)}`,
      '',
    ].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
