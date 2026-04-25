import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export const CONTENT_ROOT = path.resolve('src/content');
export const CATEGORY_DIR = path.join(CONTENT_ROOT, 'categories');
export const EPISODE_DIR = path.join(CONTENT_ROOT, 'episodes');
export const GUID_LOCK_PATH = path.resolve('guids.lock.json');

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function loadJsonRecords(directory) {
  const files = (await readdir(directory))
    .filter((file) => file.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    files.map(async (file) => ({
      file,
      data: await readJson(path.join(directory, file)),
    })),
  );
}

export async function loadJsonFiles(directory) {
  const records = await loadJsonRecords(directory);
  return records.map((record) => record.data);
}

export async function loadCategories() {
  return loadJsonFiles(CATEGORY_DIR);
}

export async function loadEpisodes() {
  return loadJsonFiles(EPISODE_DIR);
}

export function sortEpisodesDesc(left, right) {
  return new Date(right.publish_date).getTime() - new Date(left.publish_date).getTime();
}

export function isPublishedEpisode(episode, now = new Date()) {
  return episode.status === 'published' && new Date(episode.publish_date).getTime() <= now.getTime();
}

export function getPublishedEpisodes(episodes, now = new Date()) {
  return episodes.filter((episode) => isPublishedEpisode(episode, now)).sort(sortEpisodesDesc);
}

export function getTags(categories, episodes) {
  const counts = new Map();

  for (const category of categories) {
    for (const tag of category.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  for (const episode of episodes) {
    for (const tag of episode.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
}
