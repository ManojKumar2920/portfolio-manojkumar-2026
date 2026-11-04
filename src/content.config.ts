import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    client: z.string(),
    // full-stack (apps, backends, web apps, software) or 3D web
    kind: z.enum(['fullstack', '3d']),
    category: z.string(),
    year: z.number().optional(),
    summary: z.string(),
    services: z.array(z.string()),
    duration: z.string().optional(),
    color: z.string(), // accent on the canvas
    url: z.string().optional(),
    links: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
    sample: z.boolean().default(false),
    role: z.string().optional(), // e.g. "Sole backend engineer"
    note: z.string().optional(), // small print, e.g. where the work was done
    // what hangs in the frame: a reel (with poster), a still, or a logo on a coloured ground
    media: z
      .object({
        type: z.enum(['video', 'image', 'logo']),
        src: z.string(),
        poster: z.string().optional(),
        bg: z.string().optional(),
        caption: z.string().optional(),
      })
      .optional(),
    // headline numbers (first one is the hero stat); only real ones
    metrics: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
    wall: z.boolean().default(true), // hung in the home page hall
    order: z.number().default(0),
  }),
});

export const collections = { projects };
