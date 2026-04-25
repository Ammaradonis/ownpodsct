import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL ?? 'https://podcast.example.com';

export default defineConfig({
  site,
  output: 'static',
  build: {
    format: 'directory',
  },
  devToolbar: {
    enabled: false,
  },
  vite: {
    css: {
      postcss: './postcss.config.cjs',
    },
  },
});
