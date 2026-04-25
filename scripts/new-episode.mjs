import { basename, extname, resolve } from 'node:path';
import { access, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { parseArgs } from 'node:util';

import { loadCategories } from './lib/content.mjs';
import { probeMedia, slugify } from './lib/media.mjs';

const MIME_BY_EXTENSION = {
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.m4a': 'audio/mp4',
  '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
};

function inferMimeType(extension) {
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

function inferMediaType(extension) {
  const mimeType = inferMimeType(extension);
  return mimeType.split('/')[0] || 'application';
}

const {
  values: {
    show,
    title,
    media,
    season,
    'episode-number': episodeNumber,
    'publish-date': publishDate,
  },
} = parseArgs({
  options: {
    show: { type: 'string' },
    title: { type: 'string' },
    media: { type: 'string' },
    season: { type: 'string' },
    'episode-number': { type: 'string' },
    'publish-date': { type: 'string' },
  },
});

if (!show || !title || !media) {
  console.error(
    'Usage: npm run new:episode -- --show <show-slug> --title "Episode title" --media ./episode.mp3 [--season 1] [--episode-number 4] [--publish-date 2026-04-24T12:00:00Z]',
  );
  process.exit(1);
}

const mediaPath = resolve(media);
await access(mediaPath, constants.R_OK);

const categories = await loadCategories();
const category = categories.find((entry) => entry.id === show || entry.slug === show);

if (!category) {
  console.error(`Unknown show "${show}".`);
  process.exit(1);
}

const titleSlug = slugify(title);
const date = publishDate ? new Date(publishDate) : new Date();

if (Number.isNaN(date.getTime())) {
  console.error(`Invalid publish date "${publishDate}".`);
  process.exit(1);
}

const dateStamp = date.toISOString().slice(0, 10);
const compactDate = date.toISOString().slice(0, 10).replaceAll('-', '');
const mediaInfo = await probeMedia(mediaPath);
const extension = extname(mediaPath).toLowerCase();
const mimeType = inferMimeType(extension);
const mediaType = inferMediaType(extension);
const isVideo = mediaType === 'video';
const archiveIdentifier =
  season && episodeNumber
    ? `${category.slug}-s${String(Number(season)).padStart(2, '0')}e${String(Number(episodeNumber)).padStart(2, '0')}-${compactDate}`
    : `${category.slug}-${titleSlug}-${compactDate}`;

const payload = {
  id: `${category.slug}-${titleSlug}-${dateStamp}`,
  slug: titleSlug,
  category_id: category.id,
  ...(season ? { season: Number(season) } : {}),
  ...(episodeNumber ? { episode_number: Number(episodeNumber) } : {}),
  episode_type: 'full',
  title,
  subtitle: 'TODO: add subtitle.',
  description: 'TODO: add episode description.',
  description_html: '<p>TODO: add rendered show notes summary.</p>',
  summary: 'TODO: add one-line summary.',
  publish_date: date.toISOString(),
  duration_seconds: mediaInfo.durationSeconds,
  media: {
    type: mediaType,
    primary_url: `https://archive.org/download/${archiveIdentifier}/${basename(mediaPath)}`,
    mime_type: mimeType,
    file_size_bytes: mediaInfo.fileSizeBytes,
    bitrate_kbps: mediaInfo.bitrateKbps,
    sample_rate_hz: mediaInfo.sampleRateHz,
    channels: mediaInfo.channels,
    sha256: mediaInfo.sha256,
  },
  ...(isVideo
    ? {
        video: {
          enabled: true,
          url: `https://archive.org/download/${archiveIdentifier}/${basename(mediaPath)}`,
          mime_type: mimeType,
          file_size_bytes: mediaInfo.fileSizeBytes,
          resolution:
            mediaInfo.width && mediaInfo.height ? `${mediaInfo.width}x${mediaInfo.height}` : undefined,
        },
      }
    : {}),
  archive_identifier: archiveIdentifier,
  archive_url: `https://archive.org/details/${archiveIdentifier}`,
  chapters: [],
  show_notes_markdown: '## Links\n- TODO: add source links',
  guests: [],
  tags: [],
  explicit: false,
  status: 'draft',
};

const outputPath = resolve('src/content/episodes', `${category.slug}-${titleSlug}.json`);
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(`Created ${outputPath}`);
console.log(`Archive identifier: ${archiveIdentifier}`);
console.log(
  `Suggested upload: ia upload ${archiveIdentifier} "${mediaPath}" --metadata="title:${title}" --metadata="mediatype:${mediaType === 'video' ? 'movies' : 'audio'}"`,
);
console.log('Next steps: fill in show notes, chapters, guests, and then run npm run validate -- --update-guid-lock');
