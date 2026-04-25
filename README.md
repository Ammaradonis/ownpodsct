# Archive Signal

Static-first podcast publishing platform built on Astro, Archive.org, and Netlify.

## Stack

- Astro 5 for static rendering
- JSON content collections with Zod validation
- Manual RSS generation via `xmlbuilder2`
- Archive.org for media hosting
- Netlify-ready deploy configuration

## Quick Start

```bash
npm install
npm run validate
npm run build
npm run dev
```

## Commands

- `npm run dev` starts Astro locally
- `npm run validate` checks content schemas, references, chapters, and GUID stability
- `npm run build` builds the site, feeds, sitemap, and Pagefind index
- `npm run rss` regenerates `/public/feeds/*.xml`
- `npm run sitemap` regenerates `sitemap.xml`
- `npm run new:episode -- --show the-deep-end --title "Episode Title" --media ./episode.mp3`
- `npm run verify:archive` checks every published Archive.org media URL
- `npm run test` runs the Vitest suite

## Publishing

The publishing workflow is documented in [docs/PUBLISHING.md](/C:/Users/FingerWeg/CascadeProjects/podcast/docs/PUBLISHING.md).

## Environment

- `SITE_URL` overrides the canonical site URL during builds
- `ALLOW_GUID_LOCK_WRITE=1` is not required; use `npm run validate -- --update-guid-lock` instead

## Notes

- `public/feeds/` is generated and excluded from version control.
- Replace the SVG sample art with compliant 1400-3000px JPG or PNG files before submitting feeds to Apple Podcasts.
