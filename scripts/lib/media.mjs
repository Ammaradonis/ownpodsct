import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export function slugify(input) {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export async function sha256File(filePath) {
  const hash = createHash('sha256');

  await new Promise((resolve, reject) => {
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', resolve)
      .on('error', reject);
  });

  return hash.digest('hex');
}

export async function probeMedia(filePath) {
  const absolutePath = path.resolve(filePath);
  const fileStat = await stat(absolutePath);

  const probeOutput = await new Promise((resolve, reject) => {
    const child = spawn('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration,size,bit_rate:stream=index,codec_type,sample_rate,channels,width,height',
      '-of',
      'json',
      absolutePath,
    ]);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(
        new Error(
          `ffprobe is required for media probing and was not found on PATH. Original error: ${error.message}`,
        ),
      );
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed for ${absolutePath}: ${stderr || 'unknown error'}`));
        return;
      }

      resolve(JSON.parse(stdout));
    });
  });

  const audioStream = probeOutput.streams.find((stream) => stream.codec_type === 'audio');
  const videoStream = probeOutput.streams.find((stream) => stream.codec_type === 'video');

  return {
    durationSeconds: Math.round(Number(probeOutput.format.duration ?? 0)),
    bitrateKbps: probeOutput.format.bit_rate ? Math.round(Number(probeOutput.format.bit_rate) / 1000) : undefined,
    fileSizeBytes: Number(probeOutput.format.size ?? fileStat.size),
    sampleRateHz: audioStream?.sample_rate ? Number(audioStream.sample_rate) : undefined,
    channels: audioStream?.channels ? Number(audioStream.channels) : undefined,
    width: videoStream?.width ? Number(videoStream.width) : undefined,
    height: videoStream?.height ? Number(videoStream.height) : undefined,
    sha256: await sha256File(absolutePath),
  };
}
