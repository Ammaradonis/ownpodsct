import { expect, test } from '@playwright/test';

test('episode page renders a media player', async ({ page }) => {
  await page.goto('/shows/the-deep-end/antikythera-mechanism/');

  await expect(page.locator('h1')).toContainText('The Antikythera Mechanism');
  await expect(page.locator('[data-player]')).toBeVisible();
  await expect(page.locator('[data-media]')).toHaveAttribute('src', /archive\.org/);
  await expect(page.locator('text=Jump to a chapter')).toBeVisible();
});
