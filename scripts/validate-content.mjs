import { parseArgs } from 'node:util';

import { validateContent } from './lib/validation.mjs';

const {
  values: { 'update-guid-lock': updateGuidLock },
} = parseArgs({
  options: {
    'update-guid-lock': {
      type: 'boolean',
      default: false,
    },
  },
});

const result = await validateContent({ updateGuidLock });

for (const warning of result.warnings) {
  console.warn(`Warning: ${warning}`);
}

if (result.errors.length) {
  for (const error of result.errors) {
    console.error(`Error: ${error}`);
  }
  process.exit(1);
}

console.log(
  `Validated ${result.categories.length} categories and ${result.episodes.length} episodes successfully.`,
);
