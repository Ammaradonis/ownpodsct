import { marked } from 'marked';

import type { CollectionEntry } from 'astro:content';

import { formatShortDuration } from './formatDuration';

type EpisodeEntry = CollectionEntry<'episodes'>;

export function renderEpisodeNotes(episode: EpisodeEntry['data']) {
  const parts: string[] = [];

  if (episode.description_html) {
    parts.push(episode.description_html);
  } else {
    parts.push(`<p>${episode.description}</p>`);
  }

  if (episode.chapters.length) {
    const chapterItems = episode.chapters
      .map(
        (chapter) =>
          `<li><strong>${formatShortDuration(chapter.start_seconds)}</strong> ${chapter.title}</li>`,
      )
      .join('');

    parts.push(`<h2>Chapters</h2><ul>${chapterItems}</ul>`);
  }

  if (episode.show_notes_markdown) {
    parts.push(marked.parse(episode.show_notes_markdown) as string);
  }

  return parts.join('');
}
