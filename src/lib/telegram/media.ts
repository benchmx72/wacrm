import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);

interface TelegramFileResponse {
  ok?: boolean;
  result?: {
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    file_path?: string;
  };
  description?: string;
}

export interface TelegramMediaDownload {
  buffer: Buffer;
  contentType: string;
  fileName: string;
}

export async function downloadTelegramMedia(args: {
  botToken: string;
  fileId: string;
  mimeType?: string;
  fileName?: string;
}) {
  const metadataResponse = await fetch(
    `https://api.telegram.org/bot${args.botToken}/getFile?file_id=${encodeURIComponent(args.fileId)}`,
    { cache: "no-store" },
  );
  const metadata = (await metadataResponse.json().catch(() => null)) as
    | TelegramFileResponse
    | null;

  if (!metadataResponse.ok || !metadata?.ok || !metadata.result?.file_path) {
    throw new Error(
      metadata?.description ??
        `Telegram getFile failed (${metadataResponse.status})`,
    );
  }

  const mediaResponse = await fetch(
    `https://api.telegram.org/file/bot${args.botToken}/${metadata.result.file_path}`,
    { cache: "no-store" },
  );

  if (!mediaResponse.ok) {
    throw new Error(`Telegram media download failed (${mediaResponse.status})`);
  }

  const filePath = metadata.result.file_path;
  const extension = path.extname(filePath) || extensionForMimeType(args.mimeType);

  return {
    buffer: Buffer.from(await mediaResponse.arrayBuffer()),
    contentType:
      args.mimeType ||
      mediaResponse.headers.get("content-type") ||
      contentTypeForExtension(extension),
    fileName:
      args.fileName ||
      `${metadata.result.file_unique_id}${extension || ".bin"}`,
  } satisfies TelegramMediaDownload;
}

export async function prepareTelegramAudioForTranscription(
  media: TelegramMediaDownload,
) {
  const extension = path.extname(media.fileName).toLowerCase();
  const needsConversion =
    extension === ".ogg" ||
    extension === ".oga" ||
    extension === ".opus" ||
    media.contentType.includes("ogg") ||
    media.contentType.includes("opus");

  if (!needsConversion) return media;
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static is unavailable on this platform");
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "sophia-voice-"));
  const inputPath = path.join(workDir, `input${extension || ".ogg"}`);
  const outputPath = path.join(workDir, "output.mp3");

  try {
    await writeFile(inputPath, media.buffer);
    await execFileAsync(ffmpegPath, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "48k",
      outputPath,
    ]);

    return {
      buffer: await readFile(outputPath),
      contentType: "audio/mpeg",
      fileName: "telegram-voice.mp3",
    } satisfies TelegramMediaDownload;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function extensionForMimeType(mimeType?: string) {
  if (mimeType?.includes("ogg")) return ".ogg";
  if (mimeType?.includes("mpeg")) return ".mp3";
  if (mimeType?.includes("mp4")) return ".m4a";
  if (mimeType?.includes("wav")) return ".wav";
  if (mimeType?.includes("webm")) return ".webm";
  return "";
}

function contentTypeForExtension(extension: string) {
  if (extension === ".ogg" || extension === ".oga") return "audio/ogg";
  if (extension === ".opus") return "audio/opus";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".m4a" || extension === ".mp4") return "audio/mp4";
  if (extension === ".wav") return "audio/wav";
  if (extension === ".webm") return "audio/webm";
  return "application/octet-stream";
}
