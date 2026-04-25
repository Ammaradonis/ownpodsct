import { readFile, writeFile } from 'node:fs/promises';

import {
  categorySchema,
  episodeSchema,
} from './content-schema.mjs';
import {
  CATEGORY_DIR,
  EPISODE_DIR,
  GUID_LOCK_PATH,
  loadJsonRecords,
} from './content.mjs';

function uniqueKey(map, key, value, message, errors) {
  if (map.has(key)) {
    errors.push(message(map.get(key), value));
    return;
  }

  map.set(key, value);
}

function flattenZodIssues(issues) {
  return issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}

export async function validateContent({ updateGuidLock = false } = {}) {
  const errors = [];
  const warnings = [];

  const categoryRecords = await loadJsonRecords(CATEGORY_DIR);
  const episodeRecords = await loadJsonRecords(EPISODE_DIR);

  const categories = [];
  const episodes = [];

  for (const record of categoryRecords) {
    const result = categorySchema.safeParse(record.data);
    if (!result.success) {
      for (const issue of flattenZodIssues(result.error.issues)) {
        errors.push(`Category ${record.file}: ${issue}`);
      }
      continue;
    }
    categories.push({ file: record.file, data: result.data });
  }

  for (const record of episodeRecords) {
    const result = episodeSchema.safeParse(record.data);
    if (!result.success) {
      for (const issue of flattenZodIssues(result.error.issues)) {
        errors.push(`Episode ${record.file}: ${issue}`);
      }
      continue;
    }
    episodes.push({ file: record.file, data: result.data });
  }

  const categoryIds = new Set();
  const categorySlugs = new Set();
  const categoryMap = new Map();

  for (const category of categories) {
    if (categoryIds.has(category.data.id)) {
      errors.push(`Duplicate category id "${category.data.id}" found in ${category.file}.`);
    }
    categoryIds.add(category.data.id);

    if (categorySlugs.has(category.data.slug)) {
      errors.push(`Duplicate category slug "${category.data.slug}" found in ${category.file}.`);
    }
    categorySlugs.add(category.data.slug);
    categoryMap.set(category.data.id, category.data);
  }

  const episodeIds = new Map();
  const episodeSlugsByShow = new Map();
  const mediaUrls = new Map();
  const now = Date.now();
  const futureWindowMs = 24 * 60 * 60 * 1000;

  for (const episode of episodes) {
    uniqueKey(
      episodeIds,
      episode.data.id,
      episode.file,
      (firstFile, secondFile) =>
        `Duplicate episode id "${episode.data.id}" found in ${firstFile} and ${secondFile}.`,
      errors,
    );

    const slugScope = `${episode.data.category_id}:${episode.data.slug}`;
    uniqueKey(
      episodeSlugsByShow,
      slugScope,
      episode.file,
      (firstFile, secondFile) =>
        `Duplicate episode slug "${episode.data.slug}" within show "${episode.data.category_id}" found in ${firstFile} and ${secondFile}.`,
      errors,
    );

    uniqueKey(
      mediaUrls,
      episode.data.media.primary_url,
      episode.file,
      (firstFile, secondFile) =>
        `Duplicate media.primary_url "${episode.data.media.primary_url}" found in ${firstFile} and ${secondFile}.`,
      errors,
    );

    if (!categoryMap.has(episode.data.category_id)) {
      errors.push(
        `Episode ${episode.file} references missing category_id "${episode.data.category_id}".`,
      );
    }

    const publishTime = new Date(episode.data.publish_date).getTime();
    if (!Number.isFinite(publishTime)) {
      errors.push(`Episode ${episode.file} has an invalid publish_date.`);
    } else if (publishTime - now > futureWindowMs) {
      warnings.push(
        `Episode ${episode.file} is scheduled more than 24h in the future (${episode.data.publish_date}).`,
      );
    }

    let previousStart = -1;
    for (const chapter of episode.data.chapters) {
      if (chapter.start_seconds <= previousStart) {
        errors.push(
          `Episode ${episode.file} has chapters that are not strictly increasing at "${chapter.title}".`,
        );
      }
      if (chapter.start_seconds > episode.data.duration_seconds) {
        errors.push(
          `Episode ${episode.file} has chapter "${chapter.title}" beyond duration_seconds.`,
        );
      }
      previousStart = chapter.start_seconds;
    }

    if (episode.data.video?.enabled && !episode.data.video.url) {
      errors.push(`Episode ${episode.file} has video.enabled=true but no video.url.`);
    }

    if (episode.data.media.type === 'video' && !episode.data.video?.enabled) {
      errors.push(
        `Episode ${episode.file} has media.type="video" but video.enabled is not true.`,
      );
    }
  }

  const currentIds = episodes.map((episode) => episode.data.id).sort();
  let lockedIds = [];

  try {
    const rawLock = JSON.parse(await readFile(GUID_LOCK_PATH, 'utf8'));
    lockedIds = [...new Set(rawLock.episodeIds ?? [])].sort();
  } catch (error) {
    warnings.push(`GUID lock missing or unreadable at ${GUID_LOCK_PATH}: ${error.message}`);
  }

  if (updateGuidLock) {
    await writeFile(
      GUID_LOCK_PATH,
      `${JSON.stringify({ episodeIds: currentIds }, null, 2)}\n`,
      'utf8',
    );
  } else {
    const added = currentIds.filter((id) => !lockedIds.includes(id));
    const removed = lockedIds.filter((id) => !currentIds.includes(id));

    if (added.length || removed.length) {
      errors.push(
        `GUID lock mismatch. Added: ${added.join(', ') || 'none'}. Removed: ${removed.join(', ') || 'none'}. Run "npm run validate -- --update-guid-lock" to acknowledge intentional changes.`,
      );
    }
  }

  return {
    categories: categories.map((record) => record.data),
    episodes: episodes.map((record) => record.data),
    errors,
    warnings,
  };
}
