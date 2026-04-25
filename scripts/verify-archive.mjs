import { parseArgs } from 'node:util';

import { loadEpisodes } from './lib/content.mjs';

async function verifyUrl(url) {
  const headResponse = await fetch(url, {
    method: 'HEAD',
    redirect: 'follow',
  });

  const rangeResponse = await fetch(url, {
    headers: {
      Range: 'bytes=0-1',
    },
    redirect: 'follow',
  });

  const headOk = headResponse.ok;
  const rangeOk = rangeResponse.status === 206 || rangeResponse.ok;
  const acceptRanges = headResponse.headers.get('accept-ranges') ?? rangeResponse.headers.get('accept-ranges');

  return {
    url,
    headStatus: headResponse.status,
    rangeStatus: rangeResponse.status,
    acceptRanges,
    ok: headOk && rangeOk && String(acceptRanges).toLowerCase().includes('bytes'),
  };
}

function collectUrlsForEpisode(episode) {
  const urls = [episode.media.primary_url];
  if (episode.video?.enabled && episode.video.url) {
    urls.push(episode.video.url);
  }
  return urls;
}

const {
  positionals,
  values: { url },
} = parseArgs({
  allowPositionals: true,
  options: {
    url: {
      type: 'string',
    },
  },
});

const target = url ?? positionals[0];

if (!target) {
  console.error('Usage: node scripts/verify-archive.mjs <archive_identifier|episode_id|url>');
  process.exit(1);
}

const episodes = await loadEpisodes();
const matchingEpisode =
  episodes.find((episode) => episode.archive_identifier === target) ??
  episodes.find((episode) => episode.id === target) ??
  episodes.find((episode) => episode.slug === target);

const urls = matchingEpisode
  ? collectUrlsForEpisode(matchingEpisode)
  : /^https?:\/\//.test(target)
    ? [target]
    : [];

if (!urls.length) {
  console.error(`No episode or URL found for "${target}".`);
  process.exit(1);
}

let hasFailure = false;
for (const candidate of urls) {
  try {
    const result = await verifyUrl(candidate);
    console.log(
      `${result.ok ? 'OK' : 'FAIL'} ${result.url} HEAD=${result.headStatus} RANGE=${result.rangeStatus} ACCEPT-RANGES=${result.acceptRanges ?? 'missing'}`,
    );
    if (!result.ok) {
      hasFailure = true;
    }
  } catch (error) {
    hasFailure = true;
    console.error(`FAIL ${candidate} ${error.message}`);
  }
}

if (hasFailure) {
  process.exit(1);
}
