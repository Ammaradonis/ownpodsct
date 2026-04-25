import { writeFeeds } from './lib/feed.mjs';

const { categories, episodes } = await writeFeeds();

console.log(`Generated main feed plus ${categories.length} show feeds for ${episodes.length} published episodes.`);
