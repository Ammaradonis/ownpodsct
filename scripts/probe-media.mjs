import { parseArgs } from 'node:util';

import { probeMedia } from './lib/media.mjs';

const { positionals } = parseArgs({
  allowPositionals: true,
});

const filePath = positionals[0];

if (!filePath) {
  console.error('Usage: node scripts/probe-media.mjs <file>');
  process.exit(1);
}

const result = await probeMedia(filePath);
console.log(JSON.stringify(result, null, 2));
