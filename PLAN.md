# PLAN.md — Custom Podcast Platform (Archive.org + Netlify + JAMstack)

> **Status:** Production-ready implementation plan
> **Last updated:** 2026-04-24
> **Target audience:** Full-stack developers implementing the platform from scratch
> **Core constraint:** Zero recurring hosting cost for media; no paid podcast hosts; no no-code RSS generators.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Technology Decisions](#2-technology-decisions)
3. [Content Model Design](#3-content-model-design)
4. [Archive.org Integration Strategy](#4-archiveorg-integration-strategy)
5. [RSS Feed (Manual Build)](#5-rss-feed-manual-build)
6. [Frontend Architecture](#6-frontend-architecture)
7. [File & Folder Structure](#7-file--folder-structure)
8. [Deployment Workflow (Netlify)](#8-deployment-workflow-netlify)
9. [Content Publishing Workflow](#9-content-publishing-workflow)
10. [Scalability Considerations](#10-scalability-considerations)
11. [Optional Enhancements](#11-optional-enhancements)
12. [Automation Opportunities](#12-automation-opportunities)
13. [Risks & Limitations](#13-risks--limitations)
14. [Future Expansion Paths](#14-future-expansion-paths)

---

## 1. High-Level Architecture

### 1.1 System Diagram (textual)

```
┌────────────────────────────────────────────────────────────────────────┐
│                         CONTENT PRODUCTION                             │
│  ┌────────────┐   ┌────────────────┐   ┌─────────────────────────────┐ │
│  │  Record    │──▶│  Edit (DAW /   │──▶│  Export MP3 (audio) /       │ │
│  │  episode   │   │   NLE)         │   │  MP4 (video) with metadata  │ │
│  └────────────┘   └────────────────┘   └──────────────┬──────────────┘ │
└─────────────────────────────────────────────────────────┼──────────────┘
                                                          ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     MEDIA STORAGE (Archive.org)                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Upload via: web UI, `ia` CLI, or S3-like API                    │  │
│  │  Identifier: <show-slug>-<episode-slug>-<YYYYMMDD>               │  │
│  │  Direct URLs: https://archive.org/download/<id>/<file>.mp3       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ (direct file URLs)
                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    SOURCE OF TRUTH (Git repo)                          │
│  ┌────────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  │ /data/categories/  │  │ /data/episodes/  │  │  /scripts/       │    │
│  │   *.json           │  │   *.json         │  │  build-rss.mjs   │    │
│  └────────────────────┘  └──────────────────┘  └──────────────────┘    │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ (git push → Netlify webhook)
                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      BUILD PIPELINE (Netlify)                          │
│   1. npm ci                                                            │
│   2. node scripts/validate-content.mjs     (schema + URL checks)       │
│   3. astro build                            (static HTML/CSS/JS)        │
│   4. node scripts/build-rss.mjs            (emit /public/feeds/*.xml)   │
│   5. node scripts/build-sitemap.mjs                                    │
│   6. publish /dist                                                     │
└───────────────────────────────┬────────────────────────────────────────┘
                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         DISTRIBUTION (CDN)                             │
│  Netlify edge  ───▶  Website (HTML/player)                             │
│                 ───▶  /feeds/main.xml (Apple/Spotify/Google ingest)    │
│                 ───▶  /feeds/<show>.xml (per-show feeds)               │
│  Archive.org   ───▶  Byte-range streamed MP3/MP4 to the player         │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow (sequence)

1. **Produce:** Record episode locally. Export MP3 (CBR 128 kbps mono, or 96 kbps stereo) or MP4 (H.264 + AAC).
2. **Stage:** Run `scripts/probe-media.mjs <file>` to extract duration, bitrate, size, and sha256.
3. **Upload:** Push file to Archive.org with `ia upload <identifier> <file> --metadata=...`. Use a stable identifier.
4. **Register:** Add a new JSON file under `/data/episodes/<show>-<slug>.json` referencing the Archive.org URL plus the probed metadata.
5. **Commit:** `git commit && git push`.
6. **Build:** Netlify rebuilds — validates JSON, regenerates RSS, prerenders HTML.
7. **Distribute:** Listeners hit the website (HTML served by Netlify CDN). Audio bytes stream directly from `archive.org/download/...` (range requests). Podcast directories poll `/feeds/main.xml` on an interval.

### 1.3 Separation of Concerns

| Layer | Responsibility | Technology |
|-------|----------------|------------|
| **Content** | The facts about episodes (title, url, date) | JSON files in Git |
| **Storage** | Binary bytes of media | Archive.org |
| **Presentation** | HTML/CSS/JS the browser renders | Astro + vanilla JS |
| **Distribution** | Getting content to listeners/apps | Netlify CDN + RSS XML |
| **Validation** | Guaranteeing correctness pre-publish | Zod schemas + build scripts |

Each layer is independently replaceable: swap Archive.org for R2 without touching presentation; swap Astro for Eleventy without touching the content model; swap Netlify for Cloudflare Pages without touching anything but DNS.

---

## 2. Technology Decisions

### 2.1 Framework: **Astro** (chosen)

**Decision:** Use [Astro](https://astro.build) as the static site generator.

**Why Astro over alternatives:**

| Option | Verdict | Reasoning |
|--------|---------|-----------|
| **Astro** | ✅ Chosen | Content Collections with Zod validation, partial hydration (islands) keeps JS minimal, first-class Markdown + JSON support, native Netlify adapter, MPA by default (great SEO), active ecosystem. |
| Next.js (static export) | ❌ | Overkill for a content site; React runtime ships by default; static export has edge-case quirks for dynamic routes. |
| Eleventy | ⚠️ Runner-up | Zero-JS philosophy is appealing, but lacks built-in typed content schemas; more plumbing required. |
| Vanilla HTML/CSS/JS | ❌ | Viable for <20 episodes; becomes painful at scale (no templating, no content validation, manual page generation per episode). |
| Hugo | ⚠️ | Extremely fast builds, but Go templating is awkward for complex data transforms; JSON ingestion is clunkier than Astro's Content Collections. |
| SvelteKit | ❌ | Great framework, but heavier default JS payload and less mature static-only story than Astro. |

**Key Astro features we rely on:**
- **Content Collections** (`src/content/config.ts`) — typed JSON/MD schemas via Zod; build fails on bad data.
- **Dynamic routes** (`src/pages/[category]/[slug].astro`) — one template, thousands of pages.
- **Islands** (`client:visible`) — only the audio/video player ships JS; the rest is static HTML.
- **`getStaticPaths`** — pre-renders every episode page at build time.

### 2.2 Styling: **Vanilla CSS with Custom Properties + PostCSS**

**Decision:** No Tailwind, no CSS-in-JS. Use modern CSS.

**Why:**
- Modern CSS (nesting, `:has()`, container queries, `color-mix()`) covers 95% of styling needs.
- Custom properties (`--color-bg`, `--space-4`) enable dark mode and theming with zero JS.
- Astro scopes component styles automatically — no BEM/class-collision fights.
- PostCSS via `postcss-preset-env` autoprefixes and polyfills where needed.
- Zero runtime cost; smaller CSS bundle than utility frameworks at this scale.

**Fallback:** If the team prefers utility CSS, swap in Tailwind v4 (CSS-first config, no PostCSS plugin). Not recommended as default — pure CSS is less noise.

### 2.3 Build Tooling

| Tool | Role |
|------|------|
| **Node.js 22 LTS** | Runtime for build scripts |
| **npm** (or pnpm) | Dependency manager; lockfile committed |
| **Astro 5** | Static site generator |
| **Zod** | Runtime schema validation for JSON content |
| **fast-xml-parser** | RSS XML parsing for round-trip tests |
| **xmlbuilder2** | Generating valid RSS XML (proper escaping, CDATA) |
| **Playwright** (optional) | End-to-end tests: "every episode page loads and player mounts" |
| **Vitest** | Unit tests for `build-rss.mjs` |

### 2.4 Data Source: **Static JSON in Git**

**Decision:** Content lives as JSON files under `/src/content/` committed to the repo.

**Why not a Git-based CMS (Decap/Netlify CMS, Sveltia CMS, TinaCMS)?**
- None are required for MVP; adds UI complexity.
- Raw JSON editing is trivial for developer-operators.
- A CMS can be layered on later (Decap plugs into the exact same files).

**Why not a headless CMS (Sanity, Contentful, Strapi)?**
- Introduces vendor lock-in and a runtime dependency.
- Free tiers have episode/request limits that break the "near-free" constraint at scale.
- Git history + JSON diffs is a perfect audit log for free.

**Recommendation:** Start with JSON-in-Git. Add [Decap CMS](https://decapcms.org/) later as a thin editing UI if non-developers need to publish.

### 2.5 Cost Analysis

| Component | Cost | Notes |
|-----------|------|-------|
| Netlify hosting | $0 | Free tier: 100 GB bandwidth, 300 build minutes/mo |
| Archive.org storage | $0 | No storage or bandwidth cost for qualifying public media |
| Domain | ~$10–$15/yr | Optional; Netlify subdomain is free |
| Build tooling | $0 | All OSS |
| **Total** | **$0–$15/yr** | |

At scale (>100 GB Netlify egress/month): upgrade to Netlify Pro ($19/mo) **or** front the site with Cloudflare's free proxy (unlimited bandwidth). Media bytes never count against Netlify — they stream from Archive.org.

---

## 3. Content Model Design

### 3.1 Design Principles

- **Flat over nested:** one file per entity. Easy to diff, easy to merge.
- **Stable IDs:** use slugs that never change once published. Renaming breaks RSS GUIDs.
- **Denormalize for build, normalize in source:** the JSON source uses `category_id` references; Astro joins them at build time.
- **Everything validatable:** every field has a Zod rule.

### 3.2 Schema: Category (Show / Series)

**File:** `src/content/categories/<slug>.json`

```json
{
  "id": "the-deep-end",
  "title": "The Deep End",
  "slug": "the-deep-end",
  "description": "Long-form interviews with underwater archaeologists.",
  "description_html": "<p>Long-form interviews with underwater archaeologists. New episodes biweekly.</p>",
  "author": "Jane Doe",
  "owner": {
    "name": "Jane Doe",
    "email": "jane@example.com"
  },
  "language": "en-us",
  "categories_itunes": ["Science", "Science:Natural Sciences"],
  "explicit": false,
  "cover_art": {
    "url": "/images/covers/the-deep-end-3000.jpg",
    "width": 3000,
    "height": 3000
  },
  "color": "#0a3d62",
  "website_url": "https://podcast.example.com/shows/the-deep-end",
  "tags": ["archaeology", "ocean", "science"],
  "type": "episodic",
  "copyright": "© 2026 Jane Doe",
  "created_at": "2026-01-15T00:00:00Z",
  "featured": true,
  "sort_order": 1
}
```

### 3.3 Schema: Episode

**File:** `src/content/episodes/<slug>.json` (one file per episode)

```json
{
  "id": "the-deep-end-antikythera-2026-04-20",
  "slug": "antikythera-mechanism",
  "category_id": "the-deep-end",
  "season": 2,
  "episode_number": 14,
  "episode_type": "full",
  "title": "The Antikythera Mechanism: Diving for Ancient Computers",
  "subtitle": "How a 1901 sponge-diving accident rewrote computing history.",
  "description": "We sit down with Dr. Maria Katsaros to discuss the 2024 expedition that recovered new fragments of the Antikythera mechanism...",
  "description_html": "<p>We sit down with Dr. Maria Katsaros...</p><h3>Chapters</h3><ul>...</ul>",
  "summary": "Dr. Katsaros on the 2024 Antikythera expedition.",
  "publish_date": "2026-04-20T14:00:00Z",
  "duration_seconds": 3847,
  "media": {
    "type": "audio",
    "primary_url": "https://archive.org/download/the-deep-end-ep14-20260420/the-deep-end-ep14-antikythera.mp3",
    "mime_type": "audio/mpeg",
    "file_size_bytes": 61552384,
    "bitrate_kbps": 128,
    "sample_rate_hz": 44100,
    "channels": 2,
    "sha256": "f3a9...c201"
  },
  "video": {
    "enabled": true,
    "url": "https://archive.org/download/the-deep-end-ep14-20260420/the-deep-end-ep14-antikythera.mp4",
    "mime_type": "video/mp4",
    "file_size_bytes": 524288000,
    "resolution": "1920x1080"
  },
  "archive_identifier": "the-deep-end-ep14-20260420",
  "archive_url": "https://archive.org/details/the-deep-end-ep14-20260420",
  "transcript_url": "/transcripts/the-deep-end/ep14.vtt",
  "chapters": [
    { "start_seconds": 0,    "title": "Cold open" },
    { "start_seconds": 127,  "title": "Guest introduction" },
    { "start_seconds": 420,  "title": "The 1901 discovery" },
    { "start_seconds": 1824, "title": "2024 expedition findings" },
    { "start_seconds": 3320, "title": "What's next" }
  ],
  "show_notes_markdown": "## Links\n- [Antikythera Mechanism Research Project](https://example.org)\n- ...",
  "guests": [
    { "name": "Dr. Maria Katsaros", "role": "Marine Archaeologist", "url": "https://example.org/katsaros" }
  ],
  "tags": ["archaeology", "greece", "computing-history"],
  "explicit": false,
  "episode_art": {
    "url": "/images/episodes/the-deep-end-ep14.jpg",
    "width": 1400,
    "height": 1400
  },
  "status": "published"
}
```

### 3.4 Zod Schema (authoritative)

**File:** `src/content/config.ts`

```typescript
import { defineCollection, z } from 'astro:content';

const categorySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(255),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().min(1).max(4000),
  description_html: z.string().optional(),
  author: z.string(),
  owner: z.object({ name: z.string(), email: z.string().email() }),
  language: z.string().default('en-us'),
  categories_itunes: z.array(z.string()).min(1),
  explicit: z.boolean().default(false),
  cover_art: z.object({
    url: z.string(),
    width: z.number().min(1400),
    height: z.number().min(1400),
  }),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  website_url: z.string().url().optional(),
  tags: z.array(z.string()).default([]),
  type: z.enum(['episodic', 'serial']).default('episodic'),
  copyright: z.string().optional(),
  created_at: z.string().datetime(),
  featured: z.boolean().default(false),
  sort_order: z.number().default(100),
});

const episodeSchema = z.object({
  id: z.string(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  category_id: z.string(),
  season: z.number().int().positive().optional(),
  episode_number: z.number().int().positive().optional(),
  episode_type: z.enum(['full', 'trailer', 'bonus']).default('full'),
  title: z.string().min(1).max(255),
  subtitle: z.string().max(255).optional(),
  description: z.string().min(1),
  description_html: z.string().optional(),
  summary: z.string().max(4000).optional(),
  publish_date: z.string().datetime(),
  duration_seconds: z.number().int().positive(),
  media: z.object({
    type: z.enum(['audio', 'video']),
    primary_url: z.string().url().startsWith('https://archive.org/'),
    mime_type: z.enum(['audio/mpeg', 'audio/mp4', 'video/mp4']),
    file_size_bytes: z.number().int().positive(),
    bitrate_kbps: z.number().int().positive().optional(),
    sample_rate_hz: z.number().int().positive().optional(),
    channels: z.number().int().min(1).max(2).optional(),
    sha256: z.string().length(64).optional(),
  }),
  video: z.object({
    enabled: z.boolean(),
    url: z.string().url().optional(),
    mime_type: z.string().optional(),
    file_size_bytes: z.number().int().optional(),
    resolution: z.string().optional(),
  }).optional(),
  archive_identifier: z.string(),
  archive_url: z.string().url(),
  transcript_url: z.string().optional(),
  chapters: z.array(z.object({
    start_seconds: z.number().int().nonnegative(),
    title: z.string(),
  })).default([]),
  show_notes_markdown: z.string().optional(),
  guests: z.array(z.object({
    name: z.string(),
    role: z.string().optional(),
    url: z.string().url().optional(),
  })).default([]),
  tags: z.array(z.string()).default([]),
  explicit: z.boolean().default(false),
  episode_art: z.object({
    url: z.string(),
    width: z.number(),
    height: z.number(),
  }).optional(),
  status: z.enum(['draft', 'published', 'archived']).default('published'),
});

export const collections = {
  categories: defineCollection({ type: 'data', schema: categorySchema }),
  episodes: defineCollection({ type: 'data', schema: episodeSchema }),
};
```

### 3.5 Referential Integrity

The build step `scripts/validate-content.mjs` enforces:
- Every `episode.category_id` matches an existing `category.id`.
- No duplicate `episode.id` or `slug` within the same category.
- No duplicate `archive_identifier`.
- `publish_date` is not in the future beyond `+24h` (guards typos).
- All `primary_url` values return HTTP 200 + `Accept-Ranges: bytes` (run once weekly via GitHub Action, not per build).

---

## 4. Archive.org Integration Strategy

### 4.1 Why Archive.org

**Pros:**
- Free, unlimited public hosting with no egress fees.
- Stable URLs (items rarely move; redirects preserve them when they do).
- Native byte-range support → streaming works in any HTML5 audio/video element.
- Built-in transcoding (Archive auto-generates derivative formats — useful but optional).
- Global CDN via their backend.
- Preservation guarantee aligns with long-term content.

**Cons:**
- No SLA; occasional downtime.
- Slower TTFB than commercial CDNs (typically 200–800ms first byte; fine for podcast apps, noticeable in browser).
- Rate-limited for aggressive scraping (not an issue for podcast playback).
- Upload can be slow (~5–15 MB/s from most connections).
- Metadata is public — so is every file. Archive.org is not for private content.

### 4.2 Account & Tooling Setup

1. Create a free account at https://archive.org/account/signup.
2. Generate S3-like API keys: https://archive.org/account/s3.php → copy `access` and `secret` keys.
3. Install the CLI:
   ```bash
   pip install internetarchive
   ia configure   # enter keys
   ```
4. Test:
   ```bash
   ia whoami
   ```

### 4.3 Naming Conventions

**Archive.org identifier** (the URL slug after `/details/` or `/download/`):

```
<show-slug>-<season>-<episode-number>-<YYYYMMDD>
```

Examples:
- `the-deep-end-s02e14-20260420`
- `dev-talks-s01e03-20260115`
- `bonus-roundtable-20260301` (for one-offs with no show)

**Rules:**
- Lowercase only.
- Hyphens, not underscores.
- Must be unique across all of Archive.org.
- 3–100 characters.
- Cannot be changed after creation → choose carefully.

**Filename within the item:**

```
<show-slug>-<episode-number>-<short-title>.<ext>
```

Example: `the-deep-end-ep14-antikythera.mp3`

Keep filenames ASCII, lowercase, hyphen-separated. Archive.org preserves the filename as-is in the direct URL.

### 4.4 Upload Workflow

**Option A: Web UI (simplest, slowest)**

1. Go to https://archive.org/create.
2. Choose "Audio" or "Movies" media type.
3. Upload files.
4. Fill metadata (see §4.5).
5. Wait for processing (5–60 minutes for derivatives).

**Option B: `ia` CLI (recommended)**

```bash
ia upload the-deep-end-s02e14-20260420 \
  the-deep-end-ep14-antikythera.mp3 \
  the-deep-end-ep14-antikythera.mp4 \
  the-deep-end-ep14-cover.jpg \
  --metadata="mediatype:audio" \
  --metadata="collection:opensource_audio" \
  --metadata="title:The Deep End — Ep 14: The Antikythera Mechanism" \
  --metadata="creator:Jane Doe" \
  --metadata="date:2026-04-20" \
  --metadata="description:Long-form interview with Dr. Maria Katsaros..." \
  --metadata="subject:podcast;archaeology;antikythera" \
  --metadata="language:eng" \
  --metadata="licenseurl:https://creativecommons.org/licenses/by/4.0/"
```

**Option C: S3-compatible API (scriptable from CI)**

```bash
curl --location --upload-file ./episode.mp3 \
  -H "authorization: LOW <accesskey>:<secretkey>" \
  -H "x-archive-meta-mediatype:audio" \
  -H "x-archive-meta-title:The Deep End Ep 14" \
  "https://s3.us.archive.org/the-deep-end-s02e14-20260420/the-deep-end-ep14-antikythera.mp3"
```

### 4.5 Metadata Best Practices

Set these at upload (they populate the Archive page and are searchable):

| Metadata key | Value |
|--------------|-------|
| `mediatype` | `audio` (for MP3-only) or `movies` (for MP4) |
| `collection` | `opensource_audio` or `opensource_movies` (the general public collection) |
| `title` | Full episode title, including show name |
| `creator` | Podcast author / host |
| `date` | Publish date `YYYY-MM-DD` |
| `description` | Full episode description (HTML allowed) |
| `subject` | Semicolon-separated tags |
| `language` | ISO 639-2 code (`eng`, `spa`, etc.) |
| `licenseurl` | Link to CC license; omit if all rights reserved |
| `external-identifier` | `urn:episode:<id>` — links back to your JSON |

### 4.6 Direct URL Patterns

Archive.org provides multiple URL shapes — **use the download URL for RSS and players**:

| Purpose | URL pattern |
|---------|-------------|
| Human-readable item page | `https://archive.org/details/<identifier>` |
| **Direct file download (use this)** | `https://archive.org/download/<identifier>/<filename>` |
| Auto-derived format (e.g., VBR MP3) | `https://archive.org/download/<identifier>/<identifier>_vbr.mp3` |
| Metadata JSON (useful for scripts) | `https://archive.org/metadata/<identifier>` |

**Always use the file you uploaded**, not the derived version. Derivatives can be regenerated asynchronously and their URLs may change briefly.

### 4.7 Ensuring Streamability

Before uploading, verify the MP3/MP4 is streamable:

```bash
# MP3: moov atom / ID3 at start, CBR preferred for accurate seeking
ffprobe -v error -show_format -show_streams episode.mp3

# MP4: 'faststart' flag moves moov atom to the front
ffmpeg -i input.mp4 -c copy -movflags +faststart episode.mp4
```

For video especially, **`+faststart` is non-negotiable**. Without it, the browser must download the entire file before playback begins.

### 4.8 Verification Checklist Post-Upload

Run `scripts/verify-archive.mjs <identifier>` which:

1. `HEAD` the direct URL → expect `200` and `Accept-Ranges: bytes`.
2. Range-request first 512 KB → expect `206 Partial Content`.
3. Compare `Content-Length` vs `media.file_size_bytes` in JSON.
4. Optionally: `ffprobe` via HTTP to confirm codec/duration.

---

## 5. RSS Feed (Manual Build)

### 5.1 Podcast RSS Requirements (Apple Podcasts Spec)

Apple Podcasts is the de-facto standard; Spotify, Overcast, and Google Podcasts all accept Apple's tag set.

**Required at `<channel>` level:**
- `<title>` — show name
- `<link>` — show homepage
- `<description>` — show description
- `<language>` — BCP-47 (`en-us`)
- `<itunes:author>`
- `<itunes:category text="...">` (at least one)
- `<itunes:explicit>` (`true` / `false`)
- `<itunes:image href="..."/>` — ≥1400×1400, ≤3000×3000, JPG/PNG, sRGB
- `<itunes:owner>` with `<itunes:name>` and `<itunes:email>`

**Required at `<item>` level:**
- `<title>`
- `<enclosure url="..." length="..." type="audio/mpeg"/>` — **length is bytes, not seconds**
- `<guid isPermaLink="false">` — stable, never reuse
- `<pubDate>` — RFC 822 format: `Mon, 20 Apr 2026 14:00:00 +0000`
- `<itunes:duration>` — `HH:MM:SS` or seconds

**Strongly recommended:**
- `<itunes:episode>`, `<itunes:season>`, `<itunes:episodeType>`
- `<itunes:image href="..."/>` per-episode
- `<content:encoded>` — HTML show notes (wrap in `<![CDATA[...]]>`)
- `<itunes:summary>` (deprecated but many apps still use it)

### 5.2 Complete Sample RSS XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>The Deep End</title>
    <link>https://podcast.example.com/shows/the-deep-end</link>
    <atom:link href="https://podcast.example.com/feeds/the-deep-end.xml" rel="self" type="application/rss+xml"/>
    <description>Long-form interviews with underwater archaeologists.</description>
    <language>en-us</language>
    <copyright>© 2026 Jane Doe</copyright>
    <lastBuildDate>Mon, 20 Apr 2026 14:00:00 +0000</lastBuildDate>
    <pubDate>Mon, 20 Apr 2026 14:00:00 +0000</pubDate>

    <itunes:author>Jane Doe</itunes:author>
    <itunes:summary>Long-form interviews with underwater archaeologists.</itunes:summary>
    <itunes:type>episodic</itunes:type>
    <itunes:owner>
      <itunes:name>Jane Doe</itunes:name>
      <itunes:email>jane@example.com</itunes:email>
    </itunes:owner>
    <itunes:explicit>false</itunes:explicit>
    <itunes:image href="https://podcast.example.com/images/covers/the-deep-end-3000.jpg"/>
    <itunes:category text="Science">
      <itunes:category text="Natural Sciences"/>
    </itunes:category>

    <podcast:guid>c7e8d2a4-9f2c-4b1a-8e7f-1d2c3b4a5e6f</podcast:guid>
    <podcast:locked owner="jane@example.com">no</podcast:locked>

    <image>
      <url>https://podcast.example.com/images/covers/the-deep-end-3000.jpg</url>
      <title>The Deep End</title>
      <link>https://podcast.example.com/shows/the-deep-end</link>
    </image>

    <item>
      <title>Ep 14: The Antikythera Mechanism</title>
      <link>https://podcast.example.com/shows/the-deep-end/antikythera-mechanism</link>
      <guid isPermaLink="false">the-deep-end-antikythera-2026-04-20</guid>
      <pubDate>Mon, 20 Apr 2026 14:00:00 +0000</pubDate>
      <description><![CDATA[We sit down with Dr. Maria Katsaros...]]></description>
      <content:encoded><![CDATA[
        <p>We sit down with Dr. Maria Katsaros...</p>
        <h3>Chapters</h3>
        <ul>
          <li>00:00 — Cold open</li>
          <li>02:07 — Guest introduction</li>
          <li>07:00 — The 1901 discovery</li>
          <li>30:24 — 2024 expedition findings</li>
          <li>55:20 — What's next</li>
        </ul>
        <h3>Links</h3>
        <ul>
          <li><a href="https://example.org">Antikythera Mechanism Research Project</a></li>
        </ul>
      ]]></content:encoded>
      <enclosure
        url="https://archive.org/download/the-deep-end-s02e14-20260420/the-deep-end-ep14-antikythera.mp3"
        length="61552384"
        type="audio/mpeg"/>
      <itunes:duration>01:04:07</itunes:duration>
      <itunes:episode>14</itunes:episode>
      <itunes:season>2</itunes:season>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:explicit>false</itunes:explicit>
      <itunes:image href="https://podcast.example.com/images/episodes/the-deep-end-ep14.jpg"/>
      <itunes:author>Jane Doe</itunes:author>
      <itunes:subtitle>How a 1901 sponge-diving accident rewrote computing history.</itunes:subtitle>
      <itunes:summary>Dr. Katsaros on the 2024 Antikythera expedition.</itunes:summary>
    </item>

    <!-- Additional <item> entries here, newest first -->
  </channel>
</rss>
```

### 5.3 Common Validation Pitfalls

| Pitfall | Fix |
|---------|-----|
| `enclosure length` in seconds instead of bytes | Always use bytes; run `HEAD` + parse `Content-Length` |
| `pubDate` not RFC 822 | Always format as `Mon, 20 Apr 2026 14:00:00 +0000` (not ISO 8601) |
| `guid` reused or changed | Use a stable value like `<category>-<slug>-<publish_date>`; never mutate |
| Unescaped `&` in description | Always wrap HTML in `<![CDATA[...]]>` |
| Image < 1400×1400 | Apple rejects feeds on ingest |
| Missing `<atom:link rel="self">` | Required for feed self-reference |
| Feed > 4 MB | Paginate via `<atom:link rel="next">` or cap item count |
| Wrong `itunes:duration` format | Use `HH:MM:SS` (or seconds as an integer) |

### 5.4 Feed Strategy: Multi-Feed

Generate **one feed per category** plus one combined feed:

```
/feeds/main.xml             # all episodes across all shows (optional)
/feeds/the-deep-end.xml     # Show 1
/feeds/dev-talks.xml        # Show 2
...
```

Each show submits its own feed to directories. The combined feed is for the website's "latest across all shows" view if desired.

### 5.5 RSS Generator Script

**File:** `scripts/build-rss.mjs`

```javascript
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { create } from 'xmlbuilder2';
import path from 'node:path';

const SITE_URL = process.env.SITE_URL || 'https://podcast.example.com';
const CONTENT_DIR = path.resolve('src/content');
const OUT_DIR = path.resolve('public/feeds');

function rfc822(iso) {
  return new Date(iso).toUTCString().replace('GMT', '+0000');
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

async function loadJSON(dir) {
  const files = await readdir(dir);
  return Promise.all(
    files
      .filter(f => f.endsWith('.json'))
      .map(async f => JSON.parse(await readFile(path.join(dir, f), 'utf8')))
  );
}

async function buildFeed(category, episodes) {
  const items = episodes
    .filter(ep => ep.category_id === category.id && ep.status === 'published')
    .sort((a, b) => new Date(b.publish_date) - new Date(a.publish_date));

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('rss', {
      version: '2.0',
      'xmlns:itunes': 'http://www.itunes.com/dtds/podcast-1.0.dtd',
      'xmlns:content': 'http://purl.org/rss/1.0/modules/content/',
      'xmlns:atom': 'http://www.w3.org/2005/Atom',
    });

  const ch = doc.ele('channel');
  ch.ele('title').txt(category.title);
  ch.ele('link').txt(`${SITE_URL}/shows/${category.slug}`);
  ch.ele('atom:link', {
    href: `${SITE_URL}/feeds/${category.slug}.xml`,
    rel: 'self',
    type: 'application/rss+xml',
  });
  ch.ele('description').txt(category.description);
  ch.ele('language').txt(category.language);
  if (category.copyright) ch.ele('copyright').txt(category.copyright);
  ch.ele('lastBuildDate').txt(rfc822(new Date().toISOString()));
  ch.ele('itunes:author').txt(category.author);
  ch.ele('itunes:summary').txt(category.description);
  ch.ele('itunes:type').txt(category.type);
  const owner = ch.ele('itunes:owner');
  owner.ele('itunes:name').txt(category.owner.name);
  owner.ele('itunes:email').txt(category.owner.email);
  ch.ele('itunes:explicit').txt(String(category.explicit));
  ch.ele('itunes:image', { href: `${SITE_URL}${category.cover_art.url}` });
  for (const cat of category.categories_itunes) {
    const [top, sub] = cat.split(':');
    const el = ch.ele('itunes:category', { text: top });
    if (sub) el.ele('itunes:category', { text: sub });
  }

  for (const ep of items) {
    const item = ch.ele('item');
    item.ele('title').txt(ep.title);
    item.ele('link').txt(`${SITE_URL}/shows/${category.slug}/${ep.slug}`);
    item.ele('guid', { isPermaLink: 'false' }).txt(ep.id);
    item.ele('pubDate').txt(rfc822(ep.publish_date));
    item.ele('description').dat(ep.description);
    if (ep.description_html) {
      item.ele('content:encoded').dat(ep.description_html);
    }
    item.ele('enclosure', {
      url: ep.media.primary_url,
      length: String(ep.media.file_size_bytes),
      type: ep.media.mime_type,
    });
    item.ele('itunes:duration').txt(formatDuration(ep.duration_seconds));
    if (ep.episode_number) item.ele('itunes:episode').txt(String(ep.episode_number));
    if (ep.season) item.ele('itunes:season').txt(String(ep.season));
    item.ele('itunes:episodeType').txt(ep.episode_type);
    item.ele('itunes:explicit').txt(String(ep.explicit));
    if (ep.episode_art) {
      item.ele('itunes:image', { href: `${SITE_URL}${ep.episode_art.url}` });
    }
    if (ep.subtitle) item.ele('itunes:subtitle').txt(ep.subtitle);
    if (ep.summary) item.ele('itunes:summary').txt(ep.summary);
  }

  return doc.end({ prettyPrint: true });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const categories = await loadJSON(path.join(CONTENT_DIR, 'categories'));
  const episodes = await loadJSON(path.join(CONTENT_DIR, 'episodes'));

  for (const cat of categories) {
    const xml = await buildFeed(cat, episodes);
    await writeFile(path.join(OUT_DIR, `${cat.slug}.xml`), xml, 'utf8');
    console.log(`✓ feeds/${cat.slug}.xml (${episodes.filter(e => e.category_id === cat.id).length} items)`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

Wire it into the Astro build via `package.json`:

```json
{
  "scripts": {
    "build": "node scripts/validate-content.mjs && astro build && node scripts/build-rss.mjs"
  }
}
```

### 5.6 Validating the Feed

- **Apple:** https://podcastsconnect.apple.com/ → "Validate" button before submission.
- **Spotify:** https://podcasters.spotify.com → ingest attempt surfaces errors.
- **Podbase Validator:** https://podba.se/validate — community-maintained, strict.
- **W3C Feed Validator:** https://validator.w3.org/feed — catches XML-level issues.
- **Local:** `npm run test:rss` runs `fast-xml-parser` round-trip + schema assertions.

Add a Playwright smoke test that `fetch()`s `/feeds/the-deep-end.xml` post-deploy and asserts `Content-Type: application/rss+xml` plus a valid item count.

### 5.7 Updating Manually (fallback workflow)

If the script is unavailable, editing directly:

1. Open `public/feeds/<show>.xml`.
2. Copy an existing `<item>` block.
3. Update title, link, guid (**must be unique**), pubDate (RFC 822), description, enclosure (url/length/type), duration.
4. Paste at the top of `<channel>` (newest items first).
5. Bump `<lastBuildDate>` to now.
6. Validate at https://validator.w3.org/feed.
7. Commit and push.

**Strong preference:** always regenerate via the script. Hand-editing is for emergencies only.

---

## 6. Frontend Architecture

### 6.1 Routing Structure

| Route | Astro file | Generated pages |
|-------|------------|-----------------|
| `/` | `src/pages/index.astro` | 1 (homepage) |
| `/shows/` | `src/pages/shows/index.astro` | 1 (all shows) |
| `/shows/[show]/` | `src/pages/shows/[show]/index.astro` | N (one per category) |
| `/shows/[show]/[episode]/` | `src/pages/shows/[show]/[episode].astro` | M (one per episode) |
| `/tags/[tag]/` | `src/pages/tags/[tag].astro` | One per distinct tag |
| `/search/` | `src/pages/search.astro` | 1 (client-side Pagefind) |
| `/about/` | `src/pages/about.astro` | 1 |
| `/feeds/[show].xml` | Built by `scripts/build-rss.mjs` | One per category |
| `/sitemap.xml` | Auto (Astro sitemap integration) | 1 |
| `/robots.txt` | `public/robots.txt` | 1 |
| `/404.html` | `src/pages/404.astro` | 1 |

### 6.2 Page Types

**Homepage (`/`)**
- Hero: newest episode across all shows, with play button.
- Grid of shows (cover art + title).
- "Recent episodes" list (10 newest).
- Links to feeds/about.

**Show page (`/shows/[show]/`)**
- Show metadata: cover, description, host, "Subscribe" buttons (Apple/Spotify/RSS deep links).
- Paginated episode list (20/page), newest first.
- Tag cloud.

**Episode page (`/shows/[show]/[episode]/`)**
- Embedded player (audio or video).
- Full show notes (rendered HTML).
- Chapter markers (click → seek).
- Guest list with links.
- Tags.
- Next/previous episode navigation.
- Share buttons (Web Share API + copy-link).
- `<script type="application/ld+json">` with `PodcastEpisode` schema.

### 6.3 Media Playback

**Audio player** — pure HTML5 `<audio>` enhanced progressively:

```html
<audio
  controls
  preload="metadata"
  src="https://archive.org/download/.../episode.mp3"
  data-duration="3847"
  data-chapters='[{"start_seconds":0,"title":"Cold open"},...]'>
  Your browser does not support audio. <a href="...">Download MP3</a>.
</audio>
```

Enhancement script (`src/components/Player.astro` with `client:visible`):
- Chapter list renders alongside the native controls; clicking sets `audio.currentTime`.
- Persists position in `localStorage` keyed by episode `id`.
- Playback speed selector (0.75× / 1× / 1.25× / 1.5× / 2×).
- MediaSession API integration for OS-level lockscreen controls.
- Skip forward 30s / back 15s buttons.

**Video player** — same structure with `<video controls preload="metadata">`; optional `poster` attribute set to `episode_art.url`.

**Why not a library (Plyr, Video.js)?**
- Native controls are accessible and performant.
- Enhancement script is ~3 KB.
- A library adds 50–150 KB of JS for marginal polish.
- If the team wants a unified custom UI, add [Plyr](https://plyr.io) (small, accessible).

### 6.4 SEO Strategy

**Per-episode page must emit:**

```html
<title>Ep 14: The Antikythera Mechanism | The Deep End</title>
<meta name="description" content="Dr. Katsaros on the 2024 Antikythera expedition.">

<meta property="og:type" content="article">
<meta property="og:title" content="Ep 14: The Antikythera Mechanism">
<meta property="og:description" content="...">
<meta property="og:image" content="https://podcast.example.com/images/episodes/the-deep-end-ep14.jpg">
<meta property="og:url" content="https://podcast.example.com/shows/the-deep-end/antikythera-mechanism">
<meta property="og:audio" content="https://archive.org/download/.../episode.mp3">
<meta property="og:audio:type" content="audio/mpeg">

<meta name="twitter:card" content="summary_large_image">

<link rel="canonical" href="https://podcast.example.com/shows/the-deep-end/antikythera-mechanism">

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "PodcastEpisode",
  "name": "The Antikythera Mechanism",
  "datePublished": "2026-04-20",
  "timeRequired": "PT1H4M7S",
  "description": "...",
  "url": "https://podcast.example.com/shows/the-deep-end/antikythera-mechanism",
  "associatedMedia": {
    "@type": "MediaObject",
    "contentUrl": "https://archive.org/download/.../episode.mp3"
  },
  "partOfSeries": {
    "@type": "PodcastSeries",
    "name": "The Deep End",
    "url": "https://podcast.example.com/shows/the-deep-end"
  }
}
</script>
```

**Structural SEO:**
- Descriptive, keyword-rich URLs.
- `<h1>` only once per page (episode or show title).
- Alt text on every image.
- Internal linking: related episodes, tag pages.
- `sitemap.xml` generated via `@astrojs/sitemap`.
- `robots.txt` allows crawling; points to sitemap.
- Server-side rendered HTML (Astro does this by default) — crawlers see content without JS.

### 6.5 Accessibility

- **Semantic HTML:** `<article>`, `<nav>`, `<main>`, `<header>`, `<footer>`.
- **Keyboard:** every interactive element reachable with Tab; visible `:focus-visible` outlines.
- **Screen readers:**
  - `<audio>` / `<video>` native controls expose labels.
  - Custom controls use `aria-label` ("Skip forward 30 seconds").
  - Chapter list is a real `<ul>` with `<button>` elements, not `<div>`s.
- **Captions:** provide `<track kind="captions" src="/transcripts/.../ep14.vtt" srclang="en" default>` for video.
- **Transcripts:** linked on every episode page (WCAG 2.1 AAA for audio-only).
- **Color contrast:** minimum 4.5:1 for body text (7:1 preferred); test with axe or Lighthouse.
- **Reduced motion:** respect `prefers-reduced-motion` (disable auto-scrolling, fades).
- **Dark mode:** respects `prefers-color-scheme`; user toggle persisted in `localStorage`.

### 6.6 Performance Budget

| Metric | Target |
|--------|--------|
| Lighthouse Performance | ≥95 |
| Total JS (homepage) | ≤20 KB gzipped |
| Total JS (episode page) | ≤35 KB gzipped |
| LCP | ≤1.5s on fast 3G |
| CLS | 0 |
| INP | ≤200ms |

Tactics:
- Astro default: zero JS until an island requests it.
- Images via `<astro:assets>` (AVIF/WebP, responsive `srcset`, lazy loading).
- `<link rel="preconnect" href="https://archive.org">` on episode pages.
- Fonts self-hosted, `font-display: swap`.
- Critical CSS inlined by Astro; rest deferred.

---

## 7. File & Folder Structure

```
/podcast/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Lint, validate, test on PR
│       ├── verify-archive-urls.yml   # Weekly cron: HEAD every archive URL
│       └── preview-deploy.yml        # Netlify deploy preview hooks
├── .editorconfig
├── .eslintrc.json
├── .gitignore
├── .node-version                     # 22.x
├── .prettierrc
├── astro.config.mjs
├── CHANGELOG.md
├── netlify.toml
├── package.json
├── package-lock.json
├── PLAN.md                           # this document
├── README.md
├── tsconfig.json
├── public/                           # copied to dist/ unchanged
│   ├── favicon.svg
│   ├── robots.txt
│   ├── images/
│   │   ├── covers/                   # show cover art (≥1400×1400)
│   │   │   ├── the-deep-end-3000.jpg
│   │   │   └── dev-talks-3000.jpg
│   │   └── episodes/                 # per-episode art (optional)
│   │       └── the-deep-end-ep14.jpg
│   ├── fonts/
│   │   └── inter-var.woff2
│   ├── transcripts/
│   │   └── the-deep-end/
│   │       └── ep14.vtt
│   └── feeds/                        # generated; .gitignored
│       ├── main.xml
│       ├── the-deep-end.xml
│       └── dev-talks.xml
├── scripts/
│   ├── build-rss.mjs                 # §5.5 — generates all feeds
│   ├── validate-content.mjs          # schema + referential integrity
│   ├── verify-archive.mjs            # HEAD + range-request sanity
│   ├── verify-archive-all.mjs        # runs on schedule
│   ├── probe-media.mjs               # ffprobe helper — called locally pre-publish
│   ├── new-episode.mjs               # scaffolds /src/content/episodes/<slug>.json
│   └── build-sitemap.mjs
├── src/
│   ├── content/
│   │   ├── config.ts                 # Zod collections
│   │   ├── categories/
│   │   │   ├── the-deep-end.json
│   │   │   └── dev-talks.json
│   │   └── episodes/
│   │       ├── the-deep-end-antikythera-mechanism.json
│   │       ├── the-deep-end-shipwrecks-of-the-aegean.json
│   │       └── dev-talks-ep03-rust-interop.json
│   ├── components/
│   │   ├── AudioPlayer.astro
│   │   ├── VideoPlayer.astro
│   │   ├── ChapterList.astro
│   │   ├── EpisodeCard.astro
│   │   ├── ShowCard.astro
│   │   ├── SubscribeButtons.astro
│   │   ├── TagCloud.astro
│   │   ├── Pagination.astro
│   │   ├── Nav.astro
│   │   ├── Footer.astro
│   │   ├── Meta.astro                # SEO tags + JSON-LD
│   │   └── ThemeToggle.astro
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   ├── ShowLayout.astro
│   │   └── EpisodeLayout.astro
│   ├── lib/
│   │   ├── formatDuration.ts
│   │   ├── formatDate.ts
│   │   ├── getEpisodes.ts            # query helpers
│   │   ├── getCategories.ts
│   │   └── urls.ts                   # canonical URL builders
│   ├── pages/
│   │   ├── index.astro
│   │   ├── about.astro
│   │   ├── search.astro
│   │   ├── 404.astro
│   │   ├── shows/
│   │   │   ├── index.astro
│   │   │   └── [show]/
│   │   │       ├── index.astro
│   │   │       └── [episode].astro
│   │   ├── tags/
│   │   │   └── [tag].astro
│   │   └── rss.xml.ts                # optional: Astro-native combined feed
│   └── styles/
│       ├── global.css
│       ├── tokens.css                # CSS custom properties
│       └── reset.css
├── tests/
│   ├── rss.test.mjs                  # vitest: RSS schema
│   ├── content.test.mjs              # referential integrity
│   └── e2e/
│       └── episode-page.spec.ts      # Playwright: player mounts, audio loads
└── docs/
    ├── PUBLISHING.md                 # step-by-step for content editors
    ├── ARCHIVE-UPLOAD.md
    └── RSS-MAINTENANCE.md
```

### Notes on structure

- **`public/feeds/` is generated and `.gitignored`.** Feeds are rebuilt on every deploy. The source of truth for feed content is `/src/content/`.
- **One JSON file per entity.** Simpler merges; clearer diffs. Do not batch multiple episodes into one JSON file.
- **Scripts are `.mjs`, not `.ts`.** Avoid adding a TypeScript build step for small Node utilities; the Zod types are in `src/content/config.ts` for Astro's benefit.
- **Images under `public/`** are served as-is; larger optimized derivatives are generated by `<Image>` from `src/assets/` when needed.

---

## 8. Deployment Workflow (Netlify)

### 8.1 One-Time Setup

1. Push repo to GitHub.
2. Log into https://app.netlify.com.
3. **Add new site → Import from Git → GitHub → select repo.**
4. Build settings (autodetected for Astro; verify):
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Node version:** `22` (via `.node-version` or Netlify env `NODE_VERSION`)
5. Set environment variables (Site settings → Environment variables):
   - `SITE_URL` = `https://podcast.example.com`
   - `NODE_VERSION` = `22`
6. Configure custom domain (Site settings → Domain management):
   - Add `podcast.example.com`.
   - Use Netlify DNS or add CNAME at your registrar.
   - Netlify auto-provisions Let's Encrypt TLS.
7. Enable deploy previews for every PR (default on).
8. Enable build notifications (email or Slack).

### 8.2 `netlify.toml`

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "22"
  NPM_FLAGS = "--include=dev"

# Long cache for static assets
[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/images/*"
  [headers.values]
    Cache-Control = "public, max-age=604800"

# Correct content type for RSS
[[headers]]
  for = "/feeds/*.xml"
  [headers.values]
    Content-Type = "application/rss+xml; charset=utf-8"
    Cache-Control = "public, max-age=300, s-maxage=900"
    X-Content-Type-Options = "nosniff"

# Security
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "interest-cohort=()"

# Canonical redirect
[[redirects]]
  from = "https://www.podcast.example.com/*"
  to = "https://podcast.example.com/:splat"
  status = 301
  force = true

# Legacy feed URL (example of preserving inbound links)
[[redirects]]
  from = "/rss.xml"
  to = "/feeds/main.xml"
  status = 301
```

### 8.3 `package.json` Scripts

```json
{
  "name": "podcast-platform",
  "version": "1.0.0",
  "type": "module",
  "engines": { "node": ">=22.0.0" },
  "scripts": {
    "dev": "astro dev",
    "build": "npm run validate && astro build && npm run rss && npm run sitemap",
    "preview": "astro preview",
    "validate": "node scripts/validate-content.mjs",
    "rss": "node scripts/build-rss.mjs",
    "sitemap": "node scripts/build-sitemap.mjs",
    "new:episode": "node scripts/new-episode.mjs",
    "verify:archive": "node scripts/verify-archive-all.mjs",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "lint": "eslint . && prettier --check ."
  },
  "dependencies": {
    "astro": "^5.0.0",
    "@astrojs/sitemap": "^3.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "xmlbuilder2": "^3.1.1",
    "fast-xml-parser": "^4.4.0",
    "vitest": "^2.0.0",
    "@playwright/test": "^1.47.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0"
  }
}
```

### 8.4 Deploy Flow

Every `git push` to `main`:

1. Netlify webhook fires.
2. Netlify clones repo, installs deps (`npm ci`).
3. `npm run build` runs:
   - `validate-content.mjs` — fails build on bad JSON.
   - `astro build` — emits static HTML/CSS/JS to `dist/`.
   - `build-rss.mjs` — emits `public/feeds/*.xml` (copied to `dist/feeds/` by Astro).
   - `build-sitemap.mjs` — emits `dist/sitemap.xml`.
4. Netlify uploads `dist/` to its CDN.
5. Atomic swap — the new build goes live globally in ~30s.

PRs produce deploy previews at `deploy-preview-<N>--site-name.netlify.app`.

### 8.5 RSS Update Cadence

- **Automatic:** each push to `main` rebuilds the feed. Typical rebuild: 30–90s.
- **Scheduled:** for time-release episodes (`publish_date` in future), add a daily cron via GitHub Actions → `curl -X POST <netlify_build_hook>` at 00:05 UTC daily. The build filters out unpublished episodes (`publish_date > now`).

---

## 9. Content Publishing Workflow

### 9.1 End-to-End Steps (from idea to live)

```
 1. PLAN       → Write episode outline (not in repo; your notes app)
 2. RECORD     → DAW (Reaper/Logic/Audacity/Hindenburg)
 3. EDIT       → Cut, level, master (-16 LUFS target for podcasts)
 4. EXPORT     → MP3 128 kbps CBR or MP4 (H.264 High, AAC 128k, +faststart)
 5. PROBE      → `npm run new:episode -- --media ./episode.mp3`
                 (scaffolds JSON, fills duration/bitrate/size/sha256)
 6. UPLOAD     → `ia upload <identifier> ./episode.mp3 --metadata=...`
 7. VERIFY     → `node scripts/verify-archive.mjs <identifier>`
 8. EDIT JSON  → fill show notes, chapters, guests, tags
 9. COMMIT     → `git add . && git commit -m "Publish <show> ep<N>"`
10. PUSH       → `git push origin main`
11. CI         → Netlify builds, validates, generates RSS
12. VERIFY     → Check /shows/<show>/<slug>/ and /feeds/<show>.xml
13. SUBMIT     → (first episode of show only) submit feed to Apple/Spotify/Google
14. PROMOTE    → share episode URL
```

### 9.2 `new-episode.mjs` Scaffold

```bash
npm run new:episode -- --show the-deep-end --title "The Antikythera Mechanism" --media ./episode.mp3
```

The script:
1. Slugs the title: `antikythera-mechanism`.
2. Probes media: `ffprobe` for duration, bitrate, size.
3. Computes sha256.
4. Writes `src/content/episodes/the-deep-end-antikythera-mechanism.json` with placeholders.
5. Prints the Archive.org identifier and suggested `ia upload` command.

### 9.3 Roles & Responsibilities

| Role | Tasks |
|------|-------|
| **Host/Producer** | Record, edit, write show notes |
| **Publisher** (can be same person) | Run `new:episode`, upload to Archive.org, fill JSON, commit & push |
| **Developer** | Maintain scripts, Astro templates, Netlify config |

For non-developer editors: add Decap CMS pointing at `src/content/` — gives a web UI to edit JSON, but they still need Archive.org upload access.

### 9.4 Pre-Publish Checklist

- [ ] Audio file is -16 LUFS ±1 (podcast loudness standard)
- [ ] MP3 is CBR or MP4 has `+faststart`
- [ ] Archive.org upload completed and direct URL returns 200
- [ ] `media.file_size_bytes` matches actual file size (byte-exact)
- [ ] `duration_seconds` matches `ffprobe` output (±1s)
- [ ] `publish_date` is ISO 8601 UTC
- [ ] `guid`/`id` is unique and will never change
- [ ] Show notes HTML is valid (no stray `<p>` tags)
- [ ] Chapter timestamps don't exceed `duration_seconds`
- [ ] `npm run validate` passes locally
- [ ] `npm run rss` produces valid XML (check via validator)

---

## 10. Scalability Considerations

### 10.1 Targets

| Scale tier | Episodes | Build time | Notes |
|------------|----------|------------|-------|
| MVP | 1–100 | <30s | Any approach works |
| Medium | 100–1,000 | <2min | Default Astro build is fine |
| Large | 1,000–10,000 | <10min | Incremental builds, pagination mandatory |
| Very large | 10,000+ | Consider partial hydration / ISR | May outgrow static model |

### 10.2 Pagination

Show pages paginate 20 episodes per page using Astro's built-in pagination:

```astro
---
// src/pages/shows/[show]/page/[...page].astro
export async function getStaticPaths({ paginate }) {
  const categories = await getCollection('categories');
  const episodes = await getCollection('episodes');
  return categories.flatMap(cat => {
    const eps = episodes
      .filter(e => e.data.category_id === cat.id)
      .sort((a, b) => new Date(b.data.publish_date) - new Date(a.data.publish_date));
    return paginate(eps, {
      params: { show: cat.data.slug },
      pageSize: 20,
    });
  });
}
---
```

URLs: `/shows/the-deep-end/page/2/`, `/shows/the-deep-end/page/3/`, etc.

### 10.3 Lazy Loading

- Images: `loading="lazy"` on everything below the fold; `fetchpriority="high"` on the LCP image.
- Audio: `preload="metadata"` (not `"auto"`) so byte 1 isn't fetched until play.
- Video: `preload="none"` + poster image; only stream on play.
- Transcript: fetched via `<details>` expansion, not inline.

### 10.4 Build Performance

- **Incremental builds:** Astro 5's content layer caches unchanged JSON; rebuild only affected pages.
- **Parallel processing:** `build-rss.mjs` processes categories concurrently with `Promise.all`.
- **CDN cache:** Netlify caches `/assets/*` for 1 year (immutable fingerprinted filenames). RSS cached 5 min at edge.
- **Image optimization:** precompute AVIF/WebP at build; don't rely on runtime resizing.

### 10.5 Runtime Performance

- **Search:** Pagefind (build-time index, ~100 KB client) — scales to 10k+ pages without a backend.
- **Client JS:** load only on interactive pages; never global.
- **Third-party:** avoid analytics/embed scripts. Plausible or Umami (self-hosted) if required.
- **Fonts:** subset to Latin, preload single variable font file.

### 10.6 Feed Size

Apple recommends feeds <4 MB. A typical episode entry in XML is ~2–3 KB; that's ~1,500 episodes before hitting the limit. Strategies past that:

- **Chronological truncation:** include last 300 episodes; older episodes only in the website.
- **Multiple feeds:** per-season or per-year feeds plus a "latest" feed.
- **Pagination via `atom:link rel="next"`:** supported by some apps but inconsistent — avoid as a primary strategy.

---

## 11. Optional Enhancements

### 11.1 Search (Pagefind)

```bash
npm install -D pagefind
```

Add to `package.json` build step after `astro build`:

```json
"build": "... && pagefind --site dist"
```

Add to `search.astro`:

```html
<link href="/pagefind/pagefind-ui.css" rel="stylesheet">
<div id="search"></div>
<script type="module">
  import { PagefindUI } from '/pagefind/pagefind-ui.js';
  new PagefindUI({ element: '#search', showImages: false });
</script>
```

Zero-infrastructure, client-side, full-text search over all episode pages.

### 11.2 Tag Filtering

- Pre-render `/tags/<tag>/` for every distinct tag at build.
- Add a tag cloud to the footer (font-size scaled by frequency).
- Add `<meta name="keywords">` from tags (minor SEO value).

### 11.3 Dark Mode

```css
:root {
  color-scheme: light dark;
  --bg: light-dark(#ffffff, #0a0a0a);
  --fg: light-dark(#1a1a1a, #f0f0f0);
}

[data-theme="light"] { color-scheme: light; }
[data-theme="dark"]  { color-scheme: dark; }
```

Toggle persists to `localStorage`. No FOUC: apply the class in an inline `<script>` in `<head>` before the body paints.

### 11.4 Analytics

Options ranked by privacy/cost:

1. **Netlify Analytics** ($9/mo; server-side, no cookies, no script).
2. **Plausible / Umami** (self-hosted or paid; single script, GDPR-friendly).
3. **Cloudflare Web Analytics** (free, privacy-first, one script tag).
4. **GA4** — avoid if possible; cookie consent banners hurt UX.

**Plus podcast-specific analytics:** Archive.org exposes per-file download counts via `https://archive.org/details/<id>` page stats. For app-side listen stats, add a tracking proxy endpoint (Netlify Function that 302 redirects to Archive while logging to a log drain) — but this adds complexity and cost at scale.

### 11.5 Comments

- **Giscus** (GitHub Discussions backed): free, works with any static site, requires GitHub account to comment. Add once per episode page.
- **Utterances** (GitHub Issues): simpler, one issue per episode.
- **Discourse embed:** if a community already exists.
- Avoid Disqus (ads, trackers).

### 11.6 Other Polish

- **"Copy timestamp link"** — URL like `#t=1827` that seeks player on load.
- **Keyboard shortcuts** — space=play/pause, J/L=±15s, M=mute.
- **"Continue listening"** — localStorage-backed resume across episodes.
- **Episode notification** — `<link rel="alternate">` with subscribe feed in head.

---

## 12. Automation Opportunities

### 12.1 Scripts Already Specified

| Script | Purpose |
|--------|---------|
| `validate-content.mjs` | Zod schemas + referential integrity |
| `build-rss.mjs` | Generate all feed XMLs |
| `build-sitemap.mjs` | sitemap.xml |
| `verify-archive.mjs` | HEAD + range request on single URL |
| `verify-archive-all.mjs` | All URLs (run weekly) |
| `probe-media.mjs` | ffprobe wrapper |
| `new-episode.mjs` | Scaffold JSON for a new episode |

### 12.2 GitHub Actions

**File:** `.github/workflows/ci.yml`

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run validate
      - run: npm run build
      - run: npm test
```

**File:** `.github/workflows/verify-archive-urls.yml`

```yaml
name: Verify Archive URLs
on:
  schedule:
    - cron: '0 7 * * 1'     # every Monday 07:00 UTC
  workflow_dispatch:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: npm }
      - run: npm ci
      - run: npm run verify:archive
      - if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo:  context.repo.repo,
              title: 'Archive.org URL verification failed',
              body:  'One or more archive URLs returned non-200. See workflow logs.'
            });
```

**File:** `.github/workflows/scheduled-publish.yml`

```yaml
name: Scheduled Publish
on:
  schedule:
    - cron: '5 * * * *'     # hourly at :05
  workflow_dispatch:
jobs:
  rebuild:
    runs-on: ubuntu-latest
    steps:
      - run: curl -X POST -d '{}' ${{ secrets.NETLIFY_BUILD_HOOK }}
```

Triggers Netlify to rebuild hourly — episodes with future `publish_date` become live automatically.

### 12.3 Pre-Commit Hooks (Husky + lint-staged)

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.json": ["prettier --write"],
    "*.{js,mjs,ts,astro}": ["prettier --write", "eslint --fix"]
  }
}
```

Plus a `prepare-commit-msg` hook that runs `npm run validate` — blocks commits with invalid JSON.

### 12.4 Release Automation (Optional)

[Release Please](https://github.com/googleapis/release-please) — not strictly needed for a podcast site but useful if you version the platform itself.

---

## 13. Risks & Limitations

### 13.1 Archive.org Reliability

**Risk:** Archive.org has had multi-day outages (DDoS attacks 2024; hardware failures; fundraising-driven brownouts).

**Impact:** Episodes won't play until Archive.org returns.

**Mitigation:**
- **Monitoring:** `verify:archive` GitHub Action surfaces broken URLs weekly.
- **Mirror strategy:** for critical shows, also upload to a secondary free host (Cloudflare R2 free tier: 10 GB, 10M class A ops/mo; Backblaze B2 first 10 GB free). Keep a `media.mirror_url` field; RSS still points to Archive (the canonical), but website falls back in JS if primary 404s.
- **Download originals:** keep all master files on local + cloud backup. If Archive ever permanently disappears, you can re-upload elsewhere.

### 13.2 Slow First Byte

**Risk:** Archive.org TTFB can be 400–1000ms on cold cache; listener experience feels sluggish vs commercial CDNs.

**Mitigation:**
- Use `preload="metadata"` on `<audio>` so the browser warms the connection.
- Add `<link rel="preconnect" href="https://archive.org">` to episode pages.
- For hot episodes, consider pinning to a CDN (Cloudflare cache rules + R2 mirror).

### 13.3 Lack of Dynamic Backend

**Consequence:**
- No user accounts, per-user play position, comments without third-party tools.
- No real-time analytics.
- Any interactivity that needs persistence needs an external service or Netlify Function.

**Mitigation:**
- Accept for v1.
- Netlify Functions + a cheap DB (Turso, Neon) can bolt on later without rearchitecting.

### 13.4 RSS Maintenance Complexity

**Risk:** Hand-edited RSS gets malformed; a broken feed delists the podcast from directories.

**Mitigation:**
- Never hand-edit. Always regenerate via `build-rss.mjs`.
- `npm run test:rss` validates XML + schema on every commit.
- Add a post-deploy Playwright test that `fetch`es the feed and asserts structural properties.
- Subscribe to the feed in a podcast app yourself — a notification failure is an early warning.

### 13.5 GUID Stability

**Risk:** Changing an episode's `id`/`guid` causes directories to treat it as a new episode, double-listing it or hiding it.

**Mitigation:**
- Zod schema pins `id` format.
- `validate-content.mjs` tracks historical GUIDs in a committed `guids.lock.json` file; a removed or changed GUID fails the build unless explicitly acknowledged.

### 13.6 Archive.org Takedown Risk

**Risk:** Archive occasionally removes items (DMCA, ToS violations, collection curation).

**Mitigation:**
- Only upload content you own or have clear rights to.
- Apply a CC license or retain "all rights reserved" with clear provenance.
- Keep local masters.

### 13.7 Apple/Spotify Rejection

**Risk:** First-time submissions fail on trivial issues (cover art too small, explicit tag missing).

**Mitigation:**
- Run through `docs/PUBLISHING.md` checklist pre-submission.
- Use the Apple Podcasts Connect "Validate" preview.
- Use the Podcaster Academy (free Apple docs) as reference.

### 13.8 Netlify Free Tier Limits

**Risk:** Viral episode → bandwidth blows past 100 GB/month → site 429s.

**Mitigation:**
- Media bytes don't count (they're on Archive.org).
- HTML/CSS/JS at ~200 KB per page × 500k pageviews = 100 GB. Unlikely but possible.
- **Mitigation:** put Cloudflare free proxy in front of Netlify — unlimited bandwidth, Netlify becomes the origin.

---

## 14. Future Expansion Paths

### 14.1 Migrate to Full Backend (when needed)

**Trigger:** user accounts, comments, private episodes, custom analytics.

**Path:**
- Add Netlify Functions + a database (Turso for SQLite at edge, or Neon for Postgres).
- Keep the static site for public content; functions handle dynamic pieces.
- Migrate JSON content to the DB only when editing via a CMS becomes the primary workflow — otherwise Git JSON is simpler.

### 14.2 User Accounts

- **Auth:** Clerk, Auth.js, Netlify Identity (sunsetting — avoid), or Supabase Auth.
- **Features unlocked:**
  - Play position sync across devices
  - Favorites / playlists
  - Patron-only episodes (signed short-lived Archive URLs)
- **Keep static-first:** most pages stay prerendered; only account pages are dynamic.

### 14.3 Monetization

| Model | Implementation |
|-------|----------------|
| **Dynamic ad insertion (DAI)** | Replace Archive enclosure URL in RSS with a Netlify Function proxy that stitches host-read ads pre-roll/mid-roll. Complex. Only worth it at significant scale. |
| **Sponsorships** | Manual host-read ads baked into the MP3. No tech required. |
| **Subscription / Patreon** | Patreon's built-in private RSS feed; keep public feed clean. Or roll own with signed URLs. |
| **Tip jar** | Stripe Payment Link or Ko-fi in the footer. |
| **Value4Value (Podcasting 2.0)** | Add `<podcast:value>` tags with Lightning wallet addresses. Listeners on modern apps (Breez, Fountain) stream sats per minute. |

### 14.4 Podcasting 2.0 Namespace

Add `xmlns:podcast="https://podcastindex.org/namespace/1.0"` and adopt tags:

- `<podcast:transcript>` — VTT/SRT transcript URL
- `<podcast:chapters>` — JSON chapters URL (richer than `<itunes>` chapters)
- `<podcast:person>` — structured host/guest metadata
- `<podcast:funding>` — support links
- `<podcast:soundbite>` — shareable clips
- `<podcast:alternateEnclosure>` — multiple quality tiers or MP4 alongside MP3
- `<podcast:value>` — Lightning/crypto tips

Every tag is additive — no existing client breaks.

### 14.5 Video-First / YouTube Integration

- Mirror MP4 to YouTube (free) for SEO and discovery.
- Keep Archive.org as the canonical for RSS (MP4 enclosure).
- Add `<iframe src="youtube...">` option on episode pages for users preferring YT.

### 14.6 Multi-language

- Add `language` on episode level (overriding category).
- Generate per-language feeds.
- Use Astro's i18n routing (`/en/`, `/es/`).
- Use `hreflang` tags.

### 14.7 Alternative CDN / Self-Host Media

When Archive.org becomes a constraint:

| Destination | Cost at 10 TB egress/mo | Notes |
|-------------|------------------------|-------|
| **Cloudflare R2** | $0 egress + ~$15 storage | Strongest free egress; S3-compatible |
| **Backblaze B2** | ~$10 (B2→Cloudflare is free via Bandwidth Alliance) | Simple, cheap |
| **Bunny.net** | ~$10 | Global CDN, ~$0.01/GB |
| **AWS S3 + CloudFront** | ~$850 | Avoid unless already committed |

Migration is **URL replacement only** — update `media.primary_url` in every JSON file with a find/replace, regenerate feed, wait for podcast directories to pick up new URLs (~24h).

### 14.8 Native Apps

Once the website is mature, consider:
- PWA (`manifest.webmanifest` + service worker for offline) — cheapest path.
- React Native / Capacitor wrapper — launch to app stores.
- Or: don't. Podcast apps are the native clients. The RSS feed is your app.

---

## Appendix A — Quick Reference

**Archive.org identifier:** `<show-slug>-s<NN>e<NN>-<YYYYMMDD>`
**Direct URL:** `https://archive.org/download/<identifier>/<filename>`
**Feed URL:** `https://<site>/feeds/<show-slug>.xml`
**Episode URL:** `https://<site>/shows/<show-slug>/<episode-slug>/`
**Build command:** `npm run build`
**Validate:** `npm run validate`
**Add episode:** `npm run new:episode`
**Verify URLs:** `npm run verify:archive`

## Appendix B — Links

- Astro docs: https://docs.astro.build
- Netlify docs: https://docs.netlify.com
- Apple Podcasts RSS spec: https://help.apple.com/itc/podcasts_connect/#/itcb54353390
- Podcast Namespace (2.0): https://github.com/Podcastindex-org/podcast-namespace
- Archive.org uploader docs: https://archive.org/developers/internetarchive/
- Pagefind: https://pagefind.app
- RSS validator: https://validator.w3.org/feed
- Podbase validator: https://podba.se/validate

---

**End of PLAN.md** — this is a living document. Update as decisions change; commit changes alongside the code they describe.
