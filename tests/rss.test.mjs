import { describe, expect, it } from 'vitest';
import { XMLParser } from 'fast-xml-parser';

import { buildCategoryFeedXml, buildMainFeedXml } from '../scripts/lib/feed.mjs';
import { loadCategories, loadEpisodes } from '../scripts/lib/content.mjs';

const parser = new XMLParser({
  ignoreAttributes: false,
});

describe('RSS generation', () => {
  it('builds a combined main feed', async () => {
    const categories = await loadCategories();
    const episodes = await loadEpisodes();
    const xml = buildMainFeedXml(categories, episodes);
    const parsed = parser.parse(xml);

    expect(parsed.rss.channel.title).toContain('Archive Signal');
    expect(parsed.rss.channel.item.length).toBeGreaterThan(0);
    expect(parsed.rss.channel['atom:link']['@_rel']).toBe('self');
  });

  it('builds per-show feeds with matching metadata', async () => {
    const categories = await loadCategories();
    const episodes = await loadEpisodes();
    const category = categories.find((entry) => entry.slug === 'the-deep-end');
    const xml = buildCategoryFeedXml(category, episodes);
    const parsed = parser.parse(xml);

    expect(parsed.rss.channel.title).toBe('The Deep End');
    expect(parsed.rss.channel['itunes:author']).toBe('Jane Doe');
    expect(parsed.rss.channel.item.length).toBeGreaterThan(0);
  });
});
