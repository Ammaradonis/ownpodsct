import fs from 'node:fs/promises';
import path from 'node:path';

export interface ArchiveFile {
  name: string;
  format?: string;
  size?: string;
  source?: string;
}

export interface RenderedArchiveFile {
  archiveId: string;
  file: ArchiveFile;
  url: string;
  kind: 'image' | 'video' | 'audio';
}

export interface ArchiveGalleryResult {
  files: RenderedArchiveFile[];
  totalCount: number;
}

const CACHE_DIR = path.resolve('.archive-cache');
const METADATA_TIMEOUT_MS = 10_000;

const memCache = new Map<string, Promise<RenderedArchiveFile[]>>();

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
  /jpeg|png|image/i.test(f.format ?? '');

const isVideo = (f: ArchiveFile) =>
  /\.(mp4|webm|mov|m4v)$/i.test(f.name) || /mpeg4|h\.264|video/i.test(f.format ?? '');

const isAudio = (f: ArchiveFile) =>
  /\.(m4a|mp3|ogg|oga|wav|flac|aac)$/i.test(f.name) ||
  /mpeg-4 audio|mp3|ogg|wav|flac|aac/i.test(f.format ?? '');

const isThumb = (f: ArchiveFile) => /thumb/i.test(f.name);

const detectKindFromUrl = (url: string): 'image' | 'video' | 'audio' => {
  const path = url.split(/[?#]/)[0].toLowerCase();
  if (/\.(mp4|webm|mov|m4v)$/i.test(path)) return 'video';
  if (/\.(m4a|mp3|ogg|oga|wav|flac|aac)$/i.test(path)) return 'audio';
  return 'image';
};

const filenameFromUrl = (url: string): string => {
  try {
    const last = url.split(/[?#]/)[0].split('/').pop() ?? url;
    return decodeURIComponent(last);
  } catch {
    return url;
  }
};

const archiveFileUrl = (id: string, name: string) =>
  `https://archive.org/download/${id}/${encodeURIComponent(name).replace(/%2F/g, '/')}`;

const readDiskCache = async (archiveId: string): Promise<RenderedArchiveFile[] | null> => {
  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, `${archiveId}.json`), 'utf8');
    return JSON.parse(raw) as RenderedArchiveFile[];
  } catch {
    return null;
  }
};

const writeDiskCache = async (archiveId: string, files: RenderedArchiveFile[]) => {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(
      path.join(CACHE_DIR, `${archiveId}.json`),
      JSON.stringify(files),
      'utf8',
    );
  } catch {
    // best-effort cache write
  }
};

const fetchFresh = async (archiveId: string): Promise<RenderedArchiveFile[]> => {
  const response = await fetchWithTimeout(
    `https://archive.org/metadata/${archiveId}`,
    METADATA_TIMEOUT_MS,
  );
  if (!response.ok) {
    throw new Error(`Archive metadata HTTP ${response.status}`);
  }
  const item = await response.json();
  const allFiles: ArchiveFile[] = item.files ?? [];
  const noThumbs = allFiles.filter((f) => !isThumb(f));

  const images = noThumbs.filter((f) => f.source === 'original' && isImage(f));
  const audios = noThumbs.filter((f) => f.source === 'original' && isAudio(f));

  const videoFiles = noThumbs.filter(isVideo);
  const iaDerivBases = new Set(
    videoFiles
      .filter((f) => /\.ia\.mp4$/i.test(f.name))
      .map((f) => f.name.toLowerCase().replace(/\.ia\.mp4$/i, '')),
  );
  const videos = videoFiles.filter((f) => {
    if (/\.ia\.mp4$/i.test(f.name)) return true;
    if (f.source !== 'original') return false;
    const base = f.name.toLowerCase().replace(/\.[^.]+$/, '');
    return !iaDerivBases.has(base);
  });

  return [...images, ...videos, ...audios].map((file) => ({
    archiveId,
    file,
    url: archiveFileUrl(archiveId, file.name),
    kind: isVideo(file) ? 'video' : isAudio(file) ? 'audio' : 'image',
  }));
};

async function loadArchiveItem(archiveId: string): Promise<RenderedArchiveFile[]> {
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

export interface ExtraFile {
  url: string;
  kind?: 'image' | 'video' | 'audio';
}

export async function loadArchiveGallery(
  archiveIds: string | string[],
  extras: ExtraFile[] = [],
): Promise<ArchiveGalleryResult> {
  const ids = Array.isArray(archiveIds) ? archiveIds : [archiveIds];
  const perItem = await Promise.all(ids.map(loadArchiveItem));
  const archiveFiles = perItem.flat();

  const extraRendered: RenderedArchiveFile[] = extras
    .filter((ex) => !/thumb/i.test(ex.url))
    .map((ex) => ({
      archiveId: '',
      file: { name: filenameFromUrl(ex.url), source: 'extra' },
      url: ex.url,
      kind: ex.kind ?? detectKindFromUrl(ex.url),
    }));

  const files = [...archiveFiles, ...extraRendered];
  return { files, totalCount: files.length };
}
