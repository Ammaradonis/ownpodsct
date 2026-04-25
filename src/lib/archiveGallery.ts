import fs from 'node:fs/promises';
import path from 'node:path';

export interface ArchiveFile {
  name: string;
  format?: string;
  size?: string;
  source?: string;
}

export interface RenderedArchiveFile {
  file: ArchiveFile;
  url: string;
  kind: 'image' | 'video' | 'text' | 'binary';
  textContent?: string;
  textTruncated?: boolean;
}

export interface ArchiveGalleryResult {
  files: RenderedArchiveFile[];
  totalCount: number;
}

const CACHE_DIR = path.resolve('.archive-cache');
const TEXT_PREVIEW_LIMIT = 30_000;
const METADATA_TIMEOUT_MS = 10_000;
const TEXT_FETCH_TIMEOUT_MS = 8_000;

const memCache = new Map<string, Promise<ArchiveGalleryResult>>();

const fetchWithTimeout = async (url: string, ms: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const isImage = (f: ArchiveFile) =>
  /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f.name) ||
  /jpeg|png|image|item tile/i.test(f.format ?? '');

const isVideo = (f: ArchiveFile) =>
  /\.(mp4|webm|mov|m4v)$/i.test(f.name) || /mpeg4|video/i.test(f.format ?? '');

const isText = (f: ArchiveFile) => /\.(xml|txt|json|md|csv)$/i.test(f.name);

const archiveFileUrl = (id: string, name: string) =>
  `https://archive.org/download/${id}/${encodeURIComponent(name).replace(/%2F/g, '/')}`;

const readDiskCache = async (archiveId: string): Promise<ArchiveGalleryResult | null> => {
  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, `${archiveId}.json`), 'utf8');
    return JSON.parse(raw) as ArchiveGalleryResult;
  } catch {
    return null;
  }
};

const writeDiskCache = async (archiveId: string, result: ArchiveGalleryResult) => {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(
      path.join(CACHE_DIR, `${archiveId}.json`),
      JSON.stringify(result),
      'utf8',
    );
  } catch {
    // best-effort cache write
  }
};

const fetchFresh = async (archiveId: string): Promise<ArchiveGalleryResult> => {
  const response = await fetchWithTimeout(
    `https://archive.org/metadata/${archiveId}`,
    METADATA_TIMEOUT_MS,
  );
  if (!response.ok) {
    throw new Error(`Archive metadata HTTP ${response.status}`);
  }
  const item = await response.json();
  const allFiles: ArchiveFile[] = item.files ?? [];
  const files = allFiles.filter((f) => f.source !== 'derivative');

  const rendered = await Promise.all(
    files.map(async (file): Promise<RenderedArchiveFile> => {
      const url = archiveFileUrl(archiveId, file.name);
      if (isImage(file)) return { file, url, kind: 'image' };
      if (isVideo(file)) return { file, url, kind: 'video' };
      if (isText(file)) {
        try {
          const r = await fetchWithTimeout(url, TEXT_FETCH_TIMEOUT_MS);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          let text = await r.text();
          const truncated = text.length > TEXT_PREVIEW_LIMIT;
          if (truncated) text = text.slice(0, TEXT_PREVIEW_LIMIT);
          return { file, url, kind: 'text', textContent: text, textTruncated: truncated };
        } catch (err) {
          return {
            file,
            url,
            kind: 'text',
            textContent: `Preview unavailable: ${(err as Error).message}`,
          };
        }
      }
      return { file, url, kind: 'binary' };
    }),
  );

  return { files: rendered, totalCount: files.length };
};

export async function loadArchiveGallery(archiveId: string): Promise<ArchiveGalleryResult> {
  const memo = memCache.get(archiveId);
  if (memo) return memo;

  const promise = (async () => {
    const disk = await readDiskCache(archiveId);
    if (disk) return disk;
    const fresh = await fetchFresh(archiveId);
    await writeDiskCache(archiveId, fresh);
    return fresh;
  })();

  memCache.set(archiveId, promise);
  try {
    return await promise;
  } catch (err) {
    memCache.delete(archiveId);
    throw err;
  }
}

export const ARCHIVE_TEXT_PREVIEW_LIMIT = TEXT_PREVIEW_LIMIT;
