# Publishing Workflow

## End-to-end

1. Record and edit the episode locally.
2. Export audio as MP3 128 kbps CBR or video as MP4 H.264 + AAC with `+faststart`.
3. Probe the media file:

   ```bash
   node scripts/probe-media.mjs ./episode.mp3
   ```

4. Scaffold a draft episode:

   ```bash
   npm run new:episode -- --show the-deep-end --title "Episode Title" --media ./episode.mp3
   ```

5. Upload the media to Archive.org with the suggested identifier.
6. Update the generated JSON with the final Archive URL, chapters, guests, summary, and notes.
7. Acknowledge the GUID lock update:

   ```bash
   npm run validate -- --update-guid-lock
   ```

8. Re-run validation and build:

   ```bash
   npm run validate
   npm run build
   ```

9. Check the episode page, the show feed, and the main feed locally or in preview.

## Pre-publish checklist

- The `publish_date` is correct and in UTC.
- `media.file_size_bytes` matches the uploaded file exactly.
- Chapter start times are sorted and stay within the full duration.
- The Archive.org direct media URL resolves successfully.
- The feed entry uses a stable `id` that will never change.
- Cover and episode art are compliant JPG or PNG files before directory submission.
