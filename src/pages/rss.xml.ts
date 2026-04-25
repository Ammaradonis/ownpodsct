import { buildMainFeedXml } from '../../scripts/lib/feed.mjs';
import { loadCategories, loadEpisodes } from '../../scripts/lib/content.mjs';

export async function GET() {
  const categories = await loadCategories();
  const episodes = await loadEpisodes();
  const xml = buildMainFeedXml(categories, episodes);

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
}
