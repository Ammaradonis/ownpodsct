import { describe, expect, it } from 'vitest';

import { validateContent } from '../scripts/lib/validation.mjs';

describe('content validation', () => {
  it('has no blocking validation errors', async () => {
    const result = await validateContent();

    expect(result.errors).toEqual([]);
    expect(result.categories.length).toBeGreaterThan(0);
    expect(result.episodes.length).toBeGreaterThan(0);
  });
});
