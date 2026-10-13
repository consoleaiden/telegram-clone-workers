import type { TelegramUpdate } from "../telegram/types";
import { formatBytes } from "./messageFilter";

export interface ParsedBotActivity {
  update_id: number;
  kind: "command" | "document" | "media" | "text" | "channel_post" | "member_event" | "other";
  icon: string;
  summary: string;
  chat_name: string;
  chat_type: string;
  sender_name?: string;
  date_iso?: string;
}

/**
 * Parses raw Telegram updates into intuitive, plain-language activity summaries.
 */
export function parseTelegramUpdate(update: TelegramUpdate): ParsedBotActivity {
  const msg = update.message ?? update.channel_post ?? update.edited_message;

  if (update.my_chat_member) {
    const mem = update.my_chat_member;
    const actor = mem.from.username ? `@${mem.from.username}` : mem.from.first_name;
    const chatTitle = mem.chat.title ?? (mem.chat.username ? `@${mem.chat.username}` : `聊天 #${mem.chat.id}`);
    return {
      update_id: update.update_id,
      kind: "member_event",
      icon: "👤",
      summary: `机器人权限被 ${actor} 变更为「${mem.new_chat_member.status}」`,
      chat_name: chatTitle,
      chat_type: mem.chat.type,
      sender_name: actor,
      date_iso: mem.date ? new Date(mem.date * 1000).toISOString() : undefined,
    };
  }

  if (update.chat_member) {
    const mem = update.chat_member;
    const targetUser = mem.new_chat_member.user.username
      ? `@${mem.new_chat_member.user.username}`
      : mem.new_chat_member.user.first_name;
    const chatTitle = mem.chat.title ?? (mem.chat.username ? `@${mem.chat.username}` : `聊天 #${mem.chat.id}`);
    return {
      update_id: update.update_id,
      kind: "member_event",
      icon: "👥",
      summary: `用户 ${targetUser} 在聊天中的身份变为「${mem.new_chat_member.status}」`,
      chat_name: chatTitle,
      chat_type: mem.chat.type,
      date_iso: mem.date ? new Date(mem.date * 1000).toISOString() : undefined,
    };
  }

  if (!msg) {
    return {
      update_id: update.update_id,
      kind: "other",
      icon: "⚡",
      summary: "系统通知或回调事件",
      chat_name: "未知",
      chat_type: "unknown",
    };
  }

  const sender = msg.from
    ? msg.from.username
      ? `@${msg.from.username}`
      : msg.from.first_name
    : update.channel_post
    ? "频道帖"
    : "匿名";

  const chatTitle = msg.chat.title ?? (msg.chat.username ? `@${msg.chat.username}` : `聊天 #${msg.chat.id}`);
  const isPost = Boolean(update.channel_post);
  const dateIso = msg.date ? new Date(msg.date * 1000).toISOString() : undefined;

  // 1. Bot Commands (e.g. /start, /copy, /help)
  if (msg.text?.startsWith("/")) {
    const parts = msg.text.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1).join(" ");
    return {
      update_id: update.update_id,
      kind: "command",
      icon: "⚙️",
      summary: `收到来自 ${sender} 的指令 ${cmd}${args ? `，参数为「${args.length > 30 ? `${args.slice(0, 30)}…` : args}」` : ""}`,
      chat_name: chatTitle,
      chat_type: msg.chat.type,
      sender_name: sender,
      date_iso: dateIso,
    };
  }

  // 2. Documents / Files
  if (msg.document) {
    const name = msg.document.file_name ?? "未命名文件";
    const sizeStr = msg.document.file_size ? `（${formatBytes(msg.document.file_size)}）` : "";
    return {
      update_id: update.update_id,
      kind: "document",
      icon: "📁",
      summary: `收到来自 ${sender} 的文件「${name}」${sizeStr}`,
      chat_name: chatTitle,
      chat_type: msg.chat.type,
      sender_name: sender,
      date_iso: dateIso,
    };
  }

  // 3. Videos
  if (msg.video) {
    const sizeStr = msg.video.file_size ? `（${formatBytes(msg.video.file_size)}）` : "";
    const durStr = msg.video.duration ? ` [${msg.video.duration} 秒]` : "";
    return {
      update_id: update.update_id,
      kind: "media",
      icon: "🎬",
      summary: `收到来自 ${sender} 的视频${durStr}${sizeStr}`,
      chat_name: chatTitle,
      chat_type: msg.chat.type,
      sender_name: sender,
      date_iso: dateIso,
    };
  }

  // 4. Photos
  if (msg.photo && msg.photo.length > 0) {
    const captionSnippet = msg.caption ? `：${msg.caption.length > 40 ? `${msg.caption.slice(0, 40)}…` : msg.caption}` : "";
    return {
      update_id: update.update_id,
      kind: "media",
      icon: "🖼️",
      summary: `收到来自 ${sender} 的图片${captionSnippet}`,
      chat_name: chatTitle,
      chat_type: msg.chat.type,
      sender_name: sender,
      date_iso: dateIso,
    };
  }

  // 5. Audio / Voice / Animation
  if (msg.audio) {
    const name = msg.audio.file_name ?? "音频文件";
    const sizeStr = msg.audio.file_size ? `（${formatBytes(msg.audio.file_size)}）` : "";
    return {
      update_id: update.update_id,
      kind: "media",
      icon: "🎵",
      summary: `收到来自 ${sender} 的音频「${name}」${sizeStr}`,
      chat_name: chatTitle,
      chat_type: msg.chat.type,
      sender_name: sender,
      date_iso: dateIso,
    };
  }

  if (msg.voice) {
    const durStr = msg.voice.duration ? `（${msg.voice.duration} 秒）` : "";
    return {
      update_id: update.update_id,
      kind: "media",
      icon: "🎤",
      summary: `收到来自 ${sender} 的语音消息${durStr}`,
      chat_name: chatTitle,
      chat_type: msg.chat.type,
      sender_name: sender,
      date_iso: dateIso,
    };
  }

  if (msg.animation) {
    return {
      update_id: update.update_id,
      kind: "media",
      icon: "🎞️",
      summary: `收到来自 ${sender} 的 GIF / 动画`,
      chat_name: chatTitle,
      chat_type: msg.chat.type,
      sender_name: sender,
      date_iso: dateIso,
    };
  }

  // 6. Plain Text / Channel Posts
  const rawText = msg.text ?? msg.caption ?? "";
  const snippet = rawText.length > 60 ? `${rawText.slice(0, 60)}…` : rawText;

  if (isPost) {
    return {
      update_id: update.update_id,
      kind: "channel_post",
      icon: "📢",
      summary: snippet ? `发布了频道帖：「${snippet}」` : "发布了频道帖",
      chat_name: chatTitle,
      chat_type: msg.chat.type,
      date_iso: dateIso,
    };
  }

  return {
    update_id: update.update_id,
    kind: "text",
    icon: "💬",
    summary: snippet ? `来自 ${sender} 的消息：「${snippet}」` : `收到来自 ${sender} 的消息`,
    chat_name: chatTitle,
    chat_type: msg.chat.type,
    sender_name: sender,
    date_iso: dateIso,
  };
}
