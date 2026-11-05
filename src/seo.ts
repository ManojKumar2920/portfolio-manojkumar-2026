import { site } from './site';

/**
 * Who this site is about, as schema.org data (JSON-LD), so search engines and AI answer engines can tell this
 * Manoj Kumar apart from the others: a software engineer in India, with his profiles, employer and education.
 * Every page carries the Person and the WebSite; pages add their own node (a profile page, a case study).
 */

export const ORIGIN = 'https://manoj-kumar.dev';
export const PERSON_ID = `${ORIGIN}/#person`;
export const SITE_ID = `${ORIGIN}/#website`;

export const person = {
  '@type': 'Person',
  '@id': PERSON_ID,
  name: site.name,
  givenName: 'Manoj',
  familyName: 'Kumar',
  jobTitle: site.role,
  description: site.summary,
  url: `${ORIGIN}/`,
  image: `${ORIGIN}/images/manoj-profile.jpg`,
  email: `mailto:${site.email}`,
  sameAs: site.socials.map((s) => s.href),
  address: { '@type': 'PostalAddress', addressCountry: 'IN' },
  worksFor: site.experience[0] ? { '@type': 'Organization', name: site.experience[0].org } : undefined,
  alumniOf: { '@type': 'CollegeOrUniversity', name: site.education.school },
  knowsAbout: [
    'Distributed systems', 'Microservices', 'Cloud architecture', 'Backend engineering', 'Full-stack development',
    'Go', 'TypeScript', 'NestJS', 'Next.js', 'Kafka', 'Redis', 'PostgreSQL', 'AWS', 'Kubernetes', 'Cloudflare Workers', 'Three.js',
  ],
};

export const website = {
  '@type': 'WebSite',
  '@id': SITE_ID,
  url: `${ORIGIN}/`,
  name: site.name,
  alternateName: `${site.name} · ${site.role}`,
  inLanguage: 'en',
  publisher: { '@id': PERSON_ID },
  about: { '@id': PERSON_ID },
};

export function graph(...nodes: object[]) {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': [person, website, ...nodes] });
}
