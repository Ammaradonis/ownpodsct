import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { marked } from 'marked';
import { create } from 'xmlbuilder2';

import {
  getPublishedEpisodes,
  loadCategories,
  loadEpisodes,
  sortEpisodesDesc,
} from './content.mjs';
import { absoluteUrl, siteConfig } from './site-config.mjs';

const FEED_OUT_DIR = path.resolve('public/feeds');
const DIST_OUT_DIR = path.resolve('dist/feeds');

function rfc822(iso) {
  return new Date(iso).toUTCString().replace('GMT', '+0000');
}

export function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = Math.floor(seconds % 60);
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, '0')).join(':');
}

function formatPerson(text, role) {
  return role ? `${text} (${role})` : text;
}

export function buildEpisodeHtml(episode) {
  const parts = [];

  if (episode.description_html) {
    parts.push(episode.description_html);
  } else {
    parts.push(`<p>${episode.description}</p>`);
  }

  if (episode.chapters.length) {
    const items = episode.chapters
      .map(
        (chapter) =>
          `<li>${formatDuration(chapter.start_seconds).slice(3)} - ${chapter.title}</li>`,
      )
      .join('');
    parts.push(`<h3>Chapters</h3><ul>${items}</ul>`);
  }

  if (episode.show_notes_markdown) {
    parts.push(marked.parse(episode.show_notes_markdown));
  }

  return parts.join('');
}

function appendEpisodeNodes(channel, episode, category) {
  const item = channel.ele('item');
  item.ele('title').txt(episode.title);
  item.ele('link').txt(absoluteUrl(`/shows/${category.slug}/${episode.slug}/`));
  item.ele('guid', { isPermaLink: 'false' }).txt(episode.id);
  item.ele('pubDate').txt(rfc822(episode.publish_date));
  item.ele('description').dat(episode.description);
  item.ele('content:encoded').dat(buildEpisodeHtml(episode));
  item.ele('enclosure', {
    url: episode.media.primary_url,
    length: String(episode.media.file_size_bytes),
    type: episode.media.mime_type,
  });
  item.ele('itunes:duration').txt(formatDuration(episode.duration_seconds));
  if (episode.episode_number) {
    item.ele('itunes:episode').txt(String(episode.episode_number));
  }
  if (episode.season) {
    item.ele('itunes:season').txt(String(episode.season));
  }
  item.ele('itunes:episodeType').txt(episode.episode_type);
  item.ele('itunes:explicit').txt(String(episode.explicit));
  item.ele('itunes:author').txt(category.author);

  if (episode.subtitle) {
    item.ele('itunes:subtitle').txt(episode.subtitle);
  }

  if (episode.summary) {
    item.ele('itunes:summary').txt(episode.summary);
  }

  if (episode.episode_art) {
    item.ele('itunes:image', { href: absoluteUrl(episode.episode_art.url) });
  }

  if (episode.transcript_url) {
    item.ele('podcast:transcript', {
      type: episode.transcript_url.endsWith('.vtt') ? 'text/vtt' : 'text/plain',
      url: absoluteUrl(episode.transcript_url),
    });
  }

  if (episode.video?.enabled && episode.video.url) {
    item.ele('podcast:alternateEnclosure', {
      type: episode.video.mime_type ?? 'video/mp4',
      length: String(episode.video.file_size_bytes ?? ''),
      url: episode.video.url,
    });
  }

  item.ele('podcast:person', { role: 'host', group: 'cast' }).txt(category.author);
  for (const guest of episode.guests ?? []) {
    item.ele('podcast:person', { role: 'guest', group: 'cast' }).txt(formatPerson(guest.name, guest.role));
  }
}

function buildFeedDocument({
  title,
  description,
  sitePath,
  feedPath,
  imageUrl,
  author,
  owner,
  type,
  explicit,
  copyright,
  language,
  categories,
  episodes,
  podcastGuid,
  podcastLocked,
  funding,
}) {
  const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele('rss', {
    version: '2.0',
    'xmlns:itunes': 'http://www.itunes.com/dtds/podcast-1.0.dtd',
    'xmlns:content': 'http://purl.org/rss/1.0/modules/content/',
    'xmlns:atom': 'http://www.w3.org/2005/Atom',
    'xmlns:podcast': 'https://podcastindex.org/namespace/1.0',
  });

  const channel = doc.ele('channel');
  const latest = episodes[0];

  channel.ele('title').txt(title);
  channel.ele('link').txt(absoluteUrl(sitePath));
  channel.ele('atom:link', {
    href: absoluteUrl(feedPath),
    rel: 'self',
    type: 'application/rss+xml',
  });
  channel.ele('description').txt(description);
  channel.ele('language').txt(language ?? siteConfig.language);
  if (copyright) {
    channel.ele('copyright').txt(copyright);
  }
  channel.ele('lastBuildDate').txt(rfc822(new Date().toISOString()));
  channel.ele('pubDate').txt(rfc822(latest?.publish_date ?? new Date().toISOString()));
  channel.ele('itunes:author').txt(author);
  channel.ele('itunes:summary').txt(description);
  channel.ele('itunes:type').txt(type ?? 'episodic');
  const ownerNode = channel.ele('itunes:owner');
  ownerNode.ele('itunes:name').txt(owner.name);
  ownerNode.ele('itunes:email').txt(owner.email);
  channel.ele('itunes:explicit').txt(String(explicit ?? false));
  channel.ele('itunes:image', { href: absoluteUrl(imageUrl) });
  if (podcastGuid) {
    channel.ele('podcast:guid').txt(podcastGuid);
  }
  channel.ele('podcast:locked', { owner: owner.email }).txt(podcastLocked ? 'yes' : 'no');

  const imageNode = channel.ele('image');
  imageNode.ele('url').txt(absoluteUrl(imageUrl));
  imageNode.ele('title').txt(title);
  imageNode.ele('link').txt(absoluteUrl(sitePath));

  for (const categoryTag of categories) {
    const [top, sub] = categoryTag.split(':');
    const root = channel.ele('itunes:category', { text: top });
    if (sub) {
      root.ele('itunes:category', { text: sub });
    }
  }

  for (const item of funding ?? []) {
    channel.ele('podcast:funding', { url: item.url }).txt(item.text);
  }

  return { doc, channel };
}

export function buildCategoryFeedXml(category, episodes) {
  const showEpisodes = getPublishedEpisodes(
    episodes.filter((episode) => episode.category_id === category.id),
  );

  const { doc, channel } = buildFeedDocument({
    title: category.title,
    description: category.description,
    sitePath: `/shows/${category.slug}/`,
    feedPath: `/feeds/${category.slug}.xml`,
    imageUrl: category.cover_art.url,
    author: category.author,
    owner: category.owner,
    type: category.type,
    explicit: category.explicit,
    copyright: category.copyright,
    language: category.language,
    categories: category.categories_itunes,
    episodes: showEpisodes,
    podcastGuid: category.podcast_guid ?? category.id,
    podcastLocked: category.podcast_locked ?? false,
    funding: category.funding,
  });

  for (const episode of showEpisodes) {
    appendEpisodeNodes(channel, episode, category);
  }

  return doc.end({ prettyPrint: true });
}

export function buildMainFeedXml(categories, episodes) {
  const publishedEpisodes = getPublishedEpisodes(episodes);
  const featuredCategory = categories.find((category) => category.featured) ?? categories[0];
  const categoriesItunes = [
    ...new Set(categories.flatMap((category) => category.categories_itunes ?? [])),
  ];

  const { doc, channel } = buildFeedDocument({
    title: `${siteConfig.title} - Latest Episodes`,
    description: siteConfig.description,
    sitePath: '/',
    feedPath: siteConfig.mainFeedPath,
    imageUrl: featuredCategory?.cover_art.url ?? '/favicon.svg',
    author: siteConfig.author,
    owner: siteConfig.owner,
    type: 'episodic',
    explicit: false,
    language: siteConfig.language,
    categories: categoriesItunes.length ? categoriesItunes : ['Technology'],
    episodes: publishedEpisodes,
    podcastGuid: `${siteConfig.title.toLowerCase().replace(/\s+/g, '-')}-main-feed`,
    podcastLocked: false,
    funding: [],
  });

  for (const episode of publishedEpisodes) {
    const category = categories.find((item) => item.id === episode.category_id);
    if (!category) {
      continue;
    }
    appendEpisodeNodes(channel, episode, category);
  }

  return doc.end({ prettyPrint: true });
}

export async function writeFeeds() {
  const categories = await loadCategories();
  const episodes = (await loadEpisodes()).sort(sortEpisodesDesc);
  const publishedEpisodes = getPublishedEpisodes(episodes);

  await mkdir(FEED_OUT_DIR, { recursive: true });
  await writeFile(path.join(FEED_OUT_DIR, 'main.xml'), buildMainFeedXml(categories, publishedEpisodes), 'utf8');

  for (const category of categories) {
    const xml = buildCategoryFeedXml(category, publishedEpisodes);
    await writeFile(path.join(FEED_OUT_DIR, `${category.slug}.xml`), xml, 'utf8');
  }

  try {
    await mkdir(DIST_OUT_DIR, { recursive: true });
    await writeFile(path.join(DIST_OUT_DIR, 'main.xml'), buildMainFeedXml(categories, publishedEpisodes), 'utf8');
    for (const category of categories) {
      const xml = buildCategoryFeedXml(category, publishedEpisodes);
      await writeFile(path.join(DIST_OUT_DIR, `${category.slug}.xml`), xml, 'utf8');
    }
  } catch {
    // dist/ does not exist during rss-only runs; writing public feeds is enough.
  }

  return {
    categories,
    episodes: publishedEpisodes,
  };
}
