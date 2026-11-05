import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { site } from '../site';

// llms.txt: the site in plain text for AI assistants and answer engines (who this is, what he does, where to look).
export const GET: APIRoute = async ({ site: origin }) => {
  const u = (p: string) => new URL(p, origin).href;
  const projects = (await getCollection('projects')).sort((a, b) => a.data.order - b.data.order);
  const e = site.experience[0];
  const text = `# ${site.name}

> ${site.name} is a ${site.role.toLowerCase()} based in ${site.location.split(' · ')[0]}. ${site.pitch.replace(/^I design and run /, 'He designs and runs ')}

${site.summary}

- Website: ${u('/')}
- Current role: ${e ? `${e.role} at ${e.org}, ${e.place} (${e.period})` : site.role}
- Education: ${site.education.degree}, ${site.education.school} (${site.education.period})
- Stack: ${site.stack.join(', ')}
- Availability: ${site.availability}
- Contact: ${site.email} · book a call: ${site.booking.url}
${site.socials.map((s) => `- ${s.label}: ${s.href}`).join('\n')}

## Pages

- [About](${u('/about')}): experience, skills, education and how he works
- [Work](${u('/work')}): every project, with case studies
- [Credits](${u('/credits')}): third-party models and data used on the site

## Case studies

${projects.map((p) => `- [${p.data.client}: ${p.data.title}](${u(`/work/${p.id}`)}): ${p.data.summary}`).join('\n')}
`;
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
