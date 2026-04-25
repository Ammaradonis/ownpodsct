import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

import { categorySchema, episodeSchema } from '../scripts/lib/content-schema.mjs';

export const collections = {
  categories: defineCollection({
    loader: glob({ pattern: '**/*.json', base: './src/content/categories' }),
    schema: categorySchema,
  }),
  episodes: defineCollection({
    loader: glob({ pattern: '**/*.json', base: './src/content/episodes' }),
    schema: episodeSchema,
  }),
};
