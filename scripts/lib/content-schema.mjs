import { z } from 'zod';

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const relativeOrAbsoluteUrlSchema = z
  .string()
  .refine((value) => value.startsWith('/') || /^https?:\/\//.test(value), {
    message: 'Expected a root-relative or absolute URL.',
  });

const subscribeLinksSchema = z
  .object({
    apple: z.string().url().optional(),
    spotify: z.string().url().optional(),
    youtube: z.string().url().optional(),
    rss: z.string().url().optional(),
    archive: z.string().url().optional(),
  })
  .partial()
  .default({});

const fundingSchema = z.array(
  z.object({
    url: z.string().url(),
    text: z.string().min(1).max(120),
  }),
);

export const categorySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(255),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().min(1).max(4000),
  description_html: z.string().optional(),
  author: z.string().min(1).max(255),
  owner: z.object({
    name: z.string().min(1).max(255),
    email: z.string().email(),
  }),
  language: z.string().default('en-us'),
  categories_itunes: z.array(z.string().min(1)).min(1),
  explicit: z.boolean().default(false),
  cover_art: z.object({
    url: relativeOrAbsoluteUrlSchema,
    width: z.number().int().min(1400).max(3000),
    height: z.number().int().min(1400).max(3000),
  }),
  color: hexColorSchema.optional(),
  website_url: z.string().url().optional(),
  tags: z.array(z.string().min(1)).default([]),
  type: z.enum(['episodic', 'serial']).default('episodic'),
  copyright: z.string().optional(),
  created_at: z.string().datetime(),
  featured: z.boolean().default(false),
  sort_order: z.number().int().default(100),
  podcast_guid: z.string().optional(),
  podcast_locked: z.boolean().default(false),
  subscribe_links: subscribeLinksSchema.optional(),
  funding: fundingSchema.default([]),
});

export const chapterSchema = z.object({
  start_seconds: z.number().int().nonnegative(),
  title: z.string().min(1).max(255),
});

export const guestSchema = z.object({
  name: z.string().min(1).max(255),
  role: z.string().max(255).optional(),
  url: z.string().url().optional(),
});

export const mediaSchema = z.object({
  type: z.enum(['audio', 'video']),
  primary_url: z.string().url().startsWith('https://archive.org/'),
  mirror_url: z.string().url().optional(),
  mime_type: z.enum(['audio/mpeg', 'audio/mp4', 'video/mp4']),
  file_size_bytes: z.number().int().positive(),
  bitrate_kbps: z.number().int().positive().optional(),
  sample_rate_hz: z.number().int().positive().optional(),
  channels: z.number().int().min(1).max(8).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

export const videoSchema = z
  .object({
    enabled: z.boolean(),
    url: z.string().url().optional(),
    mime_type: z.enum(['video/mp4']).optional(),
    file_size_bytes: z.number().int().positive().optional(),
    resolution: z.string().regex(/^\d+x\d+$/).optional(),
    poster_url: relativeOrAbsoluteUrlSchema.optional(),
  })
  .optional();

export const episodeSchema = z.object({
  id: z.string().min(1).max(255),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  category_id: z.string().regex(/^[a-z0-9-]+$/),
  season: z.number().int().positive().optional(),
  episode_number: z.number().int().positive().optional(),
  episode_type: z.enum(['full', 'trailer', 'bonus']).default('full'),
  title: z.string().min(1).max(255),
  subtitle: z.string().max(255).optional(),
  description: z.string().min(1),
  description_html: z.string().optional(),
  summary: z.string().max(4000).optional(),
  publish_date: z.string().datetime(),
  language: z.string().optional(),
  duration_seconds: z.number().int().positive(),
  media: mediaSchema,
  video: videoSchema,
  archive_identifier: z.string().min(1).max(255),
  archive_url: z.string().url(),
  transcript_url: relativeOrAbsoluteUrlSchema.optional(),
  chapters: z.array(chapterSchema).default([]),
  show_notes_markdown: z.string().optional(),
  guests: z.array(guestSchema).default([]),
  tags: z.array(z.string().min(1)).default([]),
  explicit: z.boolean().default(false),
  episode_art: z
    .object({
      url: relativeOrAbsoluteUrlSchema,
      width: z.number().int().min(1400),
      height: z.number().int().min(1400),
    })
    .optional(),
  status: z.enum(['draft', 'published', 'archived']).default('published'),
});
