import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "./Toast";
import type { BotInspectionReport } from "../../shared/rpcTypes";

interface BotActivityModalProps {
  botId?: string;
  botToken?: string;
  botUsername?: string;
  onClose: () => void;
  onWebhookDisconnected?: () => void;
}

export function BotActivityModal({
  botId,
  botToken,
  botUsername,
  onClose,
  onWebhookDisconnected,
}: BotActivityModalProps) {
  const toast = useToast();
  const [report, setReport] = useState<BotInspectionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  async function loadReport() {
    setLoading(true);
    setError(null);
    const res = await api.post<BotInspectionReport>("/api/bots/inspect", {
      botId: botId || undefined,
      token: botToken || undefined,
    });
    setLoading(false);
    if (res.ok) {
      setReport(res.data);
    } else {
      setError(res.description);
    }
  }

  useEffect(() => {
    loadReport();
  }, [botId, botToken]);

  async function handleDisconnectWebhook() {
    setDisconnecting(true);
    const res = await api.post<{ disconnected: boolean; pending_updates_preserved: boolean; pending_update_count: number }>(
      "/api/bots/disconnect-webhook",
      {
        botId: botId || undefined,
        token: botToken || undefined,
      },
    );
    setDisconnecting(false);
    if (res.ok) {
      toast.show(
        "success",
        `Webhook 已断开。${res.data.pending_update_count} 条待处理更新已保留在 Telegram 队列中。`,
      );
      if (onWebhookDisconnected) onWebhookDisconnected();
      loadReport();
    } else {
      toast.show("error", res.description);
    }
  }

  const usernameDisplay = report?.bot_username ?? botUsername ?? "机器人";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: "var(--z-drawer, 400)",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          width: "100%",
          maxWidth: 680,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.5)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--surface-raised)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🔍</span>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>
                机器人活动与负载检查器
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
                @{usernameDisplay} · Telegram 实时诊断
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={loadReport}
              disabled={loading}
              title="刷新 Telegram 状态"
            >
              {loading ? "检查中…" : "🔄 刷新"}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={onClose}
              style={{ padding: "4px 10px", fontSize: 14 }}
              title="关闭检查器"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div style={{ padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
          {loading && !report && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div className="skeleton-row" style={{ height: 28, marginBottom: 12 }} />
              <div className="skeleton-row" style={{ height: 60, marginBottom: 12 }} />
              <div className="skeleton-row" style={{ height: 60 }} />
              <p className="text-muted" style={{ fontSize: 13, marginTop: 14 }}>
                正在连接 Telegram，探测 Webhook、轮询会话与待处理更新…
              </p>
            </div>
          )}

          {error && (
            <div
              style={{
                background: "var(--danger-tint)",
                border: "1px solid var(--danger)",
                padding: "14px 16px",
                borderRadius: "var(--radius)",
                fontSize: 13,
                color: "var(--ink)",
              }}
            >
              <strong style={{ color: "var(--danger)" }}>检查机器人失败：</strong> {error}
            </div>
          )}

          {report && (
            <>
              {/* Section 1: Webhook & Cloudflare Invocation Protection */}
              <div
                style={{
                  background: report.webhook.is_active
                    ? "rgba(245, 158, 11, 0.08)"
                    : "var(--success-tint)",
                  border: `1px solid ${
                    report.webhook.is_active
                      ? "rgba(245, 158, 11, 0.4)"
                      : "color-mix(in oklab, var(--success) 35%, transparent)"
                  }`,
                  borderRadius: "var(--radius)",
                  padding: "14px 16px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 16 }}>
                        {report.webhook.is_active ? "⚠️" : "✓"}
                      </span>
                      <strong
                        style={{
                          fontSize: 13.5,
                          color: report.webhook.is_active ? "var(--warning)" : "var(--success)",
                        }}
                      >
                        {report.webhook.is_active
                          ? "外部 Webhook 已启用"
                          : "Webhook 未启用（Cloudflare 配额已受保护）"}
                      </strong>
                    </div>

                    {report.webhook.is_active ? (
                      <div style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.5 }}>
                        <p style={{ margin: "4px 0 6px" }}>
                          Telegram 正在通过 HTTP POST 主动将更新推送到：
                          <br />
                          <code
                            style={{
                              display: "inline-block",
                              marginTop: 4,
                              padding: "2px 6px",
                              background: "var(--surface)",
                              border: "1px solid var(--border-subtle)",
                              borderRadius: 4,
                              fontFamily: "var(--font-mono)",
                              fontSize: 11.5,
                              wordBreak: "break-all",
                            }}
                          >
                            {report.webhook.url}
                          </code>
                        </p>
                        <p style={{ margin: "4px 0", color: "var(--muted)", fontSize: 12 }}>
                          队列：Telegram 中有 <strong>{report.webhook.pending_update_count}</strong> 条待处理更新。
                          {report.webhook.last_error_message && (
                            <span style={{ color: "var(--danger)", display: "block", marginTop: 2 }}>
                              最近一次投递错误：{report.webhook.last_error_message}
                            </span>
                          )}
                        </p>
                        <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 11.5 }}>
                          💡 <em>断开 Webhook 后，Telegram 将停止向你的 worker 发送 HTTP 请求（可节省请求配额）。所有待处理的消息和复制指令都会安全地保留在 Telegram 中。</em>
                        </p>
                      </div>
                    ) : (
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted)" }}>
                        没有启用的 Webhook 地址。Telegram 不会向你的 worker 发起多余的 HTTP 推送请求。纯 Cron 自动同步已就绪。
                      </p>
                    )}
                  </div>

                  {report.webhook.is_active && (
                    <button
                      className="btn btn-warning btn-sm"
                      disabled={disconnecting}
                      onClick={handleDisconnectWebhook}
                      style={{
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        background: "rgba(245, 158, 11, 0.16)",
                        color: "var(--warning, #f59e0b)",
                        border: "1px solid rgba(245, 158, 11, 0.4)",
                        fontWeight: 600,
                        cursor: disconnecting ? "not-allowed" : "pointer",
                      }}
                    >
                      {disconnecting ? "断开中…" : "🔌 断开 Webhook"}
                    </button>
                  )}
                </div>
              </div>

              {/* Section 2: External Polling Detection & Competing Sessions */}
              {report.polling_session.conflict_detected && (
                <div
                  style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.35)",
                    borderRadius: "var(--radius)",
                    padding: "12px 16px",
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 16 }}>⚡</span>
                    <div style={{ fontSize: 12.5 }}>
                      <strong style={{ color: "var(--danger)" }}>检测到存在竞争的轮询会话</strong>
                      <p style={{ margin: "4px 0 0", color: "var(--ink)" }}>
                        另一个进程（例如 Pyrogram、Telethon，或某个本地机器人脚本）正在使用该机器人 token 主动轮询更新。
                      </p>
                      <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 11.5 }}>
                        Telegram 返回了 HTTP 409 Conflict。对同一个机器人 token 运行多个并发轮询循环，可能会触发 Telegram 限流或导致丢失更新。
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Section 3: Workload & Rate Limit Overview Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                {/* Clone Worker Tasks */}
                <div
                  style={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius)",
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ fontSize: 11.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                    Clone Worker 任务
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>
                    {report.clone_worker_tasks.active_count === 0 ? "0 个进行中（空闲）" : `${report.clone_worker_tasks.active_count} 个进行中`}
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--muted)" }}>
                    {report.clone_worker_tasks.active_count === 0
                      ? "该机器人空闲，可接受新任务"
                      : `此 worker 中已配置 ${report.clone_worker_tasks.tasks.length} 个任务`}
                  </p>
                </div>

                {/* Flood Wait & Rate Limits */}
                <div
                  style={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius)",
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ fontSize: 11.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                    限流等待状态
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: report.rate_limits.is_cooling_down ? "var(--warning)" : "var(--success)", marginTop: 4 }}>
                    {report.rate_limits.is_cooling_down
                      ? `已暂停（剩余 ${report.rate_limits.cooldown_seconds_remaining} 秒）`
                      : "正常"}
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--muted)" }}>
                    {report.rate_limits.events_last_24h > 0
                      ? `过去 24 小时触发 Telegram 限流 ${report.rate_limits.events_last_24h} 次`
                      : "过去 24 小时没有限流事件"}
                  </p>
                </div>
              </div>

              {/* Section 4: Live Incoming Updates in Simple English */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>
                    最近活动与排队更新（{report.recent_activities.length}）
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                    由 Telegram 更新流翻译而来
                  </span>
                </div>

                {report.recent_activities.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {report.recent_activities.map((act) => (
                      <div
                        key={act.update_id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 12,
                          padding: "10px 14px",
                          background: "var(--surface-raised)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "var(--radius)",
                        }}
                      >
                        <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{act.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", wordBreak: "break-word" }}>
                            {act.summary}
                          </div>
                          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                            {act.chat_name} ({act.chat_type})
                            {act.sender_name && ` · 来自 ${act.sender_name}`}
                            {act.date_iso && ` · ${new Date(act.date_iso).toLocaleTimeString()}`}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: "16px",
                      background: "var(--surface-raised)",
                      border: "1px dashed var(--border)",
                      borderRadius: "var(--radius)",
                      textAlign: "center",
                      color: "var(--muted)",
                      fontSize: 12.5,
                    }}
                  >
                    {report.webhook.is_active ? (
                      <span>
                        更新目前正通过外部 Webhook 路由（Telegram 队列中有 {report.webhook.pending_update_count} 条待处理）。请在上方断开 Webhook 以直接查看它们。
                      </span>
                    ) : (
                      <span>
                        ✓ 该机器人当前完全静默——Telegram 队列中没有待处理的消息、指令或文件。
                      </span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--surface-raised)",
          }}
        >
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
            断开 Webhook 后，更新仍会安全保存在 Telegram 的队列中。
          </span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            完成 / 关闭
          </button>
        </div>
      </div>
    </div>
  );
}
