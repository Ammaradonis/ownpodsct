export const siteConfig = {
  title: 'Archive Signal',
  description:
    'A static-first podcast network powered by Astro, Archive.org, and a manual RSS pipeline.',
  siteUrl: process.env.SITE_URL ?? 'https://podcast.example.com',
  author: 'Archive Signal Studio',
  owner: {
    name: 'Archive Signal Studio',
    email: 'hello@podcast.example.com',
  },
  language: 'en-us',
  themeColor: '#0d5c63',
  pageSize: 20,
  mainFeedPath: '/feeds/main.xml',
};

export function absoluteUrl(pathname = '/') {
  if (!pathname) {
    return siteConfig.siteUrl;
  }

  if (/^https?:\/\//.test(pathname)) {
    return pathname;
  }

  return new URL(pathname, siteConfig.siteUrl).toString();
}
