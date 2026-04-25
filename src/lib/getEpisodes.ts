import { getCollection, type CollectionEntry } from 'astro:content';

export type EpisodeEntry = CollectionEntry<'episodes'>;

function episodeTime(entry: EpisodeEntry) {
  return new Date(entry.data.publish_date).getTime();
}

export function sortEpisodesDescending(left: EpisodeEntry, right: EpisodeEntry) {
  return episodeTime(right) - episodeTime(left);
}

export async function getEpisodes() {
  return (await getCollection('episodes')).sort(sortEpisodesDescending);
}

export async function getPublishedEpisodes(now = new Date()) {
  return (await getEpisodes()).filter(
    (episode) =>
      episode.data.status === 'published' &&
      new Date(episode.data.publish_date).getTime() <= now.getTime(),
  );
}

export async function getEpisodesByShow(categoryId: string) {
  return (await getPublishedEpisodes()).filter((episode) => episode.data.category_id === categoryId);
}

export async function getLatestEpisode() {
  return (await getPublishedEpisodes())[0];
}

export async function getAdjacentEpisodes(current: EpisodeEntry) {
  const showEpisodes = await getEpisodesByShow(current.data.category_id);
  const index = showEpisodes.findIndex((episode) => episode.id === current.id);

  return {
    newer: index > 0 ? showEpisodes[index - 1] : undefined,
    older: index >= 0 ? showEpisodes[index + 1] : undefined,
  };
}
