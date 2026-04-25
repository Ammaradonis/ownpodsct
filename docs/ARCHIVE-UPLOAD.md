# Archive.org Upload Guide

## Identifier pattern

Preferred format:

```text
<show-slug>-s<NN>e<NN>-<YYYYMMDD>
```

Examples:

- `the-deep-end-s02e14-20260420`
- `dev-talks-s01e03-20260418`

## Suggested command

```bash
ia upload the-deep-end-s02e14-20260420 ./episode.mp3 \
  --metadata="title:The Antikythera Mechanism" \
  --metadata="mediatype:audio" \
  --metadata="collection:opensource_audio"
```

For MP4 uploads, switch `mediatype` to `movies`.

## Verification

After upload, confirm the direct download URL and byte-range support:

```bash
node scripts/verify-archive.mjs the-deep-end-s02e14-20260420
```

If you need to verify the whole catalog:

```bash
npm run verify:archive
```
