import type { TelegramChatMember } from "./types";
import type { CapabilityEntry } from "../shared/rpcTypes";

export function deriveCapabilities(botMember: TelegramChatMember, chatType: string): CapabilityEntry[] {
  const isCreator = botMember.status === "creator";
  const isAdmin = botMember.status === "administrator" || isCreator;
  const has = (right: keyof TelegramChatMember) => isCreator || (isAdmin && Boolean(botMember[right]));

  const canSend =
    (botMember.status === "member" || isAdmin) &&
    (chatType !== "channel" || has("can_post_messages"));

  return [
    {
      key: "invite_link",
      label: "生成邀请链接",
      available: has("can_invite_users"),
      reason: has("can_invite_users") ? undefined : "机器人在此聊天中缺少「添加用户」管理员权限",
    },
    {
      key: "ban",
      label: "封禁 / 解除封禁用户",
      available: has("can_restrict_members"),
      reason: has("can_restrict_members") ? undefined : "机器人在此聊天中缺少「限制成员」管理员权限",
    },
    {
      key: "promote",
      label: "提升成员",
      available: has("can_promote_members"),
      reason: has("can_promote_members") ? undefined : "机器人在此聊天中缺少「添加新管理员」管理员权限",
    },
    {
      key: "send_message",
      label: "发送消息",
      available: canSend,
      reason: canSend ? undefined : "机器人无法在此聊天中发送消息（不是具有发送权限的成员）",
    },
    {
      key: "delete_message",
      label: "删除消息（用于「最近 N 条」探测）",
      available: has("can_delete_messages"),
      reason: has("can_delete_messages") ? undefined : "机器人在此聊天中缺少「删除消息」管理员权限",
    },
  ];
}
