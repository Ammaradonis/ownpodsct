# RSS Maintenance

## Generate feeds

```bash
npm run rss
```

This writes:

- `public/feeds/main.xml`
- `public/feeds/<show>.xml`

During full builds, the same feeds are also copied into `dist/feeds/`.

## Validate before shipping

```bash
npm run validate
npm run test:rss
```

Then validate externally:

- Apple Podcasts Connect validator
- Podbase validator
- W3C feed validator

## GUID lock

`guids.lock.json` protects feed stability. If you intentionally add or remove episode IDs, update it explicitly:

```bash
npm run validate -- --update-guid-lock
```

Never change an existing published episode `id` unless you are prepared for feed duplication in clients.
