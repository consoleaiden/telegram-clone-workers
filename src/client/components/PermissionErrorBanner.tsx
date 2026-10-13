import type { ErrorReason } from "../../shared/rpcTypes";

const REASON_COPY: Record<ErrorReason, string> = {
  insufficient_permissions: "机器人在该 Telegram 聊天中缺少所需权限——请检查它在此聊天中的管理员权限。",
  bot_not_in_chat: "机器人不是此聊天的成员（或已被移除）。",
  rate_limited: "Telegram 正在对此机器人限流——稍后会自动重试。",
  invalid_request: "该请求无效。",
  unauthorized: "机器人的 token 已被撤销或无效——Telegram 正在拒绝该机器人的所有请求。",
  unknown: "出错了。",
};

export function PermissionErrorBanner({ reason, description }: { reason: ErrorReason; description: string }) {
  return (
    <div className="permission-banner">
      <span>⚠</span>
      <div>
        <div>{REASON_COPY[reason]}</div>
        <details style={{ marginTop: 4 }}>
          <summary className="text-muted" style={{ cursor: "pointer", fontSize: 12 }}>
            详情
          </summary>
          <div className="text-mono text-muted" style={{ marginTop: 4 }}>
            {description}
          </div>
        </details>
      </div>
    </div>
  );
}
