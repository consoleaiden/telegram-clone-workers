import type { TelegramMessage } from "../telegram/types";

export interface MessageFilterCriteria {
  mediaTypes?: string[]; // e.g. ["document", "video", "photo", "audio", "voice", "animation"]
  minSizeBytes?: number | null;
  maxSizeBytes?: number | null;
}

export interface ExtractedMetadata {
  type: string;
  size?: number;
  name?: string;
  mimeType?: string;
}

export interface FilterEvaluation {
  matched: boolean;
  detectedType: string;
  detectedSize?: number;
  detectedName?: string;
  reason?: string;
}

/** Extracts standardized media type, file size, and file name from a TelegramMessage. */
export function extractMessageMetadata(msg: TelegramMessage): ExtractedMetadata {
  if (msg.document) {
    return {
      type: "document",
      size: msg.document.file_size,
      name: msg.document.file_name,
      mimeType: msg.document.mime_type,
    };
  }

  if (msg.video) {
    return {
      type: "video",
      size: msg.video.file_size,
      name: msg.video.file_name,
      mimeType: msg.video.mime_type,
    };
  }

  if (msg.animation) {
    return {
      type: "animation",
      size: msg.animation.file_size,
      name: msg.animation.file_name,
      mimeType: msg.animation.mime_type,
    };
  }

  if (msg.audio) {
    return {
      type: "audio",
      size: msg.audio.file_size,
      name: msg.audio.file_name,
      mimeType: msg.audio.mime_type,
    };
  }

  if (msg.voice) {
    return {
      type: "voice",
      size: msg.voice.file_size,
      mimeType: msg.voice.mime_type,
    };
  }

  if (msg.photo && msg.photo.length > 0) {
    // Photos come as an array of thumbnail sizes; last element is the highest resolution
    const largest = msg.photo[msg.photo.length - 1];
    return {
      type: "photo",
      size: largest.file_size,
    };
  }

  return {
    type: "text",
  };
}

/** Converts byte values to human-readable string (e.g. 14.5 MB, 1.2 GB). */
export function formatBytes(bytes?: number): string {
  if (bytes == null || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
  return `${val} ${sizes[i] || "B"}`;
}

/** Returns an emoji icon and label for a media type. */
export function getMediaIcon(type: string): string {
  switch (type) {
    case "video":
      return "🎬 视频";
    case "document":
      return "📄 文档";
    case "photo":
      return "🖼️ 图片";
    case "audio":
      return "🎵 音频";
    case "voice":
      return "🎙️ 语音";
    case "animation":
      return "🎭 GIF";
    default:
      return "💬 文本";
  }
}

/**
 * Evaluates whether a TelegramMessage satisfies the specified filter criteria.
 */
export function evaluateMessageFilter(
  msg: TelegramMessage,
  criteria: MessageFilterCriteria,
): FilterEvaluation {
  const meta = extractMessageMetadata(msg);
  const { type, size, name } = meta;

  // 1. Check media type filtering
  if (criteria.mediaTypes && criteria.mediaTypes.length > 0) {
    if (!criteria.mediaTypes.includes(type)) {
      return {
        matched: false,
        detectedType: type,
        detectedSize: size,
        detectedName: name,
        reason: type === "text" ? "不允许纯文本" : `已过滤掉${type}类型`,
      };
    }
  }

  // 2. Check file size minimum
  if (criteria.minSizeBytes != null && size !== undefined) {
    if (size < criteria.minSizeBytes) {
      return {
        matched: false,
        detectedType: type,
        detectedSize: size,
        detectedName: name,
        reason: `小于最小大小 ${formatBytes(criteria.minSizeBytes)}`,
      };
    }
  }

  // 3. Check file size maximum
  if (criteria.maxSizeBytes != null && size !== undefined) {
    if (size > criteria.maxSizeBytes) {
      return {
        matched: false,
        detectedType: type,
        detectedSize: size,
        detectedName: name,
        reason: `超过最大大小 ${formatBytes(criteria.maxSizeBytes)}`,
      };
    }
  }

  return {
    matched: true,
    detectedType: type,
    detectedSize: size,
    detectedName: name,
  };
}
