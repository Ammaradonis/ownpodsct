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

  const acceptRanges = headResponse.headers.get('accept-ranges') ?? rangeResponse.headers.get('accept-ranges');
  return (
    headResponse.ok &&
    (rangeResponse.status === 206 || rangeResponse.ok) &&
    String(acceptRanges).toLowerCase().includes('bytes')
  );
}

const episodes = await loadEpisodes();
let failures = 0;

for (const episode of episodes.filter((entry) => entry.status === 'published')) {
  const urls = [episode.media.primary_url];
  if (episode.video?.enabled && episode.video.url) {
    urls.push(episode.video.url);
  }

  for (const url of urls) {
    try {
      const ok = await verifyUrl(url);
      console.log(`${ok ? 'OK' : 'FAIL'} ${episode.id} ${url}`);
      if (!ok) {
        failures += 1;
      }
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${episode.id} ${url} ${error.message}`);
    }
  }
}

if (failures > 0) {
  process.exit(1);
}
