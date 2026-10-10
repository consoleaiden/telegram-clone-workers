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
        `Webhook disconnected. ${res.data.pending_update_count} pending update(s) preserved in Telegram queue.`,
      );
      if (onWebhookDisconnected) onWebhookDisconnected();
      loadReport();
    } else {
      toast.show("error", res.description);
    }
  }

  const usernameDisplay = report?.bot_username ?? botUsername ?? "Bot";

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
                Bot Activity & Workload Inspector
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
                @{usernameDisplay} · Live Telegram Diagnostics
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={loadReport}
              disabled={loading}
              title="Refresh Telegram status"
            >
              {loading ? "Checking…" : "🔄 Refresh"}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={onClose}
              style={{ padding: "4px 10px", fontSize: 14 }}
              title="Close inspector"
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
                Connecting to Telegram to probe webhooks, polling sessions, and pending updates…
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
              <strong style={{ color: "var(--danger)" }}>Failed to inspect bot:</strong> {error}
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
                          ? "External Webhook Active"
                          : "Webhook Inactive (Cloudflare Quota Protected)"}
                      </strong>
                    </div>

                    {report.webhook.is_active ? (
                      <div style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.5 }}>
                        <p style={{ margin: "4px 0 6px" }}>
                          Telegram is actively delivering incoming updates via HTTP POST to:
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
                          Queue: <strong>{report.webhook.pending_update_count}</strong> pending update(s) in Telegram.
                          {report.webhook.last_error_message && (
                            <span style={{ color: "var(--danger)", display: "block", marginTop: 2 }}>
                              Last delivery error: {report.webhook.last_error_message}
                            </span>
                          )}
                        </p>
                        <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 11.5 }}>
                          💡 <em>Disconnecting the webhook stops Telegram from firing HTTP requests at your worker (saving request quota). All pending messages and copy commands remain safely stored in Telegram.</em>
                        </p>
                      </div>
                    ) : (
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted)" }}>
                        No active webhook URL. Telegram will not make unwanted HTTP push requests to your worker. Pure Cron Auto-Sync is ready.
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
                      {disconnecting ? "Disconnecting…" : "🔌 Disconnect Webhook"}
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
                      <strong style={{ color: "var(--danger)" }}>Competing Polling Session Detected</strong>
                      <p style={{ margin: "4px 0 0", color: "var(--ink)" }}>
                        Another process (e.g. Pyrogram, Telethon, or a local bot script) is actively running and polling updates with this bot token right now.
                      </p>
                      <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 11.5 }}>
                        Telegram returned HTTP 409 Conflict. Running multiple concurrent polling loops on the same bot token can cause Telegram rate limits or missed updates.
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
                    Clone Worker Tasks
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>
                    {report.clone_worker_tasks.active_count === 0 ? "0 active (Idle)" : `${report.clone_worker_tasks.active_count} Active`}
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--muted)" }}>
                    {report.clone_worker_tasks.active_count === 0
                      ? "Bot is free for new assignments"
                      : `${report.clone_worker_tasks.tasks.length} task(s) configured in this worker`}
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
                    Flood Wait Health
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: report.rate_limits.is_cooling_down ? "var(--warning)" : "var(--success)", marginTop: 4 }}>
                    {report.rate_limits.is_cooling_down
                      ? `Paused (${report.rate_limits.cooldown_seconds_remaining}s left)`
                      : "Healthy"}
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--muted)" }}>
                    {report.rate_limits.events_last_24h > 0
                      ? `Hit Telegram flood wait ${report.rate_limits.events_last_24h} time(s) in last 24h`
                      : "0 rate limit events in past 24 hours"}
                  </p>
                </div>
              </div>

              {/* Section 4: Live Incoming Updates in Simple English */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>
                    Recent Activity & Queued Updates ({report.recent_activities.length})
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                    Translated from Telegram update stream
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
                            {act.sender_name && ` · from ${act.sender_name}`}
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
                        Updates are currently being routed through the external webhook ({report.webhook.pending_update_count} pending in Telegram queue). Disconnect the webhook above to inspect them directly.
                      </span>
                    ) : (
                      <span>
                        ✓ Bot is completely quiet right now — no pending messages, commands, or files waiting in Telegram queue.
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
            Updates remain safe in Telegram's queue when disconnecting webhooks.
          </span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Done / Close
          </button>
        </div>
      </div>
    </div>
  );
}
