import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { create } from 'xmlbuilder2';

import { getPublishedEpisodes, getTags, loadCategories, loadEpisodes } from './content.mjs';
import { absoluteUrl, siteConfig } from './site-config.mjs';
import { slugify } from './media.mjs';

const PUBLIC_SITEMAP_PATH = path.resolve('public/sitemap.xml');
const DIST_SITEMAP_PATH = path.resolve('dist/sitemap.xml');

function buildUrlEntry(urlset, loc, lastmod) {
  const node = urlset.ele('url');
  node.ele('loc').txt(loc);
  if (lastmod) {
    node.ele('lastmod').txt(new Date(lastmod).toISOString());
  }
}

export async function buildSitemapXml() {
  const categories = await loadCategories();
  const episodes = getPublishedEpisodes(await loadEpisodes());
  const tagStats = getTags(categories, episodes);

  const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele('urlset', {
    xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9',
  });

  buildUrlEntry(doc, absoluteUrl('/'), new Date().toISOString());
  buildUrlEntry(doc, absoluteUrl('/about/'), new Date().toISOString());
  buildUrlEntry(doc, absoluteUrl('/search/'), new Date().toISOString());
  buildUrlEntry(doc, absoluteUrl('/shows/'), new Date().toISOString());
  buildUrlEntry(doc, absoluteUrl('/rss.xml'), new Date().toISOString());
  buildUrlEntry(doc, absoluteUrl(siteConfig.mainFeedPath), new Date().toISOString());

  for (const category of categories) {
    buildUrlEntry(doc, absoluteUrl(`/shows/${category.slug}/`), category.created_at);
    buildUrlEntry(doc, absoluteUrl(`/feeds/${category.slug}.xml`), new Date().toISOString());

    const categoryEpisodes = episodes.filter((episode) => episode.category_id === category.id);
    const pageCount = Math.ceil(categoryEpisodes.length / siteConfig.pageSize);
    for (let page = 2; page <= pageCount; page += 1) {
      buildUrlEntry(doc, absoluteUrl(`/shows/${category.slug}/page/${page}/`), new Date().toISOString());
    }
  }

  for (const episode of episodes) {
    const category = categories.find((item) => item.id === episode.category_id);
    if (category) {
      buildUrlEntry(
        doc,
        absoluteUrl(`/shows/${category.slug}/${episode.slug}/`),
        episode.publish_date,
      );
    }
  }

  for (const tagStat of tagStats) {
    buildUrlEntry(doc, absoluteUrl(`/tags/${slugify(tagStat.tag)}/`), new Date().toISOString());
  }

  return doc.end({ prettyPrint: true });
}

export async function writeSitemap() {
  const xml = await buildSitemapXml();

  await mkdir(path.dirname(PUBLIC_SITEMAP_PATH), { recursive: true });
  await writeFile(PUBLIC_SITEMAP_PATH, xml, 'utf8');

  try {
    await mkdir(path.dirname(DIST_SITEMAP_PATH), { recursive: true });
    await writeFile(DIST_SITEMAP_PATH, xml, 'utf8');
  } catch {
    // Dist may not exist yet; public output still supports local workflows.
  }

  return xml;
}
